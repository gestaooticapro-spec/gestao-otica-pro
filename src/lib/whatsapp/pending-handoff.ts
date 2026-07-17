import type { Json } from '@/lib/database.types'
import { createAdminClient } from '@/lib/supabase/admin'
import { digitsOnly, phonesMatch } from '@/lib/whatsapp/phone'

export type PendingHandoffOrigin = 'attachment' | 'general'

export type PendingHandoffStateRow = {
  remote_phone: string
  state: string
  metadata: Json | null
  expires_at: string
  updated_at: string
}

export type PendingHandoffOutboundRow = {
  remote_phone: string
  message_type: string | null
  status: string | null
  payload: Json | null
  sent_at?: string | null
  created_at: string
}

export type PendingHandoffResolution = {
  remotePhone: string
  isPending: boolean
  origin: PendingHandoffOrigin | null
  handoffAt: string | null
  operatorAnsweredAt: string | null
}

function asRecord(value: Json | null | undefined): Record<string, Json | undefined> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, Json | undefined>
}

function asString(value: Json | undefined) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function timestamp(value: string | null | undefined) {
  if (!value) return 0
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

function phoneKey(value: string) {
  return digitsOnly(value) || value.trim()
}

function isOperatorOutbound(row: PendingHandoffOutboundRow) {
  if (row.status === 'failed') return false

  const messageType = String(row.message_type || '').trim().toLowerCase()
  const payload = asRecord(row.payload)
  return messageType.includes('operator')
    || messageType.includes('human') && messageType !== 'human_handoff'
    || payload.sentBy === 'operator'
    || payload.source === 'operator'
    || payload.manual === true
}

function handoffOrigin(row: PendingHandoffOutboundRow): PendingHandoffOrigin | null {
  if (row.status === 'failed' || isOperatorOutbound(row)) return null

  const messageType = String(row.message_type || '').trim().toLowerCase()
  const payload = asRecord(row.payload)
  const action = asString(payload.action) || asString(payload.lastAction)

  if (messageType === 'attachment_handoff') return 'attachment'
  if (messageType === 'human_handoff' || action === 'human_handoff') return 'general'
  return null
}

export function classifyPendingHandoffs(
  stateRows: PendingHandoffStateRow[],
  outboundRows: PendingHandoffOutboundRow[],
  now = Date.now()
) {
  const resolutions = new Map<string, PendingHandoffResolution>()

  for (const stateRow of stateRows) {
    const isActiveState = ['human_pause', 'waiting_human_after_attachment'].includes(stateRow.state)
      && timestamp(stateRow.expires_at) > now
    const matchingOutbound = outboundRows.filter((row) => phonesMatch(row.remote_phone, stateRow.remote_phone))

    let latestHandoffAt = 0
    let latestHandoffOrigin: PendingHandoffOrigin | null = null
    for (const row of matchingOutbound) {
      const origin = handoffOrigin(row)
      const createdAt = timestamp(row.created_at)
      if (!origin || createdAt <= latestHandoffAt) continue
      latestHandoffAt = createdAt
      latestHandoffOrigin = origin
    }

    const metadata = asRecord(stateRow.metadata)
    const stateAction = asString(metadata.lastAction) || asString(metadata.action)
    const stateRepresentsNewHandoff = stateAction === 'human_handoff'
      || stateRow.state === 'waiting_human_after_attachment'
    const stateUpdatedAt = timestamp(stateRow.updated_at)
    if (stateRepresentsNewHandoff && stateUpdatedAt > latestHandoffAt) {
      latestHandoffAt = stateUpdatedAt
      latestHandoffOrigin = stateRow.state === 'waiting_human_after_attachment'
        ? 'attachment'
        : 'general'
    }

    let latestOperatorAt = 0
    for (const row of matchingOutbound) {
      if (!isOperatorOutbound(row)) continue
      latestOperatorAt = Math.max(latestOperatorAt, timestamp(row.sent_at) || timestamp(row.created_at))
    }

    const isPending = isActiveState
      && latestHandoffAt > 0
      && latestHandoffAt > latestOperatorAt

    resolutions.set(phoneKey(stateRow.remote_phone), {
      remotePhone: stateRow.remote_phone,
      isPending,
      origin: isPending ? latestHandoffOrigin : null,
      handoffAt: latestHandoffAt > 0 ? new Date(latestHandoffAt).toISOString() : null,
      operatorAnsweredAt: latestOperatorAt > 0 ? new Date(latestOperatorAt).toISOString() : null,
    })
  }

  return resolutions
}

export function findPendingHandoffResolution(
  resolutions: Map<string, PendingHandoffResolution>,
  remotePhone: string
) {
  const exact = resolutions.get(phoneKey(remotePhone))
  if (exact) return exact

  for (const resolution of resolutions.values()) {
    if (phonesMatch(resolution.remotePhone, remotePhone)) return resolution
  }
  return null
}

export async function loadPendingHandoffResolutions(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  storeId: number,
  stateRows: PendingHandoffStateRow[]
) {
  const phones = [...new Set(stateRows.map((row) => row.remote_phone).filter(Boolean))]
  const outboundRows: PendingHandoffOutboundRow[] = []

  for (let index = 0; index < phones.length; index += 100) {
    const batch = phones.slice(index, index + 100)
    const { data, error } = await supabaseAdmin
      .from('whatsapp_outbound_messages')
      .select('remote_phone, message_type, status, payload, sent_at, created_at')
      .eq('store_id', storeId)
      .in('remote_phone', batch)
      .order('created_at', { ascending: false })
      .limit(5000)

    if (error) throw error
    outboundRows.push(...((data || []) as PendingHandoffOutboundRow[]))
  }

  return classifyPendingHandoffs(stateRows, outboundRows)
}
