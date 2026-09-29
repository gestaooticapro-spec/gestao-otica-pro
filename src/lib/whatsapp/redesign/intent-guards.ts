function normalize(text: string | null | undefined) {
  return String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()
}

export function isExplicitOrderReadinessQuestion(text: string | null | undefined) {
  const normalized = normalize(text)
  const mentionsOpticalItem = /\b(?:oculos|lentes?|armacao)\b/u.test(normalized)
  const asksWhetherReady = /\b(?:pront[oa]s?|list[oa]s?|ready|concluid[oa]s?|finalizad[oa]s?|liberad[oa]s?)\b/u.test(normalized)
  return mentionsOpticalItem && asksWhetherReady
}

export function isExplicitOrderStatusQuestion(text: string | null | undefined) {
  const normalized = normalize(text)
  const asksForStatus = /\b(?:status|andamento|situacao)\b/u.test(normalized)
  const referencesOrder = /\b(?:pedido|os|ordem(?: de servico)?)\b/u.test(normalized)
    || /\b(?:meu|minha) oculos\b/u.test(normalized)
  return asksForStatus && referencesOrder
}

export function isExplicitOrderStatusOrReadinessQuestion(text: string | null | undefined) {
  return isExplicitOrderStatusQuestion(text) || isExplicitOrderReadinessQuestion(text)
}

export function isExplicitHumanHandoffRequest(text: string | null | undefined) {
  const normalized = normalize(text)
  return /\b(?:quero|preciso|gostaria de) (?:falar|conversar) com (?:um )?(?:atendente|humano|pessoa|alguem)\b/u.test(normalized)
}

export function isExplicitStoreHoursQuestion(text: string | null | undefined) {
  const normalized = normalize(text)
  return /\b(?:horario|que horas|a que horas|abr\w*|abiert\w*|fech\w*|funcion\w*)\b/u.test(normalized)
}

export function enforceWhatsAppIntentEvidence(input: {
  route: string
  intent: string | null | undefined
  messageText: string | null | undefined
}) {
  if (isExplicitOrderStatusOrReadinessQuestion(input.messageText)) return 'order_status'
  if (input.intent === 'store_hours' && !isExplicitStoreHoursQuestion(input.messageText)) return 'fallback'
  return input.route
}
