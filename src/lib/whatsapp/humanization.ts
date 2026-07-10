import type { Json } from '@/lib/database.types'
import type { WhatsAppCanonicalReply } from './canonical'
import { getWhatsAppCanonicalHumanizableIntent } from './canonical'

export type WhatsAppHumanizationDecision =
  | 'skip_disabled'
  | 'skip_not_candidate'
  | 'apply'

export type WhatsAppHumanizationFailure = {
  success: false
  error: string
}

export type WhatsAppHumanizationSuccess = {
  success: true
  provider: string
  model: string
  attempts: number
  replyText: string
}

export type WhatsAppHumanizationOutcome =
  | WhatsAppHumanizationFailure
  | WhatsAppHumanizationSuccess

type PayloadRecord = Record<string, Json | undefined>

export function decideWhatsAppHumanization(
  enabled: boolean,
  canonical: WhatsAppCanonicalReply | null
): {
  decision: WhatsAppHumanizationDecision
  intent: ReturnType<typeof getWhatsAppCanonicalHumanizableIntent>
} {
  if (!enabled) {
    return { decision: 'skip_disabled', intent: null }
  }

  const intent = getWhatsAppCanonicalHumanizableIntent(canonical)
  if (!canonical || !intent) {
    return { decision: 'skip_not_candidate', intent: null }
  }

  return { decision: 'apply', intent }
}

export function applyWhatsAppHumanizationOutcome(
  payload: PayloadRecord,
  fallbackText: string,
  outcome: WhatsAppHumanizationOutcome
) {
  if (!outcome.success) {
    return {
      text: fallbackText,
      payload: {
        ...payload,
        humanization: {
          enabled: true,
          success: false,
          error: outcome.error,
        },
      } satisfies PayloadRecord,
    }
  }

  return {
    text: outcome.replyText,
    payload: {
      ...payload,
      humanization: {
        enabled: true,
        success: true,
        provider: outcome.provider,
        model: outcome.model,
        attempts: outcome.attempts,
        replyText: outcome.replyText,
      },
    } satisfies PayloadRecord,
  }
}
