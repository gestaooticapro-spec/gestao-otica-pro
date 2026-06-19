/* eslint-disable @typescript-eslint/no-explicit-any */

import { createAdminClient } from '@/lib/supabase/admin'
import { Database, Json } from '@/lib/database.types'
import { describeOpenOs, WhatsAppOsStatusCode } from './os-status'
import { digitsOnly, phonesMatch, phonesMatchLast8, toEvolutionNumber } from './phone'
import type { StoreSettings } from '@/lib/store-modules'
import { evaluateStoreHours } from './store-hours-logic'
import {
  classifyWhatsAppIntent,
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
} from './inbound-payload'
import {
  buildWhatsAppCanonicalPayload,
  extractWhatsAppCanonicalReply,
} from './canonical'
import { decidePreAiRoute, shouldReleaseClosedTrapPause } from './routing-heuristics'
import { decidePostClassificationRoute } from './flow-decisions'
import {
  applyWhatsAppHumanizationOutcome,
  decideWhatsAppHumanization,
} from './humanization'
import { findOpenInstallmentsByPhone } from '@/lib/actions/consultas.actions'

const SAME_STATUS_SILENCE_WINDOW_MS = 2 * 60 * 60 * 1000
const HUMAN_PAUSE_MS = 60 * 60 * 1000
const HUMAN_HANDOFF_PAUSE_MS = 24 * 60 * 60 * 1000
const AI_SESSION_MS = 2 * 60 * 60 * 1000
const MENU_WAIT_MS = 30 * 60 * 1000
const IDENTIFIER_WAIT_MS = 20 * 60 * 1000
const AFTER_STATUS_SILENCE_MS = 60 * 60 * 1000
const ATTACHMENT_HANDOFF_MS = 2 * 60 * 60 * 1000
const AI_AUTOMATION_MIN_CONFIDENCE = 0.78
const WHATSAPP_AI_HUMANIZE_ENABLED = process.env.WHATSAPP_AI_HUMANIZE_ENABLED === 'true'

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
>

type ConversationMetadataRecord = Record<string, Json | undefined>
type CustomerControlMode = 'auto' | 'force_ai' | 'force_human'
type CustomerLinkSource = 'phone_match' | 'status_lookup' | 'identifier_lookup' | 'manual'

type WhatsAppAiDiagnostic = {
  task: 'intent_classification' | 'reply_humanization' | 'fallback_reply' | 'receipt_extraction'
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
}

function expiresIn(ms: number) {
  return new Date(Date.now() + ms).toISOString()
}

function normalizeMessage(value: string | undefined) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
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
  return 'Oi! Sou a IAra, assistente virtual da otica. Como posso te ajudar hoje?'
}

function aiClarificationText() {
  return 'Entendi. Para eu te ajudar melhor, me diga por favor se voce quer falar sobre pedido, horario da loja, pagamento, orcamento ou atendimento com a equipe.'
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
  const extra = phone ? ` Se precisar, nosso contato é ${phone}.` : ''
  return `Nossa loja fica em ${address}.${extra}`.trim()
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
  } satisfies ConversationMetadataRecord
}

async function maybeHumanizeOutboundFromCanonical(
  payload: ConversationMetadataRecord,
  fallbackText: string,
  storeName?: string | null,
  context?: {
    userMessageText?: string | null
    conversationHistory?: string[]
  }
) {
  const canonical = extractWhatsAppCanonicalReply(payload)
  const plan = decideWhatsAppHumanization(WHATSAPP_AI_HUMANIZE_ENABLED, canonical)
  if (plan.decision !== 'apply' || !canonical || !plan.intent) {
    return { text: fallbackText, payload }
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
    return applyWhatsAppHumanizationOutcome(payload, fallbackText, {
      success: false,
      error: humanized.error,
    })
  }

  return applyWhatsAppHumanizationOutcome(payload, fallbackText, {
    success: true,
    provider: humanized.provider,
    model: humanized.model,
    attempts: humanized.attempts,
    replyText: humanized.data.reply_text,
  })
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
    .select('id, name, whatsapp, phone, street, number, neighborhood, city, state, settings')
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
  const { data, error } = await (supabase.from('whatsapp_conversation_states') as any)
    .select('id, state, expires_at, metadata')
    .eq('channel_id', channelId)
    .eq('remote_phone', phone)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  if (new Date(data.expires_at).getTime() <= Date.now()) {
    await (supabase.from('whatsapp_conversation_states') as any)
      .delete()
      .eq('id', data.id)
    return null
  }

  return data
}

async function clearConversationStateById(id: number) {
  const supabase = createAdminClient()
  const { error } = await (supabase.from('whatsapp_conversation_states') as any)
    .delete()
    .eq('id', id)

  if (error) throw error
}

async function loadCustomerControlMode(channelId: number, phone: string): Promise<CustomerControlMode> {
  const supabase = createAdminClient()
  const { data, error } = await (supabase.from('whatsapp_customer_control') as any)
    .select('mode')
    .eq('channel_id', channelId)
    .eq('remote_phone', phone)
    .maybeSingle()

  if (error) throw error

  const mode = typeof data?.mode === 'string' ? data.mode : 'auto'
  return mode === 'force_ai' || mode === 'force_human' ? mode : 'auto'
}

async function clearCustomerControlMode(channelId: number, phone: string) {
  const supabase = createAdminClient()
  const { error } = await (supabase.from('whatsapp_customer_control') as any)
    .delete()
    .eq('channel_id', channelId)
    .eq('remote_phone', phone)

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

  const { error } = await (supabase.from('whatsapp_customer_links') as any)
    .upsert(values, { onConflict: 'store_id,remote_phone' })

  if (error) throw error
}

function effectiveStateForControl(state: ConversationStateRow | null, controlMode: CustomerControlMode): ConversationState | null {
  if (!state) return null
  if (controlMode !== 'force_ai') return state.state

  if (state.state === 'silent' || state.state === 'waiting_menu') {
    return null
  }

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
  metadata: Json = {}
) {
  const supabase = createAdminClient()
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

  const { error } = await (supabase.from('whatsapp_conversation_states') as any)
    .upsert(values, { onConflict: 'channel_id,remote_phone' })

  if (error) throw error
}

async function createOutbound(
  channel: ChannelRow,
  inboundMessageId: number,
  phone: string,
  text: string,
  messageType: string,
  payload: Json = {}
): Promise<CustomerStatusResponse> {
  const supabase = createAdminClient()
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

async function createStatusReply(
  channel: ChannelRow,
  inboundMessageId: number,
  phone: string,
  customer: CustomerRow,
  serviceOrder: OpenOsRow,
  baseMetadata: Json = {},
  intentConfidence: number | null = null
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
    }))
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
    }))
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
  }), 'assistant', status.replyText))

  const response = await createOutbound(channel, inboundMessageId, phone, status.replyText, 'os_status', {
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
  })

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
  intentConfidence: number | null = null
): Promise<CustomerStatusResponse> {
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
    return createOutbound(channel, inboundMessageId, phone, text, 'identifier_prompt', {
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
    return createOutbound(channel, inboundMessageId, phone, text, 'identifier_prompt', {
      ...buildWhatsAppCanonicalPayload({
        intent: 'order_status',
        action: 'request_identifier',
        outboundType: 'identifier_prompt',
        canonicalReply: text,
      }),
    })
  }

  return createStatusReply(channel, inboundMessageId, phone, customer, serviceOrder, baseMetadata, intentConfidence)
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
  })

  if (isWhatsAppInboundPayloadFromMe(input.payload)) {
    const isSystemOutbound = await isKnownSystemOutbound(channel.id, input.providerMessageId)

    if (!isSystemOutbound) {
      await setConversationState(channel, normalizedPhone, 'human_pause', HUMAN_HANDOFF_PAUSE_MS, {
        reason: 'store_outbound_detected',
        providerMessageId: input.providerMessageId,
        preview: effectiveMessageText?.slice(0, 160) || null,
        ...buildDecisionMetadata({
          intent: null,
          action: 'human_pause_store_outbound',
          outboundType: null,
        }),
      })
    }

    return { shouldReply: false }
  }

  const { data: inbound, error: inboundError } = await (supabase.from('whatsapp_inbound_messages') as any)
    .insert({
      tenant_id: channel.tenant_id,
      store_id: channel.store_id,
      channel_id: channel.id,
      provider_message_id: input.providerMessageId,
      remote_phone: normalizedPhone,
      message_text: effectiveMessageText,
      payload: input.payload ?? null,
      status: 'received',
    })
    .select('id')
    .single()

  if (inboundError?.code === '23505') {
    return { shouldReply: false, duplicate: true }
  }
  if (inboundError) throw inboundError

  const automationSettings = await loadStoreWhatsAppSettings(channel.store_id)
  if (!isWhatsAppAutomationEnabled(automationSettings)) {
    return ignoreInbound(inbound.id)
  }

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
  const recentContext = buildRecentContextFromMetadata(state?.metadata, effectiveMessageText)
  const conversationHistory = buildAiConversationHistoryFromMetadata(state?.metadata)
  const aiReplyContext = {
    userMessageText: effectiveMessageText,
    conversationHistory: buildAiConversationHistoryFromMetadata(baseMetadata),
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

  if (controlMode === 'force_human') {
    await setConversationState(channel, normalizedPhone, 'human_pause', HUMAN_HANDOFF_PAUSE_MS, mergeMetadata(baseMetadata, {
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
  let exceptionalReason = ''
  let nextOpen = ''
  
  if (hoursFacts) {
    if (hoursFacts.is_exceptional_closure) {
      isExceptionalClosure = true
      exceptionalReason = hoursFacts.exceptional_closure_reason || ''
      nextOpen = hoursFacts.next_open_schedule
    } else if (!hoursFacts.is_open_now) {
      isNormalClosed = true
    }
  }

  async function applyOohTrapIfNeeded(fallbackAction: () => Promise<CustomerStatusResponse>): Promise<CustomerStatusResponse> {
    if (isExceptionalClosure) {
      const text = `Hoje, excepcionalmente, não estamos atendendo devido a: ${exceptionalReason}. Retornamos ${nextOpen}. Assim que retornarmos, um atendente falará com você.`
      await setConversationState(channel!, normalizedPhone, 'human_pause', HUMAN_PAUSE_MS, mergeMetadata(baseMetadata, {
        reason: 'exceptional_closure_trap',
        ...buildDecisionMetadata({ intent: null, action: 'exceptional_closure_trap', outboundType: 'exceptional_closure' })
      }))
      const outboundPayload = {
         ...buildWhatsAppCanonicalPayload({ intent: null, action: 'exceptional_closure_trap', outboundType: 'exceptional_closure', canonicalReply: text })
      } satisfies ConversationMetadataRecord
      const maybeHumanized = await maybeHumanizeOutboundFromCanonical(outboundPayload, text, storeProfile.name, aiReplyContext)
      return createOutbound(channel!, inbound.id, normalizedPhone, maybeHumanized.text, 'exceptional_closure', maybeHumanized.payload)
    }
    if (isNormalClosed) {
      await setConversationState(channel!, normalizedPhone, 'human_pause', HUMAN_PAUSE_MS, mergeMetadata(baseMetadata, {
        reason: 'normal_closed_trap',
        ...buildDecisionMetadata({ intent: null, action: 'normal_closed_trap', outboundType: null })
      }))
      return ignoreInbound(inbound.id)
    }
    return fallbackAction()
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
      await setConversationState(channel, normalizedPhone, 'human_pause', HUMAN_HANDOFF_PAUSE_MS, mergeMetadata(baseMetadata, {
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
      return createOutbound(channel, inbound.id, normalizedPhone, maybeHumanized.text, 'human_handoff', maybeHumanized.payload)
    })
  }

  if (preAiRoute === 'ignore_human_pause') {
    return ignoreInbound(inbound.id)
  }

  if (preAiRoute === 'attachment_handoff') {
    if (inboundPayloadMeta.attachmentKind === 'audio') {
      await setConversationState(channel, normalizedPhone, 'human_pause', HUMAN_HANDOFF_PAUSE_MS, mergeMetadata(baseMetadata, {
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

    if (inboundPayloadMeta.base64 && inboundPayloadMeta.mimeType) {
      try {
        const result = await extractReceiptWithVision(inboundPayloadMeta.base64, inboundPayloadMeta.mimeType)
        if (result.success && result.data.is_receipt) {
          receiptExtraction = result.data
          intentOutcome = 'payment_submission'
          text = 'Recebi seu comprovante. Vou repassar para nossa equipe dar baixa e continuar o atendimento por aqui.'
        }
      } catch (err) {
        console.error('Vision extraction error:', err)
      }
    }

    return applyOohTrapIfNeeded(async () => {
      await consumeForceAiOverrideIfNeeded()
      await setConversationState(channel, normalizedPhone, 'waiting_human_after_attachment', HUMAN_HANDOFF_PAUSE_MS, mergeMetadata(baseMetadata, {
        reason: 'attachment_received',
        attachmentKind: inboundPayloadMeta.attachmentKind,
        mimeType: inboundPayloadMeta.mimeType,
        fileName: inboundPayloadMeta.fileName,
        caption: inboundPayloadMeta.caption,
        ai_extracted_receipt: receiptExtraction,
        ...buildDecisionMetadata({
          intent: intentOutcome,
          action: 'human_handoff',
          outboundType: 'attachment_handoff',
        }),
      }))
      return createOutbound(channel, inbound.id, normalizedPhone, text, 'attachment_handoff', {
        attachmentKind: inboundPayloadMeta.attachmentKind,
        mimeType: inboundPayloadMeta.mimeType,
        fileName: inboundPayloadMeta.fileName,
        caption: inboundPayloadMeta.caption,
        ai_extracted_receipt: receiptExtraction,
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
    return applyOohTrapIfNeeded(async () => {
      await consumeForceAiOverrideIfNeeded()
      await setConversationState(channel, normalizedPhone, 'human_pause', HUMAN_HANDOFF_PAUSE_MS, mergeMetadata(baseMetadata, {
        reason: 'attachment_followup',
        ...buildDecisionMetadata({
          intent: null,
          action: 'human_handoff',
          outboundType: 'human_handoff',
        }),
      }))
      const text = attachmentFollowupText()
      return createOutbound(channel, inbound.id, normalizedPhone, text, 'human_handoff', {
        ...buildWhatsAppCanonicalPayload({
          intent: null,
          action: 'human_handoff',
          outboundType: 'human_handoff',
          canonicalReply: text,
        }),
      })
    })
  }

  if (preAiRoute === 'preserve_human_handoff') {
    return applyOohTrapIfNeeded(async () => {
      await consumeForceAiOverrideIfNeeded()
      await setConversationState(channel, normalizedPhone, 'human_pause', HUMAN_HANDOFF_PAUSE_MS, mergeMetadata(baseMetadata, {
        reason: 'recent_human_routing_preserved',
        ...buildDecisionMetadata({
          intent: null,
          action: 'human_handoff',
          outboundType: 'human_handoff',
        }),
      }))
      const text = attachmentFollowupText()
      return createOutbound(channel, inbound.id, normalizedPhone, text, 'human_handoff', {
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
    const result = await findOpenOsByIdentifier(channel.store_id, effectiveMessageText || undefined)
    if (result) {
      await consumeForceAiOverrideIfNeeded()
      return createStatusReply(channel, inbound.id, normalizedPhone, result.customer, result.serviceOrder, baseMetadata)
    }
  }

  if (preAiRoute === 'waiting_identifier_lookup') {
    const result = await findOpenOsByIdentifier(channel.store_id, effectiveMessageText || undefined)
    if (result) {
      await consumeForceAiOverrideIfNeeded()
      return createStatusReply(channel, inbound.id, normalizedPhone, result.customer, result.serviceOrder, baseMetadata)
    }

    return applyOohTrapIfNeeded(async () => {
      await consumeForceAiOverrideIfNeeded()
      await setConversationState(channel, normalizedPhone, 'human_pause', HUMAN_HANDOFF_PAUSE_MS, mergeMetadata(baseMetadata, {
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
      return createOutbound(channel, inbound.id, normalizedPhone, maybeHumanized.text, 'human_handoff', maybeHumanized.payload)
    })
  }

  if (preAiRoute === 'explicit_status_option') {
    await consumeForceAiOverrideIfNeeded()
    return handleStatusByPhone(channel, inbound.id, normalizedPhone, baseMetadata)
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
    const storeLocationText = buildStoreLocationText(storeProfile)
    const postClassificationRoute = decidePostClassificationRoute({
      classificationSuccess: classification.success,
      confidence: classification.success ? classification.data.confidence : 0,
      automationCandidate: classification.success ? classification.data.automation_candidate : false,
      intent: classification.success ? classification.data.intent : null,
      minConfidence: AI_AUTOMATION_MIN_CONFIDENCE,
      hasStoreHoursText: Boolean(storeHoursText),
      hasStoreLocationText: Boolean(storeLocationText),
    })

    if (classification.success && postClassificationRoute === 'silent_handoff') {
      await consumeForceAiOverrideIfNeeded()
      await setConversationState(channel, normalizedPhone, 'human_pause', HUMAN_HANDOFF_PAUSE_MS, mergeMetadata(baseMetadata, {
        selectedOption: 'ai_silent_handoff',
        aiConfidence: classification.data.confidence,
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
      if (postClassificationRoute === 'human_handoff') {
        await consumeForceAiOverrideIfNeeded()
        await setConversationState(channel, normalizedPhone, 'human_pause', HUMAN_HANDOFF_PAUSE_MS, mergeMetadata(baseMetadata, {
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
        return withAiDiagnostics(await createOutbound(
          channel,
          inbound.id,
          normalizedPhone,
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
              return withAiDiagnostics(await createOutbound(
                channel,
                inbound.id,
                normalizedPhone,
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
              await setConversationState(channel, normalizedPhone, 'silent', AFTER_STATUS_SILENCE_MS, appendAiSessionMessage(mergeMetadata(baseMetadata, {
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
              return withAiDiagnostics(await createOutbound(channel, inbound.id, normalizedPhone, maybeHumanized.text, 'os_status', maybeHumanized.payload))
            }
          }
        }

        // Se não achou OS, handoff
        const text = 'Vou acionar a equipe para verificar a sua retirada/agendamento. Um momento.'
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
        return withAiDiagnostics(await createOutbound(
          channel,
          inbound.id,
          normalizedPhone,
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
        return withAiDiagnostics(await createOutbound(
          channel,
          inbound.id,
          normalizedPhone,
          maybeHumanized.text,
          'human_handoff',
          maybeHumanized.payload
        ))
      }

      if (postClassificationRoute === 'payment_info') {
        await consumeForceAiOverrideIfNeeded()
        const installments = await findOpenInstallmentsByPhone(channel.store_id, normalizedPhone)
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
        return withAiDiagnostics(await createOutbound(
          channel,
          inbound.id,
          normalizedPhone,
          maybeHumanized.text,
          'human_handoff',
          maybeHumanized.payload
        ))
      }

      if (postClassificationRoute === 'order_status') {
        await consumeForceAiOverrideIfNeeded()
        return withAiDiagnostics(await handleStatusByPhone(
          channel,
          inbound.id,
          normalizedPhone,
          baseMetadata,
          classification.data.confidence
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
          await setConversationState(
            channel,
            normalizedPhone,
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
          return withAiDiagnostics(await createOutbound(channel, inbound.id, normalizedPhone, maybeHumanized.text, 'store_hours', maybeHumanized.payload))
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
          await setConversationState(
            channel,
            normalizedPhone,
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
          return withAiDiagnostics(await createOutbound(channel, inbound.id, normalizedPhone, maybeHumanized.text, 'store_location', maybeHumanized.payload))
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
        await setConversationState(channel, normalizedPhone, 'ai_session', AI_SESSION_MS, appendAiSessionMessage(mergeMetadata(baseMetadata, {
          ...(classification.success ? buildAiPayload(classification.data) : {}),
          ...buildDecisionMetadata({
            intent: classification.success ? classification.data.intent : null,
            confidence: classification.success ? classification.data.confidence : null,
            action: isGreeting ? 'ai_greeting' : 'ai_clarification',
            outboundType: isGreeting ? 'ai_greeting' : 'ai_clarification',
          }),
        }), 'assistant', text))
        return withAiDiagnostics(await createOutbound(channel, inbound.id, normalizedPhone, text, isGreeting ? 'ai_greeting' : 'ai_clarification', {
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
    return handleStatusByPhone(channel, inbound.id, normalizedPhone, baseMetadata)
  }

  if (isWhatsAppAiResponderEnabled(automationSettings)) {
    return ignoreInbound(inbound.id)
  }

  return applyOohTrapIfNeeded(async () => {
    const text = menuText()
    await consumeForceAiOverrideIfNeeded()
    await setConversationState(channel, normalizedPhone, 'waiting_menu', MENU_WAIT_MS, appendAiSessionMessage(mergeMetadata(baseMetadata, {
      reason: 'menu_sent',
      ...buildDecisionMetadata({
        intent: null,
        action: 'show_menu',
        outboundType: 'menu',
      }),
    }), 'assistant', text))
    return createOutbound(channel, inbound.id, normalizedPhone, text, 'menu', {
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
  let exceptionalReason = ''
  let nextOpen = ''

  if (hoursFacts) {
    if (hoursFacts.is_exceptional_closure) {
      isExceptionalClosure = true
      exceptionalReason = hoursFacts.exceptional_closure_reason || ''
      nextOpen = hoursFacts.next_open_schedule
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
    const text = `Hoje, excepcionalmente, nao estamos atendendo devido a: ${exceptionalReason}. Retornamos ${nextOpen}. Assim que retornarmos, um atendente falara com voce.`
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
    return buildResult({}, {
      overrideMode: controlMode,
      preAiRoute,
      postClassificationRoute: null,
      action: 'normal_closed_trap',
      outboundType: null,
      state: state?.state ?? null,
      intent: null,
      confidence: null,
      notes: ['Loja fora do horario normal e o fluxo real ficaria em silencio.'],
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
    const text = attachmentFollowupText()
    return buildResult({ shouldReply: true, phone: normalizedPhone, replyText: text }, {
      overrideMode: controlMode,
      preAiRoute,
      postClassificationRoute: null,
      action: 'human_handoff',
      outboundType: 'human_handoff',
      state: state?.state ?? null,
      intent: null,
      confidence: null,
      notes: ['Anexo recente preserva handoff humano.'],
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
    const storeLocationText = buildStoreLocationText(storeProfile)
    const postClassificationRoute = decidePostClassificationRoute({
      classificationSuccess: classification.success,
      confidence: classification.success ? classification.data.confidence : 0,
      automationCandidate: classification.success ? classification.data.automation_candidate : false,
      intent: classification.success ? classification.data.intent : null,
      minConfidence: AI_AUTOMATION_MIN_CONFIDENCE,
      hasStoreHoursText: Boolean(storeHoursText),
      hasStoreLocationText: Boolean(storeLocationText),
    })

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

  const providerMessageId = String(input.providerMessageId || '').trim()
  if (providerMessageId) {
    const supabase = createAdminClient()
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

  await setConversationState(channel, normalizedPhone, 'human_pause', HUMAN_HANDOFF_PAUSE_MS, {
    reason: 'store_initiated',
    providerMessageId: providerMessageId || null,
    preview: input.messageText?.slice(0, 160) || null,
    ...buildDecisionMetadata({
      intent: null,
      action: 'human_pause_store_initiated',
      outboundType: null,
    }),
  })

  return { success: true, paused: true as const }
}
