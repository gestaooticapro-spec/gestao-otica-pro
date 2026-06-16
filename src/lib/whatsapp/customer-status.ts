/* eslint-disable @typescript-eslint/no-explicit-any */

import { createAdminClient } from '@/lib/supabase/admin'
import { Json } from '@/lib/database.types'
import { describeOpenOs, WhatsAppOsStatusCode } from './os-status'
import { digitsOnly, phonesMatch, toEvolutionNumber } from './phone'
import type { StoreSettings } from '@/lib/store-modules'

const SAME_STATUS_SILENCE_WINDOW_MS = 2 * 60 * 60 * 1000

type ChannelRow = {
  id: number
  tenant_id: string
  store_id: number
  instance_key: string
  phone_number: string
  is_active: boolean
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

type LastOutboundStatusRow = {
  created_at: string
  message_text: string
  payload: Json | null
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

async function findCustomerByPhone(storeId: number, phone: string) {
  const supabase = createAdminClient()
  const digits = digitsOnly(phone)
  const suffix = digits.slice(-8)
  if (suffix.length < 8) return null

  const { data, error } = await (supabase.from('customers') as any)
    .select('id, full_name, fone_movel, phone')
    .eq('store_id', storeId)
    .or(`fone_movel.ilike.%${suffix}%,phone.ilike.%${suffix}%`)
    .limit(25)

  if (error) throw error

  return (data ?? []).find((customer: any) =>
    phonesMatch(phone, customer.fone_movel) || phonesMatch(phone, customer.phone)
  ) ?? null
}

async function findLatestOpenOs(storeId: number, customerId: number) {
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
  const normalized = messageText
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

  if (normalized.includes('pode vir retirar') || normalized.includes('ficou pronto')) {
    return 'ready_for_pickup'
  }

  if (normalized.includes('aguardando armacao') || normalized.includes('trazer na loja')) {
    return 'lens_arrived_needs_frame'
  }

  if (normalized.includes('fila da montagem') || normalized.includes('entrou na fila de montagem')) {
    return 'lens_arrived_assembling'
  }

  if (
    normalized.includes('em producao')
    || normalized.includes('no laboratorio')
    || normalized.includes('aberta e em preparacao')
  ) {
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

  const customer = await findCustomerByPhone(channel.store_id, normalizedPhone)
  if (!customer) {
    await (supabase.from('whatsapp_inbound_messages') as any)
      .update({ status: 'ignored' })
      .eq('id', inbound.id)
    return { shouldReply: false }
  }

  const serviceOrder = await findLatestOpenOs(channel.store_id, customer.id)
  if (!serviceOrder) {
    await (supabase.from('whatsapp_inbound_messages') as any)
      .update({ status: 'ignored' })
      .eq('id', inbound.id)
    return { shouldReply: false }
  }

  const automationSettings = await loadStoreWhatsAppSettings(channel.store_id)
  if (automationSettings?.enabled === false) {
    await (supabase.from('whatsapp_inbound_messages') as any)
      .update({ status: 'ignored' })
      .eq('id', inbound.id)
    return { shouldReply: false }
  }

  const status = describeOpenOs(
    customer.full_name,
    serviceOrder,
    automationSettings?.templates
  )
  const lastOutbound = await findLastOutboundStatus(channel.id, normalizedPhone)

  if (shouldSilenceRepeatedStatus(lastOutbound, status.statusCode)) {
    await (supabase.from('whatsapp_inbound_messages') as any)
      .update({ status: 'ignored' })
      .eq('id', inbound.id)
    return { shouldReply: false }
  }

  const { data: outbound, error: outboundError } = await (supabase.from('whatsapp_outbound_messages') as any)
    .insert({
      tenant_id: channel.tenant_id,
      store_id: channel.store_id,
      channel_id: channel.id,
      inbound_message_id: inbound.id,
      remote_phone: normalizedPhone,
      message_text: status.replyText,
      message_type: 'os_status',
      status: 'pending',
      payload: {
        statusCode: status.statusCode,
      },
    })
    .select('id')
    .single()

  if (outboundError) throw outboundError

  await (supabase.from('whatsapp_inbound_messages') as any)
    .update({ status: 'processed' })
    .eq('id', inbound.id)

  return {
    shouldReply: true,
    phone: normalizedPhone,
    customerName: customer.full_name,
    serviceOrderId: serviceOrder.id,
    statusCode: status.statusCode,
    replyText: status.replyText,
    outboundMessageId: outbound.id,
  }
}
