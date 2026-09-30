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
  if (negatesOrderStage(normalized)) return false
  const saysReady = /\b(pront\w*|retir\w*|buscar\w*|ready|pick up|listo\w*|recoger\w*)\b/u.test(normalized)
  const saysProduction = /\b(produc\w*|laborator\w*|fabric\w*|production|laboratory|fabricacion)\b/u.test(normalized)
  const saysAssembly = /\b(mont\w*|ensambl\w*|assembl\w*)\b/u.test(normalized)
  switch (status) {
    case 'ready_for_pickup':
      return saysReady && !saysProduction && !saysAssembly
    case 'lens_in_production':
      return saysProduction && !saysReady && !saysAssembly
    case 'lens_arrived_needs_frame':
      return /\b(cheg\w*|arriv\w*|lleg\w*)\b/u.test(normalized)
        && /\b(armaca\w*|frame\w*)\b/u.test(normalized)
        && !saysReady && !saysProduction && !saysAssembly
    case 'lens_arrived_assembling':
      return saysAssembly && !saysReady && !saysProduction
    default:
      return false
  }
}

function negatesOrderStage(normalizedText: string) {
  return /\b(?:nao|not)\b(?:\s+\w+){0,3}\s+(?:pront\w*|retir\w*|produc\w*|laborator\w*|mont\w*)\b/u.test(normalizedText)
}

export type OrderAgentReplyValidation =
  | { valid: true }
  | { valid: false; reason: 'no_order_facts' | 'too_many_orders' | 'missing_order' | 'mixed_orders' | 'missing_patient' | 'unsupported_patient_reference' | 'missing_status' | 'unsupported_time_or_contact' }

export function validateOrderAgentReply(
  replyText: string,
  orders: OpenOrderAgentFact[],
  options: { customerName?: string | null } = {}
): OrderAgentReplyValidation {
  if (orders.length === 0) return { valid: false, reason: 'no_order_facts' }
  if (orders.length > 2) return { valid: false, reason: 'too_many_orders' }

  const normalizedReply = normalizeOrderReplyText(replyText)
  const refersCustomerBackToStore = /\b(?:entre|entrar|fale|ligue)\s+(?:em\s+contato\s+)?(?:conosco|com\s+(?:a\s+)?(?:loja|otica|equipe))\b/u.test(normalizedReply)
  const sentences = replyText.split(/[\n.!?;]+/u).map(normalizeOrderReplyText).filter(Boolean)
  const timingPattern = /\b(?:hoje|amanha|prazo|previsao|provavel\w*|possivel\w*|estimad\w*|\d+\s*(?:dias?|semanas?|horas?))\b/gu
  const hasUnnamedOrder = orders.some((order) => !(order.patientName || options.customerName?.trim()))
  if (hasUnnamedOrder && sentences.some((sentence) =>
    /\b(?:seu|sua|teu|tua)\s+(?:pedido|os|oculos)\b/u.test(sentence)
  )) return { valid: false, reason: 'unsupported_patient_reference' }
  if (refersCustomerBackToStore || sentences.some((sentence) => {
    const timingClaims = sentence.match(timingPattern) || []
    if (timingClaims.length === 0) return false
    const order = orders.find((candidate) => containsOrderReplyPhrase(sentence, candidate.orderNumber))
    return !order || timingClaims.some((claim) => !containsOrderReplyPhrase(order.statusText, claim))
  })) return { valid: false, reason: 'unsupported_time_or_contact' }

  const mentionedOrders = new Set<string>()

  // Uma segunda frase sem OS nao pode acrescentar um status contraditorio.
  for (const sentence of sentences) {
    const namesAnOrder = orders.some((order) => containsOrderReplyPhrase(sentence, order.orderNumber))
    const assertsStage = /\b(?:pront\w*|retir\w*|buscar\w*|produc\w*|laborator\w*|mont\w*|ensambl\w*|assembl\w*|ready|recoger)\b/u.test(sentence)
      && !negatesOrderStage(sentence)
    if (assertsStage && !namesAnOrder) return { valid: false, reason: 'missing_order' }
    const unknownNumber = [...sentence.matchAll(/\b(?:os|pedido)\s*(?:n(?:o|umero)\s*)?(\d+)\b/gu)]
      .some((match) => !orders.some((order) => normalizeOrderReplyText(order.orderNumber) === match[1]))
    if (unknownNumber) return { valid: false, reason: 'missing_order' }
  }

  for (const order of orders) {
    const sentence = sentences.find((candidate) => containsOrderReplyPhrase(candidate, order.orderNumber))
    if (!sentence) return { valid: false, reason: 'missing_order' }

    const otherOrdersInSentence = orders.filter((candidate) =>
      containsOrderReplyPhrase(sentence, candidate.orderNumber)
    )
    if (otherOrdersInSentence.length > 1) return { valid: false, reason: 'mixed_orders' }
    mentionedOrders.add(order.orderNumber)

    const personName = order.patientName || options.customerName?.trim() || null
    if (personName) {
      if (!containsOrderReplyPhrase(sentence, personName)) {
        return { valid: false, reason: 'missing_patient' }
      }
    } else if (/\b(?:titular|owner|account holder)\b/u.test(sentence)
      || /\b(?:seu|sua|teu|tua)\s+(?:pedido|os|oculos)\b/u.test(sentence)) {
      return { valid: false, reason: 'unsupported_patient_reference' }
    }

    if (!orderStatusIsNamed(sentence, order.status)) {
      return { valid: false, reason: 'missing_status' }
    }
  }

  return mentionedOrders.size === orders.length
    ? { valid: true }
    : { valid: false, reason: 'missing_order' }
}
