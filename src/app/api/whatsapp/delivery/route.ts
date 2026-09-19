/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { Json } from '@/lib/database.types'
import { isValidWhatsAppInternalRequest } from '@/lib/whatsapp/internal-auth'
import { extractWhatsAppCanonicalReply } from '@/lib/whatsapp/canonical'
import { captureWhatsAppShadowOutbound } from '@/lib/whatsapp/redesign/shadow-ingestion'

export const runtime = 'nodejs'

const RequestSchema = z.object({
  outboundMessageId: z.coerce.number().int().positive(),
  status: z.enum(['sending', 'sent', 'failed']),
  providerMessageId: z.string().trim().max(255).optional(),
  errorMessage: z.string().trim().max(2000).optional(),
  payload: z.unknown().optional(),
})

export async function POST(request: Request) {
  if (!isValidWhatsAppInternalRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const parsed = RequestSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const { data: existing, error: existingError } = await (supabase.from('whatsapp_outbound_messages') as any)
      .select('id, tenant_id, store_id, channel_id, remote_phone, provider_message_id, message_text, message_type, status, payload, sent_at')
      .eq('id', parsed.data.outboundMessageId)
      .maybeSingle()

    if (existingError) throw existingError
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Outbound not found' }, { status: 404 })
    }

    if (existing.status === 'sent' && parsed.data.status === 'failed') {
      return NextResponse.json({ success: true, ignored: 'sent_already_recorded' })
    }

    const existingPayload =
      existing?.payload && typeof existing.payload === 'object' && !Array.isArray(existing.payload)
        ? existing.payload
        : {}

    const canonical = extractWhatsAppCanonicalReply(existingPayload as Json)

    const nextPayload = {
      ...existingPayload,
      delivery_context: canonical
        ? {
            intent: canonical.intent,
            action: canonical.action,
            outboundType: canonical.outboundType,
          }
        : undefined,
      ...(parsed.data.status === 'sending'
        ? { delivery_attempt_started_at: new Date().toISOString() }
        : { delivery: (parsed.data.payload ?? null) as Json }),
    }

    const sentAt = parsed.data.status === 'sent' ? new Date().toISOString() : null
    const { error } = await (supabase.from('whatsapp_outbound_messages') as any)
      .update({
        status: parsed.data.status,
        ...(parsed.data.providerMessageId ? { provider_message_id: parsed.data.providerMessageId } : {}),
        error_message: parsed.data.errorMessage ?? null,
        payload: nextPayload,
        ...(sentAt ? { sent_at: sentAt } : {}),
      })
      .eq('id', parsed.data.outboundMessageId)
      .neq('status', 'sent')

    if (error) throw error
    if (sentAt) {
      await captureWhatsAppShadowOutbound({
        channel: {
          id: existing.channel_id,
          tenant_id: existing.tenant_id,
          store_id: existing.store_id,
        },
        outboundMessageId: existing.id,
        remotePhone: existing.remote_phone,
        providerMessageId: parsed.data.providerMessageId || existing.provider_message_id || null,
        messageText: existing.message_text,
        messageType: existing.message_type,
        payload: nextPayload as Json,
        sentAt,
      })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[WhatsApp] Failed to update delivery:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
