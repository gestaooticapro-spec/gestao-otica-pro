import { phonesMatch } from './phone'

export type ConversationStateCandidate = {
  id: number
  remote_phone: string
  expires_at: string
  updated_at: string
}

export function resolveConversationStateCandidates<T extends ConversationStateCandidate>(input: {
  candidates: T[]
  phone: string
  nowMs: number
}) {
  const expiredIds = input.candidates
    .filter((row) => {
      const expiresAt = Date.parse(row.expires_at)
      return !Number.isFinite(expiresAt) || expiresAt <= input.nowMs
    })
    .map((row) => row.id)
  const expired = new Set(expiredIds)
  const matching = input.candidates
    .filter((row) => !expired.has(row.id) && phonesMatch(row.remote_phone, input.phone))
    .sort((left, right) => {
      const recency = Date.parse(right.updated_at) - Date.parse(left.updated_at)
      if (Number.isFinite(recency) && recency !== 0) return recency
      const leftExact = left.remote_phone === input.phone
      const rightExact = right.remote_phone === input.phone
      if (leftExact !== rightExact) return leftExact ? -1 : 1
      return right.id - left.id
    })

  return {
    expiredIds,
    matchingIds: matching.map((row) => row.id),
    selected: matching[0] ?? null,
  }
}
