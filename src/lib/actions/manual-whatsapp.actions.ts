'use server'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { Json } from '@/lib/database.types'
import { getWhatsAppLink } from '@/lib/utils'
import { digitsOnly, toEvolutionNumber } from '@/lib/whatsapp/phone'
import { markStoreInitiatedConversation } from '@/lib/whatsapp/customer-status'
import { generateInstallmentReceiptPDF } from '@/lib/pdf-generator'

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
  | 'document_attachment'

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
  providerMessageId?: string
  externalUrl?: string
  fallbackReason?: string
  shouldOpenExternal?: boolean
}

export type SendManualWhatsAppMediaInput = {
  storeId: number
  remotePhone: string
  mediaType: 'pdf' | 'image'
  mimeType: 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp'
  fileName: string
  fileBase64: string
  caption: string
  messageType: ManualWhatsAppMessageType
  source: string
  metadata?: Json
}

export type SendInstallmentReceiptWhatsAppInput = {
  storeId: number
  installmentId: number
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
  text?: string
  media?: {
    type: 'document' | 'image'
    mimeType: string
    fileName: string
    caption: string
    base64: string
  }
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
      mirrorOutbound: false,
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

type ValidatedMedia =
  | { ok: false; error: string }
  | {
      ok: true
      fileName: string
      fileBase64: string
      caption: string
      decodedBytes: number
    }

function validateMediaInput(input: SendManualWhatsAppMediaInput): ValidatedMedia {
  const fileName = String(input.fileName || '').trim()
  const fileBase64 = String(input.fileBase64 || '').replace(/^data:[^;]+;base64,/, '').trim()
  const caption = String(input.caption || '').trim()
  const validMime = input.mediaType === 'pdf'
    ? input.mimeType === 'application/pdf'
    : ['image/jpeg', 'image/png', 'image/webp'].includes(input.mimeType)
  const validFileName = /^[a-zA-Z0-9._-]{1,160}$/.test(fileName)
  const validBase64 = fileBase64.length > 0
    && fileBase64.length % 4 === 0
    && /^[a-zA-Z0-9+/]+={0,2}$/.test(fileBase64)
  const decodedBytes = validBase64
    ? Math.floor((fileBase64.length * 3) / 4) - (fileBase64.endsWith('==') ? 2 : fileBase64.endsWith('=') ? 1 : 0)
    : 0

  if (!validMime) return { ok: false, error: 'Tipo de arquivo nao permitido.' }
  if (!validFileName) return { ok: false, error: 'Nome de arquivo invalido.' }
  if (!validBase64 || decodedBytes <= 0) return { ok: false, error: 'Arquivo invalido.' }
  if (decodedBytes > 10 * 1024 * 1024) return { ok: false, error: 'O arquivo excede o limite de 10 MB.' }
  if (!caption || caption.length > 1024) return { ok: false, error: 'Legenda invalida.' }

  return { ok: true, fileName, fileBase64, caption, decodedBytes }
}

async function sendManualWhatsAppMediaWithContext(
  input: SendManualWhatsAppMediaInput,
  supabaseAdmin: ReturnType<typeof createAdminClient>
): Promise<SendManualWhatsAppResult> {
  const storeId = Number(input.storeId)
  const remotePhone = normalizeRemotePhone(String(input.remotePhone || ''))
  const source = String(input.source || '').trim() || 'unknown'
  const metadata = input.metadata ?? null
  const media = validateMediaInput(input)

  if (!remotePhone) {
    return {
      success: false,
      routeUsed: 'external_fallback',
      message: 'Cliente sem telefone valido para WhatsApp.',
      shouldOpenExternal: false,
    }
  }

  if (!media.ok) {
    return {
      success: false,
      routeUsed: 'external_fallback',
      message: media.error,
      shouldOpenExternal: false,
    }
  }

  const { data: channel, error: channelError } = await (supabaseAdmin.from('whatsapp_store_channels') as any)
    .select('id, tenant_id, store_id, instance_key, is_active, connection_status')
    .eq('store_id', storeId)
    .eq('provider', 'evolution')
    .order('is_active', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (channelError) throw channelError

  const mediaMetadata = {
    type: input.mediaType,
    mimeType: input.mimeType,
    fileName: media.fileName,
    sizeBytes: media.decodedBytes,
  }
  const basePayload = {
    source,
    manual: true,
    sentBy: 'operator',
    routePolicy: 'connected_channel_only',
    fallbackMode: 'none_for_attachments',
    media: mediaMetadata,
    metadata,
  }

  if (!channel?.id || !channel?.instance_key || !channel.is_active || channel.connection_status !== 'connected') {
    if (channel?.id) {
      await (supabaseAdmin.from('whatsapp_outbound_messages') as any).insert({
        tenant_id: channel.tenant_id,
        store_id: storeId,
        channel_id: channel.id,
        inbound_message_id: null,
        remote_phone: remotePhone,
        message_text: media.caption,
        message_type: input.messageType,
        status: 'failed',
        error_message: 'WhatsApp da loja nao esta conectado; anexo nao enviado.',
        payload: {
          ...basePayload,
          routeUsed: 'external_fallback',
          fallbackReason: channel.instance_key ? 'channel_disconnected' : 'channel_not_configured',
        },
      })
    }

    return {
      success: false,
      routeUsed: 'external_fallback',
      message: 'O PDF nao foi enviado porque o WhatsApp da loja nao esta conectado.',
      fallbackReason: channel?.id ? 'channel_disconnected' : 'channel_not_configured',
      shouldOpenExternal: false,
    }
  }

  await markStoreInitiatedConversation({
    instanceKey: channel.instance_key,
    phone: remotePhone,
    messageText: media.caption,
    mirrorOutbound: false,
    payload: {
      source,
      manual: true,
      messageType: input.messageType,
      media: mediaMetadata,
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
      message_text: media.caption,
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
    const automationResult = await sendAutomationMessage({
      instanceKey: channel.instance_key,
      phone: remotePhone,
      media: {
        type: input.mediaType === 'pdf' ? 'document' : 'image',
        mimeType: input.mimeType,
        fileName: media.fileName,
        caption: media.caption,
        base64: media.fileBase64,
      },
      outboundMessageId: outbound.id,
    })

    await (supabaseAdmin.from('whatsapp_outbound_messages') as any)
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', outbound.id)

    return {
      success: true,
      routeUsed: 'vps',
      message: 'Arquivo enviado via WhatsApp da loja.',
      outboundMessageId: outbound.id,
      providerMessageId: automationResult.providerMessageId,
      shouldOpenExternal: false,
    }
  } catch (sendError) {
    const errorMessage = formatActionError(sendError, 'Falha ao enviar arquivo real.')
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

    return {
      success: false,
      routeUsed: 'external_fallback',
      message: 'Nao foi possivel enviar o arquivo. Nenhum anexo foi enviado.',
      outboundMessageId: outbound.id,
      fallbackReason: 'send_failed',
      shouldOpenExternal: false,
    }
  }
}

export async function sendManualWhatsAppMedia(input: SendManualWhatsAppMediaInput): Promise<SendManualWhatsAppResult> {
  try {
    const storeId = Number(input.storeId)
    if (!Number.isFinite(storeId) || storeId <= 0) {
      return {
        success: false,
        routeUsed: 'external_fallback',
        message: 'Loja invalida.',
        shouldOpenExternal: false,
      }
    }

    const { supabaseAdmin } = await getSendContext(storeId)
    return await sendManualWhatsAppMediaWithContext(input, supabaseAdmin)
  } catch (error) {
    console.error('[Manual WhatsApp] Failed to send media:', error)
    return {
      success: false,
      routeUsed: 'external_fallback',
      message: formatActionError(error, 'Nao foi possivel preparar o envio do arquivo.'),
      fallbackReason: 'unexpected_error',
      shouldOpenExternal: false,
    }
  }
}

export async function sendInstallmentReceiptWhatsApp(input: SendInstallmentReceiptWhatsAppInput): Promise<SendManualWhatsAppResult> {
  const storeId = Number(input.storeId)
  const installmentId = Number(input.installmentId)

  try {
    if (!Number.isInteger(storeId) || storeId <= 0 || !Number.isInteger(installmentId) || installmentId <= 0) {
      return {
        success: false,
        routeUsed: 'external_fallback',
        message: 'Loja ou parcela invalida.',
        shouldOpenExternal: false,
      }
    }

    const { supabaseAdmin } = await getSendContext(storeId)
    const { data: installment, error: installmentError } = await (supabaseAdmin.from('financiamento_parcelas') as any)
      .select('*')
      .eq('id', installmentId)
      .eq('store_id', storeId)
      .maybeSingle()

    if (installmentError) throw installmentError
    if (!installment?.financiamento_id || installment.status !== 'Pago') {
      return {
        success: false,
        routeUsed: 'external_fallback',
        message: 'Parcela paga nao encontrada nesta loja.',
        shouldOpenExternal: false,
      }
    }

    const [{ data: financing, error: financingError }, { count: totalInstallments, error: countError }] = await Promise.all([
      (supabaseAdmin.from('financiamento_loja') as any)
        .select('id, venda_id, customer_id')
        .eq('id', installment.financiamento_id)
        .eq('store_id', storeId)
        .maybeSingle(),
      (supabaseAdmin.from('financiamento_parcelas') as any)
        .select('id', { count: 'exact', head: true })
        .eq('financiamento_id', installment.financiamento_id)
        .eq('store_id', storeId),
    ])

    if (financingError) throw financingError
    if (countError) throw countError
    if (!financing?.customer_id) {
      return {
        success: false,
        routeUsed: 'external_fallback',
        message: 'Financiamento sem cliente cadastrado nesta loja.',
        shouldOpenExternal: false,
      }
    }

    const { data: customer, error: customerError } = await (supabaseAdmin.from('customers') as any)
      .select('id, store_id, full_name, phone, fone_movel')
      .eq('id', financing.customer_id)
      .eq('store_id', storeId)
      .maybeSingle()

    if (customerError) throw customerError
    if (!customer) {
      return {
        success: false,
        routeUsed: 'external_fallback',
        message: 'Cliente da parcela nao encontrado nesta loja.',
        shouldOpenExternal: false,
      }
    }

    const remotePhone = customer.fone_movel || customer.phone
    if (!remotePhone) {
      return {
        success: false,
        routeUsed: 'external_fallback',
        message: 'O cliente nao possui telefone cadastrado.',
        shouldOpenExternal: false,
      }
    }

    const { data: store, error: storeError } = await (supabaseAdmin.from('stores') as any)
      .select('name, razao_social, phone, whatsapp, email, cep, street, number, neighborhood, city, state, settings')
      .eq('id', storeId)
      .maybeSingle()

    if (storeError) throw storeError
    if (!store?.name) {
      return {
        success: false,
        routeUsed: 'external_fallback',
        message: 'Loja nao encontrada para montar o recibo.',
        shouldOpenExternal: false,
      }
    }

    const storeSettings = (store.settings && typeof store.settings === 'object')
      ? (store.settings as { logo?: unknown })
      : null

    const pdfBuffer = await generateInstallmentReceiptPDF({
      customerName: customer.full_name,
      installmentNumber: installment.numero_parcela,
      totalInstallments: totalInstallments || 1,
      amount: installment.valor_parcela,
      dueDate: installment.data_vencimento,
      paymentDate: installment.data_pagamento || new Date().toISOString(),
      isReprint: Boolean(installment.receipt_printed_at),
      store: {
        name: store.name,
        legalName: store.razao_social,
        phone: store.phone,
        whatsapp: store.whatsapp,
        email: store.email,
        cep: store.cep,
        street: store.street,
        number: store.number,
        neighborhood: store.neighborhood,
        city: store.city,
        state: store.state,
        logoFile: typeof storeSettings?.logo === 'string' ? storeSettings.logo : null,
      },
    })
    const firstName = String(customer.full_name || '').trim().split(/\s+/)[0] || 'cliente'

    return await sendManualWhatsAppMediaWithContext({
      storeId,
      remotePhone,
      mediaType: 'pdf',
      mimeType: 'application/pdf',
      fileName: `recibo-parcela-${installmentId}.pdf`,
      fileBase64: pdfBuffer.toString('base64'),
      caption: `Ola, ${firstName}! Segue o recibo da parcela ${installment.numero_parcela}/${totalInstallments || 1}.`,
      messageType: 'document_attachment',
      source: 'installment_modal.receipt_button',
      metadata: {
        installmentId,
        financingId: financing.id,
        saleId: financing.venda_id,
        customerId: customer.id,
        documentType: 'installment_receipt',
      },
    }, supabaseAdmin)
  } catch (error) {
    console.error('[Manual WhatsApp] Failed to send installment receipt:', error)
    return {
      success: false,
      routeUsed: 'external_fallback',
      message: formatActionError(error, 'Nao foi possivel gerar ou enviar o recibo.'),
      fallbackReason: 'unexpected_error',
      shouldOpenExternal: false,
    }
  }
}
