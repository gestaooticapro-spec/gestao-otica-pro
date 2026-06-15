/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { isValidWhatsAppInternalRequest } from '@/lib/whatsapp/internal-auth'

export const runtime = 'nodejs'

const RequestSchema = z.object({
  instanceKey: z.string().trim().min(1).max(120),
  status: z.enum(['unknown', 'connecting', 'connected', 'disconnected']),
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
    const { error } = await (supabase.from('whatsapp_store_channels') as any)
      .update({
        connection_status: parsed.data.status,
        last_connection_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('provider', 'evolution')
      .eq('instance_key', parsed.data.instanceKey)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[WhatsApp] Failed to update connection:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
