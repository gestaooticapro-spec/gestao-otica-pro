/* eslint-disable @typescript-eslint/no-explicit-any */

import { format } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import { createClient } from '@supabase/supabase-js'

import { createAdminClient } from '@/lib/supabase/admin'
import { Database, Json } from '@/lib/database.types'
import { describeOpenOs, WhatsAppOsStatusCode } from './os-status'
import { digitsOnly, phonesMatch, toEvolutionNumber } from './phone'
import type { StoreSettings } from '@/lib/store-modules'
import {
  classifyWhatsAppIntent,
  humanizeWhatsAppReply,
  type WhatsAppIntentClassification,
  type WhatsAppAiResult,
} from './ai'
import { extractWhatsAppInboundPayloadMeta } from './inbound-payload'
import {
  buildWhatsAppCanonicalPayload,
  extractWhatsAppCanonicalReply,
} from './canonical'
import { decidePreAiRoute } from './routing-heuristics'
import { decidePostClassificationRoute } from './flow-decisions'
import {
  applyWhatsAppHumanizationOutcome,
  decideWhatsAppHumanization,
} from './humanization'

const SAME_STATUS_SILENCE_WINDOW_MS = 2 * 60 * 60 * 1000
const HUMAN_PAUSE_MS = 60 * 60 * 1000
const MENU_WAIT_MS = 30 * 60 * 1000
const IDENTIFIER_WAIT_MS = 20 * 60 * 1000
const AFTER_STATUS_SILENCE_MS = 60 * 60 * 1000
const ATTACHMENT_HANDOFF_MS = 2 * 60 * 60 * 1000
const AI_AUTOMATION_MIN_CONFIDENCE = 0.78
const WHATSAPP_AI_HUMANIZE_ENABLED = process.env.WHATSAPP_AI_HUMANIZE_ENABLED === 'true'

type ConversationState = 'waiting_menu' | 'waiting_identifier' | 'human_pause' | 'silent' | 'waiting_human_after_attachment'

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

function toMetadataRecord(value: Json | null | undefined): ConversationMetadataRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as ConversationMetadataRecord
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
  storeName?: string | null
) {
  const canonical = extractWhatsAppCanonicalReply(payload)
  const plan = decideWhatsAppHumanization(WHATSAPP_AI_HUMANIZE_ENABLED, canonical)
  if (plan.decision !== 'apply' || !canonical || !plan.intent) {
    return { text: fallbackText, payload }
  }

  const humanized = await humanizeWhatsAppReply({
    intent: plan.intent,
    canonicalReply: canonical.canonicalReply,
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
  if (normalized.includes('status') || normalized.includes('os') || normalized.includes('ordem') || normalized.includes('oculos')) return '1'
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
    .limit(25)

  if (error) throw error

  return (data ?? []).find((customer: CustomerRow) =>
    phonesMatch(phone, customer.fone_movel) || phonesMatch(phone, customer.phone)
  ) ?? null
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

async function setConversationState(
  channel: ChannelRow,
  phone: string,
  state: ConversationState,
  ms: number,
  metadata: Json = {}
) {
  const supabase = createAdminClient()
  const values = {
    tenant_id: channel.tenant_id,
    store_id: channel.store_id,
    channel_id: channel.id,
    remote_phone: phone,
    state,
    metadata,
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
  baseMetadata: Json = {}
): Promise<CustomerStatusResponse> {
  const automationSettings = await loadStoreWhatsAppSettings(channel.store_id)
  if (automationSettings?.os_on_demand?.enabled === false) {
    await setConversationState(channel, phone, 'silent', AFTER_STATUS_SILENCE_MS, mergeMetadata(baseMetadata, {
      reason: 'os_responder_disabled',
      ...buildDecisionMetadata({
        intent: 'order_status',
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
        action: 'no_reply',
        outboundType: null,
      }),
    }))
    return ignoreInbound(inboundMessageId)
  }

  await setConversationState(channel, phone, 'silent', AFTER_STATUS_SILENCE_MS, mergeMetadata(baseMetadata, {
    reason: 'status_sent',
    lastKnownCustomerId: customer.id,
    lastKnownServiceOrderId: serviceOrder.id,
    serviceOrderId: serviceOrder.id,
    statusCode: status.statusCode,
    ...buildDecisionMetadata({
      intent: 'order_status',
      action: 'auto_reply',
      outboundType: 'os_status',
    }),
  }))

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
  baseMetadata: Json = {}
): Promise<CustomerStatusResponse> {
  const customer = await findCustomerByPhone(channel.store_id, phone)
  if (!customer) {
    await setConversationState(channel, phone, 'waiting_identifier', IDENTIFIER_WAIT_MS, mergeMetadata(baseMetadata, {
      ...buildDecisionMetadata({
        intent: 'order_status',
        action: 'request_identifier',
        outboundType: 'identifier_prompt',
      }),
    }))
    const text = identifierPromptText()
    return createOutbound(channel, inboundMessageId, phone, text, 'identifier_prompt', {
      ...buildWhatsAppCanonicalPayload({
        intent: 'order_status',
        action: 'request_identifier',
        outboundType: 'identifier_prompt',
        canonicalReply: text,
      }),
    })
  }

  const serviceOrder = await findLatestOpenOs(channel.store_id, customer.id)
  if (!serviceOrder) {
    await setConversationState(channel, phone, 'waiting_identifier', IDENTIFIER_WAIT_MS, mergeMetadata(baseMetadata, {
      ...buildDecisionMetadata({
        intent: 'order_status',
        action: 'request_identifier',
        outboundType: 'identifier_prompt',
      }),
    }))
    const text = identifierPromptText()
    return createOutbound(channel, inboundMessageId, phone, text, 'identifier_prompt', {
      ...buildWhatsAppCanonicalPayload({
        intent: 'order_status',
        action: 'request_identifier',
        outboundType: 'identifier_prompt',
        canonicalReply: text,
      }),
    })
  }

  return createStatusReply(channel, inboundMessageId, phone, customer, serviceOrder, baseMetadata)
}

async function logAiResult(
  channel: ChannelRow,
  inboundId: number,
  task: 'intent_classification' | 'reply_humanization',
  result: WhatsAppAiResult<any>
) {
  try {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
    await supabase.from('whatsapp_ai_logs').insert({
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
      raw_response: result.success ? { rawText: result.rawText } : { errors: result.providerErrors },
    })
  } catch (err) {
    console.error('Failed to log AI result', err)
  }
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
  const state = await findConversationState(channel.id, normalizedPhone)
  const baseMetadata = mergeMetadata(state?.metadata, inboundContextMetadata)
  const recentContext = buildRecentContextFromMetadata(state?.metadata, effectiveMessageText)

  const storeProfile = await loadStoreProfile(channel.store_id)
  const settings = ((storeProfile.settings || {}) as StoreSettings) || {}
  
  let isExceptionalClosure = false
  let isNormalClosed = false
  let exceptionalReason = ''
  let nextOpen = ''
  
  if (settings.store_hours) {
    const { evaluateStoreHours } = await import('./store-hours-logic')
    const hoursFacts = evaluateStoreHours(settings.store_hours)
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
      const maybeHumanized = await maybeHumanizeOutboundFromCanonical(outboundPayload, text, storeProfile.name)
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
    state: state?.state ?? null,
    hasAttachment: inboundPayloadMeta.hasAttachment,
    messageText: effectiveMessageText,
    metadata: state?.metadata,
    humanHandoffWindowMs: ATTACHMENT_HANDOFF_MS,
    identifierWindowMs: IDENTIFIER_WAIT_MS,
  })

  if (preAiRoute === 'explicit_human_option') {
    return applyOohTrapIfNeeded(async () => {
      await setConversationState(channel, normalizedPhone, 'human_pause', HUMAN_PAUSE_MS, mergeMetadata(baseMetadata, {
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
      const maybeHumanized = await maybeHumanizeOutboundFromCanonical(outboundPayload, text, storeProfile.name)
      return createOutbound(channel, inbound.id, normalizedPhone, maybeHumanized.text, 'human_handoff', maybeHumanized.payload)
    })
  }

  if (preAiRoute === 'ignore_human_pause') {
    return ignoreInbound(inbound.id)
  }

  if (preAiRoute === 'attachment_handoff') {
    return applyOohTrapIfNeeded(async () => {
      await setConversationState(channel, normalizedPhone, 'waiting_human_after_attachment', ATTACHMENT_HANDOFF_MS, mergeMetadata(baseMetadata, {
        reason: 'attachment_received',
        attachmentKind: inboundPayloadMeta.attachmentKind,
        mimeType: inboundPayloadMeta.mimeType,
        fileName: inboundPayloadMeta.fileName,
        caption: inboundPayloadMeta.caption,
        ...buildDecisionMetadata({
          intent: 'prescription_submission',
          action: 'human_handoff',
          outboundType: 'attachment_handoff',
        }),
      }))
      const text = attachmentReceivedText()
      return createOutbound(channel, inbound.id, normalizedPhone, text, 'attachment_handoff', {
        attachmentKind: inboundPayloadMeta.attachmentKind,
        mimeType: inboundPayloadMeta.mimeType,
        fileName: inboundPayloadMeta.fileName,
        caption: inboundPayloadMeta.caption,
        ...buildWhatsAppCanonicalPayload({
          intent: 'prescription_submission',
          action: 'human_handoff',
          outboundType: 'attachment_handoff',
          canonicalReply: text,
          facts: {
            attachmentKind: inboundPayloadMeta.attachmentKind,
            mimeType: inboundPayloadMeta.mimeType,
          },
        }),
      })
    })
  }

  if (preAiRoute === 'attachment_followup_handoff') {
    return applyOohTrapIfNeeded(async () => {
      await setConversationState(channel, normalizedPhone, 'human_pause', ATTACHMENT_HANDOFF_MS, mergeMetadata(baseMetadata, {
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
      await setConversationState(channel, normalizedPhone, 'human_pause', ATTACHMENT_HANDOFF_MS, mergeMetadata(baseMetadata, {
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
      return createStatusReply(channel, inbound.id, normalizedPhone, result.customer, result.serviceOrder, baseMetadata)
    }
  }

  if (preAiRoute === 'waiting_identifier_lookup') {
    const result = await findOpenOsByIdentifier(channel.store_id, effectiveMessageText || undefined)
    if (result) {
      return createStatusReply(channel, inbound.id, normalizedPhone, result.customer, result.serviceOrder, baseMetadata)
    }

    return applyOohTrapIfNeeded(async () => {
      await setConversationState(channel, normalizedPhone, 'human_pause', HUMAN_PAUSE_MS, mergeMetadata(baseMetadata, {
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
      const maybeHumanized = await maybeHumanizeOutboundFromCanonical(outboundPayload, text, storeProfile.name)
      return createOutbound(channel, inbound.id, normalizedPhone, maybeHumanized.text, 'human_handoff', maybeHumanized.payload)
    })
  }

  if (preAiRoute === 'explicit_status_option') {
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
      hasRecentAttachment: hasRecentAttachmentContext(state),
      hasOpenOrder: hasKnownOpenOrderContext(state),
      handoffActive: false,
    })

    // Log the AI classification
    await logAiResult(channel, inbound.id, 'intent_classification', classification)

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

    if (classification.success && postClassificationRoute !== 'fallback') {
      if (postClassificationRoute === 'human_handoff') {
        await setConversationState(channel, normalizedPhone, 'human_pause', HUMAN_PAUSE_MS, mergeMetadata(baseMetadata, {
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
        const maybeHumanized = await maybeHumanizeOutboundFromCanonical(outboundPayload, text, storeProfile.name)
        const aiResult = (maybeHumanized as any).aiResult
        if (aiResult) {
          await logAiResult(channel, inbound.id, 'reply_humanization', aiResult)
        }
        return createOutbound(
          channel,
          inbound.id,
          normalizedPhone,
          maybeHumanized.text,
          'human_handoff',
          maybeHumanized.payload
        )
      }

      if (postClassificationRoute === 'budget_request' || postClassificationRoute === 'complaint_or_adaptation' || postClassificationRoute === 'pickup_or_scheduling') {
        const textMap: Record<string, string> = {
          budget_request: 'Vou chamar um consultor para te ajudar com esse orçamento agora mesmo!',
          complaint_or_adaptation: 'Entendi a situação. Vou chamar um especialista da nossa equipe para dar prioridade ao seu caso.',
          pickup_or_scheduling: 'Vou acionar a equipe para verificar a sua retirada/agendamento. Um momento.'
        }
        const text = textMap[postClassificationRoute] || humanHandoffText()
        await setConversationState(channel, normalizedPhone, 'human_pause', HUMAN_PAUSE_MS, mergeMetadata(baseMetadata, {
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
        const maybeHumanized = await maybeHumanizeOutboundFromCanonical(outboundPayload, text, storeProfile.name)
        const aiResult = (maybeHumanized as any).aiResult
        if (aiResult) {
          await logAiResult(channel, inbound.id, 'reply_humanization', aiResult)
        }
        return createOutbound(
          channel,
          inbound.id,
          normalizedPhone,
          maybeHumanized.text,
          'human_handoff',
          maybeHumanized.payload
        )
      }

      if (postClassificationRoute === 'order_status') {
        return handleStatusByPhone(channel, inbound.id, normalizedPhone, baseMetadata)
      }

      if (postClassificationRoute === 'store_hours') {
        const text = storeHoursText
        if (text) {
          await setConversationState(
            channel,
            normalizedPhone,
            'silent',
            AFTER_STATUS_SILENCE_MS,
            mergeMetadata(
              mergeMetadata(baseMetadata, toMetadataRecord(buildAiStateMetadata('store_hours_sent', classification.data))),
              buildDecisionMetadata({
                intent: classification.data.intent,
                confidence: classification.data.confidence,
                action: 'auto_reply',
                outboundType: 'store_hours',
              })
            )
          )
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
          const maybeHumanized = await maybeHumanizeOutboundFromCanonical(outboundPayload, text, storeProfile.name)
          const aiResult = (maybeHumanized as any).aiResult
          if (aiResult) {
            await logAiResult(channel, inbound.id, 'reply_humanization', aiResult)
          }
          return createOutbound(channel, inbound.id, normalizedPhone, maybeHumanized.text, 'store_hours', maybeHumanized.payload)
        }
      }

      if (postClassificationRoute === 'store_location') {
        const text = storeLocationText
        if (text) {
          await setConversationState(
            channel,
            normalizedPhone,
            'silent',
            AFTER_STATUS_SILENCE_MS,
            mergeMetadata(
              mergeMetadata(baseMetadata, toMetadataRecord(buildAiStateMetadata('store_location_sent', classification.data))),
              buildDecisionMetadata({
                intent: classification.data.intent,
                confidence: classification.data.confidence,
                action: 'auto_reply',
                outboundType: 'store_location',
              })
            )
          )
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
          const maybeHumanized = await maybeHumanizeOutboundFromCanonical(outboundPayload, text, storeProfile.name)
          const aiResult = (maybeHumanized as any).aiResult
          if (aiResult) {
            await logAiResult(channel, inbound.id, 'reply_humanization', aiResult)
          }
          return createOutbound(channel, inbound.id, normalizedPhone, maybeHumanized.text, 'store_location', maybeHumanized.payload)
        }
      }
    }
  }

  if (state?.state === 'waiting_menu') {
    return ignoreInbound(inbound.id)
  }

  return applyOohTrapIfNeeded(async () => {
    await setConversationState(channel, normalizedPhone, 'waiting_menu', MENU_WAIT_MS, mergeMetadata(baseMetadata, {
      reason: 'menu_sent',
      ...buildDecisionMetadata({
        intent: null,
        action: 'show_menu',
        outboundType: 'menu',
      }),
    }))
    const text = menuText()
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

  await setConversationState(channel, normalizedPhone, 'human_pause', HUMAN_PAUSE_MS, {
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
