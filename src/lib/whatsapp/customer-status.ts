/* eslint-disable @typescript-eslint/no-explicit-any */

import { createAdminClient } from '@/lib/supabase/admin'
import { Database, Json } from '@/lib/database.types'
import { describeOpenOs, WhatsAppOsStatusCode } from './os-status'
import { digitsOnly, getPhoneVariants, phonesMatch, phonesMatchLast8, toEvolutionNumber } from './phone'
import type { StoreSettings } from '@/lib/store-modules'
import { evaluateStoreHours } from './store-hours-logic'
import {
  classifyWhatsAppIntent,
  resolveWhatsAppPostSaleRating,
  humanizeWhatsAppReply,
  generateWhatsAppFallbackReply,
  extractReceiptWithVision,
  type WhatsAppReceiptExtraction,
  type WhatsAppIntentClassification,
  type WhatsAppAiResult,
  type WhatsAppAiTokenUsage,
} from './ai'
import {
  extractWhatsAppInboundPayloadMeta,
  isWhatsAppInboundPayloadFromMe,
  stripWhatsAppInboundMediaContent,
} from './inbound-payload'
import {
  buildWhatsAppCanonicalPayload,
  extractWhatsAppCanonicalReply,
} from './canonical'
import { decidePreAiRoute, shouldReleaseClosedTrapPause } from './routing-heuristics'
import { decidePostClassificationRoute, type WhatsAppPostClassificationDecision } from './flow-decisions'
import {
  applyWhatsAppHumanizationOutcome,
  decideWhatsAppHumanization,
} from './humanization'
import { findOpenInstallmentsByPhone } from '@/lib/actions/consultas.actions'
import {
  extractPostSaleRatingForStage,
  readPostSaleContext,
  type PostSaleContext,
} from './post-sale-followup'
import { concludePostSaleFromWhatsApp, recordPostSaleInteraction } from './post-sales'
import {
  buildWhatsAppStatusContextLine,
  findWhatsAppStatusPublication,
} from './status-publications'

const SAME_STATUS_SILENCE_WINDOW_MS = 2 * 60 * 60 * 1000
const HUMAN_PAUSE_MS = 60 * 60 * 1000
const HUMAN_HANDOFF_PAUSE_MS = 12 * 60 * 60 * 1000
const AI_SESSION_MS = 2 * 60 * 60 * 1000
const MENU_WAIT_MS = 30 * 60 * 1000
const IDENTIFIER_WAIT_MS = 20 * 60 * 1000
const AFTER_STATUS_SILENCE_MS = 60 * 60 * 1000
const ATTACHMENT_HANDOFF_MS = 2 * 60 * 60 * 1000
const AI_AUTOMATION_MIN_CONFIDENCE = 0.78
const WHATSAPP_AI_FINAL_WRITER_ENABLED = process.env.WHATSAPP_AI_FINAL_WRITER_ENABLED !== 'false'
const POST_SALE_PERSISTENT_MEMORY_MS = 7 * 24 * 60 * 60 * 1000

const AI_SESSION_HISTORY_MAX = 8
const AI_SESSION_TEXT_MAX = 280

type ConversationState = 'ai_session' | 'waiting_menu' | 'waiting_identifier' | 'human_pause' | 'silent' | 'waiting_human_after_attachment'
type AiSessionMessageRole = 'customer' | 'assistant'
type AiSessionMessage = {
  role: AiSessionMessageRole
  text: string
  at: string
}

type ChannelRow = {
  id: number
  tenant_id: string
  store_id: number
  instance_key: string
  phone_number: string
  is_active: boolean
}

type CustomerRow = {
  id: number
  full_name: string
  cpf: string | null
  fone_movel?: string | null
  phone?: string | null
}

type ConversationStateRow = {
  id: number
  remote_phone: string
  state: ConversationState
  expires_at: string
  metadata: Json | null
}

type LastOutboundStatusRow = {
  created_at: string
  message_text: string
  payload: Json | null
}

type OpenOsRow = {
  id: number
  created_at: string
  dependente_name: string | null
  dt_pedido_em: string | null
  dt_lente_chegou: string | null
  dt_montado_em: string | null
  armacao_com_cliente: boolean
}

type StoreProfileRow = Pick<
  Database['public']['Tables']['stores']['Row'],
  'id' | 'name' | 'whatsapp' | 'phone' | 'street' | 'number' | 'neighborhood' | 'city' | 'state' | 'settings'
> & {
  razao_social?: string | null
  pix_key?: string | null
  pix_city?: string | null
}

type ConversationMetadataRecord = Record<string, Json | undefined>
type CustomerControlMode = 'auto' | 'force_ai' | 'force_human'
type CustomerLinkSource = 'phone_match' | 'status_lookup' | 'identifier_lookup' | 'manual'

type PaymentInstallmentMatch = {
  installment_id?: number | null
  customer_id?: number | null
  due_date?: string | null
  amount?: number | string | null
  customer_name?: string | null
}

type ExactReceiptInstallmentMatch = {
  installment_id: number
  customer_id: number | null
  due_date: string | null
  amount: number | null
  customer_name: string | null
}

type PaymentReminderContext = {
  reminderId?: number | null
  installmentId?: number | null
  customerId?: number | null
  outboundMessageId?: number | null
  dueDate?: string | null
  amount?: number | null
  installmentNumber?: number | null
  totalInstallments?: number | null
}

type PostSaleRatingOutcome = {
  rating: number
  stage: 'awaiting_rating'
}

type PersistentPostSaleMemory = {
  context: PostSaleContext | null
  recentContextLines: string[]
  isRecoverableAutomationContext: boolean
}

type WhatsAppAiDiagnostic = {
  task: 'intent_classification' | 'post_sale_rating_resolution' | 'reply_humanization' | 'fallback_reply' | 'receipt_extraction'
  success: boolean
  provider: string
  model: string
  latencyMs: number
  intent?: string | null
  confidence?: number | null
  tokenUsage?: WhatsAppAiTokenUsage
  error?: string
}

export type CustomerStatusRequest = {
  instanceKey: string
  phone: string
  providerMessageId: string
  messageText?: string
  statusReferenceId?: string | null
  statusInteractionType?: 'reply' | 'reaction' | null
  providerCreatedAt?: string | null
  payload?: Json
}

export type CustomerStatusResponse = {
  shouldReply: boolean
  duplicate?: boolean
  phone?: string
  customerName?: string
  serviceOrderId?: number
  statusCode?: string
  replyText?: string
  outboundMessageId?: number
  aiDiagnostics?: WhatsAppAiDiagnostic[]
}

export type CustomerStatusSimulationResponse = CustomerStatusResponse & {
  debug: {
    overrideMode: CustomerControlMode
    preAiRoute: string | null
    postClassificationRoute: string | null
    action: string
    outboundType: string | null
    state: string | null
    intent: string | null
    confidence: number | null
    notes: string[]
  }
}

export type StoreInitiatedConversationRequest = {
  instanceKey: string
  phone: string
  providerMessageId?: string
  messageText?: string
  payload?: Json
  mirrorOutbound?: boolean
}

function expiresIn(ms: number) {
  return new Date(Date.now() + ms).toISOString()
}

function normalizeMessage(value: string | null | undefined) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function installmentReminderPreferenceCommand(value: string | null | undefined): {
  action: 'opt_out' | 'opt_in'
  requiresReminderContext: boolean
} | null {
  const normalized = normalizeMessage(value)
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (normalized === 'parar') return { action: 'opt_out', requiresReminderContext: false }
  if (['voltar', 'reativar'].includes(normalized)) return { action: 'opt_in', requiresReminderContext: false }
  if (['sair', 'cancelar', 'nao receber', 'nao quero receber'].includes(normalized)) {
    return { action: 'opt_out', requiresReminderContext: true }
  }

  return null
}

async function setInstallmentReminderPreference(input: {
  channel: ChannelRow
  remotePhone: string
  enabled: boolean
  changedAt: string
}) {
  const supabase = createAdminClient()
  const phoneVariants = [...getPhoneVariants(input.remotePhone)]
  const { data: existingRows, error: loadError } = await (supabase.from('whatsapp_message_preferences') as any)
    .select('id, remote_phone')
    .eq('store_id', input.channel.store_id)
    .in('remote_phone', phoneVariants)

  if (loadError) throw loadError

  const matchingRows = (existingRows ?? [])
    .filter((row: { remote_phone?: string | null }) => phonesMatch(row.remote_phone, input.remotePhone))

  const values = {
    installment_reminders_enabled: input.enabled,
    installment_reminders_changed_at: input.changedAt,
    updated_at: input.changedAt,
  }

  if (matchingRows.length > 0) {
    for (const row of matchingRows as Array<{ id: number }>) {
      const { error } = await (supabase.from('whatsapp_message_preferences') as any)
        .update(values)
        .eq('id', row.id)
        .lte('installment_reminders_changed_at', input.changedAt)

      if (error) throw error
    }
    return
  }

  const { error } = await (supabase.from('whatsapp_message_preferences') as any)
    .insert({
      tenant_id: input.channel.tenant_id,
      store_id: input.channel.store_id,
      remote_phone: input.remotePhone,
      ...values,
    })

  if (error) throw error
}

function preferenceChangedAt(providerCreatedAt: string | null | undefined) {
  const parsed = providerCreatedAt ? new Date(providerCreatedAt) : null
  return parsed && Number.isFinite(parsed.getTime()) ? parsed.toISOString() : new Date().toISOString()
}

function looksLikeOrderStatusQuestion(message: string | null | undefined) {
  const normalized = normalizeMessage(message || undefined)
  if (!normalized) return false

  return [
    /\bos\b/,
    /\boculos\b/,
    /\bpedido\b/,
    /\bpronto\b/,
    /\baberta\b/,
    /\bretirada\b/,
    /\blente\b/,
    /\bmontagem\b/,
  ].some((pattern) => pattern.test(normalized))
}

function looksLikeGenericGreeting(message: string | null | undefined) {
  const normalized = normalizeMessage(message || undefined)
  if (!normalized) return false

  return [
    'oi',
    'ola',
    'hola',
    'bom dia',
    'boa tarde',
    'boa noite',
    'opa',
    'e ai',
    'eae',
  ].includes(normalized)
}

function menuText() {
  return [
    'Olá! Sou o atendimento automático da ótica.',
    '',
    'Nossa equipe pode estar em atendimento no momento, mas consigo te ajudar com algumas coisas por aqui:',
    '',
    '1 - Ver se meu óculos está pronto',
    '2 - Falar com atendente',
    '',
    'Digite o número da opção desejada.',
  ].join('\n')
}

function identifierPromptText() {
  return [
    'Não encontrei um pedido em aberto ligado a este WhatsApp.',
    '',
    'Se quiser, posso tentar localizar de outra forma. Envie o CPF do titular, o número do pedido ou o nome completo.',
  ].join('\n')
}

function thirdPartyIdentifierPromptText() {
  return [
    'Para consultar o pedido de outra pessoa, preciso confirmar um identificador do titular.',
    '',
    'Envie o nome completo, CPF ou número do pedido para eu tentar localizar com segurança.',
  ].join('\n')
}

function humanHandoffText() {
  return 'Certo. Vou deixar a conversa para nossa equipe continuar o atendimento por aqui.'
}

function notFoundHandoffText() {
  return [
    'Não consegui encontrar um pedido em aberto com essas informações.',
    'Vou deixar a conversa para nossa equipe continuar o atendimento por aqui.',
  ].join('\n')
}

function attachmentReceivedText() {
  return [
    'Recebi seu arquivo direitinho.',
    'Vou encaminhar para nossa equipe continuar o atendimento por aqui.',
  ].join('\n')
}

function attachmentFollowupText() {
  return 'Perfeito. Vou deixar esse atendimento com nossa equipe para analisar o arquivo e continuar por aqui.'
}

function aiGreetingText() {
  return 'Oi! Sou a IAra, assistente virtual da \u00f3tica. Como posso te ajudar hoje?'
}

function aiClarificationText() {
  return 'Entendi. Para eu te ajudar melhor, me diga por favor se voc\u00ea quer falar sobre pedido, hor\u00e1rio da loja, pagamento, or\u00e7amento ou atendimento com a equipe.'
}

function buildClosedStoreText(hoursFacts: ReturnType<typeof evaluateStoreHours>) {
  const nextOpen = hoursFacts.next_open_schedule?.trim()
  const todaySchedule = hoursFacts.today_schedule?.trim()
  const weeklySchedule = hoursFacts.full_weekly_schedule?.trim()
  const exceptionalReason = hoursFacts.exceptional_closure_reason?.trim()
  const lowerReason = (exceptionalReason || '').toLowerCase()
  const isLunchBreak = lowerReason.includes('almo') || lowerReason.includes('intervalo')
  const nextSentence = nextOpen ? ` Voltamos ${nextOpen}.` : ''
  const weeklySentence = weeklySchedule ? ` Nosso hor\u00e1rio normal de atendimento \u00e9: ${weeklySchedule}.` : ''

  if (hoursFacts.is_exceptional_closure && exceptionalReason) {
    return `Oi! No momento nossa loja est\u00e1 fechada por um motivo especial: ${exceptionalReason}.${nextSentence} Queremos te atender assim que retornarmos, ent\u00e3o pode deixar sua mensagem por aqui.${weeklySentence}`.trim()
  }

  if (isLunchBreak) {
    return `Oi! No momento estamos em ${exceptionalReason || 'intervalo'} e por isso a loja est\u00e1 temporariamente fechada.${nextSentence} Queremos te atender assim que voltarmos.${weeklySentence}`.trim()
  }

  if (nextOpen.startsWith('Segunda-feira')) {
    return `Oi! No momento nossa loja est\u00e1 fechada.${nextSentence} Se preferir, j\u00e1 pode deixar sua mensagem que atenderemos voc\u00ea assim que abrirmos.${weeklySentence}`.trim()
  }

  if (nextOpen.startsWith('Hoje')) {
    return `Oi! No momento nossa loja est\u00e1 fechada, mas abrimos novamente ${nextOpen.toLowerCase()}. Queremos te atender, ent\u00e3o se preferir j\u00e1 pode deixar sua mensagem por aqui.${weeklySentence}`.trim()
  }

  if (todaySchedule && todaySchedule !== 'Fechado') {
    return `Oi! No momento estamos fora do hor\u00e1rio de atendimento de hoje (${todaySchedule}).${nextSentence} Queremos te atender assim que retornarmos.${weeklySentence}`.trim()
  }

  return `Oi! No momento nossa loja est\u00e1 fechada.${nextSentence} Queremos te atender assim que abrirmos, ent\u00e3o pode deixar sua mensagem por aqui.${weeklySentence}`.trim()
}

function normalizeDisplayText(value: string | null | undefined) {
  const normalized = String(value || '').trim()
  return normalized || null
}

function asJsonRecord(value: Json | StoreSettings | null | undefined): Record<string, Json | undefined> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, Json | undefined>
}

function readFirstString(
  record: Record<string, Json | undefined> | null,
  keys: string[]
) {
  if (!record) return null

  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return null
}

function formatStoreAddress(store: StoreProfileRow) {
  const line1 = [store.street, store.number].map(normalizeDisplayText).filter(Boolean).join(', ')
  const line2 = [store.neighborhood, store.city, store.state].map(normalizeDisplayText).filter(Boolean).join(' - ')
  return [line1, line2].filter(Boolean).join(', ')
}

function buildStoreLocationText(store: StoreProfileRow) {
  const address = formatStoreAddress(store)
  if (!address) return null

  const phone = normalizeDisplayText(store.whatsapp) || normalizeDisplayText(store.phone)
  const mapsUrl = buildStoreMapsUrl(store)
  const extra = phone ? ` Se precisar, nosso contato é ${phone}.` : ''
  const mapsText = mapsUrl ? ` Se preferir, aqui esta nossa localizacao no mapa: ${mapsUrl}` : ''
  return `Nossa loja fica em ${address}.${mapsText}${extra}`.trim()
}

function buildStoreMapsUrl(store: StoreProfileRow) {
  const address = formatStoreAddress(store)
  if (!address) return null

  const query = new URLSearchParams({ query: address }).toString()
  return `https://www.google.com/maps/search/?api=1&${query}`
}

function buildStoreLocationReply(store: StoreProfileRow) {
  const address = formatStoreAddress(store)
  if (!address) return null

  const phone = normalizeDisplayText(store.whatsapp) || normalizeDisplayText(store.phone)
  const mapsUrl = buildStoreMapsUrl(store)
  const extra = phone ? ` Se precisar, nosso contato \u00e9 ${phone}.` : ''
  const mapsText = mapsUrl ? ` Se preferir, aqui est\u00e1 nossa localiza\u00e7\u00e3o no mapa: ${mapsUrl}` : ''
  return `Nossa loja fica em ${address}.${mapsText}${extra}`.trim()
}

function extractStoreHoursText(settings: StoreSettings | undefined) {
  const root = asJsonRecord(settings)
  const whatsappAutomation = asJsonRecord(root?.whatsapp_automation as Json | undefined)
  const storeInfo = asJsonRecord(whatsappAutomation?.store_info as Json | undefined)

  return readFirstString(storeInfo, [
    'store_hours_text',
    'business_hours_text',
    'opening_hours_text',
    'hours_text',
    'horario_funcionamento',
    'horario_atendimento',
  ]) ?? readFirstString(whatsappAutomation, [
    'store_hours_text',
    'business_hours_text',
    'opening_hours_text',
    'hours_text',
    'horario_funcionamento',
    'horario_atendimento',
  ]) ?? readFirstString(root, [
    'store_hours_text',
    'business_hours_text',
    'opening_hours_text',
    'hours_text',
    'horario_funcionamento',
    'horario_atendimento',
  ])
}

function buildStoreHoursText(store: StoreProfileRow) {
  const settings = ((store.settings || {}) as StoreSettings) || {}
  
  if (settings.store_hours) {
    const facts = evaluateStoreHours(settings.store_hours)
    return `Nosso horário de atendimento é: ${facts.full_weekly_schedule}.`
  }

  const hours = extractStoreHoursText(settings)
  if (!hours) return null

  return `Nosso horário de atendimento é ${hours}.`
}

function canUseAiForFreeform(message: string | undefined) {
  return normalizeDisplayText(message)?.length ? true : false
}

function buildAiPayload(classification: WhatsAppIntentClassification): ConversationMetadataRecord {
  return {
    aiIntent: classification.intent,
    aiConfidence: classification.confidence,
    aiAutomationCandidate: classification.automation_candidate,
    aiReasoningTags: classification.reasoning_tags,
  }
}

function buildAiStateMetadata(reason: string, classification: WhatsAppIntentClassification): ConversationMetadataRecord {
  return {
    reason,
    aiIntent: classification.intent,
    aiConfidence: classification.confidence,
    aiAutomationCandidate: classification.automation_candidate,
    aiReasoningTags: classification.reasoning_tags,
  }
}

function buildDecisionMetadata(input: {
  intent: string | null
  confidence?: number | null
  action: string
  outboundType: string | null
}) {
  return {
    lastIntent: input.intent,
    lastIntentConfidence: input.confidence ?? null,
    lastAction: input.action,
    lastOutboundType: input.outboundType,
    lastDecisionAt: new Date().toISOString(),
  } satisfies ConversationMetadataRecord
}

function buildPaymentInstallmentMetadata(
  installments: PaymentInstallmentMatch[] | null | undefined,
  fallbackPhone: string
): ConversationMetadataRecord {
  if (!installments || installments.length === 0) {
    return {
      paymentInstallmentHint: null,
    }
  }

  const first = installments[0]
  const customerName = typeof first.customer_name === 'string' && first.customer_name.trim().length > 0
    ? first.customer_name.trim()
    : null

  return {
    paymentInstallmentHint: {
      count: installments.length,
      firstInstallmentId: typeof first.installment_id === 'number' ? first.installment_id : null,
      customerId: typeof first.customer_id === 'number' ? first.customer_id : null,
      customerName,
      dueDate: typeof first.due_date === 'string' ? first.due_date : null,
      amount: typeof first.amount === 'number' ? first.amount : Number(first.amount || 0) || null,
      searchQuery: customerName || fallbackPhone,
      exactMatch: installments.length === 1,
      source: 'phone_match',
    } as unknown as Json,
  }
}

function buildPaymentInstallmentMetadataFromReminderContext(
  context: PaymentReminderContext | null | undefined,
  fallbackPhone: string
): ConversationMetadataRecord {
  if (!context || !context.installmentId) {
    return {
      paymentInstallmentHint: null,
    }
  }

  return {
    paymentInstallmentHint: {
      count: 1,
      firstInstallmentId: context.installmentId,
      customerId: context.customerId ?? null,
      customerName: null,
      dueDate: context.dueDate ?? null,
      amount: context.amount ?? null,
      searchQuery: fallbackPhone,
      exactMatch: true,
      source: 'reminder_context',
    } as unknown as Json,
  }
}

function buildPaymentInstallmentMetadataFromExactReceiptMatch(
  match: ExactReceiptInstallmentMatch
): ConversationMetadataRecord {
  return {
    paymentInstallmentHint: {
      count: 1,
      firstInstallmentId: match.installment_id,
      customerId: match.customer_id,
      customerName: match.customer_name,
      dueDate: match.due_date,
      amount: match.amount,
      searchQuery: match.customer_name || null,
      exactMatch: true,
      source: 'receipt_exact_match',
    } as unknown as Json,
  }
}

function formatPaymentFollowupText(customerName: string, installments: PaymentInstallmentMatch[]) {
  if (!installments.length) {
    return 'Consegui localizar o cadastro, mas vou chamar nossa equipe para confirmar os detalhes financeiros com você.'
  }

  const first = installments[0]
  const amount = Number(first.amount || 0)
  const amountText = amount > 0
    ? amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : null

  let dueDateText: string | null = null
  if (typeof first.due_date === 'string' && first.due_date.trim()) {
    const [y, m, d] = first.due_date.split('T')[0].split('-')
    if (y && m && d) {
      dueDateText = `${d}/${m}/${y}`
    }
  }

  const countText = installments.length === 1
    ? 'Encontrei 1 parcela em aberto'
    : `Encontrei ${installments.length} parcelas em aberto`

  const details = [amountText, dueDateText ? `com vencimento em ${dueDateText}` : null]
    .filter(Boolean)
    .join(' ')

  const suffix = details ? `, sendo a primeira ${details}` : ''
  return `${countText} para ${customerName}${suffix}. Vou chamar um atendente para te ajudar com os valores certinhos por aqui.`
}

function readPaymentReminderContext(metadata: Json | null | undefined): PaymentReminderContext | null {
  const record = toMetadataRecord(metadata)
  const raw = record.paymentReminderContext
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null

  const value = raw as Record<string, unknown>
  const toNumber = (input: unknown) => (typeof input === 'number' && Number.isFinite(input) ? input : null)
  const toString = (input: unknown) => (typeof input === 'string' && input.trim() ? input.trim() : null)

  return {
    reminderId: toNumber(value.reminderId),
    installmentId: toNumber(value.installmentId),
    customerId: toNumber(value.customerId),
    outboundMessageId: toNumber(value.outboundMessageId),
    dueDate: toString(value.dueDate),
    amount: toNumber(value.amount),
    installmentNumber: toNumber(value.installmentNumber),
    totalInstallments: toNumber(value.totalInstallments),
  }
}

function formatPaymentDueDate(value: string | null | undefined) {
  if (!value) return null
  const [year, month, day] = value.split('T')[0].split('-')
  if (!year || !month || !day) return null
  return `${day}/${month}/${year}`
}

function formatCurrencyBr(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function buildInstallmentLabel(context: PaymentReminderContext) {
  if (context.installmentNumber && context.totalInstallments) {
    return `${context.installmentNumber}/${context.totalInstallments}`
  }
  if (context.installmentNumber) {
    return `${context.installmentNumber}`
  }
  return null
}

function isPaymentReminderAcknowledgement(message: string | null | undefined) {
  const normalized = normalizeMessage(message || undefined)
  if (!normalized) return false

  const reactionOnly = /^[\s\u2764\u2665\uFE0F\u{1F44D}\u{1F44F}\u{1F64F}\u{1F60A}\u{1F60D}\u{1F970}]+$/u
  if (reactionOnly.test(normalized)) return true

  const textWithoutReactionEmoji = normalized
    .replace(/[\u2764\u2665\uFE0F\u{1F44D}\u{1F44F}\u{1F64F}\u{1F60A}\u{1F60D}\u{1F970}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()

  return [
    'ok',
    'okay',
    'certo',
    'ta bom',
    'tudo certo',
    'entendi',
    'recebi',
    'obrigada',
    'obrigado',
    'valeu',
    'beleza',
    'combinado',
  ].includes(textWithoutReactionEmoji)
}

function paymentReminderAcknowledgementText() {
  return 'De nada! Estamos à disposição para ajudar.'
}

function looksLikePixRequest(message: string | null | undefined) {
  const normalized = normalizeMessage(message || undefined)
  if (!normalized) return false

  return [
    'pix',
    'chave pix',
    'manda a chave',
    'manda o pix',
    'me passa o pix',
    'passa o pix',
    'copia e cola',
    'qr code',
    'qrcode',
  ].some((term) => normalized.includes(term))
}

function looksLikeAmountRequest(message: string | null | undefined) {
  const normalized = normalizeMessage(message || undefined)
  if (!normalized) return false

  return [
    'qual o valor',
    'valor da parcela',
    'quanto ficou',
    'quanto e',
    'quanto é',
    'quanto devo',
    'valor',
  ].some((term) => normalized.includes(term))
}

function buildPixKeyBaseText(store: StoreProfileRow) {
  const pixKey = normalizeDisplayText(store.pix_key)
  if (!pixKey) return null

  const holder = normalizeDisplayText(store.razao_social) || normalizeDisplayText(store.name)
  return holder
    ? `Nossa chave Pix e ${pixKey}. Favorecido: ${holder}.`
    : `Nossa chave Pix e ${pixKey}.`
}

function buildReminderPixReply(store: StoreProfileRow, context: PaymentReminderContext) {
  const pixBase = buildPixKeyBaseText(store)
  if (!pixBase) return null

  const amountText = formatCurrencyBr(context.amount)
  const dueDateText = formatPaymentDueDate(context.dueDate)
  const installmentLabel = buildInstallmentLabel(context)
  const details = [
    installmentLabel ? `da parcela ${installmentLabel}` : 'da sua parcela',
    amountText ? `no valor de ${amountText}` : null,
    dueDateText ? `com vencimento em ${dueDateText}` : null,
  ].filter(Boolean).join(' ')

  return `Claro! ${pixBase}${details ? ` ${details}.` : ''} Se fizer o pagamento, pode me enviar o comprovante por aqui.`
}

function buildReminderAmountReply(context: PaymentReminderContext) {
  const amountText = formatCurrencyBr(context.amount)
  const dueDateText = formatPaymentDueDate(context.dueDate)
  const installmentLabel = buildInstallmentLabel(context)

  if (!amountText && !dueDateText) {
    return 'Consigo te ajudar com essa parcela. Se quiser, tambem posso te passar a chave Pix por aqui.'
  }

  const subject = installmentLabel ? `A parcela ${installmentLabel}` : 'Essa parcela'
  const details = [
    amountText ? `tem o valor de ${amountText}` : null,
    dueDateText ? `e vence em ${dueDateText}` : null,
  ].filter(Boolean).join(' ')

  return `${subject} ${details}. Se quiser, tambem posso te passar a chave Pix por aqui.`
}

function buildGenericPixReply(store: StoreProfileRow) {
  const pixBase = buildPixKeyBaseText(store)
  if (!pixBase) return null

  return `${pixBase} Se for sobre uma parcela especifica, me envie o nome completo ou CPF do titular que eu tento localizar o valor certinho.`
}

function paymentMatchedHandoffText() {
  return 'Encontrei o financeiro relacionado a esse numero e vou chamar nossa equipe para continuar o atendimento por aqui.'
}

function postSaleRatingPromptText() {
  return 'Que bom saber disso. Se puder, me responda com uma nota de 1 a 5 para avaliarmos o atendimento da nossa equipe.'
}

function postSaleThanksText(rating: number) {
  return `Perfeito! Obrigado pela nota ${rating}. Vou registrar seu retorno aqui e qualquer coisa nossa equipe segue a disposicao.`
}

function postSaleComplaintHandoffText() {
  return 'Poxa, sinto muito por isso. Vou encaminhar agora mesmo para nossa equipe continuar seu atendimento por aqui com prioridade.'
}

function postSaleLowConfidenceHandoffNote() {
  return 'Resposta de pos-venda sem classificacao segura. Revisar manualmente.'
}

function readPostSaleRatingOutcome(
  message: string | null | undefined,
  context: PostSaleContext | null
): PostSaleRatingOutcome | null {
  const rating = extractPostSaleRatingForStage(message, context?.stage)
  if (!rating || !context?.stage) return null
  return { rating, stage: 'awaiting_rating' }
}

async function recordPostSaleInteractionIfPossible(input: {
  channel: ChannelRow
  postSaleContext: PostSaleContext | null
  summary: string
  dedupe?: boolean
}) {
  if (!input.postSaleContext?.postSalesId) return

  await recordPostSaleInteraction({
    tenantId: input.channel.tenant_id,
    storeId: input.channel.store_id,
    postSalesId: input.postSaleContext.postSalesId,
    summary: input.summary,
    interactionType: 'WhatsApp Automatico',
    dedupe: input.dedupe,
  })
}

function applyForceAiPostClassificationRoute(
  route: WhatsAppPostClassificationDecision,
  classification: WhatsAppIntentClassification | null,
  controlMode: CustomerControlMode
): WhatsAppPostClassificationDecision {
  if (controlMode !== 'force_ai' || route !== 'silent_handoff') return route
  if (!classification) return route

  if (
    classification.intent === 'budget_request'
    || classification.intent === 'complaint_or_adaptation'
    || classification.intent === 'payment_info'
    || classification.intent === 'pickup_or_scheduling'
  ) {
    return classification.intent
  }

  return route
}

function normalizeAiSessionText(value: string | null | undefined) {
  const normalized = normalizeDisplayText(value)
  if (!normalized) return null

  return normalized
    .replace(/\s+/g, ' ')
    .slice(0, AI_SESSION_TEXT_MAX)
}

function toMetadataRecord(value: Json | null | undefined): ConversationMetadataRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as ConversationMetadataRecord
}

function readAiSessionMessages(metadata: Json | null | undefined): AiSessionMessage[] {
  const record = toMetadataRecord(metadata)
  const raw = record.aiSessionMessages
  if (!Array.isArray(raw)) return []

  return raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null
      const row = entry as Record<string, unknown>
      const role = row.role === 'customer' || row.role === 'assistant' ? row.role : null
      const text = typeof row.text === 'string' ? normalizeAiSessionText(row.text) : null
      const at = typeof row.at === 'string' && row.at.trim() ? row.at.trim() : null
      if (!role || !text || !at) return null

      return {
        role,
        text,
        at,
      } satisfies AiSessionMessage
    })
    .filter(Boolean) as AiSessionMessage[]
}

function appendAiSessionMessage(
  metadata: Json | null | undefined,
  role: AiSessionMessageRole,
  text: string | null | undefined
): Json {
  const normalizedText = normalizeAiSessionText(text)
  if (!normalizedText) return mergeMetadata(metadata, {})

  const nextMessages = [
    ...readAiSessionMessages(metadata),
    {
      role,
      text: normalizedText,
      at: new Date().toISOString(),
    } satisfies AiSessionMessage,
  ].slice(-AI_SESSION_HISTORY_MAX)

  return mergeMetadata(metadata, {
    aiSessionMessages: nextMessages as unknown as Json,
    aiSessionUpdatedAt: new Date().toISOString(),
  })
}

function clearAiSessionMessages(metadata: Json | null | undefined): Json {
  return mergeMetadata(metadata, {
    aiSessionMessages: [] as unknown as Json,
    aiSessionEndedAt: new Date().toISOString(),
  })
}

function buildAiConversationHistoryFromMetadata(metadata: Json | null | undefined) {
  return readAiSessionMessages(metadata)
    .slice(-AI_SESSION_HISTORY_MAX)
    .map((entry) => `${entry.role === 'customer' ? 'cliente' : 'ia'}: ${entry.text}`)
}

function mergeMetadata(
  base: Json | null | undefined,
  patch: ConversationMetadataRecord
): Json {
  return {
    ...toMetadataRecord(base),
    ...patch,
  }
}

function buildInboundContextMetadata(input: {
  providerMessageId: string
  effectiveMessageText: string | null
  hasAttachment: boolean
  attachmentKind: string | null
  mimeType: string | null
  fileName: string | null
  caption: string | null
  statusReferenceId?: string | null
  statusInteractionType?: string | null
}) {
  return {
    lastInboundAt: new Date().toISOString(),
    lastInboundProviderMessageId: input.providerMessageId,
    lastInboundText: input.effectiveMessageText,
    lastInboundHasAttachment: input.hasAttachment,
    lastInboundAttachmentKind: input.attachmentKind,
    lastInboundMimeType: input.mimeType,
    lastInboundFileName: input.fileName,
    lastInboundCaption: input.caption,
    lastInboundStatusReferenceId: input.statusReferenceId || null,
    lastInboundStatusInteractionType: input.statusInteractionType || null,
  } satisfies ConversationMetadataRecord
}

async function maybeHumanizeOutboundFromCanonical(
  payload: ConversationMetadataRecord,
  fallbackText: string,
  storeName?: string | null,
  context?: {
    userMessageText?: string | null
    conversationHistory?: string[]
  },
  enabled = false
) {
  const canonical = extractWhatsAppCanonicalReply(payload)
  const plan = decideWhatsAppHumanization(enabled, canonical)
  if (plan.decision !== 'apply' || !canonical || !plan.intent) {
    return { text: fallbackText, payload, aiResult: undefined as WhatsAppAiResult<any> | undefined }
  }

  const humanized = await humanizeWhatsAppReply({
    intent: plan.intent,
    canonicalReply: canonical.canonicalReply,
    userMessageText: context?.userMessageText || undefined,
    conversationHistory: context?.conversationHistory || [],
    storeName: storeName || null,
    facts: canonical.facts,
    tone: 'friendly',
    policy: {
      mustKeepShort: true,
      mustNotAddInformation: true,
    },
  })

  if (!humanized.success) {
    return {
      ...applyWhatsAppHumanizationOutcome(payload, fallbackText, {
      success: false,
      error: humanized.error,
      }),
      aiResult: humanized,
    }
  }

  return {
    ...applyWhatsAppHumanizationOutcome(payload, fallbackText, {
      success: true,
      provider: humanized.provider,
      model: humanized.model,
      attempts: humanized.attempts,
      replyText: humanized.data.reply_text,
    }),
    aiResult: humanized,
  }
}

type WhatsAppFinalWriterContext = {
  enabled: boolean
  storeName?: string | null
  userMessageText?: string | null
  conversationHistory?: string[]
  onResult?: (result: WhatsAppAiResult<any>) => Promise<void>
}

function hasRecentAttachmentContext(state: ConversationStateRow | null) {
  if (state?.state === 'waiting_human_after_attachment') return true

  const metadata = toMetadataRecord(state?.metadata)
  return metadata.lastInboundHasAttachment === true
}

function hasKnownOpenOrderContext(state: ConversationStateRow | null) {
  const metadata = toMetadataRecord(state?.metadata)
  return typeof metadata.lastKnownServiceOrderId === 'number' && metadata.lastKnownServiceOrderId > 0
}

function buildRecentContextFromMetadata(
  metadata: Json | null | undefined,
  currentMessageText: string | null
) {
  const record = toMetadataRecord(metadata)
  const lines: string[] = []

  const lastAction = normalizeDisplayText(typeof record.lastAction === 'string' ? record.lastAction : null)
  if (lastAction) {
    lines.push(`ultima_acao=${lastAction}`)
  }

  const lastIntent = normalizeDisplayText(typeof record.lastIntent === 'string' ? record.lastIntent : null)
  if (lastIntent) {
    const confidence = typeof record.lastIntentConfidence === 'number'
      ? record.lastIntentConfidence.toFixed(2)
      : null
    lines.push(confidence ? `ultima_intencao=${lastIntent} (${confidence})` : `ultima_intencao=${lastIntent}`)
  }

  const lastOutboundType = normalizeDisplayText(typeof record.lastOutboundType === 'string' ? record.lastOutboundType : null)
  if (lastOutboundType) {
    lines.push(`ultimo_outbound=${lastOutboundType}`)
  }

  const postSaleContext = readPostSaleContext(metadata)
  if (postSaleContext?.stage) {
    lines.push(`pos_venda_etapa=${postSaleContext.stage}`)
  }

  if (record.lastInboundHasAttachment === true) {
    const attachmentKind = normalizeDisplayText(typeof record.lastInboundAttachmentKind === 'string' ? record.lastInboundAttachmentKind : null)
    lines.push(attachmentKind ? `houve_anexo_recente=${attachmentKind}` : 'houve_anexo_recente=true')
  }

  const lastInboundText = normalizeDisplayText(typeof record.lastInboundText === 'string' ? record.lastInboundText : null)
  if (lastInboundText && lastInboundText !== currentMessageText) {
    lines.push(`ultima_msg_cliente=${lastInboundText.slice(0, 160)}`)
  }

  return lines.slice(0, 4)
}
function optionFromMessage(message: string | undefined): '1' | '2' | null {
  const normalized = normalizeMessage(message)
  if (/^\s*1\s*$/.test(normalized)) return '1'
  if (/^\s*2\s*$/.test(normalized)) return '2'
  if (normalized.includes('atendente') || normalized.includes('humano')) return '2'
  return null
}

function numberCandidates(message: string | undefined) {
  return Array.from(String(message || '').matchAll(/\d+/g))
    .map((match) => match[0])
    .filter(Boolean)
}

function meaningfulName(message: string | undefined) {
  const normalized = String(message || '')
    .trim()
    .replace(/\s+/g, ' ')
  return normalized.length >= 5 ? normalized : null
}

function normalizePersonName(value: string | null | undefined) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function namesLikelyReferToSamePerson(left: string | null | undefined, right: string | null | undefined) {
  const normalizedLeft = normalizePersonName(left)
  const normalizedRight = normalizePersonName(right)
  if (!normalizedLeft || !normalizedRight) return false
  if (normalizedLeft === normalizedRight) return true
  if (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)) return true

  const leftTokens = normalizedLeft.split(' ').filter((token) => token.length >= 3)
  const rightTokens = normalizedRight.split(' ').filter((token) => token.length >= 3)
  if (!leftTokens.length || !rightTokens.length) return false

  return leftTokens.some((token) => rightTokens.includes(token))
}

function getReferencedOrderStatusName(classification: WhatsAppIntentClassification) {
  return classification.entities.patient_name
    || classification.entities.customer_name
    || null
}

function shouldRequestThirdPartyIdentifier(
  classification: WhatsAppIntentClassification,
  customerByPhone: CustomerRow | null,
  serviceOrderByPhone: OpenOsRow | null
) {
  const referencedName = getReferencedOrderStatusName(classification)
  if (!referencedName || !customerByPhone) return false

  if (namesLikelyReferToSamePerson(referencedName, customerByPhone.full_name)) {
    return false
  }

  if (serviceOrderByPhone?.dependente_name && namesLikelyReferToSamePerson(referencedName, serviceOrderByPhone.dependente_name)) {
    return false
  }

  return true
}

function inferPersistentPostSaleStage(status: string | null, interactions: Array<{ resumo: string | null }>) {
  if (status === 'Concluido') return 'completed'

  const latestSummaries = interactions
    .map((interaction) => normalizeMessage(interaction.resumo || ''))
    .filter(Boolean)

  if (latestSummaries.some((summary) => summary.includes('handoff') || summary.includes('reclamacao') || summary.includes('adaptacao ruim'))) {
    return 'handoff'
  }

  if (latestSummaries.some((summary) => summary.includes('pedido de nota') || summary.includes('sem informar uma nota'))) {
    return 'awaiting_rating'
  }

  return 'awaiting_feedback'
}

async function loadPersistentPostSaleMemory(channel: ChannelRow, phone: string): Promise<PersistentPostSaleMemory | null> {
  const customer = await findCustomerByPhone(channel.store_id, phone)
  if (!customer?.id) return null

  const supabase = createAdminClient()
  const { data: orders, error: ordersError } = await (supabase.from('service_orders') as any)
    .select(`
      id,
      customer_id,
      dt_entregue_em,
      dependentes ( full_name ),
      post_sales ( id, status, avaliacao_cliente, updated_at, created_at )
    `)
    .eq('store_id', channel.store_id)
    .eq('tenant_id', channel.tenant_id)
    .eq('customer_id', customer.id)
    .not('dt_entregue_em', 'is', null)
    .order('dt_entregue_em', { ascending: false })
    .limit(10)

  if (ordersError) throw ordersError

  const candidates = ((orders || []) as any[])
    .map((order) => ({
      order,
      postSale: Array.isArray(order.post_sales) ? order.post_sales[0] : order.post_sales,
    }))
    .filter((item) => item.postSale?.id)
    .sort((left, right) => {
      const leftOpen = left.postSale.status === 'Em Acompanhamento' ? 1 : 0
      const rightOpen = right.postSale.status === 'Em Acompanhamento' ? 1 : 0
      if (leftOpen !== rightOpen) return rightOpen - leftOpen
      return new Date(right.postSale.updated_at || right.postSale.created_at || 0).getTime()
        - new Date(left.postSale.updated_at || left.postSale.created_at || 0).getTime()
    })

  const selected = candidates[0]
  if (!selected) return null

  const postSaleId = Number(selected.postSale.id)
  const { data: interactions, error: interactionsError } = await (supabase.from('post_sales_interactions') as any)
    .select('tipo_contato, resumo, created_at')
    .eq('post_sales_id', postSaleId)
    .order('created_at', { ascending: false })
    .limit(6)

  if (interactionsError) throw interactionsError

  const postSaleStatus = typeof selected.postSale.status === 'string' ? selected.postSale.status : null
  const stage = inferPersistentPostSaleStage(postSaleStatus, interactions || [])
  const postSaleUpdatedAt = new Date(selected.postSale.updated_at || selected.postSale.created_at || 0).getTime()
  const lastInteractionAt = interactions?.[0]?.created_at
    ? new Date(interactions[0].created_at).getTime()
    : 0
  const lastMovementAt = Math.max(postSaleUpdatedAt, lastInteractionAt)
  if (!Number.isFinite(lastMovementAt) || Date.now() - lastMovementAt > POST_SALE_PERSISTENT_MEMORY_MS) {
    return null
  }

  const deliveryDate = typeof selected.order.dt_entregue_em === 'string'
    ? selected.order.dt_entregue_em.slice(0, 10)
    : null
  const lastInteraction = (interactions || [])[0]?.resumo || null
  const lastInteractionText = normalizeDisplayText(lastInteraction)
  const dependentName = selected.order.dependentes?.full_name || null
  const recentContextLines = [
    `pos_venda_persistente_status=${postSaleStatus || 'desconhecido'}`,
    `pos_venda_persistente_etapa=${stage}`,
    `pos_venda_persistente_os=${selected.order.id}`,
    deliveryDate ? `pos_venda_persistente_entrega=${deliveryDate}` : null,
    dependentName ? `pos_venda_persistente_paciente=${dependentName}` : null,
    lastInteractionText ? `pos_venda_ultima_interacao=${lastInteractionText.slice(0, 140)}` : null,
    stage === 'handoff' ? 'instrucao_pos_venda_handoff=se parecer continuacao deste caso, encaminhe para humano; nao reassuma o atendimento automatico' : null,
    'instrucao_pos_venda=se a mensagem atual nao for claramente resposta ao acompanhamento, trate como assunto novo',
  ].filter((line): line is string => Boolean(line))

  const context = stage === 'completed'
    ? null
    : {
        postSalesId: postSaleId,
        serviceOrderId: Number(selected.order.id),
        customerId: customer.id,
        deliveryDate,
        stage,
        ratingPromptCount: stage === 'awaiting_rating' ? 1 : 0,
      } satisfies PostSaleContext

  return {
    context,
    recentContextLines,
    isRecoverableAutomationContext: postSaleStatus === 'Em Acompanhamento' && Boolean(context),
  }
}

async function findActiveChannel(instanceKey: string): Promise<ChannelRow | null> {
  const supabase = createAdminClient()
  const { data, error } = await (supabase.from('whatsapp_store_channels') as any)
    .select('id, tenant_id, store_id, instance_key, phone_number, is_active')
    .eq('provider', 'evolution')
    .eq('instance_key', instanceKey)
    .eq('is_active', true)
    .maybeSingle()

  if (error) throw error
  return data ?? null
}

async function findCustomerByPhone(storeId: number, phone: string): Promise<CustomerRow | null> {
  const supabase = createAdminClient()
  const digits = digitsOnly(phone)
  const suffix = digits.slice(-8)
  if (suffix.length < 8) return null

  const { data, error } = await (supabase.from('customers') as any)
    .select('id, full_name, cpf, fone_movel, phone')
    .eq('store_id', storeId)
    .or(`fone_movel.ilike.%${suffix}%,phone.ilike.%${suffix}%`)
    .limit(100)

  if (error) throw error

  const strictMatch = (data ?? []).find((customer: CustomerRow) =>
    phonesMatch(phone, customer.fone_movel) || phonesMatch(phone, customer.phone)
  ) ?? null
  if (strictMatch) return strictMatch

  const looseMatches = (data ?? []).filter((customer: CustomerRow) =>
    phonesMatchLast8(phone, customer.fone_movel) || phonesMatchLast8(phone, customer.phone)
  )

  return looseMatches.length === 1 ? looseMatches[0] : null
}

async function findCustomerByCpf(storeId: number, cpf: string): Promise<CustomerRow | null> {
  const supabase = createAdminClient()
  const digits = digitsOnly(cpf)
  if (digits.length !== 11) return null

  const { data, error } = await (supabase.from('customers') as any)
    .select('id, full_name, cpf')
    .eq('store_id', storeId)
    .eq('cpf', digits)
    .maybeSingle()

  if (error) throw error
  return data ?? null
}

async function findCustomersByName(storeId: number, name: string): Promise<CustomerRow[]> {
  const supabase = createAdminClient()
  const { data, error } = await (supabase.from('customers') as any)
    .select('id, full_name, cpf')
    .eq('store_id', storeId)
    .ilike('full_name', `%${name}%`)
    .limit(10)

  if (error) throw error
  return data ?? []
}

async function findOpenInstallmentsByCustomerIds(storeId: number, customerIds: number[]) {
  if (!customerIds.length) return []

  const supabase = createAdminClient()
  const uniqueIds = [...new Set(customerIds.filter((id) => Number.isFinite(id) && id > 0))]
  if (!uniqueIds.length) return []

  const { data: parcelas, error } = await (supabase.from('financiamento_parcelas') as any)
    .select(`
      id,
      data_vencimento,
      valor_parcela,
      status,
      customer_id
    `)
    .eq('store_id', storeId)
    .in('customer_id', uniqueIds)
    .is('data_pagamento', null)
    .neq('status', 'pago')

  if (error) throw error
  return (parcelas || []) as Array<{
    id: number
    data_vencimento: string | null
    valor_parcela: number | null
    status: string | null
    customer_id: number
  }>
}

async function findOpenInstallmentsByIdentifier(
  storeId: number,
  message: string | undefined
): Promise<{ customer: CustomerRow; installments: PaymentInstallmentMatch[] } | null> {
  const allDigits = digitsOnly(message)

  if (allDigits.length === 11) {
    const customer = await findCustomerByCpf(storeId, allDigits)
    if (customer) {
      const installments = await findOpenInstallmentsByCustomerIds(storeId, [customer.id])
      if (installments.length > 0) {
        return {
          customer,
          installments: installments.map((item) => ({
            installment_id: item.id,
            customer_id: item.customer_id,
            due_date: item.data_vencimento,
            amount: item.valor_parcela,
            customer_name: customer.full_name,
          })),
        }
      }
    }
  }

  const name = meaningfulName(message)
  if (!name) return null

  const customers = await findCustomersByName(storeId, name)
  if (!customers.length) return null

  for (const customer of customers) {
    const installments = await findOpenInstallmentsByCustomerIds(storeId, [customer.id])
    if (installments.length > 0) {
      return {
        customer,
        installments: installments.map((item) => ({
          installment_id: item.id,
          customer_id: item.customer_id,
          due_date: item.data_vencimento,
          amount: item.valor_parcela,
          customer_name: customer.full_name,
        })),
      }
    }
  }

  return null
}

async function findExactInstallmentMatchByReceipt(
  storeId: number,
  phone: string,
  receiptAmount: number | null | undefined
): Promise<ExactReceiptInstallmentMatch | null> {
  if (typeof receiptAmount !== 'number' || !Number.isFinite(receiptAmount) || receiptAmount <= 0) {
    return null
  }

  const installments = await findOpenInstallmentsByPhone(storeId, phone)
  if (!installments.length) return null

  const matches = installments.filter((item: PaymentInstallmentMatch) => {
    const amount = typeof item.amount === 'number' ? item.amount : Number(item.amount || 0)
    return Number.isFinite(amount) && Math.abs(amount - receiptAmount) < 0.01
  })

  if (matches.length !== 1) return null

  const match = matches[0]
  return {
    installment_id: Number(match.installment_id),
    customer_id: typeof match.customer_id === 'number' ? match.customer_id : null,
    due_date: typeof match.due_date === 'string' ? match.due_date : null,
    amount: typeof match.amount === 'number' ? match.amount : Number(match.amount || 0) || null,
    customer_name: typeof match.customer_name === 'string' ? match.customer_name : null,
  }
}

async function findLatestOpenOs(storeId: number, customerId: number): Promise<OpenOsRow | null> {
  const supabase = createAdminClient()
  const { data, error } = await (supabase.from('service_orders') as any)
    .select(`
      id,
      created_at,
      dt_pedido_em,
      dt_lente_chegou,
      dt_montado_em,
      armacao_com_cliente,
      dependentes ( full_name )
    `)
    .eq('store_id', storeId)
    .eq('customer_id', customerId)
    .is('dt_entregue_em', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  return {
    id: data.id,
    created_at: data.created_at,
    dependente_name: data.dependentes?.full_name ?? null,
    dt_pedido_em: data.dt_pedido_em,
    dt_lente_chegou: data.dt_lente_chegou,
    dt_montado_em: data.dt_montado_em,
    armacao_com_cliente: data.armacao_com_cliente ?? false,
  }
}

async function findOpenOsByNumber(storeId: number, value: string): Promise<{ customer: CustomerRow; serviceOrder: OpenOsRow } | null> {
  const supabase = createAdminClient()
  const digits = digitsOnly(value)
  if (!digits) return null

  let query = (supabase.from('service_orders') as any)
    .select(`
      id,
      created_at,
      dt_pedido_em,
      dt_lente_chegou,
      dt_montado_em,
      armacao_com_cliente,
      customers ( id, full_name, cpf ),
      dependentes ( full_name )
    `)
    .eq('store_id', storeId)
    .is('dt_entregue_em', null)
    .order('created_at', { ascending: false })
    .limit(1)

  if (/^\d+$/.test(digits)) {
    query = query.or(`id.eq.${Number(digits)},protocolo_fisico.eq.${digits}`)
  }

  const { data, error } = await query.maybeSingle()
  if (error) throw error
  if (!data?.customers) return null

  return {
    customer: {
      id: data.customers.id,
      full_name: data.customers.full_name,
      cpf: data.customers.cpf ?? null,
    },
    serviceOrder: {
      id: data.id,
      created_at: data.created_at,
      dependente_name: data.dependentes?.full_name ?? null,
      dt_pedido_em: data.dt_pedido_em,
      dt_lente_chegou: data.dt_lente_chegou,
      dt_montado_em: data.dt_montado_em,
      armacao_com_cliente: data.armacao_com_cliente ?? false,
    },
  }
}

async function findOpenOsByIdentifier(
  storeId: number,
  message: string | undefined
): Promise<{ customer: CustomerRow; serviceOrder: OpenOsRow } | null> {
  const allDigits = digitsOnly(message)
  const candidates = numberCandidates(message)
  if (allDigits.length === 11) {
    const customer = await findCustomerByCpf(storeId, allDigits)
    if (customer) {
      const serviceOrder = await findLatestOpenOs(storeId, customer.id)
      if (serviceOrder) return { customer, serviceOrder }
    }
  }

  for (const candidate of candidates) {
    const digits = digitsOnly(candidate)
    if (digits.length > 0 && digits.length < 11) {
      const result = await findOpenOsByNumber(storeId, digits)
      if (result) return result
    }
  }

  const name = meaningfulName(message)
  if (!name) return null

  const customers = await findCustomersByName(storeId, name)
  for (const customer of customers) {
    const serviceOrder = await findLatestOpenOs(storeId, customer.id)
    if (serviceOrder) return { customer, serviceOrder }
  }

  return null
}

async function loadStoreWhatsAppSettings(storeId: number) {
  const supabase = createAdminClient()
  const { data, error } = await (supabase.from('stores') as any)
    .select('settings')
    .eq('id', storeId)
    .single()

  if (error) throw error

  const settings = ((data?.settings || {}) as StoreSettings) || {}
  return settings.whatsapp_automation
}

async function loadStoreProfile(storeId: number): Promise<StoreProfileRow> {
  const supabase = createAdminClient()
  const { data, error } = await (supabase.from('stores') as any)
    .select('id, name, razao_social, whatsapp, phone, street, number, neighborhood, city, state, settings, pix_key, pix_city')
    .eq('id', storeId)
    .single()

  if (error) throw error
  return data as StoreProfileRow
}

function isWhatsAppAutomationEnabled(settings: StoreSettings['whatsapp_automation'] | undefined) {
  return settings?.enabled !== false
}

function isWhatsAppAiResponderEnabled(settings: StoreSettings['whatsapp_automation'] | undefined) {
  return settings?.ai_responder?.enabled === true
}

async function findLastOutboundStatus(channelId: number, phone: string): Promise<LastOutboundStatusRow | null> {
  const supabase = createAdminClient()
  const { data, error } = await (supabase.from('whatsapp_outbound_messages') as any)
    .select('created_at, message_text, payload')
    .eq('channel_id', channelId)
    .eq('remote_phone', phone)
    .eq('message_type', 'os_status')
    .in('status', ['pending', 'sent'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data ?? null
}

async function isKnownSystemOutbound(channelId: number, providerMessageId: string | undefined): Promise<boolean> {
  const normalizedProviderMessageId = String(providerMessageId || '').trim()
  if (!normalizedProviderMessageId) return false

  const supabase = createAdminClient()
  const { data, error } = await (supabase.from('whatsapp_outbound_messages') as any)
    .select('id')
    .eq('channel_id', channelId)
    .eq('provider_message_id', normalizedProviderMessageId)
    .maybeSingle()

  if (error) throw error
  return Boolean(data?.id)
}

function extractStatusCode(payload: Json | null): WhatsAppOsStatusCode | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null

  const statusCode = payload.statusCode
  return typeof statusCode === 'string' ? (statusCode as WhatsAppOsStatusCode) : null
}

function inferStatusCodeFromText(messageText: string): WhatsAppOsStatusCode | null {
  const normalized = normalizeMessage(messageText)

  if (normalized.includes('pode vir retirar') || normalized.includes('ficou pronto')) return 'ready_for_pickup'
  if (normalized.includes('aguardando armacao') || normalized.includes('trazer na loja')) return 'lens_arrived_needs_frame'
  if (normalized.includes('fila da montagem') || normalized.includes('entrou na fila de montagem')) return 'lens_arrived_assembling'
  if (normalized.includes('em producao') || normalized.includes('no laboratorio') || normalized.includes('aberta e em preparacao')) {
    return 'lens_in_production'
  }

  return null
}

function shouldSilenceRepeatedStatus(
  lastOutbound: LastOutboundStatusRow | null,
  currentStatusCode: WhatsAppOsStatusCode
) {
  if (!lastOutbound) return false

  const lastStatusCode = extractStatusCode(lastOutbound.payload)
    ?? inferStatusCodeFromText(lastOutbound.message_text)
  if (!lastStatusCode || lastStatusCode !== currentStatusCode) return false

  const lastCreatedAt = new Date(lastOutbound.created_at).getTime()
  if (Number.isNaN(lastCreatedAt)) return false

  return Date.now() - lastCreatedAt < SAME_STATUS_SILENCE_WINDOW_MS
}

async function findConversationState(channelId: number, phone: string): Promise<ConversationStateRow | null> {
  const supabase = createAdminClient()
  const phoneVariants = [...getPhoneVariants(phone)]
  if (!phoneVariants.length) return null
  const { data, error } = await (supabase.from('whatsapp_conversation_states') as any)
    .select('id, remote_phone, state, expires_at, metadata')
    .eq('channel_id', channelId)
    .in('remote_phone', phoneVariants)

  if (error) throw error
  const candidates = (data ?? []) as ConversationStateRow[]
  const now = Date.now()
  const expiredIds = candidates
    .filter((item) => new Date(item.expires_at).getTime() <= now)
    .map((item) => item.id)
  if (expiredIds.length) {
    await (supabase.from('whatsapp_conversation_states') as any)
      .delete()
      .in('id', expiredIds)
  }

  const activeCandidates = candidates.filter((item) => !expiredIds.includes(item.id))
  const exact = activeCandidates.find((item) => item.remote_phone === phone)
  const matching = exact || activeCandidates.find((item) => phonesMatch(item.remote_phone, phone))
  if (!matching) return null

  return matching
}

async function clearConversationStateById(id: number) {
  const supabase = createAdminClient()
  const { error } = await (supabase.from('whatsapp_conversation_states') as any)
    .delete()
    .eq('id', id)

  if (error) throw error
}

async function loadCustomerControlMode(channelId: number, phone: string): Promise<CustomerControlMode> {
  // A entrada de uma mensagem precisa consultar o override mais recente. Sem
  // isso, um handoff humano recém-gravado pode ser ignorado por uma resposta
  // automática servida a partir de cache.
  const supabase = createAdminClient({ noStore: true })
  const { data, error } = await (supabase.from('whatsapp_customer_control') as any)
    .select('remote_phone, mode')
    .eq('channel_id', channelId)

  if (error) throw error

  const normalizedPhone = digitsOnly(phone)
  const exactControl = (data ?? []).find((row: { remote_phone?: string | null }) =>
    digitsOnly(row.remote_phone) === normalizedPhone
  )
  const control = exactControl || (data ?? []).find((row: { remote_phone?: string | null }) =>
    phonesMatch(row.remote_phone, phone)
  )
  const mode = typeof control?.mode === 'string' ? control.mode : 'auto'
  return mode === 'force_ai' || mode === 'force_human' ? mode : 'auto'
}

async function clearCustomerControlMode(channelId: number, phone: string) {
  const supabase = createAdminClient()
  const phoneVariants = [...getPhoneVariants(phone)]
  if (!phoneVariants.length) return
  const { error } = await (supabase.from('whatsapp_customer_control') as any)
    .delete()
    .eq('channel_id', channelId)
    .in('remote_phone', phoneVariants)

  if (error) throw error
}

async function upsertCustomerLink(
  channel: ChannelRow,
  phone: string,
  customerId: number,
  source: CustomerLinkSource
) {
  const supabase = createAdminClient()
  const values = {
    tenant_id: channel.tenant_id,
    store_id: channel.store_id,
    channel_id: channel.id,
    remote_phone: phone,
    customer_id: customerId,
    source,
    last_confirmed_at: new Date().toISOString(),
  }

  const phoneVariants = [...getPhoneVariants(phone)]
  const { data: existingLinks, error: existingLinksError } = await (supabase.from('whatsapp_customer_links') as any)
    .select('id, remote_phone')
    .eq('store_id', channel.store_id)
    .in('remote_phone', phoneVariants)

  if (existingLinksError) throw existingLinksError
  const existingLink = (existingLinks ?? []).find((item: { remote_phone?: string | null }) =>
    item.remote_phone === phone || phonesMatch(item.remote_phone, phone)
  )

  if (existingLink?.id) {
    const { error } = await (supabase.from('whatsapp_customer_links') as any)
      .update(values)
      .eq('id', existingLink.id)
    if (error) throw error
    return
  }

  const { error } = await (supabase.from('whatsapp_customer_links') as any)
    .upsert(values, { onConflict: 'store_id,remote_phone' })

  if (error) throw error
}

function effectiveStateForControl(state: ConversationStateRow | null, controlMode: CustomerControlMode): ConversationState | null {
  if (!state) return null
  if (controlMode === 'force_ai') return null
  return state.state
}

function buildAiDiagnostic(task: WhatsAppAiDiagnostic['task'], result: WhatsAppAiResult<any>): WhatsAppAiDiagnostic {
  return {
    task,
    success: result.success,
    provider: result.success ? result.provider : 'unknown',
    model: result.success ? result.model : 'unknown',
    latencyMs: result.latencyMs,
    intent: result.success && task === 'intent_classification' ? result.data.intent : null,
    confidence: result.success && task === 'intent_classification' ? result.data.confidence : null,
    tokenUsage: result.success ? result.tokenUsage : undefined,
    error: result.success ? undefined : result.error,
  }
}

async function setConversationState(
  channel: ChannelRow,
  phone: string,
  state: ConversationState,
  ms: number,
  metadata: Json = {},
  sourceInboundMessageId?: number | null
) {
  const supabase = createAdminClient()
  if (sourceInboundMessageId && !(await isInboundStillLatest(channel.id, phone, sourceInboundMessageId))) {
    return false
  }
  const preparedMetadata = state === 'human_pause' || state === 'waiting_human_after_attachment'
    ? clearAiSessionMessages(metadata)
    : metadata
  const values = {
    tenant_id: channel.tenant_id,
    store_id: channel.store_id,
    channel_id: channel.id,
    remote_phone: phone,
    state,
    metadata: preparedMetadata,
    expires_at: expiresIn(ms),
    updated_at: new Date().toISOString(),
  }

  // A Evolution pode alternar entre os formatos brasileiro com e sem o nono
  // dígito. Atualiza o estado equivalente existente para não criar duas
  // conversas e perder uma pausa humana já ativa.
  const existingState = await findConversationState(channel.id, phone)
  if (existingState?.id) {
    const { error } = await (supabase.from('whatsapp_conversation_states') as any)
      .update(values)
      .eq('id', existingState.id)
    if (error) throw error
    return true
  }

  const { error } = await (supabase.from('whatsapp_conversation_states') as any)
    .upsert(values, { onConflict: 'channel_id,remote_phone' })

  if (error) throw error
  return true
}

async function createOutbound(
  channel: ChannelRow,
  inboundMessageId: number,
  phone: string,
  text: string,
  messageType: string,
  payload: Json = {},
  sourceInboundMessageId?: number | null
): Promise<CustomerStatusResponse> {
  const supabase = createAdminClient()
  if (sourceInboundMessageId && !(await isInboundStillLatest(channel.id, phone, sourceInboundMessageId))) {
    return ignoreInbound(inboundMessageId)
  }
  const { data: outbound, error } = await (supabase.from('whatsapp_outbound_messages') as any)
    .insert({
      tenant_id: channel.tenant_id,
      store_id: channel.store_id,
      channel_id: channel.id,
      inbound_message_id: inboundMessageId,
      remote_phone: phone,
      message_text: text,
      message_type: messageType,
      status: 'pending',
      payload,
    })
    .select('id')
    .single()

  if (error) throw error

  await (supabase.from('whatsapp_inbound_messages') as any)
    .update({ status: 'processed' })
    .eq('id', inboundMessageId)

  return {
    shouldReply: true,
    phone,
    replyText: text,
    outboundMessageId: outbound.id,
  }
}

async function ignoreInbound(inboundMessageId: number): Promise<CustomerStatusResponse> {
  const supabase = createAdminClient()
  await (supabase.from('whatsapp_inbound_messages') as any)
    .update({ status: 'ignored' })
    .eq('id', inboundMessageId)

  return { shouldReply: false }
}

async function isInboundStillLatest(
  channelId: number,
  phone: string,
  inboundMessageId: number
) {
  const supabase = createAdminClient()
  const { data, error } = await (supabase.from('whatsapp_inbound_messages') as any)
    .select('id')
    .eq('channel_id', channelId)
    .eq('remote_phone', phone)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return Number(data?.id || 0) === inboundMessageId
}

async function createStatusReply(
  channel: ChannelRow,
  inboundMessageId: number,
  phone: string,
  customer: CustomerRow,
  serviceOrder: OpenOsRow,
  baseMetadata: Json = {},
  intentConfidence: number | null = null,
  finalWriter?: WhatsAppFinalWriterContext
): Promise<CustomerStatusResponse> {
  await upsertCustomerLink(channel, phone, customer.id, 'status_lookup')

  const automationSettings = await loadStoreWhatsAppSettings(channel.store_id)
  if (automationSettings?.os_on_demand?.enabled === false) {
    await setConversationState(channel, phone, 'silent', AFTER_STATUS_SILENCE_MS, mergeMetadata(baseMetadata, {
      reason: 'os_responder_disabled',
      ...buildDecisionMetadata({
        intent: 'order_status',
        confidence: intentConfidence,
        action: 'no_reply',
        outboundType: null,
      }),
    }), inboundMessageId)
    return ignoreInbound(inboundMessageId)
  }

  const status = describeOpenOs(customer.full_name, serviceOrder, automationSettings?.os_on_demand?.templates)
  const lastOutbound = await findLastOutboundStatus(channel.id, phone)

  if (shouldSilenceRepeatedStatus(lastOutbound, status.statusCode)) {
    await setConversationState(channel, phone, 'silent', AFTER_STATUS_SILENCE_MS, mergeMetadata(baseMetadata, {
      reason: 'repeated_status',
      ...buildDecisionMetadata({
        intent: 'order_status',
        confidence: intentConfidence,
        action: 'no_reply',
        outboundType: null,
      }),
    }), inboundMessageId)
    return ignoreInbound(inboundMessageId)
  }

  await setConversationState(channel, phone, 'silent', AFTER_STATUS_SILENCE_MS, appendAiSessionMessage(mergeMetadata(baseMetadata, {
    reason: 'status_sent',
    lastKnownCustomerId: customer.id,
    lastKnownServiceOrderId: serviceOrder.id,
    serviceOrderId: serviceOrder.id,
    statusCode: status.statusCode,
    ...buildDecisionMetadata({
      intent: 'order_status',
      confidence: intentConfidence,
      action: 'auto_reply',
      outboundType: 'os_status',
    }),
  }), 'assistant', status.replyText), inboundMessageId)

  const outboundPayload = {
    statusCode: status.statusCode,
    ...buildWhatsAppCanonicalPayload({
      intent: 'order_status',
      action: 'auto_reply',
      outboundType: 'os_status',
      canonicalReply: status.replyText,
      facts: {
        statusCode: status.statusCode,
        serviceOrderId: serviceOrder.id,
        customerId: customer.id,
      },
    }),
  } satisfies ConversationMetadataRecord
  const rendered = await maybeHumanizeOutboundFromCanonical(
    outboundPayload,
    status.replyText,
    finalWriter?.storeName,
    finalWriter,
    finalWriter?.enabled === true
  )
  if (rendered.aiResult && finalWriter?.onResult) await finalWriter.onResult(rendered.aiResult)
  const response = await createOutbound(channel, inboundMessageId, phone, rendered.text, 'os_status', rendered.payload)

  return {
    ...response,
    customerName: customer.full_name,
    serviceOrderId: serviceOrder.id,
    statusCode: status.statusCode,
  }
}

async function handleStatusByPhone(
  channel: ChannelRow,
  inboundMessageId: number,
  phone: string,
  baseMetadata: Json = {},
  intentConfidence: number | null = null,
  finalWriter?: WhatsAppFinalWriterContext
): Promise<CustomerStatusResponse> {
  async function createAutomatedStatusOutbound(
    text: string,
    messageType: string,
    payload: ConversationMetadataRecord
  ) {
    const rendered = await maybeHumanizeOutboundFromCanonical(
      payload,
      text,
      finalWriter?.storeName,
      finalWriter,
      finalWriter?.enabled === true
    )
    if (rendered.aiResult && finalWriter?.onResult) await finalWriter.onResult(rendered.aiResult)
    return createOutbound(channel, inboundMessageId, phone, rendered.text, messageType, rendered.payload)
  }

  const customer = await findCustomerByPhone(channel.store_id, phone)
  if (!customer) {
    const text = identifierPromptText()
    await setConversationState(channel, phone, 'waiting_identifier', IDENTIFIER_WAIT_MS, appendAiSessionMessage(mergeMetadata(baseMetadata, {
      ...buildDecisionMetadata({
        intent: 'order_status',
        confidence: intentConfidence,
        action: 'request_identifier',
        outboundType: 'identifier_prompt',
      }),
    }), 'assistant', text))
    return createAutomatedStatusOutbound(text, 'identifier_prompt', {
      ...buildWhatsAppCanonicalPayload({
        intent: 'order_status',
        action: 'request_identifier',
        outboundType: 'identifier_prompt',
        canonicalReply: text,
      }),
    })
  }

  await upsertCustomerLink(channel, phone, customer.id, 'phone_match')

  const serviceOrder = await findLatestOpenOs(channel.store_id, customer.id)
  if (!serviceOrder) {
    const text = identifierPromptText()
    await setConversationState(channel, phone, 'waiting_identifier', IDENTIFIER_WAIT_MS, appendAiSessionMessage(mergeMetadata(baseMetadata, {
      ...buildDecisionMetadata({
        intent: 'order_status',
        confidence: intentConfidence,
        action: 'request_identifier',
        outboundType: 'identifier_prompt',
      }),
    }), 'assistant', text))
    return createAutomatedStatusOutbound(text, 'identifier_prompt', {
      ...buildWhatsAppCanonicalPayload({
        intent: 'order_status',
        action: 'request_identifier',
        outboundType: 'identifier_prompt',
        canonicalReply: text,
      }),
    })
  }

  return createStatusReply(channel, inboundMessageId, phone, customer, serviceOrder, baseMetadata, intentConfidence, finalWriter)
}

async function simulateStatusReply(
  channel: ChannelRow,
  phone: string
): Promise<CustomerStatusSimulationResponse> {
  const customer = await findCustomerByPhone(channel.store_id, phone)
  if (!customer) {
    const text = identifierPromptText()
    return {
      shouldReply: true,
      phone,
      replyText: text,
      debug: {
        overrideMode: 'auto',
        preAiRoute: 'explicit_status_option',
        postClassificationRoute: null,
        action: 'request_identifier',
        outboundType: 'identifier_prompt',
        state: null,
        intent: 'order_status',
        confidence: null,
        notes: ['Cliente nao encontrado pelo telefone.'],
      },
    }
  }

  const serviceOrder = await findLatestOpenOs(channel.store_id, customer.id)
  if (!serviceOrder) {
    const text = identifierPromptText()
    return {
      shouldReply: true,
      phone,
      customerName: customer.full_name,
      replyText: text,
      debug: {
        overrideMode: 'auto',
        preAiRoute: 'explicit_status_option',
        postClassificationRoute: null,
        action: 'request_identifier',
        outboundType: 'identifier_prompt',
        state: null,
        intent: 'order_status',
        confidence: null,
        notes: ['Cliente sem OS aberta vinculada ao telefone.'],
      },
    }
  }

  const automationSettings = await loadStoreWhatsAppSettings(channel.store_id)
  const status = describeOpenOs(customer.full_name, serviceOrder, automationSettings?.os_on_demand?.templates)

  return {
    shouldReply: true,
    phone,
    customerName: customer.full_name,
    serviceOrderId: serviceOrder.id,
    statusCode: status.statusCode,
    replyText: status.replyText,
    debug: {
      overrideMode: 'auto',
      preAiRoute: 'explicit_status_option',
      postClassificationRoute: null,
      action: 'auto_reply',
      outboundType: 'os_status',
      state: null,
      intent: 'order_status',
      confidence: null,
      notes: ['Status de OS simulado a partir do cadastro atual.'],
    },
  }
}

async function logAiResult(
  channel: ChannelRow,
  inboundId: number,
  task: WhatsAppAiDiagnostic['task'],
  result: WhatsAppAiResult<any>
): Promise<WhatsAppAiDiagnostic> {
  const diagnostic = buildAiDiagnostic(task, result)

  try {
    const supabase = createAdminClient()
    const { error } = await (supabase.from('whatsapp_ai_logs') as any).insert({
      store_id: channel.store_id,
      tenant_id: channel.tenant_id,
      inbound_message_id: inboundId,
      provider: result.success ? result.provider : 'unknown',
      model_name: result.success ? result.model : 'unknown',
      latency_ms: result.latencyMs,
      intent: result.success && task === 'intent_classification' ? result.data.intent : null,
      confidence: result.success && task === 'intent_classification' ? result.data.confidence : null,
      is_success: result.success,
      error_message: result.success ? null : result.error,
      raw_request: { prompt: result.promptText },
      raw_response: result.success
        ? { rawText: result.rawText, tokenUsage: result.tokenUsage ?? null }
        : { errors: result.providerErrors },
    })

    if (error) {
      console.error('Supabase AI log insert error:', error)
    }
  } catch (err) {
    console.error('Failed to log AI result', err)
  }

  return diagnostic
}

export async function resolveCustomerStatus(
  input: CustomerStatusRequest
): Promise<CustomerStatusResponse> {
  const channel = await findActiveChannel(input.instanceKey)
  if (!channel) return { shouldReply: false }

  const supabase = createAdminClient()
  const normalizedPhone = toEvolutionNumber(input.phone)
  if (!normalizedPhone) return { shouldReply: false }
  const inboundPayloadMeta = extractWhatsAppInboundPayloadMeta(input.payload)
  const effectiveMessageText = normalizeDisplayText(input.messageText) || inboundPayloadMeta.caption || inboundPayloadMeta.text
  const inboundContextMetadata = buildInboundContextMetadata({
    providerMessageId: input.providerMessageId,
    effectiveMessageText,
    hasAttachment: inboundPayloadMeta.hasAttachment,
    attachmentKind: inboundPayloadMeta.attachmentKind,
    mimeType: inboundPayloadMeta.mimeType,
    fileName: inboundPayloadMeta.fileName,
    caption: inboundPayloadMeta.caption,
    statusReferenceId: input.statusReferenceId,
    statusInteractionType: input.statusInteractionType,
  })

  if (isWhatsAppInboundPayloadFromMe(input.payload)) {
    const isSystemOutbound = await isKnownSystemOutbound(channel.id, input.providerMessageId)

    if (!isSystemOutbound) {
      await markStoreInitiatedConversation({
        instanceKey: input.instanceKey,
        phone: normalizedPhone,
        providerMessageId: input.providerMessageId,
        messageText: effectiveMessageText || undefined,
        payload: input.payload,
      })
    }

    return { shouldReply: false }
  }

  const { data: insertedInbound, error: inboundError } = await (supabase.from('whatsapp_inbound_messages') as any)
    .insert({
      tenant_id: channel.tenant_id,
      store_id: channel.store_id,
      channel_id: channel.id,
      provider_message_id: input.providerMessageId,
      remote_phone: normalizedPhone,
      message_text: effectiveMessageText,
      payload: stripWhatsAppInboundMediaContent(input.payload),
      provider_created_at: input.providerCreatedAt || null,
      status: 'received',
    })
    .select('id')
    .single()

  let inbound = insertedInbound
  if (inboundError?.code === '23505') {
    const { data: existingInbound, error: existingInboundError } = await (supabase.from('whatsapp_inbound_messages') as any)
      .select('id, status, created_at')
      .eq('channel_id', channel.id)
      .eq('provider_message_id', input.providerMessageId)
      .maybeSingle()
    if (existingInboundError) throw existingInboundError

    const oldEnoughToResume = existingInbound?.status === 'received'
      && new Date(existingInbound.created_at).getTime() < Date.now() - 90_000
    if (!oldEnoughToResume) return { shouldReply: false, duplicate: true }
    inbound = existingInbound
  }
  if (inboundError && inboundError.code !== '23505') throw inboundError
  if (!inbound) throw new Error('Inbound do WhatsApp nao foi criado nem recuperado.')

  const preferenceCommand = installmentReminderPreferenceCommand(effectiveMessageText)
  const preferenceState = preferenceCommand?.requiresReminderContext
    ? await findConversationState(channel.id, normalizedPhone)
    : null
  const hasReminderContext = Boolean(readPaymentReminderContext(preferenceState?.metadata))
  if (preferenceCommand && (!preferenceCommand.requiresReminderContext || hasReminderContext)) {
    const enabled = preferenceCommand.action === 'opt_in'
    await setInstallmentReminderPreference({
      channel,
      remotePhone: normalizedPhone,
      enabled,
      changedAt: preferenceChangedAt(input.providerCreatedAt),
    })

    const text = enabled
      ? 'Tudo certo. Você voltará a receber lembretes automáticos de vencimento por WhatsApp.'
      : 'Tudo certo. Você não receberá mais lembretes automáticos de vencimento por WhatsApp. Se quiser voltar a receber no futuro, envie VOLTAR a qualquer momento.'

    return createOutbound(channel, inbound.id, normalizedPhone, text, enabled ? 'installment_reminder_opt_in' : 'installment_reminder_opt_out', {
      installmentRemindersEnabled: enabled,
    }, inbound.id)
  }

  const automationSettings = await loadStoreWhatsAppSettings(channel.store_id)
  if (!isWhatsAppAutomationEnabled(automationSettings)) {
    return ignoreInbound(inbound.id)
  }

  const statusPublication = await findWhatsAppStatusPublication(channel.id, input.statusReferenceId)
  const statusContextLine = statusPublication
    ? buildWhatsAppStatusContextLine(statusPublication)
    : null
  const option = optionFromMessage(effectiveMessageText || undefined)
  let state = await findConversationState(channel.id, normalizedPhone)
  const controlMode = await loadCustomerControlMode(channel.id, normalizedPhone)
  const storeProfile = await loadStoreProfile(channel.store_id)
  const settings = ((storeProfile.settings || {}) as StoreSettings) || {}
  const hoursFacts = settings.store_hours ? evaluateStoreHours(settings.store_hours) : null
  const shouldReleaseClosedTrap = shouldReleaseClosedTrapPause({
    state: state?.state ?? null,
    metadata: state?.metadata,
    isStoreOpenNow: hoursFacts?.is_open_now === true,
  })

  if (shouldReleaseClosedTrap && state?.id) {
    await clearConversationStateById(state.id)
    state = null
  }

  const effectiveState = effectiveStateForControl(state, controlMode)
  const baseMetadata = appendAiSessionMessage(
    mergeMetadata(state?.metadata, inboundContextMetadata),
    'customer',
    effectiveMessageText
  )
  const livePostSaleContext = readPostSaleContext(state?.metadata)
  const persistentPostSaleMemory = livePostSaleContext
    ? null
    : await loadPersistentPostSaleMemory(channel, normalizedPhone)
  let recoveredPostSaleContext = persistentPostSaleMemory?.isRecoverableAutomationContext
    ? persistentPostSaleMemory.context
    : null
  const postSaleContextWasRecovered = !livePostSaleContext && Boolean(recoveredPostSaleContext)
  const recentContext = [
    ...(statusContextLine ? [statusContextLine] : []),
    ...buildRecentContextFromMetadata(state?.metadata, effectiveMessageText),
    ...(persistentPostSaleMemory?.recentContextLines || []),
  ].slice(0, 8)
  const conversationHistory = buildAiConversationHistoryFromMetadata(state?.metadata)
  const aiReplyContext = {
    userMessageText: effectiveMessageText,
    conversationHistory: [
      ...(statusContextLine ? [statusContextLine] : []),
      ...buildAiConversationHistoryFromMetadata(baseMetadata),
    ].slice(-8),
  }
  const aiDiagnostics: WhatsAppAiDiagnostic[] = []

  async function recordAiResult(task: WhatsAppAiDiagnostic['task'], result: WhatsAppAiResult<any>) {
    aiDiagnostics.push(await logAiResult(channel!, inbound.id, task, result))
  }

  function withAiDiagnostics<T extends CustomerStatusResponse>(response: T): T {
    if (aiDiagnostics.length === 0) return response
    return {
      ...response,
      aiDiagnostics,
    }
  }

  async function consumeForceAiOverrideIfNeeded() {
    if (controlMode !== 'force_ai') return
    await clearCustomerControlMode(channel!.id, normalizedPhone)
  }

  async function setCurrentConversationState(
    nextState: ConversationState,
    ms: number,
    metadata: Json = {}
  ) {
    return setConversationState(channel!, normalizedPhone, nextState, ms, metadata, inbound.id)
  }

  async function createCurrentOutbound(
    text: string,
    messageType: string,
    payload: Json = {}
  ) {
    const payloadRecord = toMetadataRecord(payload)
    const canonicalPayload = extractWhatsAppCanonicalReply(payloadRecord)
      ? payloadRecord
      : {
          ...payloadRecord,
          ...buildWhatsAppCanonicalPayload({
            intent: typeof payloadRecord.lastIntent === 'string' ? payloadRecord.lastIntent : null,
            action: typeof payloadRecord.lastAction === 'string' ? payloadRecord.lastAction : 'auto_reply',
            outboundType: messageType,
            canonicalReply: text,
          }),
        } satisfies ConversationMetadataRecord
    const finalWriterEnabled = WHATSAPP_AI_FINAL_WRITER_ENABLED
      && isWhatsAppAiResponderEnabled(automationSettings)
    const rendered = await maybeHumanizeOutboundFromCanonical(
      canonicalPayload,
      text,
      storeProfile.name,
      aiReplyContext,
      finalWriterEnabled
    )

    if (rendered.aiResult) {
      await recordAiResult('reply_humanization', rendered.aiResult)
    }

    return createOutbound(channel!, inbound.id, normalizedPhone, rendered.text, messageType, rendered.payload, inbound.id)
  }

  const finalWriterContext: WhatsAppFinalWriterContext = {
    enabled: WHATSAPP_AI_FINAL_WRITER_ENABLED && isWhatsAppAiResponderEnabled(automationSettings),
    storeName: storeProfile.name,
    userMessageText: effectiveMessageText,
    conversationHistory: aiReplyContext.conversationHistory,
    onResult: async (result) => recordAiResult('reply_humanization', result),
  }

  if (controlMode === 'force_human') {
    await setCurrentConversationState('human_pause', HUMAN_HANDOFF_PAUSE_MS, mergeMetadata(baseMetadata, {
      overrideMode: controlMode,
      reason: 'force_human_override',
      ...buildDecisionMetadata({
        intent: null,
        action: 'force_human_override',
        outboundType: null,
      }),
    }))
    return ignoreInbound(inbound.id)
  }
  
  let isExceptionalClosure = false
  let isNormalClosed = false
  if (hoursFacts) {
    if (hoursFacts.is_exceptional_closure) {
      isExceptionalClosure = true
    } else if (!hoursFacts.is_open_now) {
      isNormalClosed = true
    }
  }

  async function applyOohTrapIfNeeded(fallbackAction: () => Promise<CustomerStatusResponse>): Promise<CustomerStatusResponse> {
    if (isExceptionalClosure) {
      const text = buildClosedStoreText(hoursFacts!)
      await setCurrentConversationState('human_pause', HUMAN_PAUSE_MS, mergeMetadata(baseMetadata, {
        reason: 'exceptional_closure_trap',
        ...buildDecisionMetadata({ intent: null, action: 'exceptional_closure_trap', outboundType: 'exceptional_closure' })
      }))
      const outboundPayload = {
         ...buildWhatsAppCanonicalPayload({
           intent: null,
           action: 'exceptional_closure_trap',
           outboundType: 'exceptional_closure',
           canonicalReply: text,
           facts: {
             isOpenNow: false,
             isExceptionalClosure: true,
             closureReason: hoursFacts!.exceptional_closure_reason || null,
             nextOpenSchedule: hoursFacts!.next_open_schedule || null,
           },
         })
      } satisfies ConversationMetadataRecord
      const maybeHumanized = await maybeHumanizeOutboundFromCanonical(outboundPayload, text, storeProfile.name, aiReplyContext)
      return createCurrentOutbound(maybeHumanized.text, 'exceptional_closure', maybeHumanized.payload)
    }
    if (isNormalClosed) {
      const text = buildClosedStoreText(hoursFacts!)
      await setCurrentConversationState('human_pause', HUMAN_PAUSE_MS, mergeMetadata(baseMetadata, {
        reason: 'normal_closed_trap',
        ...buildDecisionMetadata({ intent: null, action: 'normal_closed_trap', outboundType: 'store_hours' })
      }))
      const outboundPayload = {
        ...buildWhatsAppCanonicalPayload({
          intent: 'store_hours',
          action: 'normal_closed_trap',
          outboundType: 'store_hours',
          canonicalReply: text,
          facts: {
            isOpenNow: false,
            nextOpenSchedule: hoursFacts!.next_open_schedule || null,
          },
        })
      } satisfies ConversationMetadataRecord
      const maybeHumanized = await maybeHumanizeOutboundFromCanonical(outboundPayload, text, storeProfile.name, aiReplyContext)
      return createCurrentOutbound(maybeHumanized.text, 'store_hours', maybeHumanized.payload)
    }
    return fallbackAction()
  }

  if (statusPublication && (!statusPublication.contextualized_at || !statusPublication.auto_reply_enabled)) {
    await setCurrentConversationState('human_pause', HUMAN_HANDOFF_PAUSE_MS, mergeMetadata(baseMetadata, {
      reason: statusPublication.contextualized_at ? 'status_auto_reply_disabled' : 'status_awaiting_context',
      statusPublicationId: statusPublication.id,
      statusProviderMessageId: statusPublication.provider_message_id,
      statusInteractionType: input.statusInteractionType || 'reply',
      handoff_internal_note: statusPublication.contextualized_at
        ? 'Cliente interagiu com um Status configurado para atendimento humano.'
        : 'Cliente interagiu com um Status que ainda não foi contextualizado pela equipe.',
      ...buildDecisionMetadata({
        intent: 'status_interaction',
        action: 'human_handoff_status_without_automation',
        outboundType: null,
      }),
    }))
    return ignoreInbound(inbound.id)
  }

  if (statusPublication) {
    return applyOohTrapIfNeeded(async () => {
      const fallbackText = 'Que bom que você se interessou por essa publicação! O que você gostaria de saber sobre ela?'
      let text = fallbackText

      if (isWhatsAppAiResponderEnabled(automationSettings)) {
        const statusReply = await generateWhatsAppFallbackReply({
          userMessageText: effectiveMessageText || 'O cliente reagiu à publicação.',
          conversationHistory: aiReplyContext.conversationHistory,
          storeName: storeProfile.name,
        })
        await recordAiResult('fallback_reply', statusReply)
        if (statusReply.success) text = statusReply.data.reply_text
      }

      const statusMetadata = mergeMetadata(baseMetadata, {
        statusPublicationId: statusPublication.id,
        statusProviderMessageId: statusPublication.provider_message_id,
        statusInteractionType: input.statusInteractionType || 'reply',
        statusContext: statusContextLine,
        ...buildDecisionMetadata({
          intent: 'status_interaction',
          action: 'reply_to_status_interaction',
          outboundType: 'status_interaction',
        }),
      })
      await setCurrentConversationState('ai_session', AI_SESSION_MS, statusMetadata)

      return withAiDiagnostics(await createCurrentOutbound(text, 'status_interaction', {
        statusPublicationId: statusPublication.id,
        statusProviderMessageId: statusPublication.provider_message_id,
        statusInteractionType: input.statusInteractionType || 'reply',
        statusContext: statusContextLine,
      }))
    })
  }

  const preAiRoute = decidePreAiRoute({
    option,
    state: effectiveState ?? null,
    hasAttachment: inboundPayloadMeta.hasAttachment,
    messageText: effectiveMessageText,
    metadata: state?.metadata,
    humanHandoffWindowMs: ATTACHMENT_HANDOFF_MS,
    identifierWindowMs: IDENTIFIER_WAIT_MS,
  })

  if (preAiRoute === 'explicit_human_option') {
    return applyOohTrapIfNeeded(async () => {
      await consumeForceAiOverrideIfNeeded()
      await setCurrentConversationState('human_pause', HUMAN_HANDOFF_PAUSE_MS, mergeMetadata(baseMetadata, {
        selectedOption: '2',
        ...buildDecisionMetadata({
          intent: 'human_agent_request',
          action: 'human_handoff',
          outboundType: 'human_handoff',
        }),
      }))
      const text = humanHandoffText()
      const outboundPayload = {
        ...buildWhatsAppCanonicalPayload({
          intent: 'human_agent_request',
          action: 'human_handoff',
          outboundType: 'human_handoff',
          canonicalReply: text,
        }),
      } satisfies ConversationMetadataRecord
      const maybeHumanized = await maybeHumanizeOutboundFromCanonical(outboundPayload, text, storeProfile.name, aiReplyContext)
      return createCurrentOutbound(maybeHumanized.text, 'human_handoff', maybeHumanized.payload)
    })
  }

  if (preAiRoute === 'ignore_human_pause') {
    return ignoreInbound(inbound.id)
  }

  if (preAiRoute === 'attachment_handoff') {
    if (inboundPayloadMeta.attachmentKind === 'audio') {
      await setCurrentConversationState('human_pause', HUMAN_HANDOFF_PAUSE_MS, mergeMetadata(baseMetadata, {
        reason: 'audio_received_silent_handoff',
        attachmentKind: inboundPayloadMeta.attachmentKind,
        mimeType: inboundPayloadMeta.mimeType,
        fileName: inboundPayloadMeta.fileName,
        caption: inboundPayloadMeta.caption,
        ...buildDecisionMetadata({
          intent: null,
          action: 'human_handoff',
          outboundType: null,
        }),
      }))
      return ignoreInbound(inbound.id)
    }

    let receiptExtraction: WhatsAppReceiptExtraction | null = null
    let intentOutcome = 'prescription_submission'
    let text = attachmentReceivedText()
    let exactReceiptInstallmentMatch: ExactReceiptInstallmentMatch | null = null

    if (inboundPayloadMeta.base64 && inboundPayloadMeta.mimeType) {
      try {
        const result = await extractReceiptWithVision(inboundPayloadMeta.base64, inboundPayloadMeta.mimeType)
        if (result.success && result.data.is_receipt) {
          receiptExtraction = result.data
          intentOutcome = 'payment_submission'
          text = 'Recebi seu comprovante. Vou repassar para nossa equipe dar baixa e continuar o atendimento por aqui.'
          exactReceiptInstallmentMatch = await findExactInstallmentMatchByReceipt(
            channel.store_id,
            normalizedPhone,
            result.data.amount
          )
        }
      } catch (err) {
        console.error('Vision extraction error:', err)
      }
    }

    return applyOohTrapIfNeeded(async () => {
      await consumeForceAiOverrideIfNeeded()
      await setCurrentConversationState('waiting_human_after_attachment', HUMAN_HANDOFF_PAUSE_MS, mergeMetadata(baseMetadata, {
        reason: 'attachment_received',
        attachmentKind: inboundPayloadMeta.attachmentKind,
        mimeType: inboundPayloadMeta.mimeType,
        fileName: inboundPayloadMeta.fileName,
        caption: inboundPayloadMeta.caption,
        ai_extracted_receipt: receiptExtraction,
        ...(exactReceiptInstallmentMatch
          ? buildPaymentInstallmentMetadataFromExactReceiptMatch(exactReceiptInstallmentMatch)
          : {}),
        ...buildDecisionMetadata({
          intent: intentOutcome,
          action: 'human_handoff',
          outboundType: 'attachment_handoff',
        }),
      }))
      return createCurrentOutbound(text, 'attachment_handoff', {
        attachmentKind: inboundPayloadMeta.attachmentKind,
        mimeType: inboundPayloadMeta.mimeType,
        fileName: inboundPayloadMeta.fileName,
        caption: inboundPayloadMeta.caption,
        ai_extracted_receipt: receiptExtraction,
        ...(exactReceiptInstallmentMatch
          ? buildPaymentInstallmentMetadataFromExactReceiptMatch(exactReceiptInstallmentMatch)
          : {}),
        ...buildWhatsAppCanonicalPayload({
          intent: intentOutcome,
          action: 'human_handoff',
          outboundType: 'attachment_handoff',
          canonicalReply: text,
          facts: {
            attachmentKind: inboundPayloadMeta.attachmentKind,
            mimeType: inboundPayloadMeta.mimeType,
            receiptIsReceipt: receiptExtraction?.is_receipt ?? null,
            receiptAmount: receiptExtraction?.amount ?? null,
            receiptPayerName: receiptExtraction?.payer_name ?? null,
            receiptReceiverName: receiptExtraction?.receiver_name ?? null,
          },
        }),
      })
    })
  }

  if (preAiRoute === 'attachment_followup_handoff') {
    await consumeForceAiOverrideIfNeeded()
    await setCurrentConversationState('human_pause', HUMAN_HANDOFF_PAUSE_MS, mergeMetadata(baseMetadata, {
      reason: 'attachment_followup_silent',
      ...buildDecisionMetadata({
        intent: null,
        action: 'ignore_human_pause',
        outboundType: null,
      }),
    }))
    return ignoreInbound(inbound.id)
  }

  if (preAiRoute === 'preserve_human_handoff') {
    return applyOohTrapIfNeeded(async () => {
      await consumeForceAiOverrideIfNeeded()
      await setCurrentConversationState('human_pause', HUMAN_HANDOFF_PAUSE_MS, mergeMetadata(baseMetadata, {
        reason: 'recent_human_routing_preserved',
        ...buildDecisionMetadata({
          intent: null,
          action: 'human_handoff',
          outboundType: 'human_handoff',
        }),
      }))
      const text = attachmentFollowupText()
      return createCurrentOutbound(text, 'human_handoff', {
        ...buildWhatsAppCanonicalPayload({
          intent: null,
          action: 'human_handoff',
          outboundType: 'human_handoff',
          canonicalReply: text,
        }),
      })
    })
  }

  if (preAiRoute === 'retry_identifier_lookup') {
    const paymentLookup = await findOpenInstallmentsByIdentifier(channel.store_id, effectiveMessageText || undefined)
    if (paymentLookup) {
      await consumeForceAiOverrideIfNeeded()
      const text = formatPaymentFollowupText(paymentLookup.customer.full_name, paymentLookup.installments)
      await setCurrentConversationState('human_pause', HUMAN_HANDOFF_PAUSE_MS, mergeMetadata(baseMetadata, {
        selectedOption: 'ai_payment_identifier_resolved',
        aiConfidence: null,
        lastKnownCustomerId: paymentLookup.customer.id,
        ...buildPaymentInstallmentMetadata(paymentLookup.installments, normalizedPhone),
        ...buildDecisionMetadata({
          intent: 'payment_info',
          confidence: null,
          action: 'human_handoff',
          outboundType: 'human_handoff',
        }),
      }))
      return createCurrentOutbound(text, 'human_handoff', {
        ...buildWhatsAppCanonicalPayload({
          intent: 'payment_info',
          action: 'human_handoff',
          outboundType: 'human_handoff',
          canonicalReply: text,
        }),
      })
    }

    const result = await findOpenOsByIdentifier(channel.store_id, effectiveMessageText || undefined)
    if (result) {
      await consumeForceAiOverrideIfNeeded()
      return createStatusReply(channel, inbound.id, normalizedPhone, result.customer, result.serviceOrder, baseMetadata, null, finalWriterContext)
    }
  }

  if (preAiRoute === 'waiting_identifier_lookup') {
    const paymentLookup = await findOpenInstallmentsByIdentifier(channel.store_id, effectiveMessageText || undefined)
    if (paymentLookup) {
      await consumeForceAiOverrideIfNeeded()
      const text = formatPaymentFollowupText(paymentLookup.customer.full_name, paymentLookup.installments)
      await setCurrentConversationState('human_pause', HUMAN_HANDOFF_PAUSE_MS, mergeMetadata(baseMetadata, {
        selectedOption: 'ai_payment_identifier_resolved',
        aiConfidence: null,
        lastKnownCustomerId: paymentLookup.customer.id,
        ...buildPaymentInstallmentMetadata(paymentLookup.installments, normalizedPhone),
        ...buildDecisionMetadata({
          intent: 'payment_info',
          confidence: null,
          action: 'human_handoff',
          outboundType: 'human_handoff',
        }),
      }))
      return createCurrentOutbound(text, 'human_handoff', {
        ...buildWhatsAppCanonicalPayload({
          intent: 'payment_info',
          action: 'human_handoff',
          outboundType: 'human_handoff',
          canonicalReply: text,
        }),
      })
    }

    const result = await findOpenOsByIdentifier(channel.store_id, effectiveMessageText || undefined)
    if (result) {
      await consumeForceAiOverrideIfNeeded()
      return createStatusReply(channel, inbound.id, normalizedPhone, result.customer, result.serviceOrder, baseMetadata, null, finalWriterContext)
    }

    return applyOohTrapIfNeeded(async () => {
      await consumeForceAiOverrideIfNeeded()
      await setCurrentConversationState('human_pause', HUMAN_HANDOFF_PAUSE_MS, mergeMetadata(baseMetadata, {
        reason: 'identifier_not_found',
        ...buildDecisionMetadata({
          intent: 'order_status',
          action: 'human_handoff',
          outboundType: 'human_handoff',
        }),
      }))
      const text = notFoundHandoffText()
      const outboundPayload = {
        ...buildWhatsAppCanonicalPayload({
          intent: 'order_status',
          action: 'human_handoff',
          outboundType: 'human_handoff',
          canonicalReply: text,
        }),
      } satisfies ConversationMetadataRecord
      const maybeHumanized = await maybeHumanizeOutboundFromCanonical(outboundPayload, text, storeProfile.name, aiReplyContext)
      return createCurrentOutbound(maybeHumanized.text, 'human_handoff', maybeHumanized.payload)
    })
  }

  if (preAiRoute === 'explicit_status_option') {
    await consumeForceAiOverrideIfNeeded()
    return handleStatusByPhone(channel, inbound.id, normalizedPhone, baseMetadata, null, finalWriterContext)
  }

  const paymentReminderContext = readPaymentReminderContext(state?.metadata)
  const paymentReminderAcknowledgement = paymentReminderContext && isPaymentReminderAcknowledgement(effectiveMessageText)
  const reminderFinancialHandoff = paymentReminderContext && (looksLikePixRequest(effectiveMessageText) || looksLikeAmountRequest(effectiveMessageText))
    ? paymentMatchedHandoffText()
    : null

  if (paymentReminderAcknowledgement && paymentReminderContext) {
    await consumeForceAiOverrideIfNeeded()
    const text = paymentReminderAcknowledgementText()
    await setCurrentConversationState('ai_session', AI_SESSION_MS, appendAiSessionMessage(mergeMetadata(baseMetadata, {
      reason: 'payment_reminder_acknowledged',
      lastKnownCustomerId: paymentReminderContext.customerId ?? null,
      ...buildPaymentInstallmentMetadataFromReminderContext(paymentReminderContext, normalizedPhone),
      ...buildDecisionMetadata({
        intent: 'payment_info',
        action: 'payment_reminder_acknowledged',
        outboundType: 'payment_reminder_acknowledgement',
      }),
    }), 'assistant', text))
    return createCurrentOutbound(text, 'payment_reminder_acknowledgement', {
      ...buildWhatsAppCanonicalPayload({
        intent: 'payment_info',
        action: 'payment_reminder_acknowledged',
        outboundType: 'payment_reminder_acknowledgement',
        canonicalReply: text,
        facts: {
          reminderId: paymentReminderContext.reminderId ?? null,
          installmentId: paymentReminderContext.installmentId ?? null,
        },
      }),
      paymentReminderContext,
    })
  }

  if (reminderFinancialHandoff && paymentReminderContext) {
    await consumeForceAiOverrideIfNeeded()
    await setCurrentConversationState('human_pause', HUMAN_HANDOFF_PAUSE_MS, appendAiSessionMessage(mergeMetadata(baseMetadata, {
      reason: 'payment_context_handoff',
      lastKnownCustomerId: paymentReminderContext.customerId ?? null,
      ...buildPaymentInstallmentMetadataFromReminderContext(paymentReminderContext, normalizedPhone),
      ...buildDecisionMetadata({
        intent: 'payment_info',
        action: 'human_handoff',
        outboundType: 'human_handoff',
      }),
    }), 'assistant', reminderFinancialHandoff))
    return createCurrentOutbound(reminderFinancialHandoff, 'human_handoff', {
      ...buildWhatsAppCanonicalPayload({
        intent: 'payment_info',
        action: 'human_handoff',
        outboundType: 'human_handoff',
        canonicalReply: reminderFinancialHandoff,
      }),
      paymentReminderContext,
    })
  }

  let recoveredPostSaleClassification: WhatsAppAiResult<WhatsAppIntentClassification> | null = null
  if (postSaleContextWasRecovered && recoveredPostSaleContext) {
    const recoveredRating = extractPostSaleRatingForStage(effectiveMessageText, recoveredPostSaleContext.stage)
    let shouldResumePostSale = Boolean(recoveredRating)

    if (!shouldResumePostSale) {
      recoveredPostSaleClassification = await classifyWhatsAppIntent({
        messageText: effectiveMessageText || '',
        channelLabel: channel.instance_key,
        storeName: storeProfile.name,
        conversationState: 'post_sale_memory',
        recentContext,
        conversationHistory,
        hasRecentAttachment: hasRecentAttachmentContext(state),
        hasOpenOrder: hasKnownOpenOrderContext(state),
        handoffActive: false,
      })
      await recordAiResult('intent_classification', recoveredPostSaleClassification)

      const recoveredIntent = recoveredPostSaleClassification.success
        ? recoveredPostSaleClassification.data.intent
        : null
      shouldResumePostSale = recoveredPostSaleClassification.success
        && recoveredPostSaleClassification.data.confidence >= AI_AUTOMATION_MIN_CONFIDENCE
        && (
          recoveredIntent === 'post_sale_positive'
          || recoveredIntent === 'complaint_or_adaptation'
          || recoveredIntent === 'human_agent_request'
        )
    }

    if (!shouldResumePostSale) {
      recoveredPostSaleContext = null
      recoveredPostSaleClassification = null
    }
  }

  const postSaleContext = livePostSaleContext ?? recoveredPostSaleContext
  const postSaleRatingOutcome = readPostSaleRatingOutcome(effectiveMessageText, postSaleContext)

  if (postSaleContext) {
    if (postSaleRatingOutcome?.rating && postSaleContext.postSalesId) {
      await consumeForceAiOverrideIfNeeded()
      await concludePostSaleFromWhatsApp({
        tenantId: channel.tenant_id,
        storeId: channel.store_id,
        postSalesId: postSaleContext.postSalesId,
        rating: postSaleRatingOutcome.rating,
      })

      const text = postSaleThanksText(postSaleRatingOutcome.rating)
      await setCurrentConversationState('silent', AFTER_STATUS_SILENCE_MS, appendAiSessionMessage(mergeMetadata(baseMetadata, {
        reason: 'post_sale_rating_received',
        postSaleContext: {
          ...postSaleContext,
          stage: 'completed',
        } as unknown as Json,
        ...buildDecisionMetadata({
          intent: 'post_sale_positive',
          confidence: null,
          action: 'post_sale_rating_received',
          outboundType: 'post_sale_rating_received',
        }),
      }), 'assistant', text))

      return createCurrentOutbound(text, 'post_sale_rating_received', {
        ...buildWhatsAppCanonicalPayload({
          intent: 'post_sale_positive',
          action: 'post_sale_rating_received',
          outboundType: 'post_sale_rating_received',
          canonicalReply: text,
          facts: {
            postSalesId: postSaleContext.postSalesId,
            serviceOrderId: postSaleContext.serviceOrderId ?? null,
            customerId: postSaleContext.customerId ?? null,
            rating: postSaleRatingOutcome.rating,
          },
        }),
      })
    }

    if (postSaleContext.stage === 'awaiting_rating' && postSaleContext.postSalesId) {
      const ratingResolution = await resolveWhatsAppPostSaleRating({
        messageText: effectiveMessageText || '',
        conversationHistory,
        storeName: storeProfile.name,
      })
      await recordAiResult('post_sale_rating_resolution', ratingResolution)

      if (ratingResolution.success) {
        await consumeForceAiOverrideIfNeeded()

        if (ratingResolution.data.action === 'record_rating') {
          await concludePostSaleFromWhatsApp({
            tenantId: channel.tenant_id,
            storeId: channel.store_id,
            postSalesId: postSaleContext.postSalesId,
            rating: ratingResolution.data.rating,
          })

          const text = ratingResolution.data.reply_text
          await setCurrentConversationState('silent', AFTER_STATUS_SILENCE_MS, appendAiSessionMessage(mergeMetadata(baseMetadata, {
            reason: 'post_sale_rating_received_by_ai',
            postSaleContext: {
              ...postSaleContext,
              stage: 'completed',
            } as unknown as Json,
            ...buildDecisionMetadata({
              intent: 'post_sale_positive',
              confidence: null,
              action: 'post_sale_rating_received_by_ai',
              outboundType: 'post_sale_rating_received',
            }),
          }), 'assistant', text))

          return withAiDiagnostics(await createCurrentOutbound(text, 'post_sale_rating_received', {
            ...buildWhatsAppCanonicalPayload({
              intent: 'post_sale_positive',
              action: 'post_sale_rating_received_by_ai',
              outboundType: 'post_sale_rating_received',
              canonicalReply: text,
              facts: {
                postSalesId: postSaleContext.postSalesId,
                serviceOrderId: postSaleContext.serviceOrderId ?? null,
                customerId: postSaleContext.customerId ?? null,
                rating: ratingResolution.data.rating,
              },
            }),
          }))
        }

        if (ratingResolution.data.action === 'ask_rating') {
          const text = ratingResolution.data.reply_text
          await recordPostSaleInteractionIfPossible({
            channel,
            postSaleContext,
            summary: 'IA solicitou esclarecimento da nota de pos-venda.',
            dedupe: true,
          })
          await setCurrentConversationState('ai_session', AI_SESSION_MS, appendAiSessionMessage(mergeMetadata(baseMetadata, {
            reason: 'post_sale_rating_clarification_requested_by_ai',
            postSaleContext: {
              ...postSaleContext,
              stage: 'awaiting_rating',
              ratingPromptCount: Math.max(1, Number(postSaleContext.ratingPromptCount || 0)) + 1,
            } as unknown as Json,
            ...buildDecisionMetadata({
              intent: 'post_sale_positive',
              confidence: null,
              action: 'post_sale_request_rating_clarification',
              outboundType: 'post_sale_rating_prompt',
            }),
          }), 'assistant', text))

          return withAiDiagnostics(await createCurrentOutbound(text, 'post_sale_rating_prompt', {
            ...buildWhatsAppCanonicalPayload({
              intent: 'post_sale_positive',
              action: 'post_sale_request_rating_clarification',
              outboundType: 'post_sale_rating_prompt',
              canonicalReply: text,
              facts: {
                postSalesId: postSaleContext.postSalesId,
                serviceOrderId: postSaleContext.serviceOrderId ?? null,
                customerId: postSaleContext.customerId ?? null,
              },
            }),
          }))
        }

        const text = ratingResolution.data.reply_text
        await recordPostSaleInteractionIfPossible({
          channel,
          postSaleContext,
          summary: 'IA encaminhou a resposta de pos-venda para atendimento humano.',
          dedupe: true,
        })
        await setCurrentConversationState('human_pause', HUMAN_HANDOFF_PAUSE_MS, appendAiSessionMessage(mergeMetadata(baseMetadata, {
          reason: 'post_sale_rating_handoff_by_ai',
          handoff_internal_note: 'IA identificou que a resposta ao pedido de nota precisa de atendimento humano.',
          postSaleContext: {
            ...postSaleContext,
            stage: 'handoff',
          } as unknown as Json,
          ...buildDecisionMetadata({
            intent: 'human_agent_request',
            confidence: null,
            action: 'human_handoff',
            outboundType: 'human_handoff',
          }),
        }), 'assistant', text))

        return withAiDiagnostics(await createCurrentOutbound(text, 'human_handoff', {
          ...buildWhatsAppCanonicalPayload({
            intent: 'human_agent_request',
            action: 'post_sale_rating_handoff_by_ai',
            outboundType: 'human_handoff',
            canonicalReply: text,
          }),
        }))
      }

      const text = postSaleRatingPromptText()
      await recordPostSaleInteractionIfPossible({
        channel,
        postSaleContext,
        summary: 'IA indisponivel ao interpretar a nota; solicitado esclarecimento numerico.',
        dedupe: true,
      })
      await setCurrentConversationState('ai_session', AI_SESSION_MS, appendAiSessionMessage(mergeMetadata(baseMetadata, {
        reason: 'post_sale_rating_clarification_fallback',
        postSaleContext: {
          ...postSaleContext,
          stage: 'awaiting_rating',
          ratingPromptCount: Math.max(1, Number(postSaleContext.ratingPromptCount || 0)) + 1,
        } as unknown as Json,
        ...buildDecisionMetadata({
          intent: 'post_sale_positive',
          confidence: null,
          action: 'post_sale_request_rating_clarification_fallback',
          outboundType: 'post_sale_rating_prompt',
        }),
      }), 'assistant', text))
      return withAiDiagnostics(await createCurrentOutbound(text, 'post_sale_rating_prompt', {
        ...buildWhatsAppCanonicalPayload({
          intent: 'post_sale_positive',
          action: 'post_sale_request_rating_clarification_fallback',
          outboundType: 'post_sale_rating_prompt',
          canonicalReply: text,
          facts: {
            postSalesId: postSaleContext.postSalesId,
            serviceOrderId: postSaleContext.serviceOrderId ?? null,
            customerId: postSaleContext.customerId ?? null,
          },
        }),
      }))
    }

    // Uma saudacao isolada nao e motivo para abandonar o pos-venda. Isso
    // acontece quando o cliente envia algo como "Boa tarde" e completa a
    // resposta alguns segundos depois. Mantemos o contexto para que a proxima
    // mensagem ainda possa disparar a pergunta da nota.
    if (postSaleContext.stage === 'awaiting_feedback' && looksLikeGenericGreeting(effectiveMessageText)) {
      await setCurrentConversationState('ai_session', AI_SESSION_MS, mergeMetadata(baseMetadata, {
        reason: 'post_sale_waiting_feedback_fragment',
        postSaleContext: {
          ...postSaleContext,
          stage: 'awaiting_feedback',
        } as unknown as Json,
        ...buildDecisionMetadata({
          intent: null,
          confidence: null,
          action: 'no_reply_waiting_post_sale_feedback',
          outboundType: null,
        }),
      }))
      return withAiDiagnostics(await ignoreInbound(inbound.id))
    }

    const postSaleClassification = recoveredPostSaleClassification ?? await classifyWhatsAppIntent({
      messageText: effectiveMessageText || '',
      channelLabel: channel.instance_key,
      storeName: storeProfile.name,
      conversationState: state?.state ?? null,
      recentContext,
      conversationHistory,
      hasRecentAttachment: hasRecentAttachmentContext(state),
      hasOpenOrder: hasKnownOpenOrderContext(state),
      handoffActive: false,
    })

    if (!recoveredPostSaleClassification) {
      await recordAiResult('intent_classification', postSaleClassification)
    }

    if (
      postSaleContext.stage === 'handoff'
      && postSaleClassification.success
      && (
        postSaleClassification.data.intent === 'complaint_or_adaptation'
        || postSaleClassification.data.intent === 'human_agent_request'
        || postSaleClassification.data.intent === 'post_sale_positive'
      )
    ) {
      await consumeForceAiOverrideIfNeeded()
      const text = postSaleClassification.data.intent === 'complaint_or_adaptation'
        ? postSaleComplaintHandoffText()
        : humanHandoffText()
      await recordPostSaleInteractionIfPossible({
        channel,
        postSaleContext,
        summary: 'Cliente retomou um pos-venda que ja estava em atendimento humano.',
        dedupe: true,
      })
      await setCurrentConversationState('human_pause', HUMAN_HANDOFF_PAUSE_MS, appendAiSessionMessage(mergeMetadata(baseMetadata, {
        reason: 'post_sale_reopened_after_handoff',
        handoff_internal_note: 'Cliente voltou a falar sobre pos-venda que ja estava em atendimento humano.',
        postSaleContext: {
          ...postSaleContext,
          stage: 'handoff',
        } as unknown as Json,
        ...buildDecisionMetadata({
          intent: postSaleClassification.data.intent,
          confidence: postSaleClassification.data.confidence,
          action: 'human_handoff',
          outboundType: 'human_handoff',
        }),
      }), 'assistant', text))

      return withAiDiagnostics(await createCurrentOutbound(text, 'human_handoff', {
        ...buildWhatsAppCanonicalPayload({
          intent: postSaleClassification.data.intent,
          action: 'human_handoff',
          outboundType: 'human_handoff',
          canonicalReply: text,
          facts: {
            postSalesId: postSaleContext.postSalesId ?? null,
            serviceOrderId: postSaleContext.serviceOrderId ?? null,
            customerId: postSaleContext.customerId ?? null,
          },
        }),
      }))
    }

    if (
      postSaleClassification.success
      && postSaleClassification.data.intent === 'complaint_or_adaptation'
    ) {
      await consumeForceAiOverrideIfNeeded()
      const text = postSaleComplaintHandoffText()
      await recordPostSaleInteractionIfPossible({
        channel,
        postSaleContext,
        summary: 'Cliente sinalizou reclamacao ou adaptacao ruim no pos-venda automatico.',
        dedupe: true,
      })
      await setCurrentConversationState('human_pause', HUMAN_HANDOFF_PAUSE_MS, appendAiSessionMessage(mergeMetadata(baseMetadata, {
        reason: 'post_sale_complaint_handoff',
        handoff_internal_note: 'Cliente sinalizou reclamacao/adaptacao ruim no pos-venda automatico.',
        postSaleContext: {
          ...postSaleContext,
          stage: 'handoff',
        } as unknown as Json,
        ...buildDecisionMetadata({
          intent: postSaleClassification.data.intent,
          confidence: postSaleClassification.data.confidence,
          action: 'human_handoff',
          outboundType: 'human_handoff',
        }),
      }), 'assistant', text))

      return withAiDiagnostics(await createCurrentOutbound(text, 'human_handoff', {
        ...buildWhatsAppCanonicalPayload({
          intent: postSaleClassification.data.intent,
          action: 'human_handoff',
          outboundType: 'human_handoff',
          canonicalReply: text,
          facts: {
            postSalesId: postSaleContext.postSalesId ?? null,
            serviceOrderId: postSaleContext.serviceOrderId ?? null,
            customerId: postSaleContext.customerId ?? null,
          },
        }),
      }))
    }

    if (
      postSaleClassification.success
      && postSaleClassification.data.intent === 'human_agent_request'
    ) {
      await consumeForceAiOverrideIfNeeded()
      const text = humanHandoffText()
      await recordPostSaleInteractionIfPossible({
        channel,
        postSaleContext,
        summary: 'Cliente pediu atendimento humano durante o pos-venda automatico.',
        dedupe: true,
      })
      await setCurrentConversationState('human_pause', HUMAN_HANDOFF_PAUSE_MS, appendAiSessionMessage(mergeMetadata(baseMetadata, {
        reason: 'post_sale_requested_human',
        handoff_internal_note: 'Cliente pediu atendente humano durante o pos-venda automatico.',
        postSaleContext: {
          ...postSaleContext,
          stage: 'handoff',
        } as unknown as Json,
        ...buildDecisionMetadata({
          intent: postSaleClassification.data.intent,
          confidence: postSaleClassification.data.confidence,
          action: 'human_handoff',
          outboundType: 'human_handoff',
        }),
      }), 'assistant', text))

      return withAiDiagnostics(await createCurrentOutbound(text, 'human_handoff', {
        ...buildWhatsAppCanonicalPayload({
          intent: postSaleClassification.data.intent,
          action: 'human_handoff',
          outboundType: 'human_handoff',
          canonicalReply: text,
        }),
      }))
    }

    if (
      postSaleClassification.success
      && postSaleClassification.data.intent === 'post_sale_positive'
    ) {
      if (postSaleContext.stage === 'awaiting_feedback') {
        await consumeForceAiOverrideIfNeeded()
        const text = postSaleRatingPromptText()
        await recordPostSaleInteractionIfPossible({
          channel,
          postSaleContext,
          summary: 'Cliente respondeu positivamente ao acompanhamento automatico e recebeu pedido de nota.',
          dedupe: true,
        })
        await setCurrentConversationState('ai_session', AI_SESSION_MS, appendAiSessionMessage(mergeMetadata(baseMetadata, {
          reason: 'post_sale_rating_requested',
          postSaleContext: {
            ...postSaleContext,
            stage: 'awaiting_rating',
            ratingPromptCount: 1,
          } as unknown as Json,
          ...buildDecisionMetadata({
            intent: postSaleClassification.data.intent,
            confidence: postSaleClassification.data.confidence,
            action: 'post_sale_request_rating',
            outboundType: 'post_sale_rating_prompt',
          }),
        }), 'assistant', text))

        return withAiDiagnostics(await createCurrentOutbound(text, 'post_sale_rating_prompt', {
          ...buildWhatsAppCanonicalPayload({
            intent: postSaleClassification.data.intent,
            action: 'post_sale_request_rating',
            outboundType: 'post_sale_rating_prompt',
            canonicalReply: text,
            facts: {
              postSalesId: postSaleContext.postSalesId ?? null,
              serviceOrderId: postSaleContext.serviceOrderId ?? null,
              customerId: postSaleContext.customerId ?? null,
            },
          }),
        }))
      }

      if (postSaleContext.stage === 'awaiting_rating') {
        await consumeForceAiOverrideIfNeeded()
        await recordPostSaleInteractionIfPossible({
          channel,
          postSaleContext,
          summary: 'Cliente respondeu ao pedido de nota sem informar uma nota numerica valida.',
          dedupe: true,
        })
        await setCurrentConversationState('ai_session', AI_SESSION_MS, mergeMetadata(baseMetadata, {
          reason: 'post_sale_waiting_numeric_rating',
          postSaleContext: {
            ...postSaleContext,
            stage: 'awaiting_rating',
            ratingPromptCount: Math.max(1, Number(postSaleContext.ratingPromptCount || 0)),
          } as unknown as Json,
          ...buildDecisionMetadata({
            intent: postSaleClassification.data.intent,
            confidence: postSaleClassification.data.confidence,
            action: 'no_reply',
            outboundType: null,
          }),
        }))
        return withAiDiagnostics(await ignoreInbound(inbound.id))
      }
    }

    await consumeForceAiOverrideIfNeeded()
    await recordPostSaleInteractionIfPossible({
      channel,
      postSaleContext,
      summary: 'Pos-venda automatico entrou em handoff silencioso por baixa confianca na classificacao.',
      dedupe: true,
    })
    await setCurrentConversationState('human_pause', HUMAN_HANDOFF_PAUSE_MS, mergeMetadata(baseMetadata, {
      reason: 'post_sale_low_confidence_handoff',
      handoff_internal_note: postSaleLowConfidenceHandoffNote(),
      postSaleContext: {
        ...postSaleContext,
        stage: 'handoff',
      } as unknown as Json,
      ...buildDecisionMetadata({
        intent: postSaleClassification.success ? postSaleClassification.data.intent : null,
        confidence: postSaleClassification.success ? postSaleClassification.data.confidence : null,
        action: 'silent_handoff',
        outboundType: null,
      }),
    }))
    return withAiDiagnostics(await ignoreInbound(inbound.id))
  }

  const genericPixReply = !paymentReminderContext && looksLikePixRequest(effectiveMessageText)
    ? buildGenericPixReply(storeProfile)
    : null

  if (genericPixReply) {
    await consumeForceAiOverrideIfNeeded()
    await setCurrentConversationState('human_pause', HUMAN_HANDOFF_PAUSE_MS, appendAiSessionMessage(mergeMetadata(baseMetadata, {
      reason: 'pix_sent_handoff',
      handoff_internal_note: 'Chave Pix enviada automaticamente; conversa transferida para atendimento humano.',
      ...buildDecisionMetadata({
        intent: 'payment_info',
        action: 'payment_pix_info',
        outboundType: 'payment_pix_info',
      }),
    }), 'assistant', genericPixReply))
    return createCurrentOutbound(genericPixReply, 'payment_pix_info', {
      ...buildWhatsAppCanonicalPayload({
        intent: 'payment_info',
        action: 'payment_pix_info',
        outboundType: 'payment_pix_info',
        canonicalReply: genericPixReply,
      }),
    })
  }

  if (preAiRoute === 'ignore_silent') {
    return ignoreInbound(inbound.id)
  }

  if (canUseAiForFreeform(effectiveMessageText || undefined)) {
    const storeProfile = await loadStoreProfile(channel.store_id)
    const classification = await classifyWhatsAppIntent({
      messageText: effectiveMessageText!,
      channelLabel: channel.instance_key,
      storeName: storeProfile.name,
      conversationState: state?.state ?? null,
      recentContext,
      conversationHistory,
      hasRecentAttachment: hasRecentAttachmentContext(state),
      hasOpenOrder: hasKnownOpenOrderContext(state),
      handoffActive: false,
    })

    // Log the AI classification
    await recordAiResult('intent_classification', classification)

    const storeHoursText = buildStoreHoursText(storeProfile)
    const storeLocationText = buildStoreLocationReply(storeProfile)
    const postClassificationRoute = applyForceAiPostClassificationRoute(
      decidePostClassificationRoute({
        classificationSuccess: classification.success,
        confidence: classification.success ? classification.data.confidence : 0,
        automationCandidate: classification.success ? classification.data.automation_candidate : false,
        intent: classification.success ? classification.data.intent : null,
        minConfidence: AI_AUTOMATION_MIN_CONFIDENCE,
        hasStoreHoursText: Boolean(storeHoursText),
        hasStoreLocationText: Boolean(storeLocationText),
      }),
      classification.success ? classification.data : null,
      controlMode
    )

    if (classification.success && postClassificationRoute === 'silent_handoff') {
      await consumeForceAiOverrideIfNeeded()
      const paymentInstallmentMetadata = classification.data.intent === 'payment_info'
        ? buildPaymentInstallmentMetadata(
          await findOpenInstallmentsByPhone(channel.store_id, normalizedPhone),
          normalizedPhone
        )
        : {}
      await setCurrentConversationState('human_pause', HUMAN_HANDOFF_PAUSE_MS, mergeMetadata(baseMetadata, {
        selectedOption: 'ai_silent_handoff',
        aiConfidence: classification.data.confidence,
        ...paymentInstallmentMetadata,
        ...buildDecisionMetadata({
          intent: classification.data.intent,
          confidence: classification.data.confidence,
          action: 'silent_handoff',
          outboundType: null,
        }),
      }))

      return withAiDiagnostics(await ignoreInbound(inbound.id))
    }

    if (classification.success && postClassificationRoute !== 'fallback') {
      if (postClassificationRoute === 'post_sale_positive') {
        return withAiDiagnostics(await ignoreInbound(inbound.id))
      }

      if (postClassificationRoute === 'human_handoff') {
        await consumeForceAiOverrideIfNeeded()
        await setCurrentConversationState('human_pause', HUMAN_HANDOFF_PAUSE_MS, mergeMetadata(baseMetadata, {
          selectedOption: 'ai_human_handoff',
          aiConfidence: classification.data.confidence,
          ...buildDecisionMetadata({
            intent: classification.data.intent,
            confidence: classification.data.confidence,
            action: 'human_handoff',
            outboundType: 'human_handoff',
          }),
        }))
        const text = humanHandoffText()
        const outboundPayload = {
          ...buildAiPayload(classification.data),
          ...buildWhatsAppCanonicalPayload({
            intent: classification.data.intent,
            action: 'human_handoff',
            outboundType: 'human_handoff',
            canonicalReply: text,
          }),
        } satisfies ConversationMetadataRecord
        const maybeHumanized = await maybeHumanizeOutboundFromCanonical(outboundPayload, text, storeProfile.name, aiReplyContext)
        const aiResult = (maybeHumanized as any).aiResult
        if (aiResult) {
          await recordAiResult('reply_humanization', aiResult)
        }
        return withAiDiagnostics(await createCurrentOutbound(
          maybeHumanized.text,
          'human_handoff',
          maybeHumanized.payload
        ))
      }

      if (postClassificationRoute === 'pickup_or_scheduling') {
        await consumeForceAiOverrideIfNeeded()
        const customer = await findCustomerByPhone(channel.store_id, normalizedPhone)
        if (customer) {
          await upsertCustomerLink(channel, normalizedPhone, customer.id, 'phone_match')
          const serviceOrder = await findLatestOpenOs(channel.store_id, customer.id)
          if (serviceOrder) {
            const automationSettings = await loadStoreWhatsAppSettings(channel.store_id)
            const status = describeOpenOs(customer.full_name, serviceOrder, automationSettings?.os_on_demand?.templates)
            const lastOutbound = await findLastOutboundStatus(channel.id, normalizedPhone)

            if (shouldSilenceRepeatedStatus(lastOutbound, status.statusCode)) {
              // FOLLOW-UP question: It's a handoff!
              const text = 'Vou acionar a equipe para verificar a sua retirada/agendamento no detalhe. Um momento.'
              await setCurrentConversationState('human_pause', HUMAN_HANDOFF_PAUSE_MS, mergeMetadata(baseMetadata, {
                selectedOption: 'ai_specific_handoff',
                aiConfidence: classification.data.confidence,
                ...buildDecisionMetadata({
                  intent: classification.data.intent,
                  confidence: classification.data.confidence,
                  action: 'human_handoff',
                  outboundType: 'human_handoff',
                }),
              }))
              const outboundPayload = {
                ...buildAiPayload(classification.data),
                ...buildWhatsAppCanonicalPayload({
                  intent: classification.data.intent,
                  action: 'human_handoff',
                  outboundType: 'human_handoff',
                  canonicalReply: text,
                }),
              } satisfies ConversationMetadataRecord
              const maybeHumanized = await maybeHumanizeOutboundFromCanonical(outboundPayload, text, storeProfile.name, aiReplyContext)
              const aiResult = (maybeHumanized as any).aiResult
              if (aiResult) {
                await recordAiResult('reply_humanization', aiResult)
              }
              return withAiDiagnostics(await createCurrentOutbound(
                maybeHumanized.text,
                'human_handoff',
                maybeHumanized.payload
              ))
            } else {
              // New status update for pickup
              const storeHoursAppend = storeHoursText ? ` Nosso horário de atendimento é ${storeHoursText}.` : ''
              const finalCanonicalReply = `${status.replyText}${storeHoursAppend}`
              
              const outboundPayload = {
                statusCode: status.statusCode,
                ...buildAiPayload(classification.data),
                ...buildWhatsAppCanonicalPayload({
                  intent: 'pickup_or_scheduling',
                  action: 'auto_reply',
                  outboundType: 'os_status',
                  canonicalReply: finalCanonicalReply,
                  facts: {
                    statusCode: status.statusCode,
                    serviceOrderId: serviceOrder.id,
                    customerId: customer.id,
                  },
                }),
              } satisfies ConversationMetadataRecord

              const maybeHumanized = await maybeHumanizeOutboundFromCanonical(outboundPayload, finalCanonicalReply, storeProfile.name, aiReplyContext)
              const aiResult = (maybeHumanized as any).aiResult
              if (aiResult) {
                await recordAiResult('reply_humanization', aiResult)
              }
              await setCurrentConversationState('silent', AFTER_STATUS_SILENCE_MS, appendAiSessionMessage(mergeMetadata(baseMetadata, {
                reason: 'status_sent_pickup',
                lastKnownCustomerId: customer.id,
                lastKnownServiceOrderId: serviceOrder.id,
                serviceOrderId: serviceOrder.id,
                statusCode: status.statusCode,
                ...buildDecisionMetadata({
                  intent: 'pickup_or_scheduling',
                  confidence: classification.data.confidence,
                  action: 'auto_reply',
                  outboundType: 'os_status',
                }),
              }), 'assistant', maybeHumanized.text))
              return withAiDiagnostics(await createCurrentOutbound(maybeHumanized.text, 'os_status', maybeHumanized.payload))
            }
          }
        }

        // Se não achou OS, handoff
        const text = 'Vou acionar a equipe para verificar a sua retirada/agendamento. Um momento.'
        await setCurrentConversationState('human_pause', HUMAN_HANDOFF_PAUSE_MS, mergeMetadata(baseMetadata, {
          selectedOption: 'ai_specific_handoff',
          aiConfidence: classification.data.confidence,
          ...buildDecisionMetadata({
            intent: classification.data.intent,
            confidence: classification.data.confidence,
            action: 'human_handoff',
            outboundType: 'human_handoff',
          }),
        }))
        const outboundPayload = {
          ...buildAiPayload(classification.data),
          ...buildWhatsAppCanonicalPayload({
            intent: classification.data.intent,
            action: 'human_handoff',
            outboundType: 'human_handoff',
            canonicalReply: text,
          }),
        } satisfies ConversationMetadataRecord
        const maybeHumanized = await maybeHumanizeOutboundFromCanonical(outboundPayload, text, storeProfile.name, aiReplyContext)
        const aiResult = (maybeHumanized as any).aiResult
        if (aiResult) {
          await recordAiResult('reply_humanization', aiResult)
        }
        return withAiDiagnostics(await createCurrentOutbound(
          maybeHumanized.text,
          'human_handoff',
          maybeHumanized.payload
        ))
      }

      if (postClassificationRoute === 'budget_request' || postClassificationRoute === 'complaint_or_adaptation') {
        await consumeForceAiOverrideIfNeeded()
        const textMap: Record<string, string> = {
          budget_request: 'Vou chamar um consultor para te ajudar com esse orçamento agora mesmo!',
          complaint_or_adaptation: 'Entendi a situação. Vou chamar um especialista da nossa equipe para dar prioridade ao seu caso.',
        }
        const text = textMap[postClassificationRoute] || humanHandoffText()
        await setConversationState(channel, normalizedPhone, 'human_pause', HUMAN_HANDOFF_PAUSE_MS, mergeMetadata(baseMetadata, {
          selectedOption: 'ai_specific_handoff',
          aiConfidence: classification.data.confidence,
          ...buildDecisionMetadata({
            intent: classification.data.intent,
            confidence: classification.data.confidence,
            action: 'human_handoff',
            outboundType: 'human_handoff',
          }),
        }))
        const outboundPayload = {
          ...buildAiPayload(classification.data),
          ...buildWhatsAppCanonicalPayload({
            intent: classification.data.intent,
            action: 'human_handoff',
            outboundType: 'human_handoff',
            canonicalReply: text,
          }),
        } satisfies ConversationMetadataRecord
        const maybeHumanized = await maybeHumanizeOutboundFromCanonical(outboundPayload, text, storeProfile.name, aiReplyContext)
        const aiResult = (maybeHumanized as any).aiResult
        if (aiResult) {
          await recordAiResult('reply_humanization', aiResult)
        }
        return withAiDiagnostics(await createCurrentOutbound(
          maybeHumanized.text,
          'human_handoff',
          maybeHumanized.payload
        ))
      }

      if (postClassificationRoute === 'payment_info') {
        const installments = await findOpenInstallmentsByPhone(channel.store_id, normalizedPhone)
        if (installments && installments.length > 0) {
          await consumeForceAiOverrideIfNeeded()
          const paymentInstallmentMetadata = buildPaymentInstallmentMetadata(installments, normalizedPhone)
          const text = paymentMatchedHandoffText()
          await setCurrentConversationState('human_pause', HUMAN_HANDOFF_PAUSE_MS, mergeMetadata(baseMetadata, {
            reason: 'payment_match_handoff',
            selectedOption: 'ai_specific_handoff',
            aiConfidence: classification.data.confidence,
            ...paymentInstallmentMetadata,
            ...buildDecisionMetadata({
              intent: classification.data.intent,
              confidence: classification.data.confidence,
              action: 'human_handoff',
              outboundType: 'human_handoff',
            }),
          }))
          const outboundPayload = {
            ...buildAiPayload(classification.data),
            ...buildWhatsAppCanonicalPayload({
              intent: classification.data.intent,
              action: 'human_handoff',
              outboundType: 'human_handoff',
              canonicalReply: text,
            }),
          } satisfies ConversationMetadataRecord

          const maybeHumanized = await maybeHumanizeOutboundFromCanonical(outboundPayload, text, storeProfile.name, aiReplyContext)
          const aiResult = (maybeHumanized as any).aiResult
          if (aiResult) {
            await recordAiResult('reply_humanization', aiResult)
          }
          return withAiDiagnostics(await createCurrentOutbound(
            maybeHumanized.text,
            'human_handoff',
            maybeHumanized.payload
          ))
        }
      }

      if (postClassificationRoute === 'payment_info') {
        await consumeForceAiOverrideIfNeeded()
        const installments = await findOpenInstallmentsByPhone(channel.store_id, normalizedPhone)
        const paymentInstallmentMetadata = buildPaymentInstallmentMetadata(installments, normalizedPhone)
        let text = ''
        if (installments && installments.length > 0) {
          const first = installments[0]
          // Format date from YYYY-MM-DD
          let dataFormatada = first.due_date
          if (dataFormatada) {
            const [y, m, d] = dataFormatada.split('T')[0].split('-')
            dataFormatada = `${d}/${m}/${y}`
          }
          text = `Achei um cadastro em aberto referente a uma compra que vence/venceu no dia ${dataFormatada}. É sobre essa compra que você quer falar? Por questões de segurança, poderia me confirmar o nome completo do titular ou o CPF?`
        } else {
          text = `Não consegui localizar nenhuma fatura em aberto cadastrada direto no seu número. Você poderia me informar o nome de quem fez a compra ou o CPF?`
        }

        await setCurrentConversationState('waiting_identifier', IDENTIFIER_WAIT_MS, mergeMetadata(baseMetadata, {
          reason: 'payment_identifier_requested',
          selectedOption: 'ai_specific_handoff',
          aiConfidence: classification.data.confidence,
          ...paymentInstallmentMetadata,
          ...buildDecisionMetadata({
            intent: classification.data.intent,
            confidence: classification.data.confidence,
            action: 'request_identifier',
            outboundType: 'payment_identifier_prompt',
          }),
        }))

        const outboundPayload = {
          ...buildAiPayload(classification.data),
          ...buildWhatsAppCanonicalPayload({
            intent: classification.data.intent,
            action: 'request_identifier',
            outboundType: 'payment_identifier_prompt',
            canonicalReply: text,
          }),
        } satisfies ConversationMetadataRecord

        const maybeHumanized = await maybeHumanizeOutboundFromCanonical(outboundPayload, text, storeProfile.name, aiReplyContext)
        const aiResult = (maybeHumanized as any).aiResult
        if (aiResult) {
          await recordAiResult('reply_humanization', aiResult)
        }
        return withAiDiagnostics(await createCurrentOutbound(
          maybeHumanized.text,
          'payment_identifier_prompt',
          maybeHumanized.payload
        ))
      }

      if (postClassificationRoute === 'order_status') {
        await consumeForceAiOverrideIfNeeded()
        const customerByPhone = await findCustomerByPhone(channel.store_id, normalizedPhone)
        const serviceOrderByPhone = customerByPhone
          ? await findLatestOpenOs(channel.store_id, customerByPhone.id)
          : null

        if (shouldRequestThirdPartyIdentifier(classification.data, customerByPhone, serviceOrderByPhone)) {
          const text = thirdPartyIdentifierPromptText()
          await setCurrentConversationState('waiting_identifier', IDENTIFIER_WAIT_MS, appendAiSessionMessage(mergeMetadata(baseMetadata, {
            reason: 'third_party_identifier_requested',
            aiConfidence: classification.data.confidence,
            ...buildAiPayload(classification.data),
            ...buildDecisionMetadata({
              intent: classification.data.intent,
              confidence: classification.data.confidence,
              action: 'request_identifier',
              outboundType: 'identifier_prompt',
            }),
          }), 'assistant', text))

          return withAiDiagnostics(await createCurrentOutbound(text, 'identifier_prompt', {
            ...buildAiPayload(classification.data),
            ...buildWhatsAppCanonicalPayload({
              intent: classification.data.intent,
              action: 'request_identifier',
              outboundType: 'identifier_prompt',
              canonicalReply: text,
              facts: {
                referencedName: getReferencedOrderStatusName(classification.data),
              },
            }),
          }))
        }

        return withAiDiagnostics(await handleStatusByPhone(
          channel,
          inbound.id,
          normalizedPhone,
          baseMetadata,
          classification.data.confidence,
          finalWriterContext
        ))
      }

      if (postClassificationRoute === 'store_hours') {
        const text = storeHoursText
        if (text) {
          await consumeForceAiOverrideIfNeeded()
          const outboundPayload = {
            ...buildAiPayload(classification.data),
            ...buildWhatsAppCanonicalPayload({
              intent: classification.data.intent,
              action: 'auto_reply',
              outboundType: 'store_hours',
              canonicalReply: text,
              facts: {
                storeName: storeProfile.name,
              },
            }),
          } satisfies ConversationMetadataRecord
          const maybeHumanized = await maybeHumanizeOutboundFromCanonical(outboundPayload, text, storeProfile.name, aiReplyContext)
          const aiResult = (maybeHumanized as any).aiResult
          if (aiResult) {
            await recordAiResult('reply_humanization', aiResult)
          }
          await setCurrentConversationState(
            'silent',
            AFTER_STATUS_SILENCE_MS,
            appendAiSessionMessage(
              mergeMetadata(
                mergeMetadata(baseMetadata, toMetadataRecord(buildAiStateMetadata('store_hours_sent', classification.data))),
                buildDecisionMetadata({
                  intent: classification.data.intent,
                  confidence: classification.data.confidence,
                  action: 'auto_reply',
                  outboundType: 'store_hours',
                })
              ),
              'assistant',
              maybeHumanized.text
            )
          )
          return withAiDiagnostics(await createCurrentOutbound(maybeHumanized.text, 'store_hours', maybeHumanized.payload))
        }
      }

      if (postClassificationRoute === 'store_location') {
        const text = storeLocationText
        if (text) {
          await consumeForceAiOverrideIfNeeded()
          const outboundPayload = {
            ...buildAiPayload(classification.data),
            ...buildWhatsAppCanonicalPayload({
              intent: classification.data.intent,
              action: 'auto_reply',
              outboundType: 'store_location',
              canonicalReply: text,
              facts: {
                storeName: storeProfile.name,
              },
            }),
          } satisfies ConversationMetadataRecord
          const maybeHumanized = await maybeHumanizeOutboundFromCanonical(outboundPayload, text, storeProfile.name, aiReplyContext)
          const aiResult = (maybeHumanized as any).aiResult
          if (aiResult) {
            await recordAiResult('reply_humanization', aiResult)
          }
          await setCurrentConversationState(
            'silent',
            AFTER_STATUS_SILENCE_MS,
            appendAiSessionMessage(
              mergeMetadata(
                mergeMetadata(baseMetadata, toMetadataRecord(buildAiStateMetadata('store_location_sent', classification.data))),
                buildDecisionMetadata({
                  intent: classification.data.intent,
                  confidence: classification.data.confidence,
                  action: 'auto_reply',
                  outboundType: 'store_location',
                })
              ),
              'assistant',
              maybeHumanized.text
            )
          )
          return withAiDiagnostics(await createCurrentOutbound(maybeHumanized.text, 'store_location', maybeHumanized.payload))
        }
      }
    }

    if (isWhatsAppAiResponderEnabled(automationSettings)) {
      const isGreeting = looksLikeGenericGreeting(effectiveMessageText)
      return applyOohTrapIfNeeded(async () => {
        let text = isGreeting ? aiGreetingText() : aiClarificationText()
        const fallbackReply = await generateWhatsAppFallbackReply({
          userMessageText: effectiveMessageText || '',
          conversationHistory: aiReplyContext.conversationHistory,
          storeName: storeProfile.name,
        })
        await recordAiResult('fallback_reply', fallbackReply)
        if (fallbackReply.success) {
          text = fallbackReply.data.reply_text
        }

        await consumeForceAiOverrideIfNeeded()
        await setCurrentConversationState('ai_session', AI_SESSION_MS, appendAiSessionMessage(mergeMetadata(baseMetadata, {
          ...(classification.success ? buildAiPayload(classification.data) : {}),
          ...buildDecisionMetadata({
            intent: classification.success ? classification.data.intent : null,
            confidence: classification.success ? classification.data.confidence : null,
            action: isGreeting ? 'ai_greeting' : 'ai_clarification',
            outboundType: isGreeting ? 'ai_greeting' : 'ai_clarification',
          }),
        }), 'assistant', text))
        return withAiDiagnostics(await createCurrentOutbound(text, isGreeting ? 'ai_greeting' : 'ai_clarification', {
          ...(classification.success ? buildAiPayload(classification.data) : {}),
          ...buildWhatsAppCanonicalPayload({
            intent: classification.success ? classification.data.intent : null,
            action: isGreeting ? 'ai_greeting' : 'ai_clarification',
            outboundType: isGreeting ? 'ai_greeting' : 'ai_clarification',
            canonicalReply: text,
          }),
        }))
      })
    }
  }

  if (state?.state === 'waiting_menu') {
    return ignoreInbound(inbound.id)
  }

  if (!isWhatsAppAiResponderEnabled(automationSettings) && looksLikeOrderStatusQuestion(effectiveMessageText || undefined)) {
    await consumeForceAiOverrideIfNeeded()
    return handleStatusByPhone(channel, inbound.id, normalizedPhone, baseMetadata, null, finalWriterContext)
  }

  if (isWhatsAppAiResponderEnabled(automationSettings)) {
    return ignoreInbound(inbound.id)
  }

  return applyOohTrapIfNeeded(async () => {
    const text = menuText()
    await consumeForceAiOverrideIfNeeded()
    await setCurrentConversationState('waiting_menu', MENU_WAIT_MS, appendAiSessionMessage(mergeMetadata(baseMetadata, {
      reason: 'menu_sent',
      ...buildDecisionMetadata({
        intent: null,
        action: 'show_menu',
        outboundType: 'menu',
      }),
    }), 'assistant', text))
    return createCurrentOutbound(text, 'menu', {
      ...buildWhatsAppCanonicalPayload({
        intent: null,
        action: 'show_menu',
        outboundType: 'menu',
        canonicalReply: text,
      }),
    })
  })
}

export async function simulateCustomerStatus(
  input: Omit<CustomerStatusRequest, 'providerMessageId'> & { providerMessageId?: string }
): Promise<CustomerStatusSimulationResponse> {
  const channel = await findActiveChannel(input.instanceKey)
  if (!channel) {
    return {
      shouldReply: false,
      debug: {
        overrideMode: 'auto',
        preAiRoute: null,
        postClassificationRoute: null,
        action: 'channel_not_found',
        outboundType: null,
        state: null,
        intent: null,
        confidence: null,
        notes: ['Canal nao encontrado ou inativo.'],
      },
    }
  }

  const normalizedPhone = toEvolutionNumber(input.phone)
  if (!normalizedPhone) {
    return {
      shouldReply: false,
      debug: {
        overrideMode: 'auto',
        preAiRoute: null,
        postClassificationRoute: null,
        action: 'invalid_phone',
        outboundType: null,
        state: null,
        intent: null,
        confidence: null,
        notes: ['Telefone invalido para simulacao.'],
      },
    }
  }

  const inboundPayloadMeta = extractWhatsAppInboundPayloadMeta(input.payload)
  const effectiveMessageText = normalizeDisplayText(input.messageText) || inboundPayloadMeta.caption || inboundPayloadMeta.text
  const automationSettings = await loadStoreWhatsAppSettings(channel.store_id)
  const state = await findConversationState(channel.id, normalizedPhone)
  const controlMode = await loadCustomerControlMode(channel.id, normalizedPhone)
  const aiDiagnostics: WhatsAppAiDiagnostic[] = []
  const storeProfile = await loadStoreProfile(channel.store_id)
  const settings = ((storeProfile.settings || {}) as StoreSettings) || {}
  const option = optionFromMessage(effectiveMessageText || undefined)
  const hoursFacts = settings.store_hours ? evaluateStoreHours(settings.store_hours) : null
  const releasedClosedTrapPause = shouldReleaseClosedTrapPause({
    state: state?.state ?? null,
    metadata: state?.metadata,
    isStoreOpenNow: hoursFacts?.is_open_now === true,
  })
  const routingState = releasedClosedTrapPause ? null : state
  const debugState = routingState?.state ?? null
  const effectiveState = effectiveStateForControl(routingState, controlMode)
  const recentContext = buildRecentContextFromMetadata(routingState?.metadata, effectiveMessageText)
  const conversationHistory = buildAiConversationHistoryFromMetadata(routingState?.metadata)

  function buildResult(partial: Partial<CustomerStatusSimulationResponse>, debug: CustomerStatusSimulationResponse['debug']) {
    return {
      shouldReply: false,
      ...partial,
      ...(aiDiagnostics.length ? { aiDiagnostics } : {}),
      debug,
    } satisfies CustomerStatusSimulationResponse
  }

  if (!isWhatsAppAutomationEnabled(automationSettings)) {
    return buildResult({}, {
      overrideMode: controlMode,
      preAiRoute: null,
      postClassificationRoute: null,
      action: 'automation_disabled',
      outboundType: null,
      state: state?.state ?? null,
      intent: null,
      confidence: null,
      notes: ['Automacao geral do WhatsApp esta desligada.'],
    })
  }

  if (controlMode === 'force_human') {
    return buildResult({}, {
      overrideMode: controlMode,
      preAiRoute: null,
      postClassificationRoute: null,
      action: 'force_human_override',
      outboundType: null,
      state: state?.state ?? null,
      intent: null,
      confidence: null,
      notes: ['Cliente fixado em atendimento humano.'],
    })
  }

  let isExceptionalClosure = false
  let isNormalClosed = false
  if (hoursFacts) {
    if (hoursFacts.is_exceptional_closure) {
      isExceptionalClosure = true
    } else if (!hoursFacts.is_open_now) {
      isNormalClosed = true
    }
  }

  const preAiRoute = decidePreAiRoute({
    option,
    state: effectiveState ?? null,
    hasAttachment: inboundPayloadMeta.hasAttachment,
    messageText: effectiveMessageText,
    metadata: routingState?.metadata,
    isStoreOpenNow: hoursFacts?.is_open_now === true,
    humanHandoffWindowMs: ATTACHMENT_HANDOFF_MS,
    identifierWindowMs: IDENTIFIER_WAIT_MS,
  })

  if (isExceptionalClosure) {
    const text = buildClosedStoreText(hoursFacts!)
    return buildResult({ shouldReply: true, phone: normalizedPhone, replyText: text }, {
      overrideMode: controlMode,
      preAiRoute,
      postClassificationRoute: null,
      action: 'exceptional_closure_trap',
      outboundType: 'exceptional_closure',
      state: state?.state ?? null,
      intent: null,
      confidence: null,
      notes: ['Loja em fechamento excepcional.'],
    })
  }

  if (isNormalClosed) {
    const text = buildClosedStoreText(hoursFacts!)
    return buildResult({ shouldReply: true, phone: normalizedPhone, replyText: text }, {
      overrideMode: controlMode,
      preAiRoute,
      postClassificationRoute: null,
      action: 'normal_closed_trap',
      outboundType: 'store_hours',
      state: state?.state ?? null,
      intent: null,
      confidence: null,
      notes: ['Loja fechada fora do horario normal responde com aviso dinamico de atendimento.'],
    })
  }

  if (preAiRoute === 'explicit_human_option') {
    const text = humanHandoffText()
    return buildResult({ shouldReply: true, phone: normalizedPhone, replyText: text }, {
      overrideMode: controlMode,
      preAiRoute,
      postClassificationRoute: null,
      action: 'human_handoff',
      outboundType: 'human_handoff',
      state: state?.state ?? null,
      intent: 'human_agent_request',
      confidence: null,
      notes: ['Cliente pediu atendimento humano explicitamente.'],
    })
  }

  if (preAiRoute === 'ignore_human_pause') {
    return buildResult({}, {
      overrideMode: controlMode,
      preAiRoute,
      postClassificationRoute: null,
      action: 'ignore_human_pause',
      outboundType: null,
      state: state?.state ?? null,
      intent: null,
      confidence: null,
      notes: ['Conversa em pausa humana.'],
    })
  }

  if (preAiRoute === 'attachment_handoff') {
    const text = inboundPayloadMeta.attachmentKind === 'audio'
      ? null
      : attachmentReceivedText()
    return buildResult({ shouldReply: Boolean(text), phone: normalizedPhone, replyText: text || undefined }, {
      overrideMode: controlMode,
      preAiRoute,
      postClassificationRoute: null,
      action: 'attachment_handoff',
      outboundType: text ? 'attachment_handoff' : null,
      state: state?.state ?? null,
      intent: inboundPayloadMeta.attachmentKind === 'audio' ? null : 'prescription_submission',
      confidence: null,
      notes: ['Simulacao com anexo entra em handoff humano.'],
    })
  }

  if (preAiRoute === 'attachment_followup_handoff' || preAiRoute === 'preserve_human_handoff') {
    return buildResult({}, {
      overrideMode: controlMode,
      preAiRoute,
      postClassificationRoute: null,
      action: 'ignore_human_pause',
      outboundType: null,
      state: state?.state ?? null,
      intent: null,
      confidence: null,
      notes: ['Anexo recente preserva handoff humano sem nova resposta automatica.'],
    })
  }

  if (preAiRoute === 'explicit_status_option') {
    const statusResult = await simulateStatusReply(channel, normalizedPhone)
    return {
      ...statusResult,
      debug: {
        ...statusResult.debug,
        overrideMode: controlMode,
        state: state?.state ?? null,
      },
    }
  }

  if (preAiRoute === 'retry_identifier_lookup' || preAiRoute === 'waiting_identifier_lookup') {
    const paymentLookup = await findOpenInstallmentsByIdentifier(channel.store_id, effectiveMessageText || undefined)
    if (paymentLookup) {
      const text = formatPaymentFollowupText(paymentLookup.customer.full_name, paymentLookup.installments)
      return buildResult({
        shouldReply: true,
        phone: normalizedPhone,
        customerName: paymentLookup.customer.full_name,
        replyText: text,
      }, {
        overrideMode: controlMode,
        preAiRoute,
        postClassificationRoute: null,
        action: 'human_handoff',
        outboundType: 'human_handoff',
        state: state?.state ?? null,
        intent: 'payment_info',
        confidence: null,
        notes: ['Identificador permitiu localizar parcelas pendentes do cliente.'],
      })
    }

    const result = await findOpenOsByIdentifier(channel.store_id, effectiveMessageText || undefined)
    if (result) {
      const automationSettingsForStatus = await loadStoreWhatsAppSettings(channel.store_id)
      const status = describeOpenOs(result.customer.full_name, result.serviceOrder, automationSettingsForStatus?.os_on_demand?.templates)
      return buildResult({
        shouldReply: true,
        phone: normalizedPhone,
        customerName: result.customer.full_name,
        serviceOrderId: result.serviceOrder.id,
        statusCode: status.statusCode,
        replyText: status.replyText,
      }, {
        overrideMode: controlMode,
        preAiRoute,
        postClassificationRoute: null,
        action: 'auto_reply',
        outboundType: 'os_status',
        state: state?.state ?? null,
        intent: 'order_status',
        confidence: null,
        notes: ['Identificador permitiu localizar uma OS aberta.'],
      })
    }

    if (preAiRoute === 'waiting_identifier_lookup') {
      const text = notFoundHandoffText()
      return buildResult({ shouldReply: true, phone: normalizedPhone, replyText: text }, {
        overrideMode: controlMode,
        preAiRoute,
        postClassificationRoute: null,
        action: 'human_handoff',
        outboundType: 'human_handoff',
        state: state?.state ?? null,
        intent: 'order_status',
        confidence: null,
        notes: ['Identificador nao encontrou OS; fluxo real faria handoff.'],
      })
    }
  }

  if (preAiRoute === 'ignore_silent') {
    return buildResult({}, {
      overrideMode: controlMode,
      preAiRoute,
      postClassificationRoute: null,
      action: 'ignore_silent',
      outboundType: null,
      state: state?.state ?? null,
      intent: null,
      confidence: null,
      notes: ['Janela de silencio ativa.'],
    })
  }

  if (canUseAiForFreeform(effectiveMessageText || undefined)) {
    const classification = await classifyWhatsAppIntent({
      messageText: effectiveMessageText!,
      channelLabel: channel.instance_key,
      storeName: storeProfile.name,
      conversationState: effectiveState ?? null,
      recentContext,
      conversationHistory,
      hasRecentAttachment: hasRecentAttachmentContext(state),
      hasOpenOrder: hasKnownOpenOrderContext(state),
      handoffActive: false,
    })

    aiDiagnostics.push(buildAiDiagnostic('intent_classification', classification))

    const storeHoursText = buildStoreHoursText(storeProfile)
    const storeLocationText = buildStoreLocationReply(storeProfile)
    const postClassificationRoute = applyForceAiPostClassificationRoute(
      decidePostClassificationRoute({
        classificationSuccess: classification.success,
        confidence: classification.success ? classification.data.confidence : 0,
        automationCandidate: classification.success ? classification.data.automation_candidate : false,
        intent: classification.success ? classification.data.intent : null,
        minConfidence: AI_AUTOMATION_MIN_CONFIDENCE,
        hasStoreHoursText: Boolean(storeHoursText),
        hasStoreLocationText: Boolean(storeLocationText),
      }),
      classification.success ? classification.data : null,
      controlMode
    )

    if (classification.success && postClassificationRoute === 'silent_handoff') {
      return buildResult({}, {
        overrideMode: controlMode,
        preAiRoute,
        postClassificationRoute,
        action: 'silent_handoff',
        outboundType: null,
        state: state?.state ?? null,
        intent: classification.data.intent,
        confidence: classification.data.confidence,
        notes: ['Fluxo real classificaria e faria handoff sem resposta automatica.'],
      })
    }

    if (classification.success && postClassificationRoute === 'human_handoff') {
      const text = humanHandoffText()
      return buildResult({ shouldReply: true, phone: normalizedPhone, replyText: text }, {
        overrideMode: controlMode,
        preAiRoute,
        postClassificationRoute,
        action: 'human_handoff',
        outboundType: 'human_handoff',
        state: state?.state ?? null,
        intent: classification.data.intent,
        confidence: classification.data.confidence,
        notes: ['Classificacao pediu transferir para humano.'],
      })
    }

    if (classification.success && postClassificationRoute === 'order_status') {
      const customerByPhone = await findCustomerByPhone(channel.store_id, normalizedPhone)
      const serviceOrderByPhone = customerByPhone
        ? await findLatestOpenOs(channel.store_id, customerByPhone.id)
        : null

      if (shouldRequestThirdPartyIdentifier(classification.data, customerByPhone, serviceOrderByPhone)) {
        const text = thirdPartyIdentifierPromptText()
        return buildResult({ shouldReply: true, phone: normalizedPhone, replyText: text }, {
          overrideMode: controlMode,
          preAiRoute,
          postClassificationRoute,
          action: 'request_identifier',
          outboundType: 'identifier_prompt',
          state: state?.state ?? null,
          intent: classification.data.intent,
          confidence: classification.data.confidence,
          notes: ['Mensagem parece consultar o pedido de outra pessoa; pediu identificador antes de responder status automatico.'],
        })
      }

      const statusResult = await simulateStatusReply(channel, normalizedPhone)
      return {
        ...statusResult,
        aiDiagnostics,
        debug: {
          ...statusResult.debug,
          overrideMode: controlMode,
          preAiRoute,
          postClassificationRoute,
          state: state?.state ?? null,
          intent: classification.data.intent,
          confidence: classification.data.confidence,
        },
      }
    }

    if (classification.success && postClassificationRoute === 'pickup_or_scheduling') {
      const customer = await findCustomerByPhone(channel.store_id, normalizedPhone)
      if (customer) {
        const serviceOrder = await findLatestOpenOs(channel.store_id, customer.id)
        if (serviceOrder) {
          const automationSettingsForStatus = await loadStoreWhatsAppSettings(channel.store_id)
          const status = describeOpenOs(customer.full_name, serviceOrder, automationSettingsForStatus?.os_on_demand?.templates)
          const storeHoursAppend = buildStoreHoursText(storeProfile) ? ` Nosso horario de atendimento e ${buildStoreHoursText(storeProfile)}.` : ''
          return buildResult({
            shouldReply: true,
            phone: normalizedPhone,
            customerName: customer.full_name,
            serviceOrderId: serviceOrder.id,
            statusCode: status.statusCode,
            replyText: `${status.replyText}${storeHoursAppend}`,
          }, {
            overrideMode: controlMode,
            preAiRoute,
            postClassificationRoute,
            action: 'auto_reply',
            outboundType: 'os_status',
            state: state?.state ?? null,
            intent: classification.data.intent,
            confidence: classification.data.confidence,
            notes: ['Pickup/scheduling resolveu via status da OS.'],
          })
        }
      }

      const text = 'Vou acionar a equipe para verificar a sua retirada/agendamento. Um momento.'
      return buildResult({ shouldReply: true, phone: normalizedPhone, replyText: text }, {
        overrideMode: controlMode,
        preAiRoute,
        postClassificationRoute,
        action: 'human_handoff',
        outboundType: 'human_handoff',
        state: state?.state ?? null,
        intent: classification.data.intent,
        confidence: classification.data.confidence,
        notes: ['Pickup/scheduling sem OS encontrada cai em handoff.'],
      })
    }

    if (classification.success && postClassificationRoute === 'payment_info') {
      const installments = await findOpenInstallmentsByPhone(channel.store_id, normalizedPhone)
      if (installments && installments.length > 0) {
        const text = paymentMatchedHandoffText()
        return buildResult({ shouldReply: true, phone: normalizedPhone, replyText: text }, {
          overrideMode: controlMode,
          preAiRoute,
          postClassificationRoute,
          action: 'human_handoff',
          outboundType: 'human_handoff',
          state: state?.state ?? null,
          intent: classification.data.intent,
          confidence: classification.data.confidence,
          notes: ['Pagamento com parcela encontrada entra em handoff seguro sem expor dados financeiros.'],
        })
      }
    }

    if (classification.success && postClassificationRoute === 'payment_info') {
      const installments = await findOpenInstallmentsByPhone(channel.store_id, normalizedPhone)
      let text = ''
      if (installments && installments.length > 0) {
        const first = installments[0]
        let dueDateText = first.due_date || ''
        if (dueDateText) {
          const [y, m, d] = dueDateText.split('T')[0].split('-')
          dueDateText = `${d}/${m}/${y}`
        }
        text = `Achei um cadastro em aberto referente a uma compra que vence/venceu no dia ${dueDateText}. É sobre essa compra que você quer falar? Por questões de segurança, poderia me confirmar o nome completo do titular ou o CPF?`
      } else {
        text = 'Não consegui localizar nenhuma fatura em aberto cadastrada direto no seu número. Você poderia me informar o nome de quem fez a compra ou o CPF?'
      }

      return buildResult({ shouldReply: true, phone: normalizedPhone, replyText: text }, {
        overrideMode: controlMode,
        preAiRoute,
        postClassificationRoute,
        action: 'request_identifier',
        outboundType: 'payment_identifier_prompt',
        state: state?.state ?? null,
        intent: classification.data.intent,
        confidence: classification.data.confidence,
        notes: ['Fluxo financeiro pede identificador e aguarda a resposta antes do handoff humano.'],
      })
    }

    if (classification.success && postClassificationRoute === 'store_hours' && storeHoursText) {
      return buildResult({ shouldReply: true, phone: normalizedPhone, replyText: storeHoursText }, {
        overrideMode: controlMode,
        preAiRoute,
        postClassificationRoute,
        action: 'auto_reply',
        outboundType: 'store_hours',
        state: state?.state ?? null,
        intent: classification.data.intent,
        confidence: classification.data.confidence,
        notes: ['Resposta automatica com horario da loja.'],
      })
    }

    if (classification.success && postClassificationRoute === 'store_location' && storeLocationText) {
      return buildResult({ shouldReply: true, phone: normalizedPhone, replyText: storeLocationText }, {
        overrideMode: controlMode,
        preAiRoute,
        postClassificationRoute,
        action: 'auto_reply',
        outboundType: 'store_location',
        state: state?.state ?? null,
        intent: classification.data.intent,
        confidence: classification.data.confidence,
        notes: ['Resposta automatica com localizacao da loja.'],
      })
    }
  }

  if (!isWhatsAppAiResponderEnabled(automationSettings) && looksLikeOrderStatusQuestion(effectiveMessageText || undefined)) {
    const statusResult = await simulateStatusReply(channel, normalizedPhone)
    return {
      ...statusResult,
      debug: {
        ...statusResult.debug,
        overrideMode: controlMode,
        preAiRoute,
        state: state?.state ?? null,
      },
    }
  }

  if (isWhatsAppAiResponderEnabled(automationSettings)) {
    const isGreeting = looksLikeGenericGreeting(effectiveMessageText)
    let text = isGreeting ? aiGreetingText() : aiClarificationText()
    const fallbackReply = await generateWhatsAppFallbackReply({
      userMessageText: effectiveMessageText || '',
      conversationHistory,
      storeName: storeProfile.name,
    })
    aiDiagnostics.push(buildAiDiagnostic('fallback_reply', fallbackReply))
    if (fallbackReply.success) {
      text = fallbackReply.data.reply_text
    }

    return buildResult({ shouldReply: true, phone: normalizedPhone, replyText: text }, {
      overrideMode: controlMode,
      preAiRoute,
      postClassificationRoute: 'fallback',
      action: isGreeting ? 'ai_greeting' : 'ai_clarification',
      outboundType: isGreeting ? 'ai_greeting' : 'ai_clarification',
      state: state?.state ?? null,
      intent: null,
      confidence: null,
      notes: ['Fluxo de fallback da IA.'],
    })
  }

  const menu = menuText()
  return buildResult({ shouldReply: true, phone: normalizedPhone, replyText: menu }, {
    overrideMode: controlMode,
    preAiRoute,
    postClassificationRoute: null,
    action: 'show_menu',
    outboundType: 'menu',
    state: state?.state ?? null,
    intent: null,
    confidence: null,
    notes: ['Fluxo classico de menu.'],
  })
}

export async function markStoreInitiatedConversation(
  input: StoreInitiatedConversationRequest
) {
  const channel = await findActiveChannel(input.instanceKey)
  if (!channel) return { success: false, reason: 'channel_not_found' as const }

  const normalizedPhone = toEvolutionNumber(input.phone)
  if (!normalizedPhone) return { success: false, reason: 'invalid_phone' as const }

  const mirrorOutbound = input.mirrorOutbound !== false
  const providerMessageId = String(input.providerMessageId || '').trim()
  const messageText = String(input.messageText || '').trim()
  const supabase = createAdminClient()
  if (mirrorOutbound && providerMessageId) {
    const { data, error } = await (supabase.from('whatsapp_outbound_messages') as any)
      .select('id')
      .eq('channel_id', channel.id)
      .eq('provider_message_id', providerMessageId)
      .maybeSingle()

    if (error) throw error
    if (data?.id) {
      return { success: true, skipped: 'system_outbound' as const }
    }
  }

  // Uma nova mensagem enviada pela propria loja sempre retoma o atendimento
  // humano. Ela deve prevalecer sobre um "force_ai" deixado para a proxima
  // mensagem do cliente, evitando que a IA entre no meio da conversa.
  const { error: forceAiClearError } = await (supabase.from('whatsapp_customer_control') as any)
    .delete()
    .eq('channel_id', channel.id)
    .in('remote_phone', [...getPhoneVariants(normalizedPhone)])
    .eq('mode', 'force_ai')

  if (forceAiClearError) throw forceAiClearError

  if (mirrorOutbound) {
    const { error: outboundInsertError } = await (supabase.from('whatsapp_outbound_messages') as any)
      .insert({
        tenant_id: channel.tenant_id,
        store_id: channel.store_id,
        channel_id: channel.id,
        inbound_message_id: null,
        provider_message_id: providerMessageId || null,
        remote_phone: normalizedPhone,
        message_text: messageText || '[mensagem enviada pela loja sem texto legivel]',
        message_type: 'operator_store_initiated',
        status: 'sent',
        sent_at: new Date().toISOString(),
        payload: {
          source: 'store_device',
          sentBy: 'operator',
          fromMe: true,
          mirroredFromWebhook: true,
          rawPayload: input.payload ?? null,
        },
      })
    if (outboundInsertError) throw outboundInsertError
  }

  await setConversationState(channel, normalizedPhone, 'human_pause', HUMAN_HANDOFF_PAUSE_MS, {
    reason: mirrorOutbound ? 'store_initiated' : 'app_manual_send',
    providerMessageId: providerMessageId || null,
    preview: messageText.slice(0, 160) || null,
    ...buildDecisionMetadata({
      intent: null,
      action: mirrorOutbound ? 'human_pause_store_initiated' : 'human_pause_app_manual_send',
      outboundType: null,
    }),
  })

  return { success: true, paused: true as const }
}
