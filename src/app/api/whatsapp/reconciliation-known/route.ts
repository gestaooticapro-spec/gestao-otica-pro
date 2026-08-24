import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { isValidWhatsAppInternalRequest } from '@/lib/whatsapp/internal-auth'

export const runtime = 'nodejs'

const RequestSchema = z.object({
  instanceKey: z.string().trim().min(1).max(120),
  providerMessageIds: z.array(z.string().trim().min(1).max(255)).max(500),
})

export async function POST(request: Request) {
  if (!isValidWhatsAppInternalRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsed = RequestSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data: channel, error: channelError } = await (supabase.from('whatsapp_store_channels') as any)
    .select('id')
    .eq('instance_key', parsed.data.instanceKey)
    .maybeSingle()
  if (channelError) throw channelError
  if (!channel) return NextResponse.json({ error: 'Unknown instance' }, { status: 404 })

  if (parsed.data.providerMessageIds.length === 0) {
    return NextResponse.json({ knownProviderMessageIds: [] })
  }

  const { data: inbounds, error } = await (supabase.from('whatsapp_inbound_messages') as any)
    .select('id, provider_message_id, status, created_at')
    .eq('channel_id', channel.id)
    .in('provider_message_id', parsed.data.providerMessageIds)
  if (error) throw error

  const { data: audited, error: auditedError } = await (supabase.from('whatsapp_webhook_events') as any)
    .select('provider_message_id')
    .eq('channel_id', channel.id)
    .eq('processing_status', 'forwarded')
    .in('provider_message_id', parsed.data.providerMessageIds)
  if (auditedError) throw auditedError

  const inboundIds = (inbounds || []).map((row: { id: number }) => row.id)
  const { data: pendingReplies, error: pendingError } = inboundIds.length
    ? await (supabase.from('whatsapp_outbound_messages') as any)
      .select('id, inbound_message_id, remote_phone, message_text')
      .eq('channel_id', channel.id)
      .eq('status', 'pending')
      .in('inbound_message_id', inboundIds)
    : { data: [], error: null }
  if (pendingError) throw pendingError

  const providerIdByInboundId = new Map(
    (inbounds || []).map((row: { id: number; provider_message_id: string }) => [row.id, row.provider_message_id])
  )
  const staleReceivedCutoff = Date.now() - 90_000
  const knownIds = new Set([
    ...(inbounds || [])
      .filter((row: { status: string; created_at: string }) => (
        row.status !== 'received' || new Date(row.created_at).getTime() >= staleReceivedCutoff
      ))
      .map((row: { provider_message_id: string }) => row.provider_message_id),
    ...(audited || []).map((row: { provider_message_id: string }) => row.provider_message_id),
  ])

  return NextResponse.json({
    knownProviderMessageIds: [...knownIds],
    pendingReplies: (pendingReplies || []).map((row: {
      id: number
      inbound_message_id: number
      remote_phone: string
      message_text: string
    }) => ({
      outboundMessageId: row.id,
      providerMessageId: providerIdByInboundId.get(row.inbound_message_id),
      phone: row.remote_phone,
      replyText: row.message_text,
    })),
  })
}
