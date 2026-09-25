import {
  WhatsAppConversationTopicSchema,
  WhatsAppRedesignActionSchema,
  type WhatsAppConversationTopic,
  type WhatsAppRedesignAction,
} from './contracts'

export type WhatsAppShadowOutcome =
  | 'store_hours'
  | 'store_location'
  | 'attachment_handoff'
  | 'human_handoff'
  | 'no_reply'
  | 'greeting'
  | 'clarification'
  | 'order_status'
  | 'identifier_request'
  | 'continuation'
  | 'other_reply'
  | 'pending'
  | 'failed'
  | 'missing_output'
  | 'unknown'

export type WhatsAppShadowComparisonVerdict =
  | 'aligned'
  | 'safety_aligned'
  | 'divergent'
  | 'inconclusive'

export type WhatsAppShadowDecisionEvidence = {
  action: WhatsAppRedesignAction
  intent: WhatsAppConversationTopic
  mentionsAttachment: boolean
}

export type WhatsAppLegacyDecisionEvidence = {
  inboundStatus: 'received' | 'ignored' | 'processed' | 'failed'
  outboundStatus: 'pending' | 'sending' | 'sent' | 'failed' | 'cancelled' | null
  messageType: string | null
  canonicalAction: string | null
  canonicalOutboundType: string | null
  canonicalIntent: string | null
}

export type WhatsAppShadowComparison = {
  shadowOutcome: WhatsAppShadowOutcome
  legacyOutcome: WhatsAppShadowOutcome
  verdict: WhatsAppShadowComparisonVerdict
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function extractWhatsAppShadowDecisionEvidence(
  metadata: unknown
): WhatsAppShadowDecisionEvidence | null {
  const shadow = record(record(metadata)?.shadowProcessing)
  const decision = record(shadow?.decision)
  const classification = record(shadow?.classification)
  const action = WhatsAppRedesignActionSchema.safeParse(decision?.action)
  const intent = WhatsAppConversationTopicSchema.safeParse(classification?.intent)
  if (!action.success || !intent.success) return null

  return {
    action: action.data,
    intent: intent.data,
    mentionsAttachment: classification?.mentionsAttachment === true,
  }
}

export function extractWhatsAppLegacyCanonicalEvidence(payload: unknown) {
  const canonical = record(record(payload)?.canonical)
  return {
    canonicalAction: text(canonical?.action),
    canonicalOutboundType: text(canonical?.outboundType),
    canonicalIntent: text(canonical?.intent),
  }
}

export function classifyWhatsAppShadowOutcome(
  evidence: WhatsAppShadowDecisionEvidence
): WhatsAppShadowOutcome {
  if (evidence.action === 'answer_store_hours') return 'store_hours'
  if (evidence.action === 'answer_store_location') return 'store_location'
  if (evidence.action === 'no_reply') return 'no_reply'
  if (evidence.action === 'acknowledge_attachment') return 'attachment_handoff'
  if (evidence.action === 'recognize_continuation') return 'continuation'
  if (evidence.action === 'conservative_fallback') {
    return evidence.intent === 'greeting' ? 'greeting' : 'clarification'
  }
  if (evidence.action === 'human_handoff' || evidence.action === 'repeat_handoff') {
    return evidence.intent === 'attachment' || evidence.mentionsAttachment
      ? 'attachment_handoff'
      : 'human_handoff'
  }
  return 'unknown'
}

export function classifyWhatsAppLegacyOutcome(
  evidence: WhatsAppLegacyDecisionEvidence
): WhatsAppShadowOutcome {
  if (evidence.outboundStatus === 'failed' || evidence.inboundStatus === 'failed') return 'failed'
  if (!evidence.outboundStatus) {
    if (evidence.inboundStatus === 'ignored') return 'no_reply'
    if (evidence.inboundStatus === 'received') return 'pending'
    if (evidence.inboundStatus === 'processed') return 'missing_output'
    return 'unknown'
  }

  const outboundType = evidence.canonicalOutboundType || evidence.messageType
  const action = evidence.canonicalAction
  if (outboundType === 'store_hours') return 'store_hours'
  if (outboundType === 'store_location') return 'store_location'
  if (outboundType === 'attachment_handoff') return 'attachment_handoff'
  if (outboundType === 'human_handoff' || action?.includes('human_handoff')) return 'human_handoff'
  if (outboundType === 'os_status') return 'order_status'
  if (outboundType === 'identifier_prompt' || outboundType === 'payment_identifier_prompt'
    || action === 'request_identifier') return 'identifier_request'
  if (outboundType === 'ai_greeting' || action === 'ai_greeting') return 'greeting'
  if (outboundType === 'ai_clarification' || outboundType === 'menu'
    || action === 'ai_clarification' || action === 'show_menu') return 'clarification'
  return 'other_reply'
}

function isHandoff(outcome: WhatsAppShadowOutcome) {
  return outcome === 'human_handoff' || outcome === 'attachment_handoff'
}

export function compareWhatsAppShadowWithLegacy(
  shadow: WhatsAppShadowDecisionEvidence,
  legacy: WhatsAppLegacyDecisionEvidence
): WhatsAppShadowComparison {
  const shadowOutcome = classifyWhatsAppShadowOutcome(shadow)
  const legacyOutcome = classifyWhatsAppLegacyOutcome(legacy)

  if (['pending', 'failed', 'missing_output', 'unknown'].includes(legacyOutcome)
    || shadowOutcome === 'unknown') {
    return { shadowOutcome, legacyOutcome, verdict: 'inconclusive' }
  }
  if (shadowOutcome === legacyOutcome) {
    return { shadowOutcome, legacyOutcome, verdict: 'aligned' }
  }
  if (isHandoff(shadowOutcome) && isHandoff(legacyOutcome)) {
    return { shadowOutcome, legacyOutcome, verdict: 'safety_aligned' }
  }
  return { shadowOutcome, legacyOutcome, verdict: 'divergent' }
}
