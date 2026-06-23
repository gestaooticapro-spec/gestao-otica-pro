'use server'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { Json } from '@/lib/database.types'
import { getWhatsAppLink } from '@/lib/utils'
import { digitsOnly, toEvolutionNumber } from '@/lib/whatsapp/phone'
import { markStoreInitiatedConversation } from '@/lib/whatsapp/customer-status'

const ALLOWED_ROLES = ['admin', 'manager', 'store_operator', 'vendedor', 'tecnico']

export type ManualWhatsAppMessageType =
  | 'operator_manual'
  | 'billing_reminder'
  | 'post_sale_followup'
  | 'relationship'
  | 'assistance_update'
  | 'service_order'
  | 'customer_history'
  | 'document_link'

export type ManualWhatsAppRouteUsed = 'vps' | 'external_fallback'

export type SendManualWhatsAppInput = {
  storeId: number
  remotePhone: string
  messageText: string
  messageType: ManualWhatsAppMessageType
  source: string
  metadata?: Json
}

export type SendManualWhatsAppResult = {
  success: boolean
  message: string
  routeUsed: ManualWhatsAppRouteUsed
  outboundMessageId?: number
  externalUrl?: string
  fallbackReason?: string
  shouldOpenExternal?: boolean
}

type AccessProfile = {
  role: string
  store_id: number | null
}

function formatActionError(error: unknown, fallback: string) {
  if (!error) return fallback
  if (error instanceof Error && error.message) return error.message

  if (typeof error === 'object' && error !== null) {
    const candidate = error as { message?: unknown; details?: unknown; code?: unknown }
    const parts = [candidate.message, candidate.details, candidate.code]
      .filter((value) => typeof value === 'string' && value.trim().length > 0)
      .map((value) => String(value).trim())

    if (parts.length > 0) return parts.join(' | ')
  }

  return fallback
}

function normalizeRemotePhone(value: string) {
  const digits = digitsOnly(value)
  if (!digits) return value.trim()

  if (digits.startsWith('55') && digits.length >= 12) return digits

  const evolution = toEvolutionNumber(digits)
  return evolution || digits
}

function fallbackResult(input: {
  phone: string
  messageText: string
  reason: string
  outboundMessageId?: number
}): SendManualWhatsAppResult {
  return {
    success: true,
    routeUsed: 'external_fallback',
    message: 'Abrimos o WhatsApp externo porque a VPS nao concluiu o envio.',
    externalUrl: getWhatsAppLink(input.phone, input.messageText),
    outboundMessageId: input.outboundMessageId,
    fallbackReason: input.reason,
    shouldOpenExternal: true,
  }
}

async function getSendContext(storeId: number) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Usuario nao autenticado.')
  }

  const profile = (await getProfileByAdmin(user.id)) as AccessProfile | null
  if (!profile) {
    throw new Error('Perfil invalido.')
  }

  const isAllowed = ALLOWED_ROLES.includes(profile.role)
  const hasStoreAccess = profile.role === 'admin' || profile.store_id === storeId

  if (!isAllowed || !hasStoreAccess) {
    throw new Error('Acesso negado.')
  }

  return {
    profile,
    supabaseAdmin: createAdminClient(),
  }
}

async function sendAutomationMessage(payload: {
  instanceKey: string
  phone: string
  text: string
  outboundMessageId: number
}) {
  const baseUrl = process.env.WHATSAPP_AUTOMATION_ADMIN_URL?.replace(/\/$/, '')
  const secret = process.env.WHATSAPP_INTERNAL_SECRET
  if (!baseUrl || !secret) throw new Error('WhatsApp automation admin environment is not configured.')

  const response = await fetch(`${baseUrl}/admin/messages/send`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${secret}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000),
  })

  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(`WhatsApp send failed (${response.status}): ${JSON.stringify(result)}`)
  }

  return result
}

export async function sendManualWhatsApp(input: SendManualWhatsAppInput): Promise<SendManualWhatsAppResult> {
  const storeId = Number(input.storeId)
  const remotePhone = normalizeRemotePhone(String(input.remotePhone || ''))
  const messageText = String(input.messageText || '').trim()
  const source = String(input.source || '').trim() || 'unknown'
  const metadata = input.metadata ?? null

  try {
    if (!Number.isFinite(storeId) || storeId <= 0) {
      return {
        success: false,
        routeUsed: 'external_fallback',
        message: 'Loja invalida.',
        shouldOpenExternal: false,
      }
    }

    if (!remotePhone) {
      return {
        success: false,
        routeUsed: 'external_fallback',
        message: 'Telefone invalido.',
        shouldOpenExternal: false,
      }
    }

    if (!messageText) {
      return {
        success: false,
        routeUsed: 'external_fallback',
        message: 'Mensagem vazia.',
        externalUrl: getWhatsAppLink(remotePhone),
        shouldOpenExternal: false,
      }
    }

    if (messageText.length > 5000) {
      return {
        success: false,
        routeUsed: 'external_fallback',
        message: 'Mensagem muito longa.',
        externalUrl: getWhatsAppLink(remotePhone, messageText),
        shouldOpenExternal: false,
      }
    }

    const { supabaseAdmin } = await getSendContext(storeId)
    const { data: channel, error: channelError } = await (supabaseAdmin.from('whatsapp_store_channels') as any)
      .select('id, tenant_id, store_id, instance_key, is_active, connection_status')
      .eq('store_id', storeId)
      .eq('provider', 'evolution')
      .order('is_active', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (channelError) throw channelError

    const basePayload = {
      source,
      manual: true,
      sentBy: 'operator',
      routePolicy: 'automatic',
      fallbackMode: 'external',
      metadata,
    }

    if (!channel?.id || !channel?.instance_key) {
      return fallbackResult({
        phone: remotePhone,
        messageText,
        reason: 'channel_not_configured',
      })
    }

    if (!channel.is_active || channel.connection_status !== 'connected') {
      const { data: outbound, error: outboundError } = await (supabaseAdmin.from('whatsapp_outbound_messages') as any)
        .insert({
          tenant_id: channel.tenant_id,
          store_id: storeId,
          channel_id: channel.id,
          inbound_message_id: null,
          remote_phone: remotePhone,
          message_text: messageText,
          message_type: input.messageType,
          status: 'failed',
          error_message: 'WhatsApp da loja nao esta conectado.',
          payload: {
            ...basePayload,
            routeUsed: 'external_fallback',
            fallbackReason: 'channel_disconnected',
          },
        })
        .select('id')
        .single()

      if (outboundError) throw outboundError

      return fallbackResult({
        phone: remotePhone,
        messageText,
        reason: 'channel_disconnected',
        outboundMessageId: outbound.id,
      })
    }

    await markStoreInitiatedConversation({
      instanceKey: channel.instance_key,
      phone: remotePhone,
      messageText,
      payload: {
        source,
        manual: true,
        messageType: input.messageType,
        metadata,
      },
    })

    const { data: outbound, error: outboundError } = await (supabaseAdmin.from('whatsapp_outbound_messages') as any)
      .insert({
        tenant_id: channel.tenant_id,
        store_id: storeId,
        channel_id: channel.id,
        inbound_message_id: null,
        remote_phone: remotePhone,
        message_text: messageText,
        message_type: input.messageType,
        status: 'pending',
        payload: {
          ...basePayload,
          routeUsed: 'vps',
        },
      })
      .select('id')
      .single()

    if (outboundError) throw outboundError

    try {
      await sendAutomationMessage({
        instanceKey: channel.instance_key,
        phone: remotePhone,
        text: messageText,
        outboundMessageId: outbound.id,
      })
    } catch (sendError) {
      const errorMessage = formatActionError(sendError, 'Falha ao enviar mensagem real.')
      await (supabaseAdmin.from('whatsapp_outbound_messages') as any)
        .update({
          status: 'failed',
          error_message: errorMessage,
          payload: {
            ...basePayload,
            routeUsed: 'external_fallback',
            fallbackReason: 'send_failed',
            vpsError: errorMessage,
          },
        })
        .eq('id', outbound.id)

      return fallbackResult({
        phone: remotePhone,
        messageText,
        reason: 'send_failed',
        outboundMessageId: outbound.id,
      })
    }

    await (supabaseAdmin.from('whatsapp_outbound_messages') as any)
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
      })
      .eq('id', outbound.id)

    return {
      success: true,
      routeUsed: 'vps',
      message: 'Mensagem enviada via WhatsApp da loja.',
      outboundMessageId: outbound.id,
    }
  } catch (error) {
    console.error('[Manual WhatsApp] Failed to send manual message:', error)
    return {
      success: false,
      routeUsed: 'external_fallback',
      message: formatActionError(error, 'Nao foi possivel preparar o envio manual.'),
      fallbackReason: 'unexpected_error',
      shouldOpenExternal: false,
    }
  }
}
