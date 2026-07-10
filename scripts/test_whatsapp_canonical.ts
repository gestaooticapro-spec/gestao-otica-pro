import assert from 'node:assert/strict'

import {
  buildWhatsAppCanonicalPayload,
  extractWhatsAppCanonicalReply,
  getWhatsAppCanonicalHumanizableIntent,
  isWhatsAppCanonicalHumanizationCandidate,
} from '@/lib/whatsapp/canonical'

const storeHoursPayload = buildWhatsAppCanonicalPayload({
  intent: 'store_hours',
  action: 'auto_reply',
  outboundType: 'store_hours',
  canonicalReply: 'Nosso horario de atendimento e das 08:00 as 18:00.',
  facts: {
    storeName: 'Loja Centro',
  },
})

const storeHoursCanonical = extractWhatsAppCanonicalReply(storeHoursPayload)
assert.ok(storeHoursCanonical, 'store_hours canonical should exist')
assert.equal(storeHoursCanonical?.intent, 'store_hours')
assert.equal(storeHoursCanonical?.facts.storeName, 'Loja Centro')
assert.equal(isWhatsAppCanonicalHumanizationCandidate(storeHoursCanonical), true)

const statusHandoffPayload = buildWhatsAppCanonicalPayload({
  intent: 'order_status',
  action: 'human_handoff',
  outboundType: 'human_handoff',
  canonicalReply: 'Vou deixar a conversa com nossa equipe.',
})

const statusHandoffCanonical = extractWhatsAppCanonicalReply(statusHandoffPayload)
assert.equal(isWhatsAppCanonicalHumanizationCandidate(statusHandoffCanonical), true)
assert.equal(getWhatsAppCanonicalHumanizableIntent(statusHandoffCanonical), 'order_status')

const genericHandoffPayload = buildWhatsAppCanonicalPayload({
  intent: null,
  action: 'human_handoff',
  outboundType: 'human_handoff',
  canonicalReply: 'Vou deixar a conversa com nossa equipe.',
})

const genericHandoffCanonical = extractWhatsAppCanonicalReply(genericHandoffPayload)
assert.equal(isWhatsAppCanonicalHumanizationCandidate(genericHandoffCanonical), true)
assert.equal(getWhatsAppCanonicalHumanizableIntent(genericHandoffCanonical), 'human_agent_request')

const attachmentHandoffPayload = buildWhatsAppCanonicalPayload({
  intent: 'prescription_submission',
  action: 'human_handoff',
  outboundType: 'attachment_handoff',
  canonicalReply: 'Recebi seu arquivo e vou encaminhar para a equipe.',
})

const attachmentHandoffCanonical = extractWhatsAppCanonicalReply(attachmentHandoffPayload)
assert.equal(isWhatsAppCanonicalHumanizationCandidate(attachmentHandoffCanonical), false)
assert.equal(getWhatsAppCanonicalHumanizableIntent(attachmentHandoffCanonical), null)

assert.equal(extractWhatsAppCanonicalReply({ invalid: true } as never), null)

console.log('WhatsApp canonical layer checks passed.')
