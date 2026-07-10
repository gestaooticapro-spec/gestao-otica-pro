import assert from 'node:assert/strict'

import { decidePreAiRoute, shouldReleaseClosedTrapPause } from '@/lib/whatsapp/routing-heuristics'

const nowMs = new Date('2026-06-17T15:00:00.000Z').getTime()
const humanHandoffWindowMs = 2 * 60 * 60 * 1000
const identifierWindowMs = 20 * 60 * 1000

assert.equal(decidePreAiRoute({
  option: '2',
  state: null,
  hasAttachment: false,
  messageText: '2',
  metadata: null,
  humanHandoffWindowMs,
  identifierWindowMs,
  nowMs,
}), 'explicit_human_option')

assert.equal(decidePreAiRoute({
  option: null,
  state: 'human_pause',
  hasAttachment: false,
  messageText: 'oi',
  metadata: null,
  humanHandoffWindowMs,
  identifierWindowMs,
  nowMs,
}), 'ignore_human_pause')

assert.equal(shouldReleaseClosedTrapPause({
  state: 'human_pause',
  metadata: {
    reason: 'normal_closed_trap',
    lastAction: 'normal_closed_trap',
  },
  isStoreOpenNow: true,
}), true)

assert.equal(decidePreAiRoute({
  option: null,
  state: 'human_pause',
  hasAttachment: false,
  messageText: 'oi',
  metadata: {
    reason: 'normal_closed_trap',
    lastAction: 'normal_closed_trap',
  },
  isStoreOpenNow: true,
  humanHandoffWindowMs,
  identifierWindowMs,
  nowMs,
}), 'release_human_pause')

assert.equal(decidePreAiRoute({
  option: null,
  state: null,
  hasAttachment: true,
  messageText: 'segue',
  metadata: null,
  humanHandoffWindowMs,
  identifierWindowMs,
  nowMs,
}), 'attachment_handoff')

assert.equal(decidePreAiRoute({
  option: null,
  state: 'waiting_human_after_attachment',
  hasAttachment: false,
  messageText: 'oi',
  metadata: null,
  humanHandoffWindowMs,
  identifierWindowMs,
  nowMs,
}), 'attachment_followup_handoff')

assert.equal(decidePreAiRoute({
  option: null,
  state: null,
  hasAttachment: false,
  messageText: 'quero falar',
  metadata: {
    lastAction: 'human_handoff',
    lastInboundHasAttachment: true,
    lastDecisionAt: '2026-06-17T14:20:00.000Z',
  },
  humanHandoffWindowMs,
  identifierWindowMs,
  nowMs,
}), 'preserve_human_handoff')

assert.equal(decidePreAiRoute({
  option: null,
  state: null,
  hasAttachment: false,
  messageText: '123456',
  metadata: {
    lastAction: 'request_identifier',
    lastDecisionAt: '2026-06-17T14:50:00.000Z',
  },
  humanHandoffWindowMs,
  identifierWindowMs,
  nowMs,
}), 'retry_identifier_lookup')

assert.equal(decidePreAiRoute({
  option: null,
  state: 'waiting_identifier',
  hasAttachment: false,
  messageText: '123456',
  metadata: null,
  humanHandoffWindowMs,
  identifierWindowMs,
  nowMs,
}), 'waiting_identifier_lookup')

assert.equal(decidePreAiRoute({
  option: '1',
  state: null,
  hasAttachment: false,
  messageText: '1',
  metadata: null,
  humanHandoffWindowMs,
  identifierWindowMs,
  nowMs,
}), 'explicit_status_option')

assert.equal(decidePreAiRoute({
  option: null,
  state: 'silent',
  hasAttachment: false,
  messageText: 'oi',
  metadata: null,
  humanHandoffWindowMs,
  identifierWindowMs,
  nowMs,
}), 'ignore_silent')

assert.equal(decidePreAiRoute({
  option: null,
  state: null,
  hasAttachment: false,
  messageText: 'que horas fecha hoje?',
  metadata: null,
  humanHandoffWindowMs,
  identifierWindowMs,
  nowMs,
}), 'continue_to_ai_or_menu')

assert.equal(decidePreAiRoute({
  option: null,
  state: 'ai_session',
  hasAttachment: false,
  messageText: 'e sabado?',
  metadata: null,
  humanHandoffWindowMs,
  identifierWindowMs,
  nowMs,
}), 'continue_to_ai_or_menu')

console.log('WhatsApp pre-AI routing checks passed.')
