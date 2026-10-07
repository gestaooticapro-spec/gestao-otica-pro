import assert from 'node:assert/strict'
import test from 'node:test'
import { shouldSuppressAttachmentHandoff } from '../src/lib/whatsapp/redesign/attachment-handoff-policy'
import { buildWhatsAppShadowDecision } from '../src/lib/whatsapp/redesign/system-decision'
import { defaultConversationSummary } from '../src/lib/whatsapp/redesign/contracts'

const previous = {
  message_type: 'human_handoff', status: 'sent', created_at: '2026-10-07T17:31:21.353Z',
  inbound_message_id: 12242, payload: { canonical: { action: 'human_handoff' } },
}
const input = { latestOutbound: previous, inboundId: 12243, forceAi: false, now: '2026-10-07T17:31:39.658Z' }

test('segunda imagem do caso real nao cria outro aviso mesmo com memoria atrasada', () => {
  assert.equal(shouldSuppressAttachmentHandoff(input), true)
  for (const status of ['pending', 'sending', 'sent']) {
    assert.equal(shouldSuppressAttachmentHandoff({ ...input, latestOutbound: { ...previous, status } }), true)
  }
})

test('primeiro arquivo, falha anterior, nova conversa e IA proxima continuam permitidos', () => {
  assert.equal(shouldSuppressAttachmentHandoff({ ...input, latestOutbound: null }), false)
  assert.equal(shouldSuppressAttachmentHandoff({ ...input, forceAi: true }), false)
  assert.equal(shouldSuppressAttachmentHandoff({ ...input, inboundId: 12242 }), false)
  assert.equal(shouldSuppressAttachmentHandoff({ ...input, now: '2026-10-10T17:31:39Z' }), false)
  for (const status of ['failed', 'cancelled']) {
    assert.equal(shouldSuppressAttachmentHandoff({ ...input, latestOutbound: { ...previous, status } }), false)
  }
  assert.equal(shouldSuppressAttachmentHandoff({ ...input,
    latestOutbound: { ...previous, message_type: 'operator_store_initiated', payload: {} } }), false)
})

test('decisao nao repete handoff pendente mas mantem primeiro encaminhamento e pedido humano explicito', () => {
  const decisionInput = {
    storeId: 1,
    classification: { intent: 'attachment' as const, confidence: 0.99, topicRelation: 'continue_topic' as const,
      requestsHuman: false, mentionsAttachment: true,
      entities: { customerName: null, patientName: null, cpf: null, orderNumber: null } },
    memory: { summary: defaultConversationSummary(input.now), messages: [] },
    now: input.now, hoursFacts: null, storeLocationReply: null, hasCurrentTurnAttachment: true,
  }
  assert.equal(buildWhatsAppShadowDecision(decisionInput).draft.action, 'human_handoff')
  const pending = { ...decisionInput, memory: { ...decisionInput.memory,
    summary: { ...decisionInput.memory.summary, humanControl: 'human_pending' as const, pendingAction: 'awaiting_human' as const } } }
  const suppressed = buildWhatsAppShadowDecision(pending)
  assert.equal(suppressed.draft.action, 'no_reply')
  assert.equal(suppressed.reason, 'attachment_handoff_already_notified')
  assert.equal(buildWhatsAppShadowDecision({ ...pending,
    classification: { ...pending.classification, requestsHuman: true } }).draft.action, 'repeat_handoff')
})
