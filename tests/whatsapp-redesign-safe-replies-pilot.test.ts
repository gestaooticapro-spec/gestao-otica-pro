import assert from 'node:assert/strict'
import test from 'node:test'
import {
  WhatsAppRedesignClassificationSchema,
  WhatsAppSystemDecisionSchema,
} from '../src/lib/whatsapp/redesign/contracts'
import {
  isStoreOneSafeRepliesPilotEnabled,
  selectStoreOnePilotSafeReply,
} from '../src/lib/whatsapp/redesign/safe-replies-pilot'

const classification = WhatsAppRedesignClassificationSchema.parse({
  intent: 'store_hours', confidence: 0.98, topicRelation: 'change_topic',
  requestsHuman: false, mentionsAttachment: false,
  entities: { customerName: null, patientName: null, cpf: null, orderNumber: null },
})
const decision = WhatsAppSystemDecisionSchema.parse({
  action: 'answer_store_hours', canonicalReply: 'Horário oficial de hoje.',
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

test('resposta ao vivo usa a decisao canonica, inclusive handoff e anexo', () => {
  const base = {
    classification, decision,
    turnMessages: [{ kind: 'text', text: 'Qual o horário?' }],
    officialPixKey: null, officialPixHolder: null,
  }
  assert.deepEqual(selectStoreOnePilotSafeReply(base), {
    action: 'answer_store_hours', messageType: 'store_hours', text: 'Horário oficial de hoje.',
  })
  const handoff = WhatsAppSystemDecisionSchema.parse({
    ...decision, action: 'human_handoff', canonicalReply: 'Vou chamar um atendente.',
    humanHandoffTiming: { mode: 'during_open_hours', nextOpenSchedule: null },
  })
  assert.equal(selectStoreOnePilotSafeReply({
    ...base, classification: { ...classification, requestsHuman: true }, decision: handoff,
  })?.action, 'human_handoff')
  assert.equal(selectStoreOnePilotSafeReply({
    ...base, turnMessages: [{ kind: 'image', text: null }], decision: {
      ...handoff, action: 'acknowledge_attachment', humanHandoffTiming: null,
      canonicalReply: 'Recebi o arquivo. Vou chamar um atendente.',
    },
  })?.messageType, 'attachment_handoff')
  assert.equal(selectStoreOnePilotSafeReply({
    ...base, turnMessages: [...base.turnMessages, ...base.turnMessages],
  })?.action, 'answer_store_hours')
})

test('Pix literal usa chave oficial; demais pedidos seguem handoff canonico', () => {
  const pixDecision = WhatsAppSystemDecisionSchema.parse({
    ...decision, action: 'answer_official_pix', canonicalReply: 'Responder com a chave oficial cadastrada.',
  })
  const handoff = WhatsAppSystemDecisionSchema.parse({
    ...decision, action: 'human_handoff', canonicalReply: 'Atendente.',
    humanHandoffTiming: { mode: 'during_open_hours', nextOpenSchedule: null },
  })
  const base = {
    classification: { ...classification, intent: 'unknown' as const }, decision: pixDecision,
    turnMessages: [{ kind: 'text', text: 'Qual é a chave Pix?' }],
    officialPixKey: 'chave-teste', officialPixHolder: 'Loja Teste',
  }
  assert.deepEqual(selectStoreOnePilotSafeReply(base), {
    action: 'answer_official_pix', messageType: 'payment_pix_info',
    text: 'Nossa chave Pix é chave-teste. Favorecido: Loja Teste. Confira o favorecido antes de pagar.',
  })
  assert.equal(selectStoreOnePilotSafeReply({ ...base, classification, decision: pixDecision })?.action, 'answer_official_pix')
  assert.equal(selectStoreOnePilotSafeReply({ ...base, officialPixKey: null }), null)
  for (const text of ['Já paguei no Pix', 'Qual o valor da parcela e a chave Pix?', 'Não me passe o Pix', 'Enviei comprovante Pix']) {
    assert.equal(selectStoreOnePilotSafeReply({ ...base, decision: handoff, turnMessages: [{ kind: 'text', text }] })?.action, 'human_handoff')
  }
})
