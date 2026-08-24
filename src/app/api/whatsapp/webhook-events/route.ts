import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { isValidWhatsAppInternalRequest } from '@/lib/whatsapp/internal-auth'

export const runtime = 'nodejs'

const RequestSchema = z.object({
  instanceKey: z.string().trim().min(1).max(120),
  providerMessageId: z.string().trim().min(1).max(255),
  phone: z.string().trim().min(8).max(30).nullable().optional(),
  eventName: z.string().trim().min(1).max(80).default('messages.upsert'),
  source: z.enum(['webhook', 'reconciliation']),
  providerCreatedAt: z.string().datetime().nullable().optional(),
  processingStatus: z.enum(['received', 'forwarded', 'failed']).default('received'),
  errorMessage: z.string().max(2000).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
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
    .select('id, tenant_id, store_id')
    .eq('instance_key', parsed.data.instanceKey)
    .maybeSingle()

  if (channelError) throw channelError
  if (!channel) return NextResponse.json({ error: 'Unknown instance' }, { status: 404 })

  const { data: existing, error: existingError } = await (supabase.from('whatsapp_webhook_events') as any)
    .select('id, source, processing_status, error_message, metadata')
    .eq('channel_id', channel.id)
    .eq('provider_message_id', parsed.data.providerMessageId)
    .maybeSingle()
  if (existingError) throw existingError

  const nowIso = new Date().toISOString()
  const statusRank = { received: 0, failed: 1, forwarded: 2 } as const
  const nextStatus = existing && statusRank[existing.processing_status as keyof typeof statusRank] > statusRank[parsed.data.processingStatus]
    ? existing.processing_status
    : parsed.data.processingStatus
  const existingMetadata = existing?.metadata && typeof existing.metadata === 'object' && !Array.isArray(existing.metadata)
    ? existing.metadata
    : {}
  const values = {
    tenant_id: channel.tenant_id,
    store_id: channel.store_id,
    channel_id: channel.id,
    instance_key: parsed.data.instanceKey,
    provider_message_id: parsed.data.providerMessageId,
    remote_phone: parsed.data.phone || null,
    event_name: parsed.data.eventName,
    source: existing?.source || parsed.data.source,
    provider_created_at: parsed.data.providerCreatedAt || null,
    processing_status: nextStatus,
    error_message: nextStatus === 'forwarded'
      ? null
      : (parsed.data.errorMessage || existing?.error_message || null),
    metadata: { ...existingMetadata, ...(parsed.data.metadata || {}) },
    updated_at: nowIso,
  }

  const { error } = existing?.id
    ? await (supabase.from('whatsapp_webhook_events') as any).update(values).eq('id', existing.id)
    : await (supabase.from('whatsapp_webhook_events') as any).insert(values)

  if (error) throw error
  return NextResponse.json({ ok: true })
}
