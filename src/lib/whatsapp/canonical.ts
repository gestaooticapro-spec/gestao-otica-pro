import type { Json } from '@/lib/database.types'

export type WhatsAppCanonicalFacts = Record<string, string | number | boolean | null>

export type WhatsAppCanonicalReply = {
  intent: string | null
  action: string
  outboundType: string
  canonicalReply: string
  facts: WhatsAppCanonicalFacts
}

export type WhatsAppCanonicalPayload = {
  canonical: WhatsAppCanonicalReply
}

export type WhatsAppCanonicalHumanizableIntent =
  | 'store_hours'
  | 'store_location'
  | 'human_agent_request'
  | 'order_status'
  | 'payment_info'
  | 'post_sale_positive'
  | 'budget_request'
  | 'prescription_submission'
  | 'complaint_or_adaptation'
  | 'pickup_or_scheduling'
  | 'unknown'

export function isWhatsAppCanonicalHumanizationCandidate(reply: WhatsAppCanonicalReply | null) {
  return getWhatsAppCanonicalHumanizableIntent(reply) !== null
}

export function getWhatsAppCanonicalHumanizableIntent(
  reply: WhatsAppCanonicalReply | null
): WhatsAppCanonicalHumanizableIntent | null {
  if (!reply) return null

  if (reply.intent === 'store_hours' || reply.intent === 'store_location' || reply.intent === 'human_agent_request'
    || reply.intent === 'order_status' || reply.intent === 'payment_info' || reply.intent === 'post_sale_positive'
    || reply.intent === 'budget_request' || reply.intent === 'prescription_submission'
    || reply.intent === 'complaint_or_adaptation' || reply.intent === 'pickup_or_scheduling' || reply.intent === 'unknown') {
    return reply.intent
  }

  if (
    reply.intent === null
    && (reply.action === 'human_handoff' || reply.outboundType === 'human_handoff')
  ) {
    return 'human_agent_request'
  }

  return 'unknown'
}

export function buildWhatsAppCanonicalPayload(input: {
  intent: string | null
  action: string
  outboundType: string
  canonicalReply: string
  facts?: WhatsAppCanonicalFacts
}): WhatsAppCanonicalPayload {
  return {
    canonical: {
      intent: input.intent,
      action: input.action,
      outboundType: input.outboundType,
      canonicalReply: input.canonicalReply,
      facts: input.facts || {},
    },
  }
}

export function extractWhatsAppCanonicalReply(payload: Json | null | undefined): WhatsAppCanonicalReply | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null

  const canonical = (payload as Record<string, Json | undefined>).canonical
  if (!canonical || typeof canonical !== 'object' || Array.isArray(canonical)) return null

  const record = canonical as Record<string, Json | undefined>
  if (typeof record.action !== 'string' || typeof record.outboundType !== 'string' || typeof record.canonicalReply !== 'string') {
    return null
  }

  const factsValue = record.facts
  const facts = factsValue && typeof factsValue === 'object' && !Array.isArray(factsValue)
    ? factsValue as WhatsAppCanonicalFacts
    : {}

  return {
    intent: typeof record.intent === 'string' ? record.intent : null,
    action: record.action,
    outboundType: record.outboundType,
    canonicalReply: record.canonicalReply,
    facts,
  }
}
