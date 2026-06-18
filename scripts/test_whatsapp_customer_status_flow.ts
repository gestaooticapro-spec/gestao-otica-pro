import assert from 'node:assert/strict'

import { decidePostClassificationRoute } from '@/lib/whatsapp/flow-decisions'
import { decidePreAiRoute } from '@/lib/whatsapp/routing-heuristics'

const nowMs = new Date('2026-06-17T15:00:00.000Z').getTime()
const humanHandoffWindowMs = 2 * 60 * 60 * 1000
const identifierWindowMs = 20 * 60 * 1000
const minConfidence = 0.78

function simulateFlow(input: {
  option: '1' | '2' | null
  state: 'waiting_menu' | 'waiting_identifier' | 'human_pause' | 'silent' | 'waiting_human_after_attachment' | null
  hasAttachment: boolean
  messageText: string | null
  metadata?: Record<string, unknown> | null
  classification?: {
    success: boolean
    confidence: number
    automationCandidate: boolean
    intent: string | null
  }
  hasStoreHoursText?: boolean
  hasStoreLocationText?: boolean
}) {
  const preAi = decidePreAiRoute({
    option: input.option,
    state: input.state,
    hasAttachment: input.hasAttachment,
    messageText: input.messageText,
    metadata: (input.metadata || null) as never,
    humanHandoffWindowMs,
    identifierWindowMs,
    nowMs,
  })

  if (preAi !== 'continue_to_ai_or_menu') return preAi

  const postAi = decidePostClassificationRoute({
    classificationSuccess: input.classification?.success ?? false,
    confidence: input.classification?.confidence ?? 0,
    automationCandidate: input.classification?.automationCandidate ?? false,
    intent: input.classification?.intent ?? null,
    minConfidence,
    hasStoreHoursText: Boolean(input.hasStoreHoursText),
    hasStoreLocationText: Boolean(input.hasStoreLocationText),
  })

  return postAi
}

assert.equal(simulateFlow({
  option: '2',
  state: null,
  hasAttachment: false,
  messageText: '2',
}), 'explicit_human_option')

assert.equal(simulateFlow({
  option: null,
  state: null,
  hasAttachment: true,
  messageText: 'segue arquivo',
}), 'attachment_handoff')

assert.equal(simulateFlow({
  option: null,
  state: null,
  hasAttachment: false,
  messageText: 'meu oculos chegou?',
  classification: {
    success: true,
    confidence: 0.95,
    automationCandidate: true,
    intent: 'order_status',
  },
}), 'order_status')

assert.equal(simulateFlow({
  option: null,
  state: null,
  hasAttachment: false,
  messageText: 'que horas fecha hoje?',
  classification: {
    success: true,
    confidence: 0.91,
    automationCandidate: true,
    intent: 'store_hours',
  },
  hasStoreHoursText: true,
}), 'store_hours')

assert.equal(simulateFlow({
  option: null,
  state: null,
  hasAttachment: false,
  messageText: 'onde fica a loja?',
  classification: {
    success: true,
    confidence: 0.89,
    automationCandidate: true,
    intent: 'store_location',
  },
  hasStoreLocationText: true,
}), 'store_location')

assert.equal(simulateFlow({
  option: null,
  state: null,
  hasAttachment: false,
  messageText: 'quero falar com alguem',
  classification: {
    success: true,
    confidence: 0.88,
    automationCandidate: false,
    intent: 'human_agent_request',
  },
}), 'human_handoff')

assert.equal(simulateFlow({
  option: null,
  state: null,
  hasAttachment: false,
  messageText: 'quanto custa a lente?',
  classification: {
    success: true,
    confidence: 0.92,
    automationCandidate: false,
    intent: 'budget_request',
  },
}), 'silent_handoff')

assert.equal(simulateFlow({
  option: null,
  state: null,
  hasAttachment: false,
  messageText: 'nao adaptei com meu oculos',
  classification: {
    success: true,
    confidence: 0.91,
    automationCandidate: false,
    intent: 'complaint_or_adaptation',
  },
}), 'silent_handoff')

assert.equal(simulateFlow({
  option: null,
  state: null,
  hasAttachment: false,
  messageText: 'quero marcar a retirada',
  classification: {
    success: true,
    confidence: 0.89,
    automationCandidate: false,
    intent: 'pickup_or_scheduling',
  },
}), 'silent_handoff')

assert.equal(simulateFlow({
  option: null,
  state: null,
  hasAttachment: false,
  messageText: 'que horas fecha hoje?',
  classification: {
    success: true,
    confidence: 0.6,
    automationCandidate: true,
    intent: 'store_hours',
  },
  hasStoreHoursText: true,
}), 'fallback')

assert.equal(simulateFlow({
  option: null,
  state: null,
  hasAttachment: false,
  messageText: '123456',
  metadata: {
    lastAction: 'request_identifier',
    lastDecisionAt: '2026-06-17T14:50:00.000Z',
  },
}), 'retry_identifier_lookup')

assert.equal(simulateFlow({
  option: null,
  state: null,
  hasAttachment: false,
  messageText: 'oi',
  metadata: {
    lastAction: 'human_handoff',
    lastInboundHasAttachment: true,
    lastDecisionAt: '2026-06-17T14:20:00.000Z',
  },
}), 'preserve_human_handoff')

console.log('WhatsApp customer-status flow checks passed.')
