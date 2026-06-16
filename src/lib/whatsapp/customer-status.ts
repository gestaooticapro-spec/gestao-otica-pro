/* eslint-disable @typescript-eslint/no-explicit-any */

import { createAdminClient } from '@/lib/supabase/admin'
import { Json } from '@/lib/database.types'
import { describeOpenOs, WhatsAppOsStatusCode } from './os-status'
import { digitsOnly, phonesMatch, toEvolutionNumber } from './phone'
import type { StoreSettings } from '@/lib/store-modules'

const SAME_STATUS_SILENCE_WINDOW_MS = 2 * 60 * 60 * 1000
const HUMAN_PAUSE_MS = 60 * 60 * 1000
const MENU_WAIT_MS = 30 * 60 * 1000
const IDENTIFIER_WAIT_MS = 20 * 60 * 1000
const AFTER_STATUS_SILENCE_MS = 60 * 60 * 1000

type ConversationState = 'waiting_menu' | 'waiting_identifier' | 'human_pause' | 'silent'

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
  return settings.whatsapp_automation?.os_on_demand
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
  serviceOrder: OpenOsRow
): Promise<CustomerStatusResponse> {
  const automationSettings = await loadStoreWhatsAppSettings(channel.store_id)
  if (automationSettings?.enabled === false) {
    await setConversationState(channel, phone, 'silent', AFTER_STATUS_SILENCE_MS, { reason: 'os_responder_disabled' })
    return ignoreInbound(inboundMessageId)
  }

  const status = describeOpenOs(customer.full_name, serviceOrder, automationSettings?.templates)
  const lastOutbound = await findLastOutboundStatus(channel.id, phone)

  if (shouldSilenceRepeatedStatus(lastOutbound, status.statusCode)) {
    await setConversationState(channel, phone, 'silent', AFTER_STATUS_SILENCE_MS, { reason: 'repeated_status' })
    return ignoreInbound(inboundMessageId)
  }

  await setConversationState(channel, phone, 'silent', AFTER_STATUS_SILENCE_MS, {
    reason: 'status_sent',
    serviceOrderId: serviceOrder.id,
    statusCode: status.statusCode,
  })

  const response = await createOutbound(channel, inboundMessageId, phone, status.replyText, 'os_status', {
    statusCode: status.statusCode,
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
  phone: string
): Promise<CustomerStatusResponse> {
  const customer = await findCustomerByPhone(channel.store_id, phone)
  if (!customer) {
    await setConversationState(channel, phone, 'waiting_identifier', IDENTIFIER_WAIT_MS)
    return createOutbound(channel, inboundMessageId, phone, identifierPromptText(), 'identifier_prompt')
  }

  const serviceOrder = await findLatestOpenOs(channel.store_id, customer.id)
  if (!serviceOrder) {
    await setConversationState(channel, phone, 'waiting_identifier', IDENTIFIER_WAIT_MS)
    return createOutbound(channel, inboundMessageId, phone, identifierPromptText(), 'identifier_prompt')
  }

  return createStatusReply(channel, inboundMessageId, phone, customer, serviceOrder)
}

export async function resolveCustomerStatus(
  input: CustomerStatusRequest
): Promise<CustomerStatusResponse> {
  const channel = await findActiveChannel(input.instanceKey)
  if (!channel) return { shouldReply: false }

  const supabase = createAdminClient()
  const normalizedPhone = toEvolutionNumber(input.phone)
  if (!normalizedPhone) return { shouldReply: false }

  const { data: inbound, error: inboundError } = await (supabase.from('whatsapp_inbound_messages') as any)
    .insert({
      tenant_id: channel.tenant_id,
      store_id: channel.store_id,
      channel_id: channel.id,
      provider_message_id: input.providerMessageId,
      remote_phone: normalizedPhone,
      message_text: input.messageText?.trim() || null,
      payload: input.payload ?? null,
      status: 'received',
    })
    .select('id')
    .single()

  if (inboundError?.code === '23505') {
    return { shouldReply: false, duplicate: true }
  }
  if (inboundError) throw inboundError

  const option = optionFromMessage(input.messageText)
  const state = await findConversationState(channel.id, normalizedPhone)

  if (option === '2') {
    await setConversationState(channel, normalizedPhone, 'human_pause', HUMAN_PAUSE_MS, { selectedOption: '2' })
    return createOutbound(channel, inbound.id, normalizedPhone, humanHandoffText(), 'human_handoff')
  }

  if (state?.state === 'human_pause') {
    return ignoreInbound(inbound.id)
  }

  if (option === '1') {
    return handleStatusByPhone(channel, inbound.id, normalizedPhone)
  }

  if (state?.state === 'waiting_identifier') {
    const result = await findOpenOsByIdentifier(channel.store_id, input.messageText)
    if (result) {
      return createStatusReply(channel, inbound.id, normalizedPhone, result.customer, result.serviceOrder)
    }

    await setConversationState(channel, normalizedPhone, 'human_pause', HUMAN_PAUSE_MS, { reason: 'identifier_not_found' })
    return createOutbound(channel, inbound.id, normalizedPhone, notFoundHandoffText(), 'human_handoff')
  }

  if (state?.state === 'waiting_menu') {
    return ignoreInbound(inbound.id)
  }

  if (state?.state === 'silent') {
    return ignoreInbound(inbound.id)
  }

  await setConversationState(channel, normalizedPhone, 'waiting_menu', MENU_WAIT_MS)
  return createOutbound(channel, inbound.id, normalizedPhone, menuText(), 'menu')
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
  })

  return { success: true, paused: true as const }
}
