import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isValidWhatsAppInternalRequest } from '@/lib/whatsapp/internal-auth'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  if (!isValidWhatsAppInternalRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('whatsapp_store_channels')
      .select('store_id, instance_key')
      .eq('provider', 'evolution')
      .eq('is_active', true)
      .order('store_id')

    if (error) throw error
    return NextResponse.json({ channels: data ?? [] })
  } catch (error) {
    console.error('[WhatsApp] Failed to list active channels:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
