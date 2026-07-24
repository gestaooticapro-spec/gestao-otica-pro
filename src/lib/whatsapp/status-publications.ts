import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/database.types'

type Channel = {
  id: number
  tenant_id: string
  store_id: number
}

export type WhatsAppStatusPublication = {
  id: number
  provider_message_id: string
  message_text: string | null
  media_kind: string | null
  published_at: string
  expires_at: string
  context_category: string | null
  context_description: string | null
  response_guidance: string | null
  auto_reply_enabled: boolean
  contextualized_at: string | null
}

async function findChannel(instanceKey: string): Promise<Channel | null> {
  const supabase = createAdminClient()
  const { data, error } = await (supabase.from('whatsapp_store_channels') as any)
    .select('id, tenant_id, store_id')
    .eq('provider', 'evolution')
    .eq('instance_key', instanceKey)
    .eq('is_active', true)
    .maybeSingle()

  if (error) throw error
  return data ?? null
}

export async function registerWhatsAppStatusPublication(input: {
  instanceKey: string
  providerMessageId: string
  messageText?: string
  mediaKind?: string | null
  publishedAt?: string
  payload?: Json | null
}) {
  const channel = await findChannel(input.instanceKey)
  if (!channel) return { success: false, reason: 'channel_not_found' as const }

  const providerMessageId = input.providerMessageId.trim()
  if (!providerMessageId) return { success: false, reason: 'invalid_message_id' as const }

  const publishedAt = input.publishedAt && !Number.isNaN(Date.parse(input.publishedAt))
    ? new Date(input.publishedAt)
    : new Date()
  const expiresAt = new Date(publishedAt.getTime() + 24 * 60 * 60 * 1000)
  const supabase = createAdminClient()

  const { data, error } = await (supabase.from('whatsapp_status_publications') as any)
    .upsert({
      tenant_id: channel.tenant_id,
      store_id: channel.store_id,
      channel_id: channel.id,
      provider_message_id: providerMessageId,
      message_text: input.messageText?.trim() || null,
      media_kind: input.mediaKind?.trim() || null,
      payload: input.payload ?? null,
      published_at: publishedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
    }, {
      onConflict: 'channel_id,provider_message_id',
    })
    .select('id')
    .single()

  if (error) throw error
  return { success: true, publicationId: Number(data.id) }
}

export async function findWhatsAppStatusPublication(
  channelId: number,
  providerMessageId: string | null | undefined
): Promise<WhatsAppStatusPublication | null> {
  const referenceId = String(providerMessageId || '').trim()
  if (!referenceId) return null

  const supabase = createAdminClient()
  const { data, error } = await (supabase.from('whatsapp_status_publications') as any)
    .select('id, provider_message_id, message_text, media_kind, published_at, expires_at, context_category, context_description, response_guidance, auto_reply_enabled, contextualized_at')
    .eq('channel_id', channelId)
    .eq('provider_message_id', referenceId)
    .maybeSingle()

  if (error) throw error
  return data ?? null
}

export function buildWhatsAppStatusContextLine(publication: WhatsAppStatusPublication) {
  const publishedContent = publication.message_text?.replace(/\s+/g, ' ').trim().slice(0, 500)
    || (publication.media_kind ? `publicacao em ${publication.media_kind} sem legenda` : 'publicacao sem texto legivel')
  const description = publication.context_description?.replace(/\s+/g, ' ').trim().slice(0, 800)
  const guidance = publication.response_guidance?.replace(/\s+/g, ' ').trim().slice(0, 500)

  return [
    `STATUS_DA_LOJA_REFERENCIADO: ${publishedContent}`,
    publication.context_category ? `OBJETIVO_DO_STATUS: ${publication.context_category}` : null,
    description ? `DESCRICAO_DA_EQUIPE: ${description}` : null,
    guidance ? `ORIENTACAO_DE_RESPOSTA: ${guidance}` : null,
  ].filter(Boolean).join(' | ')
}

export async function countPendingWhatsAppStatusContexts(storeId: number) {
  const supabase = createAdminClient()
  const { count, error } = await (supabase.from('whatsapp_status_publications') as any)
    .select('id', { count: 'exact', head: true })
    .eq('store_id', storeId)
    .is('contextualized_at', null)
    .gt('expires_at', new Date().toISOString())

  if (error) throw error
  return Number(count || 0)
}
