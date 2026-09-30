import type { Json } from '@/lib/database.types'

type MetadataRecord = Record<string, unknown>

function asRecord(value: unknown): MetadataRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as MetadataRecord
    : {}
}

function metadataText(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

export function isConfirmedOperatorActivity(metadata: Json | null | undefined) {
  const record = asRecord(metadata)
  const reason = metadataText(record.reason)
  const action = metadataText(record.lastAction ?? record.action)

  return record.handoffResolvedByOperator === true
    || reason === 'store_initiated'
    || reason === 'app_manual_send'
    || action === 'human_pause_store_initiated'
    || action === 'human_pause_app_manual_send'
}

export function isAutomatedHandoffMetadata(metadata: Json | null | undefined) {
  const record = asRecord(metadata)
  const reason = metadataText(record.reason)
  const actions = [record.lastAction, record.action, record.lastOutboundType, record.outboundType]
    .map(metadataText)

  return actions.some((action) => action.includes('handoff'))
    || reason.includes('handoff')
    || reason === 'identifier_not_found'
    || reason === 'status_awaiting_context'
    || reason === 'status_auto_reply_disabled'
}

export function normalizeConversationStateForHumanControl(
  state: string,
  metadata: Json | null | undefined,
  controlMode: string
) {
  if (state === 'waiting_human_after_attachment') return 'awaiting_human'
  if (state !== 'human_pause') return state
  if (controlMode === 'force_human' || isConfirmedOperatorActivity(metadata)) return 'human_pause'

  return isAutomatedHandoffMetadata(metadata) ? 'awaiting_human' : 'ai_session'
}

export function applyOperatorActivityPauseExpiry<T extends {
  state: string
  metadata?: Json | null
  updated_at: string
  expires_at: string
}>(row: T, pauseMs: number): T {
  if (row.state !== 'human_pause' || !isConfirmedOperatorActivity(row.metadata)) return row

  const metadata = asRecord(row.metadata)
  const activityAt = typeof metadata.humanActivityAt === 'string'
    ? metadata.humanActivityAt
    : row.updated_at
  const activityAtMs = Date.parse(activityAt)
  if (!Number.isFinite(activityAtMs)) return row

  return {
    ...row,
    expires_at: new Date(activityAtMs + pauseMs).toISOString(),
  }
}

export function isOperatorPauseActive(input: {
  state: string
  metadata?: Json | null
  updatedAt: string
  nowMs: number
  pauseMs: number
}) {
  if (input.state !== 'human_pause' || !isConfirmedOperatorActivity(input.metadata)) return false

  const metadata = asRecord(input.metadata)
  const activityAt = typeof metadata.humanActivityAt === 'string'
    ? metadata.humanActivityAt
    : input.updatedAt
  const activityAtMs = Date.parse(activityAt)
  if (!Number.isFinite(activityAtMs)) return false

  const elapsedMs = input.nowMs - activityAtMs
  return elapsedMs >= 0 && elapsedMs < input.pauseMs
}
