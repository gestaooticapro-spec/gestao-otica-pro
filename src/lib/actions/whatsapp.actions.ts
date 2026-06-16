'use server'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { toEvolutionNumber } from '@/lib/whatsapp/phone'
import { updateStoreSettings } from '@/lib/actions/store.actions'
import {
  DEFAULT_WHATSAPP_OS_REPLY_TEMPLATES,
  WhatsAppOsStatusCode,
} from '@/lib/whatsapp/os-status'
import type {
  StoreSettings,
  WhatsAppAutomationOsOnDemandSettings,
  WhatsAppOsReplyTemplates,
} from '@/lib/store-modules'

export type WhatsAppChannel = {
  id: number
  store_id: number
  instance_key: string
  phone_number: string
  is_active: boolean
  connection_status: 'unknown' | 'connecting' | 'connected' | 'disconnected'
  last_connection_at: string | null
  updated_at: string
}

export type WhatsAppChannelResult = {
  success: boolean
  message: string
  channel?: WhatsAppChannel | null
}

export type WhatsAppActivationResult = WhatsAppChannelResult & {
  qrCodeBase64?: string | null
}

export type WhatsAppOsResponderSettings = {
  enabled: boolean
  templates: WhatsAppOsReplyTemplates
}

export type WhatsAppOsResponderSettingsResult = {
  success: boolean
  message: string
  settings?: WhatsAppOsResponderSettings
}

const ChannelSchema = z.object({
  storeId: z.coerce.number().int().positive(),
  instanceKey: z.string()
    .trim()
    .min(2, 'Informe o identificador da instância.')
    .max(120)
    .regex(/^[a-zA-Z0-9_-]+$/, 'Use apenas letras, números, hífen e sublinhado.'),
  phoneNumber: z.string().trim().min(10, 'Informe o número do WhatsApp.'),
  isActive: z.boolean(),
})

const ActivationSchema = z.object({
  storeId: z.coerce.number().int().positive(),
  phoneNumber: z.string().trim().min(10, 'Informe o nÃºmero do WhatsApp.'),
  acceptedRisk: z.boolean().refine(Boolean, 'Confirme que entendeu o risco antes de continuar.'),
})

const StatusSchema = z.object({
  storeId: z.coerce.number().int().positive(),
})

const OsResponderSettingsSchema = z.object({
  storeId: z.coerce.number().int().positive(),
  enabled: z.boolean(),
  templates: z.object({
    lens_in_production: z.string().trim().min(8, 'Informe um texto para lente em producao.').max(1000),
    lens_arrived_needs_frame: z.string().trim().min(8, 'Informe um texto para lente aguardando armacao.').max(1000),
    lens_arrived_assembling: z.string().trim().min(8, 'Informe um texto para fila de montagem.').max(1000),
    ready_for_pickup: z.string().trim().min(8, 'Informe um texto para oculos pronto.').max(1000),
  }),
})

async function getAuthorizedProfile(storeId: number) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const profile = await getProfileByAdmin(user.id) as any
  if (!profile || !['admin', 'manager'].includes(profile.role)) return null
  if (profile.role !== 'admin' && Number(profile.store_id) !== storeId) return null

  return profile
}

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

function buildInstanceKey(storeId: number, storeName: string) {
  const slug = slugify(storeName) || 'loja'
  return `loja-${storeId}-${slug}`
}

async function automationRequest<T>(
  path: '/admin/instances/setup' | '/admin/instances/connect' | '/admin/instances/status',
  payload: { instanceKey: string }
): Promise<T> {
  const baseUrl = process.env.WHATSAPP_AUTOMATION_ADMIN_URL?.replace(/\/$/, '')
  const secret = process.env.WHATSAPP_INTERNAL_SECRET

  if (!baseUrl || !secret) {
    throw new Error('WhatsApp automation admin environment is not configured.')
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${secret}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  })

  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(`WhatsApp automation admin failed (${response.status}): ${JSON.stringify(result)}`)
  }

  return result as T
}

async function loadStoreForWhatsApp(storeId: number) {
  const supabase = createAdminClient()
  const { data: store, error } = await (supabase.from('stores') as any)
    .select('id, tenant_id, name')
    .eq('id', storeId)
    .single()

  if (error || !store) throw error || new Error('Loja nÃ£o encontrada.')
  return store as { id: number; tenant_id: string; name: string }
}

async function loadStoreSettings(storeId: number): Promise<StoreSettings> {
  const supabase = createAdminClient()
  const { data, error } = await (supabase.from('stores') as any)
    .select('settings')
    .eq('id', storeId)
    .single()

  if (error) throw error
  return ((data?.settings || {}) as StoreSettings) || {}
}

function buildOsResponderSettings(
  saved: WhatsAppAutomationOsOnDemandSettings | undefined
): WhatsAppOsResponderSettings {
  const templates = {
    ...DEFAULT_WHATSAPP_OS_REPLY_TEMPLATES,
    ...(saved?.templates || {}),
  }

  return {
    enabled: saved?.enabled !== false,
    templates,
  }
}

async function upsertWhatsAppChannel(input: {
  tenantId: string
  storeId: number
  instanceKey: string
  phoneNumber: string
  isActive: boolean
  connectionStatus: WhatsAppChannel['connection_status']
}) {
  const supabase = createAdminClient()
  const { data: existing } = await (supabase.from('whatsapp_store_channels') as any)
    .select('id')
    .eq('store_id', input.storeId)
    .eq('provider', 'evolution')
    .maybeSingle()

  const values = {
    tenant_id: input.tenantId,
    store_id: input.storeId,
    provider: 'evolution',
    instance_key: input.instanceKey,
    phone_number: input.phoneNumber,
    is_active: input.isActive,
    connection_status: input.connectionStatus,
    last_connection_at: input.connectionStatus === 'connected' ? new Date().toISOString() : undefined,
    updated_at: new Date().toISOString(),
  }

  const query = existing
    ? (supabase.from('whatsapp_store_channels') as any).update(values).eq('id', existing.id)
    : (supabase.from('whatsapp_store_channels') as any).insert(values)

  const { data, error } = await query
    .select('id, store_id, instance_key, phone_number, is_active, connection_status, last_connection_at, updated_at')
    .single()

  if (error) throw error
  return data as WhatsAppChannel
}

export async function getWhatsAppChannel(storeId: number): Promise<WhatsAppChannelResult> {
  if (!await getAuthorizedProfile(storeId)) {
    return { success: false, message: 'Acesso negado.' }
  }

  try {
    const supabase = createAdminClient()
    const { data, error } = await (supabase.from('whatsapp_store_channels') as any)
      .select('id, store_id, instance_key, phone_number, is_active, connection_status, last_connection_at, updated_at')
      .eq('store_id', storeId)
      .eq('provider', 'evolution')
      .maybeSingle()

    if (error) throw error
    return { success: true, message: '', channel: data ?? null }
  } catch (error) {
    console.error('[WhatsApp] Failed to load channel:', error)
    return {
      success: false,
      message: 'Não foi possível carregar o canal. Verifique se a migração do WhatsApp foi aplicada.',
    }
  }
}

export async function getWhatsAppOsResponderSettings(storeId: number): Promise<WhatsAppOsResponderSettingsResult> {
  if (!await getAuthorizedProfile(storeId)) {
    return { success: false, message: 'Acesso negado.' }
  }

  try {
    const settings = await loadStoreSettings(storeId)
    return {
      success: true,
      message: '',
      settings: buildOsResponderSettings(settings.whatsapp_automation?.os_on_demand),
    }
  } catch (error) {
    console.error('[WhatsApp] Failed to load OS responder settings:', error)
    return { success: false, message: 'Nao foi possivel carregar as respostas da OS.' }
  }
}

export async function saveWhatsAppOsResponderSettings(input: {
  storeId: number
  enabled: boolean
  templates: Record<WhatsAppOsStatusCode, string>
}): Promise<WhatsAppOsResponderSettingsResult> {
  const parsed = OsResponderSettingsSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message || 'Dados invalidos.' }
  }

  const profile = await getAuthorizedProfile(parsed.data.storeId)
  if (!profile) return { success: false, message: 'Acesso negado.' }

  try {
    const currentSettings = await loadStoreSettings(parsed.data.storeId)
    const nextSettings: Partial<StoreSettings> = {
      whatsapp_automation: {
        ...(currentSettings.whatsapp_automation || {}),
        os_on_demand: {
          enabled: parsed.data.enabled,
          templates: parsed.data.templates,
        },
      },
    }

    const result = await updateStoreSettings(parsed.data.storeId, nextSettings)
    if (!result.success) {
      return { success: false, message: result.message }
    }

    return {
      success: true,
      message: 'Respostas da OS atualizadas.',
      settings: {
        enabled: parsed.data.enabled,
        templates: parsed.data.templates,
      },
    }
  } catch (error) {
    console.error('[WhatsApp] Failed to save OS responder settings:', error)
    return { success: false, message: 'Nao foi possivel salvar as respostas da OS.' }
  }
}

export async function startWhatsAppActivation(input: {
  storeId: number
  phoneNumber: string
  acceptedRisk: boolean
}): Promise<WhatsAppActivationResult> {
  const parsed = ActivationSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message || 'Dados invÃ¡lidos.' }
  }

  const profile = await getAuthorizedProfile(parsed.data.storeId)
  if (!profile) return { success: false, message: 'Acesso negado.' }

  const normalizedPhone = toEvolutionNumber(parsed.data.phoneNumber)
  if (normalizedPhone.length < 12 || normalizedPhone.length > 13) {
    return { success: false, message: 'Informe um telefone brasileiro vÃ¡lido com DDD.' }
  }

  try {
    const store = await loadStoreForWhatsApp(parsed.data.storeId)
    const instanceKey = buildInstanceKey(store.id, store.name)
    const result = await automationRequest<{
      connectionStatus: WhatsAppChannel['connection_status']
      qrCodeBase64?: string | null
    }>('/admin/instances/setup', { instanceKey })

    const connectionStatus = result.connectionStatus === 'connected' ? 'connected' : 'connecting'
    const channel = await upsertWhatsAppChannel({
      tenantId: store.tenant_id,
      storeId: store.id,
      instanceKey,
      phoneNumber: normalizedPhone,
      isActive: connectionStatus === 'connected',
      connectionStatus,
    })

    revalidatePath(`/dashboard/loja/${store.id}/config`)
    return {
      success: true,
      message: connectionStatus === 'connected'
        ? 'WhatsApp conectado e respostas ativadas.'
        : 'Escaneie o QR Code para concluir a conexÃ£o.',
      channel,
      qrCodeBase64: result.qrCodeBase64 ?? null,
    }
  } catch (error) {
    console.error('[WhatsApp] Failed to start activation:', error)
    return { success: false, message: 'NÃ£o foi possÃ­vel iniciar a ativaÃ§Ã£o do WhatsApp.' }
  }
}

export async function refreshWhatsAppConnection(storeId: number): Promise<WhatsAppActivationResult> {
  const parsed = StatusSchema.safeParse({ storeId })
  if (!parsed.success) return { success: false, message: 'Loja invÃ¡lida.' }

  const profile = await getAuthorizedProfile(parsed.data.storeId)
  if (!profile) return { success: false, message: 'Acesso negado.' }

  try {
    const current = await getWhatsAppChannel(parsed.data.storeId)
    if (!current.success || !current.channel) {
      return { success: false, message: 'Nenhum canal configurado para esta loja.' }
    }

    const result = await automationRequest<{
      connectionStatus: WhatsAppChannel['connection_status']
    }>('/admin/instances/status', { instanceKey: current.channel.instance_key })

    const store = await loadStoreForWhatsApp(parsed.data.storeId)
    const connectionStatus = result.connectionStatus === 'connected' ? 'connected' : 'connecting'
    const channel = await upsertWhatsAppChannel({
      tenantId: store.tenant_id,
      storeId: store.id,
      instanceKey: current.channel.instance_key,
      phoneNumber: current.channel.phone_number,
      isActive: connectionStatus === 'connected',
      connectionStatus,
    })

    revalidatePath(`/dashboard/loja/${store.id}/config`)
    return {
      success: true,
      message: connectionStatus === 'connected'
        ? 'ConexÃ£o confirmada. As respostas estÃ£o ativadas.'
        : 'Ainda aguardando a conexÃ£o do WhatsApp.',
      channel,
    }
  } catch (error) {
    console.error('[WhatsApp] Failed to refresh connection:', error)
    return { success: false, message: 'NÃ£o foi possÃ­vel verificar a conexÃ£o.' }
  }
}

export async function requestWhatsAppQrCode(storeId: number): Promise<WhatsAppActivationResult> {
  const parsed = StatusSchema.safeParse({ storeId })
  if (!parsed.success) return { success: false, message: 'Loja invÃ¡lida.' }

  const profile = await getAuthorizedProfile(parsed.data.storeId)
  if (!profile) return { success: false, message: 'Acesso negado.' }

  try {
    const current = await getWhatsAppChannel(parsed.data.storeId)
    if (!current.success || !current.channel) {
      return { success: false, message: 'Inicie a ativaÃ§Ã£o antes de gerar o QR Code.' }
    }

    const result = await automationRequest<{
      connectionStatus: WhatsAppChannel['connection_status']
      qrCodeBase64?: string | null
    }>('/admin/instances/connect', { instanceKey: current.channel.instance_key })

    const store = await loadStoreForWhatsApp(parsed.data.storeId)
    const channel = await upsertWhatsAppChannel({
      tenantId: store.tenant_id,
      storeId: store.id,
      instanceKey: current.channel.instance_key,
      phoneNumber: current.channel.phone_number,
      isActive: false,
      connectionStatus: result.connectionStatus === 'connected' ? 'connected' : 'connecting',
    })

    return {
      success: true,
      message: 'QR Code atualizado.',
      channel,
      qrCodeBase64: result.qrCodeBase64 ?? null,
    }
  } catch (error) {
    console.error('[WhatsApp] Failed to request QR code:', error)
    return { success: false, message: 'NÃ£o foi possÃ­vel gerar um novo QR Code.' }
  }
}

export async function saveWhatsAppChannel(input: {
  storeId: number
  instanceKey: string
  phoneNumber: string
  isActive: boolean
}): Promise<WhatsAppChannelResult> {
  const parsed = ChannelSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message || 'Dados inválidos.' }
  }

  const profile = await getAuthorizedProfile(parsed.data.storeId)
  if (!profile) return { success: false, message: 'Acesso negado.' }

  const normalizedPhone = toEvolutionNumber(parsed.data.phoneNumber)
  if (normalizedPhone.length < 12 || normalizedPhone.length > 13) {
    return { success: false, message: 'Informe um telefone brasileiro válido com DDD.' }
  }

  try {
    const supabase = createAdminClient()
    const { data: store, error: storeError } = await (supabase.from('stores') as any)
      .select('tenant_id')
      .eq('id', parsed.data.storeId)
      .single()

    if (storeError || !store) throw storeError || new Error('Loja não encontrada.')

    const { data: existing } = await (supabase.from('whatsapp_store_channels') as any)
      .select('id, instance_key')
      .eq('store_id', parsed.data.storeId)
      .eq('provider', 'evolution')
      .maybeSingle()

    const instanceChanged = existing && existing.instance_key !== parsed.data.instanceKey
    const values = {
      tenant_id: store.tenant_id,
      store_id: parsed.data.storeId,
      provider: 'evolution',
      instance_key: parsed.data.instanceKey,
      phone_number: normalizedPhone,
      is_active: parsed.data.isActive,
      connection_status: instanceChanged ? 'unknown' : undefined,
      updated_at: new Date().toISOString(),
    }

    const query = existing
      ? (supabase.from('whatsapp_store_channels') as any)
        .update(values)
        .eq('id', existing.id)
      : (supabase.from('whatsapp_store_channels') as any)
        .insert({ ...values, connection_status: 'unknown' })

    const { data, error } = await query
      .select('id, store_id, instance_key, phone_number, is_active, connection_status, last_connection_at, updated_at')
      .single()

    if (error) {
      if (error.code === '23505') {
        return { success: false, message: 'Essa instância já está vinculada a outra loja.' }
      }
      throw error
    }

    revalidatePath(`/dashboard/loja/${parsed.data.storeId}/config`)
    return { success: true, message: 'Canal do WhatsApp atualizado.', channel: data }
  } catch (error) {
    console.error('[WhatsApp] Failed to save channel:', error)
    return { success: false, message: 'Não foi possível salvar o canal do WhatsApp.' }
  }
}
