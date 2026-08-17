'use server'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { Json } from '@/lib/database.types'
import { getWhatsAppLink } from '@/lib/utils'
import { digitsOnly, toEvolutionNumber } from '@/lib/whatsapp/phone'
import { markStoreInitiatedConversation } from '@/lib/whatsapp/customer-status'
import {
  generateInstallmentReceiptPDF,
} from '@/lib/pdf-generator'
import {
  generateCustomerFinancialSummaryImage,
  generateCustomerFinancialSummaryImages,
  generateCustomerPrescriptionSummaryImage,
} from '@/lib/whatsapp-summary-image'
import {
  getCustomerFinancialSummary,
  getCustomerPrescriptionSummary,
  type FinancialSummary,
} from '@/lib/actions/customer-history.actions'

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

export type SendSalePaymentReceiptWhatsAppInput = {
  storeId: number
  paymentId: number
}

export type SendCustomerFinancialSummaryWhatsAppInput = {
  storeId: number
  customerId: number
  financingIds?: number[]
}

export type SendCustomerPrescriptionSummaryWhatsAppInput = {
  storeId: number
  customerId: number
  prescriptionGroupId?: string | null
}

type AccessProfile = {
  role: string
  store_id: number | null
}

function getSelectedFinancialSummary(
  summary: FinancialSummary,
  requestedFinancingIds: number[] | undefined
): FinancialSummary | null {
  if (requestedFinancingIds === undefined) return summary

  const selectedIds = new Set(
    requestedFinancingIds
      .map((id) => Number(id))
      .filter((id) => Number.isSafeInteger(id) && id > 0)
  )
  if (selectedIds.size === 0) return null

  const financiamentos = summary.financiamentos.filter((financiamento) => selectedIds.has(financiamento.id))
  if (financiamentos.length === 0) return null

  const parcelas = financiamentos.flatMap((financiamento) => financiamento.parcelas)
  const parcelasPagas = parcelas.filter((parcela) => String(parcela.status || '').toLowerCase() === 'pago')
  const parcelasPendentes = parcelas.filter((parcela) => String(parcela.status || '').toLowerCase() !== 'pago')
  const proximaPendente = parcelasPendentes
    .filter((parcela) => parcela.dataVencimento)
    .sort((a, b) => new Date(a.dataVencimento).getTime() - new Date(b.dataVencimento).getTime())[0]

  return {
    financiamentos,
    totais: {
      parcelasPagas: parcelasPagas.length,
      parcelasPendentes: parcelasPendentes.length,
      totalParcelas: parcelas.length,
      valorPago: parcelas.reduce((total, parcela) => total + Number(parcela.valorPago || 0), 0),
      valorRestante: parcelasPendentes.reduce((total, parcela) => total + Number(parcela.valor || 0), 0),
      valorTotalFinanciado: financiamentos.reduce((total, financiamento) => total + Number(financiamento.valorFinanciado || 0), 0),
    },
    proximoVencimento: proximaPendente
      ? {
          data: proximaPendente.dataVencimento,
          valor: proximaPendente.valor,
          numeroParcela: proximaPendente.numeroParcela,
        }
      : null,
  }
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

function formatMediaSendFailure(errorMessage: string) {
  const normalized = errorMessage.toLowerCase()

  if (
    normalized.includes('"exists":false')
    || normalized.includes('exists:false')
    || normalized.includes('number exists false')
  ) {
    return 'Nao foi possivel enviar a imagem porque o telefone cadastrado nao existe no WhatsApp. Confira o numero do cliente.'
  }

  if (normalized.includes('invalid media payload')) {
    return 'Nao foi possivel enviar a imagem porque o anexo foi recusado antes do envio.'
  }

  if (normalized.includes('connection closed')) {
    return 'O WhatsApp da loja esta temporariamente indisponivel para envio de arquivos. Nenhum arquivo foi enviado. Tente novamente em alguns instantes.'
  }

  if (normalized.includes('evolution media send failed')) {
    return 'Nao foi possivel enviar a imagem pelo WhatsApp da loja. Tente novamente em alguns instantes.'
  }

  return 'Nao foi possivel enviar o arquivo. Nenhum anexo foi enviado.'
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
      message: 'A imagem nao foi enviada porque o WhatsApp da loja nao esta conectado.',
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

    if (automationResult.retryScheduled) {
      return {
        success: false,
        routeUsed: 'vps',
        message: 'A primeira tentativa falhou. Se o arquivo não for enviado em 20 segundos, tente novamente.',
        outboundMessageId: outbound.id,
        fallbackReason: 'send_failed',
        shouldOpenExternal: false,
      }
    }

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
      message: formatMediaSendFailure(errorMessage),
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

async function getStoreDocumentProfile(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  storeId: number
) {
  const { data: store, error: storeError } = await (supabaseAdmin.from('stores') as any)
    .select('name, razao_social, phone, whatsapp, email, cep, street, number, neighborhood, city, state, settings')
    .eq('id', storeId)
    .maybeSingle()

  if (storeError) throw storeError
  if (!store?.name) {
    throw new Error('Loja nao encontrada para montar o documento.')
  }

  const storeSettings = (store.settings && typeof store.settings === 'object')
    ? (store.settings as { logo?: unknown })
    : null

  return {
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
  }
}

export async function sendCustomerFinancialSummaryWhatsApp(
  input: SendCustomerFinancialSummaryWhatsAppInput
): Promise<SendManualWhatsAppResult> {
  const storeId = Number(input.storeId)
  const customerId = Number(input.customerId)

  try {
    if (!Number.isInteger(storeId) || storeId <= 0 || !Number.isInteger(customerId) || customerId <= 0) {
      return {
        success: false,
        routeUsed: 'external_fallback',
        message: 'Loja ou cliente invalido.',
        shouldOpenExternal: false,
      }
    }

    const { supabaseAdmin } = await getSendContext(storeId)
    const { data: customer, error: customerError } = await (supabaseAdmin.from('customers') as any)
      .select('id, store_id, full_name, phone, fone_movel')
      .eq('id', customerId)
      .eq('store_id', storeId)
      .maybeSingle()

    if (customerError) throw customerError
    if (!customer) {
      return {
        success: false,
        routeUsed: 'external_fallback',
        message: 'Cliente nao encontrado nesta loja.',
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

    const financialData = await getCustomerFinancialSummary(customerId, storeId)
    const selectedFinancialData = getSelectedFinancialSummary(financialData, input.financingIds)
    if (!selectedFinancialData || selectedFinancialData.totais.totalParcelas === 0) {
      return {
        success: false,
        routeUsed: 'external_fallback',
        message: input.financingIds === undefined
          ? 'Nenhum financiamento encontrado para este cliente.'
          : 'Selecione ao menos uma venda para enviar.',
        shouldOpenExternal: false,
      }
    }

    const storeProfile = await getStoreDocumentProfile(supabaseAdmin, storeId)
    const isPartialSelection = selectedFinancialData.financiamentos.length < financialData.financiamentos.length
    const imageBuffers = await generateCustomerFinancialSummaryImages({
      customerName: customer.full_name || 'Cliente',
      store: storeProfile,
      selectionNote: isPartialSelection
        ? `Resumo parcial: ${selectedFinancialData.financiamentos.length} de ${financialData.financiamentos.length} vendas selecionadas.`
        : undefined,
      totals: selectedFinancialData.totais,
      nextDue: selectedFinancialData.proximoVencimento,
      financiamentos: selectedFinancialData.financiamentos,
    })
    const firstName = String(customer.full_name || '').trim().split(/\s+/)[0] || 'cliente'
    let lastResult: SendManualWhatsAppResult | null = null

    for (let index = 0; index < imageBuffers.length; index += 1) {
      const isMultiPage = imageBuffers.length > 1
      const pageSuffix = isMultiPage ? ` (${index + 1}/${imageBuffers.length})` : ''
      const result = await sendManualWhatsAppMediaWithContext({
        storeId,
        remotePhone,
        mediaType: 'image',
        mimeType: 'image/png',
        fileName: `financeiro-cliente-${customerId}-${index + 1}.png`,
        fileBase64: imageBuffers[index].toString('base64'),
        caption: `Ola, ${firstName}! Segue o detalhamento financeiro atualizado${pageSuffix}.`,
        messageType: 'document_attachment',
        source: 'customer_history.financial_image_button',
        metadata: {
          customerId,
          financingIds: selectedFinancialData.financiamentos.map((financiamento) => financiamento.id),
          documentType: 'customer_financial_summary',
          mediaFormat: 'png',
          pageIndex: index + 1,
          pageCount: imageBuffers.length,
        },
      }, supabaseAdmin)

      if (!result.success) {
        return result
      }

      lastResult = result
    }

    return lastResult || {
      success: false,
      routeUsed: 'external_fallback',
      message: 'Nao foi possivel gerar a imagem financeira.',
      shouldOpenExternal: false,
    }
  } catch (error) {
    console.error('[Manual WhatsApp] Failed to send customer financial summary:', error)
    return {
      success: false,
      routeUsed: 'external_fallback',
      message: formatActionError(error, 'Nao foi possivel gerar ou enviar a imagem financeira.'),
      fallbackReason: 'unexpected_error',
      shouldOpenExternal: false,
    }
  }
}

export async function sendCustomerPrescriptionSummaryWhatsApp(
  input: SendCustomerPrescriptionSummaryWhatsAppInput
): Promise<SendManualWhatsAppResult> {
  const storeId = Number(input.storeId)
  const customerId = Number(input.customerId)
  const requestedGroupId = String(input.prescriptionGroupId || 'titular').trim() || 'titular'

  try {
    if (!Number.isInteger(storeId) || storeId <= 0 || !Number.isInteger(customerId) || customerId <= 0) {
      return {
        success: false,
        routeUsed: 'external_fallback',
        message: 'Loja ou cliente invalido.',
        shouldOpenExternal: false,
      }
    }

    const { supabaseAdmin } = await getSendContext(storeId)
    const { data: customer, error: customerError } = await (supabaseAdmin.from('customers') as any)
      .select('id, store_id, full_name, phone, fone_movel')
      .eq('id', customerId)
      .eq('store_id', storeId)
      .maybeSingle()

    if (customerError) throw customerError
    if (!customer) {
      return {
        success: false,
        routeUsed: 'external_fallback',
        message: 'Cliente nao encontrado nesta loja.',
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

    const groups = await getCustomerPrescriptionSummary(customerId, storeId)
    const selectedGroup = groups.find((group) => group.id === requestedGroupId) || groups[0] || null
    if (!selectedGroup || selectedGroup.receitas.length === 0) {
      return {
        success: false,
        routeUsed: 'external_fallback',
        message: 'Nenhuma receita encontrada para esta selecao.',
        shouldOpenExternal: false,
      }
    }

    const storeProfile = await getStoreDocumentProfile(supabaseAdmin, storeId)
    const imageBuffer = await generateCustomerPrescriptionSummaryImage({
      customerName: customer.full_name || 'Cliente',
      subjectLabel: selectedGroup.dependenteId === null
        ? customer.full_name || 'Titular'
        : selectedGroup.label || 'Dependente',
      store: storeProfile,
      prescriptions: selectedGroup.receitas,
    })
    const firstName = String(customer.full_name || '').trim().split(/\s+/)[0] || 'cliente'

    return await sendManualWhatsAppMediaWithContext({
      storeId,
      remotePhone,
      mediaType: 'image',
      mimeType: 'image/png',
      fileName: `receitas-cliente-${customerId}-${selectedGroup.id}.png`,
      fileBase64: imageBuffer.toString('base64'),
      caption: `Ola, ${firstName}! Segue o detalhamento das receitas registradas.`,
      messageType: 'document_attachment',
      source: 'customer_history.prescription_image_button',
      metadata: {
        customerId,
        prescriptionGroupId: selectedGroup.id,
        documentType: 'customer_prescription_summary',
        mediaFormat: 'png',
      },
    }, supabaseAdmin)
  } catch (error) {
    console.error('[Manual WhatsApp] Failed to send customer prescription summary:', error)
    return {
      success: false,
      routeUsed: 'external_fallback',
      message: formatActionError(error, 'Nao foi possivel gerar ou enviar a imagem das receitas.'),
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
    if (!installment?.financiamento_id) {
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

    const { data: installmentPayments, error: paymentsError } = await (supabaseAdmin.from('pagamentos') as any)
      .select('valor_pago, created_at, data_pagamento')
      .eq('parcela_id', installmentId)

    if (paymentsError) throw paymentsError
    if (installment.status !== 'Pago' && (!installmentPayments || installmentPayments.length === 0)) {
      return {
        success: false,
        routeUsed: 'external_fallback',
        message: 'Parcela paga nao encontrada nesta loja.',
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

    const storeProfile = await getStoreDocumentProfile(supabaseAdmin, storeId)
    const pdfBuffer = await generateInstallmentReceiptPDF({
      customerName: customer.full_name,
      installmentNumber: installment.numero_parcela,
      totalInstallments: totalInstallments || 1,
      amount: (() => {
        const receivedAmount = (installmentPayments || []).reduce(
          (total: number, payment: any) => total + Number(payment.valor_pago || 0),
          0
        )
        return receivedAmount > 0 ? Number(receivedAmount.toFixed(2)) : installment.valor_parcela
      })(),
      dueDate: installment.data_vencimento,
      paymentDate: installment.data_pagamento || installmentPayments?.[installmentPayments.length - 1]?.data_pagamento || installmentPayments?.[installmentPayments.length - 1]?.created_at || new Date().toISOString(),
      isReprint: Boolean(installment.receipt_printed_at),
      store: storeProfile,
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

export async function sendSalePaymentReceiptWhatsApp(
  input: SendSalePaymentReceiptWhatsAppInput
): Promise<SendManualWhatsAppResult> {
  const storeId = Number(input.storeId)
  const paymentId = Number(input.paymentId)

  try {
    if (!Number.isInteger(storeId) || storeId <= 0 || !Number.isInteger(paymentId) || paymentId <= 0) {
      return {
        success: false,
        routeUsed: 'external_fallback',
        message: 'Loja ou pagamento invalido.',
        shouldOpenExternal: false,
      }
    }

    const { supabaseAdmin } = await getSendContext(storeId)
    const { data: payment, error: paymentError } = await (supabaseAdmin.from('pagamentos') as any)
      .select('*')
      .eq('id', paymentId)
      .eq('store_id', storeId)
      .maybeSingle()

    if (paymentError) throw paymentError
    if (!payment?.venda_id) {
      return {
        success: false,
        routeUsed: 'external_fallback',
        message: 'Pagamento nao encontrado nesta loja.',
        shouldOpenExternal: false,
      }
    }

    const [{ data: sale, error: saleError }, { data: payments, error: paymentsError }] = await Promise.all([
      (supabaseAdmin.from('vendas') as any)
        .select('id, store_id, customer_id')
        .eq('id', payment.venda_id)
        .eq('store_id', storeId)
        .maybeSingle(),
      (supabaseAdmin.from('pagamentos') as any)
        .select('id, created_at, data_pagamento')
        .eq('venda_id', payment.venda_id)
        .eq('store_id', storeId)
        .order('data_pagamento', { ascending: true })
        .order('created_at', { ascending: true }),
    ])

    if (saleError) throw saleError
    if (paymentsError) throw paymentsError
    if (!sale?.customer_id) {
      return {
        success: false,
        routeUsed: 'external_fallback',
        message: 'Venda sem cliente cadastrado nesta loja.',
        shouldOpenExternal: false,
      }
    }

    const { data: customer, error: customerError } = await (supabaseAdmin.from('customers') as any)
      .select('id, store_id, full_name, phone, fone_movel')
      .eq('id', sale.customer_id)
      .eq('store_id', storeId)
      .maybeSingle()

    if (customerError) throw customerError
    if (!customer) {
      return {
        success: false,
        routeUsed: 'external_fallback',
        message: 'Cliente do pagamento nao encontrado nesta loja.',
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

    const orderedPayments = Array.isArray(payments) ? payments : []
    const paymentIndex = orderedPayments.findIndex((item) => item.id === paymentId)
    const paymentOrdinal = paymentIndex >= 0 ? paymentIndex + 1 : 1
    const totalPayments = orderedPayments.length || 1
    const paymentDate = payment.data_pagamento || payment.created_at || new Date().toISOString()
    const paymentDateLabel = paymentDate ? new Date(paymentDate).toLocaleDateString('pt-BR') : '-'

    const storeProfile = await getStoreDocumentProfile(supabaseAdmin, storeId)
    const pdfBuffer = await generateInstallmentReceiptPDF({
      customerName: customer.full_name,
      installmentNumber: paymentOrdinal,
      totalInstallments: totalPayments,
      amount: payment.valor_pago,
      dueDate: paymentDate,
      paymentDate,
      isReprint: Boolean(payment.receipt_printed_at),
      receiptTitle: 'RECIBO DE PAGAMENTO',
      referenceLabel: 'PAGAMENTO',
      referenceValue: `${paymentOrdinal} de ${totalPayments}`,
      declarationText: `Recebemos de ${customer.full_name || 'Consumidor Final'} a importancia de ${Number(payment.valor_pago || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}, referente ao pagamento registrado em ${paymentDateLabel} para a venda #${payment.venda_id}.`,
      footerNote: 'Documento nao fiscal emitido para comprovacao deste pagamento.',
      store: storeProfile,
    })
    const firstName = String(customer.full_name || '').trim().split(/\s+/)[0] || 'cliente'

    return await sendManualWhatsAppMediaWithContext({
      storeId,
      remotePhone,
      mediaType: 'pdf',
      mimeType: 'application/pdf',
      fileName: `recibo-pagamento-${paymentId}.pdf`,
      fileBase64: pdfBuffer.toString('base64'),
      caption: `Ola, ${firstName}! Segue o recibo deste pagamento.`,
      messageType: 'document_attachment',
      source: 'sale_payment.receipt_button',
      metadata: {
        paymentId,
        saleId: payment.venda_id,
        customerId: customer.id,
        documentType: 'sale_payment_receipt',
      },
    }, supabaseAdmin)
  } catch (error) {
    console.error('[Manual WhatsApp] Failed to send sale payment receipt:', error)
    return {
      success: false,
      routeUsed: 'external_fallback',
      message: formatActionError(error, 'Nao foi possivel gerar ou enviar o recibo do pagamento.'),
      fallbackReason: 'unexpected_error',
      shouldOpenExternal: false,
    }
  }
}
