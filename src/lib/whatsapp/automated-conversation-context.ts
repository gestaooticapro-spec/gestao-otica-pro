import type { Json } from '@/lib/database.types'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPhoneVariants, phonesMatch } from './phone'

type StateRow = {
  id: number
  remote_phone: string
  state: string
  handoff_pending?: boolean | null
  expires_at: string
  updated_at: string
  metadata: Json | null
}

type Metadata = Record<string, Json | undefined>

function asMetadata(value: Json | null | undefined): Metadata {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Metadata
    : {}
}

function activeContext(rows: StateRow[], key: 'postSaleContext' | 'paymentReminderContext', sentAtMs: number) {
  for (const row of rows) {
    if (Date.parse(row.expires_at) <= sentAtMs) continue
    const value = asMetadata(row.metadata)[key]
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue
    if (key === 'paymentReminderContext') {
      const context = asMetadata(value)
      const expiresAt = typeof context.expiresAt === 'string'
        ? Date.parse(context.expiresAt)
        : Date.parse(row.updated_at) + 48 * 60 * 60 * 1000
      if (!Number.isFinite(expiresAt) || expiresAt <= sentAtMs) continue
      return { ...context, expiresAt: new Date(expiresAt).toISOString() } as Json
    }
    return value
  }
  return undefined
}

export function buildAutomatedConversationState(input: {
  rows: StateRow[]
  sentAtIso: string
  retentionMs: number
  messageText: string
  metadata: Metadata
}) {
  const sentAtMs = Date.parse(input.sentAtIso)
  const rows = [...input.rows].sort((left, right) =>
    Date.parse(right.updated_at) - Date.parse(left.updated_at)
  )
  const latest = rows[0]
  const metadata: Metadata = { ...asMetadata(latest?.metadata) }
  const postSaleContext = activeContext(rows, 'postSaleContext', sentAtMs)
  const paymentReminderContext = activeContext(rows, 'paymentReminderContext', sentAtMs)
  if (postSaleContext) metadata.postSaleContext = postSaleContext
  if (paymentReminderContext) metadata.paymentReminderContext = paymentReminderContext

  // Uma saída automática substitui a pausa operacional, mas mantém os assuntos
  // anteriores como memória. A identidade do último assunto não vira a do contato.
  delete metadata.humanActivityAt
  delete metadata.handoffResolvedByOperator
  delete metadata.lastKnownCustomerId
  delete metadata.lastKnownServiceOrderId
  delete metadata.paymentInstallmentHint
  delete metadata.lastIntent
  delete metadata.lastIntentConfidence
  delete metadata.lastInboundText
  delete metadata.lastInboundHasAttachment
  delete metadata.lastInboundAttachmentKind
  delete metadata.preview
  Object.assign(metadata, input.metadata)

  const history = rows
    .flatMap((row) => {
      const messages = asMetadata(row.metadata).aiSessionMessages
      return Array.isArray(messages) ? messages : []
    })
    .filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))
    .filter((entry, index, all) => all.findIndex((other) =>
      JSON.stringify(other) === JSON.stringify(entry)
    ) === index)
    .sort((left, right) => Date.parse(String(asMetadata(left).at)) - Date.parse(String(asMetadata(right).at)))
    .slice(-7)
  const last = asMetadata(history.at(-1) as Json | undefined)
  if (last.text !== input.messageText || last.at !== input.sentAtIso) {
    history.push({ role: 'assistant', text: input.messageText, at: input.sentAtIso })
  }
  metadata.aiSessionMessages = history.slice(-8) as Json
  metadata.aiSessionUpdatedAt = input.sentAtIso

  const previousExpiry = rows
    .filter((row) => row.state !== 'human_pause')
    .reduce((max, row) => Math.max(max, Date.parse(row.expires_at) || 0), 0)
  return {
    state: 'ai_session' as const,
    metadata: metadata as Json,
    expires_at: new Date(Math.max(sentAtMs + input.retentionMs, previousExpiry)).toISOString(),
    updated_at: input.sentAtIso,
    handoff_pending: rows.some((row) => row.handoff_pending === true),
  }
}

export function hasNewerConversationState(rows: StateRow[], sentAtIso: string) {
  return rows.some((row) => Date.parse(row.updated_at) > Date.parse(sentAtIso))
}

export async function recordAutomatedOutboundConversationContext(input: {
  tenantId: string
  storeId: number
  channelId: number
  remotePhone: string
  sentAtIso: string
  retentionMs: number
  messageText: string
  metadata: Metadata
}, supabase: ReturnType<typeof createAdminClient> = createAdminClient()) {
  const variants = [...getPhoneVariants(input.remotePhone)]
  if (!variants.length) throw new Error('Telefone de contexto automático inválido.')

  const { data, error } = await (supabase.from('whatsapp_conversation_states') as any)
    .select('id, remote_phone, state, handoff_pending, expires_at, updated_at, metadata')
    .eq('channel_id', input.channelId)
    .in('remote_phone', variants)
  if (error) throw error

  const rows = ((data ?? []) as StateRow[])
    .filter((row) => phonesMatch(row.remote_phone, input.remotePhone))
  // Uma mensagem humana confirmada depois do envio mantém a pausa.
  if (hasNewerConversationState(rows, input.sentAtIso)) {
    console.info('[whatsapp_automated_context]', JSON.stringify({
      channelId: input.channelId, outcome: 'newer_state_preserved',
    }))
    return false
  }

  const values = buildAutomatedConversationState({
    rows,
    sentAtIso: input.sentAtIso,
    retentionMs: input.retentionMs,
    messageText: input.messageText,
    metadata: input.metadata,
  })
  if (rows.length) {
    const { data: updated, error: updateError } = await (supabase.from('whatsapp_conversation_states') as any)
      .update(values)
      .in('id', rows.map((row) => row.id))
      .lte('updated_at', input.sentAtIso)
      .select('id')
    if (updateError) throw updateError
    console.info('[whatsapp_automated_context]', JSON.stringify({
      channelId: input.channelId, outcome: updated?.length ? 'updated' : 'concurrent_update_preserved',
      matchedStates: rows.length, updatedStates: updated?.length ?? 0,
    }))
    return Boolean(updated?.length)
  }

  const { error: insertError } = await (supabase.from('whatsapp_conversation_states') as any)
    .insert({
      tenant_id: input.tenantId,
      store_id: input.storeId,
      channel_id: input.channelId,
      remote_phone: input.remotePhone,
      ...values,
    })
  if (insertError?.code === '23505') return false
  if (insertError) throw insertError
  console.info('[whatsapp_automated_context]', JSON.stringify({
    channelId: input.channelId, outcome: 'created', matchedStates: 0, updatedStates: 1,
  }))
  return true
}
