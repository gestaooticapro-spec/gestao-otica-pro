import type { Json } from '@/lib/database.types'

export type WhatsAppHistoryRouteDecision =
  | 'preserve_human_handoff'
  | 'retry_identifier_lookup'
  | 'none'

export type WhatsAppConversationStateName =
  | 'ai_session'
  | 'waiting_menu'
  | 'waiting_identifier'
  | 'awaiting_human'
  | 'human_pause'
  | 'silent'
  | 'waiting_human_after_attachment'
  | null

export type WhatsAppPreAiRouteDecision =
  | 'explicit_human_option'
  | 'release_human_pause'
  | 'ignore_human_pause'
  | 'attachment_handoff'
  | 'attachment_followup_handoff'
  | 'preserve_human_handoff'
  | 'retry_identifier_lookup'
  | 'waiting_identifier_lookup'
  | 'explicit_status_option'
  | 'ignore_silent'
  | 'continue_to_ai_or_menu'

function asRecord(value: Json | null | undefined): Record<string, Json | undefined> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, Json | undefined>
}

function readMetadataString(metadata: Json | null | undefined, key: string) {
  const record = asRecord(metadata)
  const value = record[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function isClosedTrapReason(value: string | null) {
  return value === 'normal_closed_trap' || value === 'exceptional_closure_trap'
}

export function shouldReleaseClosedTrapPause(input: {
  state: WhatsAppConversationStateName
  metadata: Json | null | undefined
  isStoreOpenNow: boolean
}) {
  if (input.state !== 'human_pause' || !input.isStoreOpenNow) return false

  const reason = readMetadataString(input.metadata, 'reason')
  const lastAction = readMetadataString(input.metadata, 'lastAction')

  return isClosedTrapReason(reason) || isClosedTrapReason(lastAction)
}

export function isRecentIsoTimestamp(value: Json | undefined, maxAgeMs: number, nowMs = Date.now()) {
  if (typeof value !== 'string' || !value.trim()) return false
  const parsed = new Date(value).getTime()
  if (Number.isNaN(parsed)) return false
  return nowMs - parsed <= maxAgeMs
}

export function shouldKeepHumanRoutingFromHistory(
  metadata: Json | null | undefined,
  option: '1' | '2' | null,
  maxAgeMs: number,
  nowMs = Date.now()
) {
  if (option) return false

  const record = asRecord(metadata)
  const lastAction = typeof record.lastAction === 'string' ? record.lastAction : null

  return isRecentIsoTimestamp(record.lastDecisionAt, maxAgeMs, nowMs)
    && record.lastInboundHasAttachment === true
    && (lastAction === 'human_handoff' || lastAction === 'human_pause_store_initiated')
}

export function shouldTryIdentifierFromHistory(
  metadata: Json | null | undefined,
  option: '1' | '2' | null,
  messageText: string | null,
  maxAgeMs: number,
  nowMs = Date.now()
) {
  if (option) return false
  if (!String(messageText || '').trim()) return false

  const record = asRecord(metadata)
  const lastAction = typeof record.lastAction === 'string' ? record.lastAction : null

  return isRecentIsoTimestamp(record.lastDecisionAt, maxAgeMs, nowMs)
    && lastAction === 'request_identifier'
}

export function decideHistoryRoute(input: {
  metadata: Json | null | undefined
  option: '1' | '2' | null
  messageText: string | null
  humanHandoffWindowMs: number
  identifierWindowMs: number
  nowMs?: number
}): WhatsAppHistoryRouteDecision {
  const nowMs = input.nowMs ?? Date.now()

  if (shouldKeepHumanRoutingFromHistory(input.metadata, input.option, input.humanHandoffWindowMs, nowMs)) {
    return 'preserve_human_handoff'
  }

  if (shouldTryIdentifierFromHistory(input.metadata, input.option, input.messageText, input.identifierWindowMs, nowMs)) {
    return 'retry_identifier_lookup'
  }

  return 'none'
}

export function decidePreAiRoute(input: {
  option: '1' | '2' | null
  state: WhatsAppConversationStateName
  hasAttachment: boolean
  messageText: string | null
  metadata: Json | null | undefined
  isStoreOpenNow?: boolean
  humanHandoffWindowMs: number
  identifierWindowMs: number
  nowMs?: number
}): WhatsAppPreAiRouteDecision {
  if (input.option === '2') return 'explicit_human_option'
  if (shouldReleaseClosedTrapPause({
    state: input.state,
    metadata: input.metadata,
    isStoreOpenNow: input.isStoreOpenNow === true,
  })) {
    return 'release_human_pause'
  }
  if (input.state === 'human_pause') return 'ignore_human_pause'
  if (input.hasAttachment) return 'attachment_handoff'
  if (input.state === 'waiting_human_after_attachment') return 'attachment_followup_handoff'

  const historyRoute = decideHistoryRoute({
    metadata: input.metadata,
    option: input.option,
    messageText: input.messageText,
    humanHandoffWindowMs: input.humanHandoffWindowMs,
    identifierWindowMs: input.identifierWindowMs,
    nowMs: input.nowMs,
  })

  if (historyRoute === 'preserve_human_handoff') return 'preserve_human_handoff'
  if (historyRoute === 'retry_identifier_lookup') return 'retry_identifier_lookup'
  if (input.state === 'waiting_identifier') return 'waiting_identifier_lookup'
  if (input.option === '1') return 'explicit_status_option'
  if (input.state === 'silent') return 'ignore_silent'
  return 'continue_to_ai_or_menu'
}
