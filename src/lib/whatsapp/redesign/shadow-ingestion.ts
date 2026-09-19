import type { Json } from '@/lib/database.types'
import { createAdminClient } from '@/lib/supabase/admin'
import type { StoreSettings, WhatsAppAutomationSettings } from '@/lib/store-modules'
import { extractWhatsAppInboundPayloadMeta } from '../inbound-payload'
import {
  WhatsAppConversationMessageKindSchema,
  WhatsAppRedesignModeSchema,
  type WhatsAppConversationMessageKind,
  type WhatsAppConversationRole,
  type WhatsAppRedesignMode,
} from './contracts'
import {
  buildTurnDraft,
  toConversationMessage,
  type WhatsAppConversationIdentity,
  type WhatsAppConversationTurnDraft,
  type WhatsAppStoredMessageInput,
  type WhatsAppStoredMessageRow,
} from './persistence'
import { WhatsAppRedesignConversationStore } from './store'

export type WhatsAppShadowChannel = {
  id: number
  tenant_id: string
  store_id: number
}

export type WhatsAppShadowInboundInput = {
  channel: WhatsAppShadowChannel
  remotePhone: string
  providerMessageId: string
  messageText: string | null
  providerCreatedAt: string | null
  payload?: Json
}

export type WhatsAppShadowOutboundInput = {
  channel: WhatsAppShadowChannel
  outboundMessageId: number
  remotePhone: string
  providerMessageId: string | null
  messageText: string
  messageType: string
  payload?: Json | null
  sentAt: string
}

type AggregatedMessage = {
  providerMessageId?: unknown
  messageText?: unknown
  attachmentKind?: unknown
  receivedAt?: unknown
}

export type WhatsAppShadowTurnEnvelope = {
  turnKey: string
  draft: WhatsAppConversationTurnDraft
  metadata: Record<string, unknown>
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function normalizedText(value: unknown) {
  const text = typeof value === 'string' ? value.trim() : ''
  return text ? text.slice(0, 4000) : null
}

function normalizedDate(value: unknown, fallback: string) {
  if (typeof value === 'string' && Number.isFinite(Date.parse(value))) {
    return new Date(value).toISOString()
  }
  return new Date(fallback).toISOString()
}

function normalizedKind(value: unknown): WhatsAppConversationMessageKind {
  const parsed = WhatsAppConversationMessageKindSchema.safeParse(value)
  return parsed.success ? parsed.data : 'unknown'
}

export function resolveWhatsAppRedesignMode(
  settings: WhatsAppAutomationSettings | null | undefined
): WhatsAppRedesignMode {
  const parsed = WhatsAppRedesignModeSchema.safeParse(settings?.ai_redesign?.mode)
  return parsed.success ? parsed.data : 'legacy'
}

export function extractShadowInboundMessages(
  input: Omit<WhatsAppShadowInboundInput, 'channel' | 'remotePhone'>
): WhatsAppStoredMessageInput[] {
  const fallbackAt = normalizedDate(input.providerCreatedAt, new Date().toISOString())
  const payload = asRecord(input.payload)
  const aggregated = payload?.aggregated === true && Array.isArray(payload.messages)

  if (aggregated) {
    return (payload.messages as AggregatedMessage[]).flatMap((candidate) => {
      const providerMessageId = normalizedText(candidate.providerMessageId)
      if (!providerMessageId) return []
      const kind = candidate.attachmentKind ? normalizedKind(candidate.attachmentKind) : 'text'
      return [{
        sourceKey: `provider:${providerMessageId}`,
        providerMessageId,
        role: 'customer' as const,
        kind,
        text: normalizedText(candidate.messageText),
        occurredAt: normalizedDate(candidate.receivedAt, fallbackAt),
        metadata: {
          aggregated: true,
          attachmentKind: candidate.attachmentKind ?? null,
        },
      }]
    })
  }

  const meta = extractWhatsAppInboundPayloadMeta(input.payload)
  const kind = meta.hasAttachment ? normalizedKind(meta.attachmentKind) : 'text'
  return [{
    sourceKey: `provider:${input.providerMessageId}`,
    providerMessageId: input.providerMessageId,
    role: 'customer',
    kind,
    text: normalizedText(input.messageText) || meta.caption || meta.text,
    occurredAt: fallbackAt,
    metadata: {
      aggregated: false,
      hasAttachment: meta.hasAttachment,
      attachmentKind: meta.attachmentKind,
      mimeType: meta.mimeType,
      fileName: meta.fileName,
    },
  }]
}

export function inferShadowOutboundRole(
  messageType: string,
  payload: Json | null | undefined
): WhatsAppConversationRole {
  const record = asRecord(payload)
  const sentBy = normalizedText(record?.sentBy)?.toLowerCase()
  if (
    sentBy === 'operator'
    || record?.manual === true
    || messageType.startsWith('operator_')
  ) {
    return 'human'
  }
  return 'assistant'
}

export function buildShadowInboundTurn(
  providerMessageId: string,
  storedMessages: WhatsAppStoredMessageRow[],
  payload?: Json
): WhatsAppShadowTurnEnvelope {
  const payloadRecord = asRecord(payload)
  const isAggregated = payloadRecord?.aggregated === true
  const rawWindowMs = isAggregated ? Number(payloadRecord?.aggregationWindowMs) : 0
  const aggregationWindowMs = Number.isFinite(rawWindowMs)
    ? Math.max(0, Math.min(120_000, Math.floor(rawWindowMs)))
    : 0
  const messages = storedMessages.map(toConversationMessage)
  const lastOccurredAtMs = messages.reduce(
    (latest, message) => Math.max(latest, Date.parse(message.occurredAt)),
    0
  )
  const draft = buildTurnDraft(
    messages,
    new Date(lastOccurredAtMs + aggregationWindowMs).toISOString()
  )

  return {
    turnKey: `inbound:${providerMessageId}`,
    draft,
    metadata: {
      source: isAggregated ? 'whatsapp-automation-buffer' : 'direct-inbound',
      aggregated: isAggregated,
      aggregationWindowMs,
      messageCount: draft.messageIds.length,
    },
  }
}

async function loadMode(storeId: number): Promise<WhatsAppRedesignMode> {
  const supabase = createAdminClient()
  const { data, error } = await (supabase.from('stores') as any)
    .select('settings')
    .eq('id', storeId)
    .single()
  if (error) throw error

  const settings = ((data?.settings || {}) as StoreSettings) || {}
  return resolveWhatsAppRedesignMode(settings.whatsapp_automation)
}

function identity(
  channel: WhatsAppShadowChannel,
  remotePhone: string,
  mode: WhatsAppRedesignMode
): WhatsAppConversationIdentity {
  return {
    tenantId: channel.tenant_id,
    storeId: channel.store_id,
    channelId: channel.id,
    remotePhone,
    mode,
  }
}

export async function runFailOpenShadowCapture<T>(
  operation: () => Promise<T>,
  onError: (error: unknown) => void = (error) => {
    console.error('[WhatsApp redesign shadow] Falha de captura; fluxo legado preservado:', error)
  }
): Promise<{ success: true; value: T } | { success: false }> {
  try {
    return { success: true, value: await operation() }
  } catch (error) {
    onError(error)
    return { success: false }
  }
}

export async function captureWhatsAppShadowInbound(input: WhatsAppShadowInboundInput) {
  const result = await runFailOpenShadowCapture(async () => {
    const mode = await loadMode(input.channel.store_id)
    if (mode === 'legacy') return { captured: false, reason: 'legacy_mode' as const }

    const store = new WhatsAppRedesignConversationStore()
    const messages = extractShadowInboundMessages(input)
    const storedMessages: Array<WhatsAppStoredMessageRow & { conversation_id: number }> = []
    for (const message of messages) {
      storedMessages.push(await store.recordMessage(identity(input.channel, input.remotePhone, mode), message))
    }
    const turn = buildShadowInboundTurn(input.providerMessageId, storedMessages, input.payload)
    const turnId = await store.createReadyTurn({
      conversationId: storedMessages[0].conversation_id,
      turnKey: turn.turnKey,
      draft: turn.draft,
      metadata: turn.metadata,
    })
    return { captured: true, count: messages.length, turnId }
  })
  return result.success ? result.value : { captured: false, reason: 'capture_failed' as const }
}

export async function captureWhatsAppShadowOutbound(input: WhatsAppShadowOutboundInput) {
  const result = await runFailOpenShadowCapture(async () => {
    const mode = await loadMode(input.channel.store_id)
    if (mode === 'legacy') return { captured: false, reason: 'legacy_mode' as const }

    const store = new WhatsAppRedesignConversationStore()
    await store.recordMessage(identity(input.channel, input.remotePhone, mode), {
      sourceKey: `outbound:${input.outboundMessageId}`,
      providerMessageId: input.providerMessageId,
      role: inferShadowOutboundRole(input.messageType, input.payload),
      kind: 'text',
      text: input.messageText,
      occurredAt: input.sentAt,
      metadata: {
        messageType: input.messageType,
        deliveryStatus: 'sent',
      },
    })
    return { captured: true, count: 1 }
  })
  return result.success ? result.value : { captured: false, reason: 'capture_failed' as const }
}
