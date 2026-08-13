/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { isValidWhatsAppInternalRequest } from '@/lib/whatsapp/internal-auth'

export const runtime = 'nodejs'

const RequestSchema = z.object({
  instanceKey: z.string().trim().min(1).max(120),
  providerMessageId: z.string().trim().min(1).max(255),
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
    const { data: channel, error: channelError } = await (supabase.from('whatsapp_store_channels') as any)
      .select('id')
      .eq('provider', 'evolution')
      .eq('instance_key', parsed.data.instanceKey)
      .eq('is_active', true)
      .maybeSingle()

    if (channelError) throw channelError
    if (!channel) return NextResponse.json({ shouldReply: false })

    const { data: inbound, error: inboundError } = await (supabase.from('whatsapp_inbound_messages') as any)
      .select('id')
      .eq('channel_id', channel.id)
      .eq('provider_message_id', parsed.data.providerMessageId)
      .maybeSingle()

    if (inboundError) throw inboundError
    if (!inbound) return NextResponse.json({ shouldReply: false })

    const { data: outbound, error: outboundError } = await (supabase.from('whatsapp_outbound_messages') as any)
      .select('id, remote_phone, message_text, status')
      .eq('channel_id', channel.id)
      .eq('inbound_message_id', inbound.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (outboundError) throw outboundError
    if (!outbound || outbound.status !== 'pending' || !outbound.message_text) {
      return NextResponse.json({ shouldReply: false })
    }

    return NextResponse.json({
      shouldReply: true,
      phone: outbound.remote_phone,
      replyText: outbound.message_text,
      outboundMessageId: outbound.id,
      recovered: true,
    })
  } catch (error) {
    console.error('[WhatsApp] Failed to recover pending reply:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
