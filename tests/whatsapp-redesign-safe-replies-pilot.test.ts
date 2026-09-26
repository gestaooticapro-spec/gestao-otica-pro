import assert from 'node:assert/strict'
import test from 'node:test'
import {
  WhatsAppRedesignClassificationSchema,
  WhatsAppSystemDecisionSchema,
} from '../src/lib/whatsapp/redesign/contracts'
import {
  isStoreOneSafeRepliesPilotEnabled,
  resolveStoreOnePilotReplyText,
  selectStoreOnePilotSafeReply,
  shouldLookupOrderStatusInStoreOnePilot,
} from '../src/lib/whatsapp/redesign/safe-replies-pilot'
import { buildWhatsAppRedesignReplyPrompt } from '../src/lib/whatsapp/ai'

const classification = WhatsAppRedesignClassificationSchema.parse({
  intent: 'store_hours', confidence: 0.98, topicRelation: 'change_topic',
  requestsHuman: false, mentionsAttachment: false,
  entities: { customerName: null, patientName: null, cpf: null, orderNumber: null },
})
const decision = WhatsAppSystemDecisionSchema.parse({
  action: 'answer_store_hours', fallbackReply: 'Fallback horário oficial de hoje.',
  facts: {}, humanHandoffTiming: null,
  humanization: {
    mustNotAddFacts: true, mustKeepShort: true, mustIdentifyIara: false,
    mustMentionHumanHandoff: false, forbiddenClaims: [],
  },
})

test('piloto exige Loja 1, modo sombra e ativacao explicita', () => {
  const settings = { ai_redesign: { mode: 'shadow' as const, safe_replies_enabled: true } }
  assert.equal(isStoreOneSafeRepliesPilotEnabled(1, settings), true)
  assert.equal(isStoreOneSafeRepliesPilotEnabled(2, settings), false)
  assert.equal(isStoreOneSafeRepliesPilotEnabled(1, { ai_redesign: { mode: 'shadow' } }), false)
  assert.equal(isStoreOneSafeRepliesPilotEnabled(1, { ai_redesign: { mode: 'legacy', safe_replies_enabled: true } }), false)
})

test('piloto consulta OS apenas com intencao confiavel e sem pedido humano ou anexo', () => {
  const orderClassification = WhatsAppRedesignClassificationSchema.parse({
    ...classification,
    intent: 'order_status',
    confidence: 0.94,
  })
  const orderDecision = WhatsAppSystemDecisionSchema.parse({
    ...decision,
    action: 'human_handoff',
    fallbackReply: 'Fallback: vou chamar um atendente para consultar a OS.',
    facts: { decisionReason: 'topic_requires_human:order_status' },
    humanHandoffTiming: { mode: 'during_open_hours', nextOpenSchedule: null },
    humanization: { ...decision.humanization, mustIdentifyIara: true, mustMentionHumanHandoff: true },
  })

  assert.equal(shouldLookupOrderStatusInStoreOnePilot({ classification: orderClassification, decision: orderDecision }), true)
  assert.equal(shouldLookupOrderStatusInStoreOnePilot({
    classification: { ...orderClassification, confidence: 0.5 }, decision: orderDecision,
  }), false)
  assert.equal(shouldLookupOrderStatusInStoreOnePilot({
    classification: { ...orderClassification, requestsHuman: true }, decision: orderDecision,
  }), false)
  assert.equal(shouldLookupOrderStatusInStoreOnePilot({
    classification: { ...orderClassification, mentionsAttachment: true }, decision: orderDecision,
  }), false)
  const repeatedHandoffDecision = WhatsAppSystemDecisionSchema.parse({
    ...orderDecision,
    action: 'repeat_handoff',
    facts: { decisionReason: 'topic_requires_human:vision_exam' },
  })
  assert.equal(shouldLookupOrderStatusInStoreOnePilot({
    classification: { ...orderClassification, intent: 'vision_exam' },
    decision: repeatedHandoffDecision,
    messageText: 'Meu óculos ficou pronto?',
  }), true)
  assert.equal(shouldLookupOrderStatusInStoreOnePilot({
    classification: { ...orderClassification, intent: 'vision_exam' },
    decision: repeatedHandoffDecision,
    messageText: 'Quero fazer óculos novos.',
  }), false)
})

test('selecao do piloto prepara texto fixo somente como fallback, nunca como texto ao vivo', () => {
  const base = {
    classification, decision,
    turnMessages: [{ kind: 'text', text: 'Qual o horário?' }],
    officialPixKey: null, officialPixHolder: null,
  }
  const hoursReply = selectStoreOnePilotSafeReply(base)
  assert.equal(hoursReply?.action, 'answer_store_hours')
  assert.equal(hoursReply?.messageType, 'store_hours')
  assert.equal(hoursReply?.fallbackText, 'Fallback horário oficial de hoje.')
  assert.equal('text' in (hoursReply ?? {}), false)

  const handoff = WhatsAppSystemDecisionSchema.parse({
    ...decision, action: 'human_handoff', fallbackReply: 'Fallback: vou chamar um atendente.',
    humanHandoffTiming: { mode: 'during_open_hours', nextOpenSchedule: null },
  })
  assert.equal(selectStoreOnePilotSafeReply({
    ...base, classification: { ...classification, requestsHuman: true }, decision: handoff,
  })?.action, 'human_handoff')
  assert.equal(selectStoreOnePilotSafeReply({
    ...base, turnMessages: [{ kind: 'image', text: null }], decision: {
      ...handoff, action: 'acknowledge_attachment', humanHandoffTiming: null,
      fallbackReply: 'Fallback: recebi o arquivo e vou chamar um atendente.',
    },
  })?.messageType, 'attachment_handoff')
})

test('geracao contextual preserva a marca e nunca afirma disponibilidade em estoque', () => {
  const productClassification = WhatsAppRedesignClassificationSchema.parse({
    intent: 'product_availability', confidence: 0.98, topicRelation: 'change_topic',
    requestsHuman: false, mentionsAttachment: false,
    entities: { customerName: null, patientName: null, cpf: null, orderNumber: null, productMention: 'lentes Varilux' },
  })
  const handoff = WhatsAppSystemDecisionSchema.parse({
    ...decision,
    action: 'human_handoff',
    fallbackReply: 'Fallback de contingência para lentes Varilux.',
    facts: { handoffReason: 'product_availability', productMention: 'lentes Varilux' },
    humanHandoffTiming: { mode: 'during_open_hours', nextOpenSchedule: null },
    humanization: { ...decision.humanization, mustIdentifyIara: true, mustMentionHumanHandoff: true },
  })
  const candidate = selectStoreOnePilotSafeReply({
    classification: productClassification,
    decision: handoff,
    turnMessages: [{ kind: 'text', text: 'Vocês têm lentes Varilux em estoque?' }],
    officialPixKey: null,
    officialPixHolder: null,
  })!

  assert.equal(candidate.replyInput.facts.productMention, 'lentes Varilux')
  assert.equal(candidate.replyInput.userMessages[0].text, 'Vocês têm lentes Varilux em estoque?')
  const prompt = buildWhatsAppRedesignReplyPrompt(candidate.replyInput)
  assert.match(prompt, /escreva uma resposta nova e contextual/)
  assert.match(prompt, /nunca confirme nem sugira disponibilidade em estoque/)
  assert.match(prompt, /identifique-se explicitamente pelo nome IAra/)
  assert.match(prompt, /lentes Varilux/)
  assert.doesNotMatch(prompt, /Fallback de contingência para lentes Varilux/)

  assert.equal(resolveStoreOnePilotReplyText(candidate, {
    success: true,
    data: { reply_text: 'Sou a IAra e vou pedir para a equipe verificar as lentes Varilux para você.' },
  }).generatedBy, 'ai')
  const unsafeStockClaim = resolveStoreOnePilotReplyText(candidate, {
    success: true,
    data: { reply_text: 'Sou a IAra e temos lentes Varilux disponíveis em estoque.' },
  })
  assert.equal(unsafeStockClaim.generatedBy, 'fallback')
  assert.equal(unsafeStockClaim.fallbackReason, 'unsafe_stock_claim')
  const missingProduct = resolveStoreOnePilotReplyText(candidate, {
    success: true,
    data: { reply_text: 'Sou a IAra e vou pedir para a equipe consultar a disponibilidade.' },
  })
  assert.equal(missingProduct.generatedBy, 'fallback')
  assert.equal(missingProduct.fallbackReason, 'required_product_omitted')
  assert.equal(missingProduct.text, candidate.fallbackText)
  assert.equal(resolveStoreOnePilotReplyText(candidate, { success: false }).fallbackReason, 'provider_failure')

  const missingIdentity = resolveStoreOnePilotReplyText(candidate, {
    success: true,
    data: { reply_text: 'Vou pedir para a equipe verificar as lentes Varilux para você.' },
  })
  assert.equal(missingIdentity.fallbackReason, 'assistant_identity_omitted')
  assert.equal(resolveStoreOnePilotReplyText(candidate, {
    success: true,
    data: { reply_text: 'Sou a IAra e vou pedir para a equipe verificar as lentes Varilux para você.' },
  }).generatedBy, 'ai')
})

test('handoff gerado precisa preservar o encaminhamento humano', () => {
  const handoff = WhatsAppSystemDecisionSchema.parse({
    ...decision,
    action: 'human_handoff',
    fallbackReply: 'Fallback: vou chamar um atendente.',
    humanHandoffTiming: { mode: 'during_open_hours', nextOpenSchedule: null },
    humanization: { ...decision.humanization, mustIdentifyIara: true, mustMentionHumanHandoff: true },
  })
  const candidate = selectStoreOnePilotSafeReply({
    classification: { ...classification, intent: 'human_agent_request', requestsHuman: true },
    decision: handoff,
    turnMessages: [{ kind: 'text', text: 'Quero falar com alguém.' }],
    officialPixKey: null,
    officialPixHolder: null,
  })!
  const missingHandoff = resolveStoreOnePilotReplyText(candidate, {
    success: true,
    data: { reply_text: 'Sou a IAra, claro, vou ajudar você com isso.' },
  })
  assert.equal(missingHandoff.generatedBy, 'fallback')
  assert.equal(missingHandoff.fallbackReason, 'handoff_omitted')
})

test('Pix gerado inclui a chave oficial e usa o texto fixo so se a resposta falhar', () => {
  const pixDecision = WhatsAppSystemDecisionSchema.parse({
    ...decision, action: 'answer_official_pix', fallbackReply: 'Fallback da chave Pix oficial.',
  })
  const candidate = selectStoreOnePilotSafeReply({
    classification: { ...classification, intent: 'unknown' },
    decision: pixDecision,
    turnMessages: [{ kind: 'text', text: 'Qual é a chave Pix?' }],
    officialPixKey: 'chave-teste',
    officialPixHolder: 'Loja Teste',
  })!
  assert.equal(candidate.replyInput.facts.officialPixKey, 'chave-teste')
  assert.equal(resolveStoreOnePilotReplyText(candidate, {
    success: true, data: { reply_text: 'A chave Pix é chave-teste. Confira o favorecido antes de pagar.' },
  }).generatedBy, 'ai')
  assert.equal(resolveStoreOnePilotReplyText(candidate, {
    success: true, data: { reply_text: 'Use a chave da loja para pagar.' },
  }).fallbackReason, 'official_key_omitted')
  assert.equal(selectStoreOnePilotSafeReply({
    classification: { ...classification, intent: 'unknown' }, decision: pixDecision,
    turnMessages: [{ kind: 'text', text: 'Paguei a parcela no Pix' }],
    officialPixKey: 'chave-teste', officialPixHolder: 'Loja Teste',
  }), null)
})

test('horario oficial deve aparecer na resposta gerada ou aciona fallback seguro', () => {
  const candidate = selectStoreOnePilotSafeReply({
    classification,
    decision: WhatsAppSystemDecisionSchema.parse({
      ...decision,
      facts: { requestedDay: 'tomorrow', tomorrowSchedule: '08:30 às 12:30' },
    }),
    turnMessages: [{ kind: 'text', text: 'Amanhã abre?' }],
    officialPixKey: null,
    officialPixHolder: null,
  })!
  assert.equal(resolveStoreOnePilotReplyText(candidate, {
    success: true, data: { reply_text: 'Amanhã, abrimos das 08:30 às 12:30.' },
  }).generatedBy, 'ai')
  assert.equal(resolveStoreOnePilotReplyText(candidate, {
    success: true, data: { reply_text: 'Sim, abrimos amanhã.' },
  }).fallbackReason, 'official_hours_omitted')
})
