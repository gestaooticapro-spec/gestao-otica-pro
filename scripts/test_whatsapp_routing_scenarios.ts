import assert from 'node:assert/strict'

import { decideHistoryRoute } from '@/lib/whatsapp/routing-heuristics'

const nowMs = new Date('2026-06-17T15:00:00.000Z').getTime()
const humanWindowMs = 2 * 60 * 60 * 1000
const identifierWindowMs = 20 * 60 * 1000

const preserveHuman = decideHistoryRoute({
  metadata: {
    lastAction: 'human_handoff',
    lastInboundHasAttachment: true,
    lastDecisionAt: '2026-06-17T14:20:00.000Z',
  },
  option: null,
  messageText: 'oi',
  humanHandoffWindowMs: humanWindowMs,
  identifierWindowMs,
  nowMs,
})
assert.equal(preserveHuman, 'preserve_human_handoff')

const preserveHumanBlockedByExplicitOption = decideHistoryRoute({
  metadata: {
    lastAction: 'human_handoff',
    lastInboundHasAttachment: true,
    lastDecisionAt: '2026-06-17T14:20:00.000Z',
  },
  option: '1',
  messageText: '1',
  humanHandoffWindowMs: humanWindowMs,
  identifierWindowMs,
  nowMs,
})
assert.equal(preserveHumanBlockedByExplicitOption, 'none')

const retryIdentifier = decideHistoryRoute({
  metadata: {
    lastAction: 'request_identifier',
    lastDecisionAt: '2026-06-17T14:50:00.000Z',
  },
  option: null,
  messageText: '123456',
  humanHandoffWindowMs: humanWindowMs,
  identifierWindowMs,
  nowMs,
})
assert.equal(retryIdentifier, 'retry_identifier_lookup')

const retryIdentifierExpired = decideHistoryRoute({
  metadata: {
    lastAction: 'request_identifier',
    lastDecisionAt: '2026-06-17T14:10:00.000Z',
  },
  option: null,
  messageText: '123456',
  humanHandoffWindowMs: humanWindowMs,
  identifierWindowMs,
  nowMs,
})
assert.equal(retryIdentifierExpired, 'none')

const emptyMessageDoesNotRetry = decideHistoryRoute({
  metadata: {
    lastAction: 'request_identifier',
    lastDecisionAt: '2026-06-17T14:50:00.000Z',
  },
  option: null,
  messageText: '   ',
  humanHandoffWindowMs: humanWindowMs,
  identifierWindowMs,
  nowMs,
})
assert.equal(emptyMessageDoesNotRetry, 'none')

console.log('WhatsApp routing scenario checks passed.')
