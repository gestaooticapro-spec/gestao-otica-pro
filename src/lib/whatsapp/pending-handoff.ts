import { digitsOnly, phonesMatch } from '@/lib/whatsapp/phone'
import type { Json } from '@/lib/database.types'

export type PendingHandoffOrigin = 'attachment' | 'general'

export type PendingHandoffStateRow = {
  remote_phone: string
  state: string
  metadata?: Json | null
  expires_at: string
  updated_at: string
  handoff_pending?: boolean | null
  handoff_origin?: PendingHandoffOrigin | null
  handoff_at?: string | null
  operator_answered_at?: string | null
}

export type PendingHandoffResolution = {
  remotePhone: string
  isPending: boolean
  origin: PendingHandoffOrigin | null
  handoffAt: string | null
  operatorAnsweredAt: string | null
}

function phoneKey(value: string) {
  return digitsOnly(value) || value.trim()
}

/**
 * O status atual do handoff é persistido junto à conversa. A lista
 * operacional lê estes campos sem reprocessar mensagens outbound.
 */
export function resolvePersistedPendingHandoffs(stateRows: PendingHandoffStateRow[]) {
  const resolutions = new Map<string, PendingHandoffResolution>()

  for (const stateRow of stateRows) {
    const isPending = stateRow.handoff_pending === true
    resolutions.set(phoneKey(stateRow.remote_phone), {
      remotePhone: stateRow.remote_phone,
      isPending,
      origin: isPending ? stateRow.handoff_origin || null : null,
      handoffAt: stateRow.handoff_at || null,
      operatorAnsweredAt: stateRow.operator_answered_at || null,
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
