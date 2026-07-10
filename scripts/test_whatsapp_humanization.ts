import assert from 'node:assert/strict'

import { buildWhatsAppCanonicalPayload, extractWhatsAppCanonicalReply } from '@/lib/whatsapp/canonical'
import {
  applyWhatsAppHumanizationOutcome,
  decideWhatsAppHumanization,
} from '@/lib/whatsapp/humanization'

const storeHoursPayload = buildWhatsAppCanonicalPayload({
  intent: 'store_hours',
  action: 'auto_reply',
  outboundType: 'store_hours',
  canonicalReply: 'Nosso horario de atendimento e das 08:00 as 18:00.',
  facts: { storeName: 'Loja Centro' },
})

const canonical = extractWhatsAppCanonicalReply(storeHoursPayload)
assert.ok(canonical, 'canonical should exist')

const disabledPlan = decideWhatsAppHumanization(false, canonical)
assert.equal(disabledPlan.decision, 'skip_disabled')
assert.equal(disabledPlan.intent, null)

const enabledPlan = decideWhatsAppHumanization(true, canonical)
assert.equal(enabledPlan.decision, 'apply')
assert.equal(enabledPlan.intent, 'store_hours')

const nonCandidateCanonical = extractWhatsAppCanonicalReply(buildWhatsAppCanonicalPayload({
  intent: 'prescription_submission',
  action: 'human_handoff',
  outboundType: 'attachment_handoff',
  canonicalReply: 'Recebi seu arquivo e vou encaminhar para a equipe.',
}))
const nonCandidatePlan = decideWhatsAppHumanization(true, nonCandidateCanonical)
assert.equal(nonCandidatePlan.decision, 'skip_not_candidate')

const fallbackApplied = applyWhatsAppHumanizationOutcome(
  storeHoursPayload as never,
  'Texto canônico',
  {
    success: false,
    error: 'timeout',
  }
)
assert.equal(fallbackApplied.text, 'Texto canônico')
assert.equal((fallbackApplied.payload.humanization as { success?: boolean }).success, false)

const successApplied = applyWhatsAppHumanizationOutcome(
  storeHoursPayload as never,
  'Texto canônico',
  {
    success: true,
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    attempts: 1,
    replyText: 'Oi! Hoje atendemos das 08:00 as 18:00.',
  }
)
assert.equal(successApplied.text, 'Oi! Hoje atendemos das 08:00 as 18:00.')
assert.equal((successApplied.payload.humanization as { success?: boolean }).success, true)

console.log('WhatsApp humanization checks passed.')
