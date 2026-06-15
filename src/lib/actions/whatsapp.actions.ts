'use server'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { toEvolutionNumber } from '@/lib/whatsapp/phone'

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

async function getAuthorizedProfile(storeId: number) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const profile = await getProfileByAdmin(user.id) as any
  if (!profile || !['admin', 'manager'].includes(profile.role)) return null
  if (profile.role !== 'admin' && Number(profile.store_id) !== storeId) return null

  return profile
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
