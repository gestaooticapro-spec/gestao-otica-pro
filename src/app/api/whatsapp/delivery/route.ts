/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { Json } from '@/lib/database.types'
import { isValidWhatsAppInternalRequest } from '@/lib/whatsapp/internal-auth'
import { extractWhatsAppCanonicalReply } from '@/lib/whatsapp/canonical'

export const runtime = 'nodejs'

const RequestSchema = z.object({
  outboundMessageId: z.coerce.number().int().positive(),
  status: z.enum(['sent', 'failed']),
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
      .select('payload')
      .eq('id', parsed.data.outboundMessageId)
      .maybeSingle()

    if (existingError) throw existingError

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
      delivery: (parsed.data.payload ?? null) as Json,
    }

    const { error } = await (supabase.from('whatsapp_outbound_messages') as any)
      .update({
        status: parsed.data.status,
        provider_message_id: parsed.data.providerMessageId ?? null,
        error_message: parsed.data.errorMessage ?? null,
        payload: nextPayload,
        sent_at: parsed.data.status === 'sent' ? new Date().toISOString() : null,
      })
      .eq('id', parsed.data.outboundMessageId)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[WhatsApp] Failed to update delivery:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
