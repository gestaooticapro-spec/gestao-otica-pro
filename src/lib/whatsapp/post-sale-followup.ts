import type { Json } from '@/lib/database.types'

export const DEFAULT_POST_SALE_FOLLOWUP_DAYS = 7
export const DEFAULT_POST_SALE_FOLLOWUP_TEMPLATE = [
  'Olá, {nome}! Aqui é da ótica.',
  '',
  'A retirada de {paciente} aconteceu há {dias} dias e queríamos saber como está a adaptação.',
].join('\n')

export type WhatsAppPostSaleFollowupSettings = {
  enabled?: boolean
  template?: string
  days_after_delivery?: number
  business_hours_only?: boolean
}

export type PostSaleFollowupSettings = Required<WhatsAppPostSaleFollowupSettings>

export type PostSaleFollowupStage =
  | 'awaiting_feedback'
  | 'awaiting_rating'
  | 'completed'
  | 'handoff'

export type PostSaleContext = {
  followupId?: number | null
  postSalesId?: number | null
  serviceOrderId?: number | null
  customerId?: number | null
  deliveryDate?: string | null
  stage?: PostSaleFollowupStage | null
  ratingPromptCount?: number | null
}

export type PostSaleTurnDisposition = 'handle_post_sale' | 'route_other_topic' | 'suppress_preserving_context'

export function postSaleRatingPromptText() {
  return 'Que bom saber disso. Se puder, me responda com uma nota de 1 a 5 para avaliarmos o atendimento da nossa equipe.'
}

export function postSaleRatingThanksText(rating: number) {
  return `Perfeito! Obrigado pela nota ${rating}. Vou registrar seu retorno aqui e qualquer coisa nossa equipe segue a disposicao.`
}

export function validatePostSaleActionReply(input: {
  text: string
  action: 'request_rating' | 'confirm_rating'
  rating?: number | null
}): { valid: true } | { valid: false; reason: string } {
  const normalized = input.text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
  if (!normalized || normalized.length > 600) return { valid: false, reason: 'empty_or_long_reply' }
  if (/\b(?:os|pedido)\s*#?\d+\b|\bcpf\b|\bpix\b/.test(normalized)) {
    return { valid: false, reason: 'unrelated_customer_facts' }
  }

  if (input.action === 'request_rating') {
    const acknowledgesFeedback = /\b(?:bom|otimo|legal|feliz|contente|agradec\w*|great|glad|happy|pleased|good|nice|gracias|alegr\w*|bien|genial)\b/.test(normalized)
    const requestsRating = /\b(?:nota|avaliacao|pontuacao|rating|rate|score|calificacion|valoracion)\b/.test(normalized)
    const includesScale = /\b1\s*(?:a|ate|ao|to|-)\s*5\b/.test(normalized)
    return acknowledgesFeedback && requestsRating && includesScale
      ? { valid: true }
      : { valid: false, reason: 'rating_question_missing' }
  }

  const rating = input.rating
  if (!Number.isInteger(rating) || !rating || rating < 1 || rating > 5) {
    return { valid: false, reason: 'invalid_confirmed_rating' }
  }
  const thanks = /\b(?:obrigad\w*|agradec\w*|thank\w*|graci\w*)\b/.test(normalized)
  const statesRecorded = /\b(?:registrad[oa]s?|registrei|anotad[oa]s?|anotei|salv[oa]s?|salvei|gravad[oa]s?|gravei|recorded|noted|saved)\b/.test(normalized)
  const includesRating = new RegExp(`\\b${rating}\\b`).test(normalized)
  return thanks && statesRecorded && includesRating
    ? { valid: true }
    : { valid: false, reason: 'rating_confirmation_missing' }
}

export function shouldUseStoreOnePilotDuringPostSale(input: {
  context: PostSaleContext | null
  explicitRating: number | null
  explicitOrderRequest: boolean
  classificationSucceeded: boolean
  intent: string | null
  confidence: number
  minimumConfidence: number
}) {
  if (!input.context?.postSalesId || input.context.stage === 'completed') return true
  if (input.explicitRating) return false
  if (input.explicitOrderRequest) return true
  return input.classificationSucceeded
    && input.intent === 'order_status'
    && input.confidence >= input.minimumConfidence
}

export const STORE_ONE_POST_SALE_TEST_PROTOCOL = '1043'
export const STORE_ONE_POST_SALE_TEST_MARKER = 'store_1_protocol_1043'

export function isStoreOnePostSaleTestProtocol(protocol: string | null | undefined) {
  return String(protocol ?? '').replace(/\D/g, '') === STORE_ONE_POST_SALE_TEST_PROTOCOL
}

export function canBypassPostSaleBusinessHoursForTest(input: {
  followupId: number
  targetFollowupId?: number
  storeId: number
  manualTestMarker: string | null | undefined
}) {
  return input.storeId === 1
    && input.targetFollowupId === input.followupId
    && input.manualTestMarker === STORE_ONE_POST_SALE_TEST_MARKER
}

export function canReuseStoreOnePostSaleTestFollowup(input: {
  protocol: string
  storeId: number
  status: string
  serviceOrderId: number | null | undefined
  expectedServiceOrderId: number
  coveredServiceOrderIds: number[] | null | undefined
  remotePhoneMatches: boolean
}) {
  const coveredIds = input.coveredServiceOrderIds ?? []
  return input.storeId === 1
    && isStoreOnePostSaleTestProtocol(input.protocol)
    && input.serviceOrderId === input.expectedServiceOrderId
    && coveredIds.length === 1
    && coveredIds[0] === input.expectedServiceOrderId
    && input.remotePhoneMatches
    && ['scheduled', 'sent', 'failed', 'cancelled'].includes(input.status)
}

export type PostSaleForcedToolCall =
  | { name: 'request_post_sale_rating' }
  | { name: 'record_post_sale_rating'; rating: number }

export function getPostSaleForcedToolCall(input: {
  context: PostSaleContext | null
  disposition: PostSaleTurnDisposition | null
  intent: string | null
  explicitRating: number | null
}): PostSaleForcedToolCall | null {
  if (!input.context?.postSalesId || input.disposition !== 'handle_post_sale') return null

  if (input.context.stage === 'awaiting_rating' && input.explicitRating) {
    return { name: 'record_post_sale_rating', rating: input.explicitRating }
  }

  if (input.context.stage === 'awaiting_feedback' && input.intent === 'post_sale_positive') {
    return { name: 'request_post_sale_rating' }
  }

  return null
}

export function decidePostSaleTurnDisposition(input: {
  classificationSucceeded: boolean
  confidence: number
  automationCandidate: boolean
  intent: string | null
  minimumConfidence: number
}): PostSaleTurnDisposition {
  if (
    !input.classificationSucceeded
    || input.confidence < input.minimumConfidence
    || !input.intent
    || input.intent === 'unknown'
  ) {
    return 'suppress_preserving_context'
  }

  if (input.intent === 'post_sale_positive'
    || input.intent === 'complaint_or_adaptation'
    || input.intent === 'human_agent_request') {
    return 'handle_post_sale'
  }

  return input.automationCandidate
    ? 'route_other_topic'
    : 'suppress_preserving_context'
}

export function transitionPostSaleContextAfterTurn(
  context: PostSaleContext | null,
  outcome: 'preserve' | 'rating_requested' | 'rating_recorded' | 'post_sale_handoff'
): PostSaleContext | null {
  if (!context) return null
  if (outcome === 'rating_recorded') return { ...context, stage: 'completed' }
  if (outcome === 'rating_requested' && context.stage === 'awaiting_feedback') {
    return { ...context, stage: 'awaiting_rating', ratingPromptCount: 1 }
  }
  if (outcome === 'post_sale_handoff') return { ...context, stage: 'handoff' }
  return context
}

export type StalePostSaleFollowupRecovery =
  | 'reschedule'
  | 'finalize_sent'
  | 'mark_failed'
  | 'manual_review'

export type PostSaleDeadlineOutcome = 'auto_score_3' | 'auto_score_4' | 'keep_human'

export function decidePostSaleDeadlineOutcome(interactionSummaries: Array<string | null | undefined>): PostSaleDeadlineOutcome {
  const summaries = interactionSummaries
    .map((summary) => String(summary || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase())

  if (summaries.some((summary) => (
    summary.includes('handoff')
    || summary.includes('reclamacao')
    || summary.includes('adaptacao ruim')
    || summary.includes('atendimento humano')
  ))) {
    return 'keep_human'
  }

  return summaries.some((summary) => summary.includes('respondeu positivamente'))
    ? 'auto_score_4'
    : 'auto_score_3'
}

export function buildPostSaleFollowupSettings(
  saved: WhatsAppPostSaleFollowupSettings | undefined
): PostSaleFollowupSettings {
  return {
    enabled: saved?.enabled === true,
    template: saved?.template?.trim() || DEFAULT_POST_SALE_FOLLOWUP_TEMPLATE,
    days_after_delivery: Math.max(1, Number(saved?.days_after_delivery || DEFAULT_POST_SALE_FOLLOWUP_DAYS)),
    // Pos-venda sempre respeita o horario comercial e os slots exclusivos.
    business_hours_only: true,
  }
}

function firstName(fullName: string) {
  return fullName.trim().split(/\s+/)[0] || fullName
}

function patientText(customerName: string, dependentName: string | null) {
  if (!dependentName || dependentName.trim() === customerName.trim()) return 'seus óculos'
  return `óculos de ${dependentName.trim()}`
}

function replaceMarkers(template: string, values: Record<string, string>) {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, value),
    template
  )
}

export function buildPostSaleFollowupMessage(input: {
  template: string
  customerName: string
  dependentName: string | null
  daysSinceDelivery: number
  groupedServiceOrderCount?: number
}) {
  const count = Math.max(1, Number(input.groupedServiceOrderCount || 1))
  let message = replaceMarkers(input.template, {
    nome: firstName(input.customerName),
    titular: input.customerName,
    paciente: input.dependentName
      ? (count > 1 ? `${count} pares de óculos de ${input.dependentName.trim()}` : patientText(input.customerName, input.dependentName))
      : (count > 1 ? `seus ${count} pares de óculos` : patientText(input.customerName, input.dependentName)),
    dias: `${Math.max(1, input.daysSinceDelivery)}`,
  })

  if (count > 1) {
    message = message.replace(/\bfoi retirad[oa]\b/gi, 'foram retirados')
  }

  message = message
    .replace(/\boculos\b/gi, 'óculos')
    .replace(/\bqueriamos\b/gi, 'queríamos')

  return message
}

export function extractPostSaleRating(message: string | null | undefined) {
  const normalized = String(message || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

  if (!normalized) return null

  // 1) Prioriza "nota N" explícita em qualquer ponto da mensagem.
  //    Ex.: "nota 5", "dei nota 4 pra voces", "nota:3".
  const explicit = normalized.match(/\bnota\s*:?\s*(?:(?:e|foi|seria|fica)\s+)?([1-5])\b/)
  if (explicit) {
    const rating = Number(explicit[1])
    if (rating >= 1 && rating <= 5) return rating
  }

  // 2) Mensagem composta APENAS pelo número (eventual pontuação/espacos).
  //    Evita capturar digitos soltos em frases longas como "faz 2 dias, nota 5".
  //    Aceita "5", "5!", "5 estrelas", "5/5".
  const isolated = normalized.match(/^([1-5])\s*(?:(?:\/\s*5)|estrelas?)?\s*[!.?]*$/)
  if (isolated) return Number(isolated[1])

  return null
}

export function extractPostSaleRatingForStage(
  message: string | null | undefined,
  stage: PostSaleFollowupStage | null | undefined
) {
  return stage === 'awaiting_rating' ? extractPostSaleRating(message) : null
}

export function decideStalePostSaleFollowupRecovery(input: {
  outboundMessageId: number | null
  outboundStatus: string | null
}): StalePostSaleFollowupRecovery {
  if (!input.outboundMessageId) return 'reschedule'
  if (input.outboundStatus === 'sent') return 'finalize_sent'
  if (input.outboundStatus === 'failed') return 'mark_failed'
  return 'manual_review'
}

export function readPostSaleContext(metadata: Json | null | undefined): PostSaleContext | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null

  const raw = (metadata as Record<string, Json | undefined>).postSaleContext
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null

  const value = raw as Record<string, unknown>
  const toNumber = (input: unknown) => (typeof input === 'number' && Number.isFinite(input) ? input : null)
  const toString = (input: unknown) => (typeof input === 'string' && input.trim() ? input.trim() : null)
  const stage = toString(value.stage)

  return {
    followupId: toNumber(value.followupId),
    postSalesId: toNumber(value.postSalesId),
    serviceOrderId: toNumber(value.serviceOrderId),
    customerId: toNumber(value.customerId),
    deliveryDate: toString(value.deliveryDate),
    stage: stage === 'awaiting_feedback' || stage === 'awaiting_rating' || stage === 'completed' || stage === 'handoff'
      ? stage
      : null,
    ratingPromptCount: toNumber(value.ratingPromptCount),
  }
}
