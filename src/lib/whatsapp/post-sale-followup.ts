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
  const explicit = normalized.match(/\bnota\s*:?\s*([1-5])\b/)
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
