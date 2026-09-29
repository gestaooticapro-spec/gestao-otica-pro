import assert from 'node:assert/strict'
import test from 'node:test'
import {
  WhatsAppRedesignClassificationSchema,
  WhatsAppSystemDecisionSchema,
} from '../src/lib/whatsapp/redesign/contracts'
import {
  extractExplicitOrderNumber,
  isStoreOneSafeRepliesPilotEnabled,
  resolveStoreOnePilotReplyText,
  selectStoreOnePilotSafeReply,
  shouldForceStoreOnePhoneOrderStatusLookup,
  shouldLookupOrderStatusInStoreOnePilot,
  shouldUseOrderStatusToolAgent,
} from '../src/lib/whatsapp/redesign/safe-replies-pilot'
import { buildWhatsAppRedesignReplyPrompt } from '../src/lib/whatsapp/ai'
import {
  enforceWhatsAppIntentEvidence,
  isExplicitOrderReadinessQuestion,
  isExplicitOrderStatusQuestion,
  isExplicitHumanHandoffRequest,
} from '../src/lib/whatsapp/redesign/intent-guards'

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

test('extrai identificador explicito de OS sem confundir pergunta de status', () => {
  assert.equal(extractExplicitOrderNumber('OS 277'), '277')
  assert.equal(extractExplicitOrderNumber('Pedido nº 2041'), '2041')
  assert.equal(extractExplicitOrderNumber('Meu óculos está pronto?'), null)
  assert.equal(extractExplicitOrderNumber('Quero falar com um atendente'), null)
})

test('piloto consulta OS apenas com intencao confiavel e sem pedido humano ou anexo', () => {
  const orderClassification = WhatsAppRedesignClassificationSchema.parse({
    ...classification,
    intent: 'order_status',
    confidence: 0.94,
  })
  const orderDecision = WhatsAppSystemDecisionSchema.parse({
    ...decision,
    action: 'lookup_order_status',
    fallbackReply: 'Consultar a OS antes de responder.',
    facts: { decisionReason: 'order_status_requires_authorized_lookup' },
    humanHandoffTiming: null,
    humanization: decision.humanization,
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
    humanHandoffTiming: { mode: 'during_open_hours', nextOpenSchedule: null },
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
  assert.equal(shouldLookupOrderStatusInStoreOnePilot({
    classification: { ...orderClassification, intent: 'store_hours' },
    decision,
    messageText: 'Meu óculos está pronto?',
  }), true)
  assert.equal(shouldLookupOrderStatusInStoreOnePilot({
    classification: { ...orderClassification, intent: 'store_hours' },
    decision,
    messageText: 'Meu óculos está pronto? Quero falar com um atendente.',
  }), false)
})

test('consulta de OS confiavel segue para o agente de ferramentas quando habilitado', () => {
  const orderClassification = WhatsAppRedesignClassificationSchema.parse({
    ...classification,
    intent: 'order_status',
    confidence: 0.94,
  })
  const handoffDecision = WhatsAppSystemDecisionSchema.parse({
    ...decision,
    action: 'human_handoff',
    facts: { decisionReason: 'topic_requires_human:order_status' },
    humanHandoffTiming: { mode: 'during_open_hours', nextOpenSchedule: null },
    humanization: { ...decision.humanization, mustIdentifyIara: true, mustMentionHumanHandoff: true },
  })

  assert.equal(shouldUseOrderStatusToolAgent({
    enabled: true, classification: orderClassification, decision: handoffDecision,
  }), true)
  assert.equal(shouldUseOrderStatusToolAgent({
    enabled: false, classification: orderClassification, decision: handoffDecision,
  }), false)
  assert.equal(shouldUseOrderStatusToolAgent({
    enabled: true,
    classification: { ...orderClassification, requestsHuman: true },
    decision: handoffDecision,
  }), false)
  assert.equal(shouldUseOrderStatusToolAgent({
    enabled: true,
    classification: { ...orderClassification, intent: 'vision_exam' },
    decision: WhatsAppSystemDecisionSchema.parse({
      ...handoffDecision,
      action: 'repeat_handoff',
      facts: { decisionReason: 'topic_requires_human:vision_exam' },
    }),
    messageText: 'E da OS 9999?',
  }), true)
  assert.equal(shouldUseOrderStatusToolAgent({
    enabled: true,
    classification: { ...orderClassification, requestsHuman: true },
    decision: handoffDecision,
    messageText: 'Quero falar com atendente sobre a OS 9999',
  }), false)
})

test('pergunta explícita sobre status do óculos supera classificação equivocada como exame de vista', () => {
  const misclassified = WhatsAppRedesignClassificationSchema.parse({
    ...classification,
    intent: 'vision_exam',
    confidence: 0.96,
  })
  const handoffDecision = WhatsAppSystemDecisionSchema.parse({
    ...decision,
    action: 'human_handoff',
    facts: { decisionReason: 'topic_requires_human:vision_exam' },
    humanHandoffTiming: { mode: 'during_open_hours', nextOpenSchedule: null },
    humanization: { ...decision.humanization, mustIdentifyIara: true, mustMentionHumanHandoff: true },
  })
  const text = 'Qual é o status do meu óculos?'

  assert.equal(isExplicitOrderStatusQuestion(text), true)
  assert.equal(isExplicitHumanHandoffRequest('Quero falar com um atendente sobre isso.'), true)
  assert.equal(enforceWhatsAppIntentEvidence({ route: 'human_handoff', intent: 'vision_exam', messageText: text }), 'order_status')
  assert.equal(shouldUseOrderStatusToolAgent({
    enabled: true, classification: misclassified, decision: handoffDecision, messageText: text,
  }), true)
  assert.equal(shouldForceStoreOnePhoneOrderStatusLookup({
    storeId: 1, classification: misclassified, decision: handoffDecision, messageText: text,
  }), true)
  assert.equal(shouldForceStoreOnePhoneOrderStatusLookup({
    storeId: 2, classification: misclassified, decision: handoffDecision, messageText: text,
  }), false)
  assert.equal(shouldLookupOrderStatusInStoreOnePilot({
    classification: misclassified, decision: handoffDecision, messageText: text,
  }), true)
  assert.equal(shouldForceStoreOnePhoneOrderStatusLookup({
    storeId: 1,
    classification: misclassified,
    decision: handoffDecision,
    messageText: 'Qual é o status do meu óculos? Quero falar com um atendente.',
  }), false)
  assert.equal(shouldForceStoreOnePhoneOrderStatusLookup({
    storeId: 1,
    classification: misclassified,
    decision: WhatsAppSystemDecisionSchema.parse({
      ...handoffDecision,
      action: 'no_reply',
      fallbackReply: null,
      humanHandoffTiming: null,
    }),
    messageText: text,
  }), false)
  assert.equal(shouldUseOrderStatusToolAgent({
    enabled: true,
    classification: { ...misclassified, requestsHuman: true },
    decision: handoffDecision,
    messageText: 'Qual é o status do meu óculos? Quero falar com um atendente.',
  }), false)
})

test('o piloto nao carrega texto fixo de contingencia', () => {
  const base = {
    classification, decision,
    turnMessages: [{ kind: 'text', text: 'Qual o horário?' }],
    officialPixKey: null, officialPixHolder: null,
  }
  const hoursReply = selectStoreOnePilotSafeReply(base)
  assert.equal(hoursReply?.action, 'answer_store_hours')
  assert.equal(hoursReply?.messageType, 'store_hours')
  assert.equal('fallbackText' in (hoursReply ?? {}), false)
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
  assert.equal(unsafeStockClaim.shouldSend, false)
  assert.equal(unsafeStockClaim.generatedBy, 'suppressed')
  assert.equal(unsafeStockClaim.reason, 'unsafe_stock_claim')
  const missingProduct = resolveStoreOnePilotReplyText(candidate, {
    success: true,
    data: { reply_text: 'Sou a IAra e vou pedir para a equipe consultar a disponibilidade.' },
  })
  assert.equal(missingProduct.shouldSend, false)
  assert.equal(missingProduct.generatedBy, 'suppressed')
  assert.equal(missingProduct.reason, 'required_product_omitted')
  const providerFailure = resolveStoreOnePilotReplyText(candidate, { success: false })
  assert.equal(providerFailure.shouldSend, false)
  assert.equal(providerFailure.reason, 'provider_failure')

  const missingIdentity = resolveStoreOnePilotReplyText(candidate, {
    success: true,
    data: { reply_text: 'Vou pedir para a equipe verificar as lentes Varilux para você.' },
  })
  assert.equal(missingIdentity.shouldSend, false)
  assert.equal(missingIdentity.reason, 'assistant_identity_omitted')
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
  assert.equal(missingHandoff.shouldSend, false)
  assert.equal(missingHandoff.generatedBy, 'suppressed')
  assert.equal(missingHandoff.reason, 'handoff_omitted')
})

test('Pix gerado inclui a chave oficial e e suprimido se a resposta falhar na validacao', () => {
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
  }).reason, 'official_key_omitted')
  assert.equal(selectStoreOnePilotSafeReply({
    classification: { ...classification, intent: 'unknown' }, decision: pixDecision,
    turnMessages: [{ kind: 'text', text: 'Paguei a parcela no Pix' }],
    officialPixKey: 'chave-teste', officialPixHolder: 'Loja Teste',
  }), null)
})

test('horario oficial ausente na resposta gerada suprime o envio', () => {
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
  }).reason, 'official_hours_omitted')
})

test('pergunta sobre oculos pronto e roteada para OS, nao para horario', () => {
  const message = 'A cliente perguntou se o óculos estava pronto.'
  assert.equal(isExplicitOrderReadinessQuestion(message), true)
  assert.equal(enforceWhatsAppIntentEvidence({
    route: 'store_hours', intent: 'store_hours', messageText: message,
  }), 'order_status')
  assert.equal(enforceWhatsAppIntentEvidence({
    route: 'store_hours', intent: 'store_hours', messageText: 'Amanhã a loja abre?',
  }), 'store_hours')
  assert.equal(enforceWhatsAppIntentEvidence({
    route: 'store_hours', intent: 'store_hours', messageText: 'Meu óculos está bonito.',
  }), 'fallback')
})
