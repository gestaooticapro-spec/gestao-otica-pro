export type WhatsAppPostClassificationDecision =
  | 'human_handoff'
  | 'order_status'
  | 'store_hours'
  | 'store_location'
  | 'fallback'

export type WhatsAppPostClassificationInput = {
  classificationSuccess: boolean
  confidence: number
  automationCandidate: boolean
  intent: string | null
  minConfidence: number
  hasStoreHoursText: boolean
  hasStoreLocationText: boolean
}

export function decidePostClassificationRoute(
  input: WhatsAppPostClassificationInput
): WhatsAppPostClassificationDecision {
  if (!input.classificationSuccess) return 'fallback'
  if (input.confidence < input.minConfidence) return 'fallback'

  if (input.intent === 'human_agent_request') {
    return 'human_handoff'
  }

  if (!input.automationCandidate) {
    return 'fallback'
  }

  if (input.intent === 'order_status') {
    return 'order_status'
  }

  if (input.intent === 'store_hours' && input.hasStoreHoursText) {
    return 'store_hours'
  }

  if (input.intent === 'store_location' && input.hasStoreLocationText) {
    return 'store_location'
  }

  return 'fallback'
}
