import type { Json } from '@/lib/database.types'

export const DEFAULT_POST_SALE_FOLLOWUP_DAYS = 7
export const DEFAULT_POST_SALE_FOLLOWUP_TEMPLATE = [
  'Ola, {nome}! Aqui e da otica.',
  '',
  'Ja faz {dias} dias que {paciente} foi retirado e queriamos saber como esta a adaptacao.',
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

export function buildPostSaleFollowupSettings(
  saved: WhatsAppPostSaleFollowupSettings | undefined
): PostSaleFollowupSettings {
  return {
    enabled: saved?.enabled === true,
    template: saved?.template?.trim() || DEFAULT_POST_SALE_FOLLOWUP_TEMPLATE,
    days_after_delivery: Math.max(1, Number(saved?.days_after_delivery || DEFAULT_POST_SALE_FOLLOWUP_DAYS)),
    business_hours_only: saved?.business_hours_only !== false,
  }
}

function firstName(fullName: string) {
  return fullName.trim().split(/\s+/)[0] || fullName
}

function patientText(customerName: string, dependentName: string | null) {
  if (!dependentName || dependentName.trim() === customerName.trim()) return 'seus oculos'
  return `os oculos de ${dependentName.trim()}`
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
}) {
  return replaceMarkers(input.template, {
    nome: firstName(input.customerName),
    titular: input.customerName,
    paciente: patientText(input.customerName, input.dependentName),
    dias: `${Math.max(1, input.daysSinceDelivery)}`,
  })
}

export function extractPostSaleRating(message: string | null | undefined) {
  const normalized = String(message || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

  const match = normalized.match(/\b(?:nota\s*)?([1-5])\b/)
  if (!match) return null

  const rating = Number(match[1])
  return rating >= 1 && rating <= 5 ? rating : null
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
