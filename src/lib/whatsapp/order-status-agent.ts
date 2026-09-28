export type OpenOrderAgentFact = {
  orderNumber: string
  patientName: string | null
  status: string
  statusText: string
}

export function canUseIdentifierLookupAgentReply(input: {
  expectedLookupExecuted: boolean
  lookupSucceeded: boolean
  handoffRequested: boolean
}) {
  if (!input.expectedLookupExecuted) return false
  return input.lookupSucceeded || input.handoffRequested
}

export function resolveToolAgentReplySemantics(input: {
  handedOff: boolean
  orderStatusAction: 'request_identifier' | 'auto_reply' | null
  ratingRecorded: boolean
  ratingRequested: boolean
}) {
  if (input.handedOff) {
    return {
      state: 'awaiting_human' as const,
      reason: 'human_handoff',
      intent: 'human_agent_request',
      action: 'human_handoff',
      outboundType: 'human_handoff',
    }
  }

  if (input.orderStatusAction) {
    const requestingIdentifier = input.orderStatusAction === 'request_identifier'
    return {
      state: requestingIdentifier ? 'waiting_identifier' as const : 'ai_session' as const,
      reason: requestingIdentifier ? 'order_identifier_requested' : 'order_status_auto_reply',
      intent: 'order_status',
      action: input.orderStatusAction,
      outboundType: requestingIdentifier ? 'identifier_prompt' : 'os_status',
    }
  }

  if (input.ratingRecorded || input.ratingRequested) {
    const action = input.ratingRecorded ? 'post_sale_rating_recorded' : 'post_sale_rating_requested'
    return {
      state: 'ai_session' as const,
      reason: action,
      intent: 'unknown',
      action,
      outboundType: 'ai_tool_assistant',
    }
  }

  return {
    state: 'ai_session' as const,
    reason: 'ai_tool_reply',
    intent: 'unknown',
    action: 'ai_tool_reply',
    outboundType: 'ai_tool_assistant',
  }
}

export function prepareOpenOrdersForAgent(orders: OpenOrderAgentFact[]) {
  if (orders.length > 2) {
    return {
      multipleOpenOrders: true,
      tooManyOpenOrders: true,
      orders: [] as OpenOrderAgentFact[],
    }
  }

  return {
    multipleOpenOrders: orders.length > 1,
    tooManyOpenOrders: false,
    orders,
  }
}

function normalizeOrderReplyText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function containsOrderReplyPhrase(text: string, phrase: string) {
  const normalizedText = normalizeOrderReplyText(text)
  const normalizedPhrase = normalizeOrderReplyText(phrase)
  return Boolean(normalizedPhrase) && ` ${normalizedText} `.includes(` ${normalizedPhrase} `)
}

function orderStatusIsNamed(text: string, status: string) {
  const normalized = normalizeOrderReplyText(text)
  switch (status) {
    case 'ready_for_pickup':
      return /\b(pront\w*|retir\w*|buscar\w*|ready|pick up|listo\w*|recoger\w*)\b/u.test(normalized)
    case 'lens_in_production':
      return /\b(produc\w*|laborator\w*|fabric\w*|production|laboratory|fabricacion)\b/u.test(normalized)
    case 'lens_arrived_needs_frame':
      return /\b(cheg\w*|arriv\w*|lleg\w*)\b/u.test(normalized)
        && /\b(armaca\w*|frame\w*)\b/u.test(normalized)
    case 'lens_arrived_assembling':
      return /\b(mont\w*|ensambl\w*|assembl\w*)\b/u.test(normalized)
    default:
      return false
  }
}

export type OrderAgentReplyValidation =
  | { valid: true }
  | { valid: false; reason: 'no_order_facts' | 'too_many_orders' | 'missing_order' | 'mixed_orders' | 'missing_patient' | 'missing_status' }

export function validateOrderAgentReply(
  replyText: string,
  orders: OpenOrderAgentFact[]
): OrderAgentReplyValidation {
  if (orders.length === 0) return { valid: false, reason: 'no_order_facts' }
  if (orders.length > 2) return { valid: false, reason: 'too_many_orders' }

  const sentences = replyText.split(/[\n.!?;]+/u).map(normalizeOrderReplyText).filter(Boolean)
  const mentionedOrders = new Set<string>()

  for (const order of orders) {
    const sentence = sentences.find((candidate) => containsOrderReplyPhrase(candidate, order.orderNumber))
    if (!sentence) return { valid: false, reason: 'missing_order' }

    const otherOrdersInSentence = orders.filter((candidate) =>
      containsOrderReplyPhrase(sentence, candidate.orderNumber)
    )
    if (otherOrdersInSentence.length > 1) return { valid: false, reason: 'mixed_orders' }
    mentionedOrders.add(order.orderNumber)

    if (order.patientName) {
      if (!containsOrderReplyPhrase(sentence, order.patientName)) {
        return { valid: false, reason: 'missing_patient' }
      }
    } else if (!/\b(titular|owner|account holder)\b/u.test(sentence)) {
      return { valid: false, reason: 'missing_patient' }
    }

    if (!orderStatusIsNamed(sentence, order.status)) {
      return { valid: false, reason: 'missing_status' }
    }
  }

  return mentionedOrders.size === orders.length
    ? { valid: true }
    : { valid: false, reason: 'missing_order' }
}
