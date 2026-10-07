import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { cleanupWhatsAppRetention } from '@/lib/whatsapp/retention'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim()
  const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
  if (!secret || !provided || Buffer.byteLength(secret) !== Buffer.byteLength(provided)
    || !timingSafeEqual(Buffer.from(secret), Buffer.from(provided))) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const admin = createAdminClient({ noStore: true })
    const { data: channels, error } = await (admin.from('whatsapp_store_channels') as any).select('store_id')
    if (error) throw error
    const stores = [...new Set((channels as Array<{ store_id: number }> || []).map((channel) => Number(channel.store_id)))]
    const results = []
    for (const storeId of stores) {
      try {
        const deleted = await cleanupWhatsAppRetention(admin, storeId)
        results.push({ storeId, success: true, deleted })
      } catch (error) {
        console.error('[WhatsApp retention] Store cleanup failed', storeId, error)
        results.push({ storeId, success: false })
      }
    }
    const success = results.every((result) => result.success)
    return NextResponse.json({ success, results }, {
      status: success ? 200 : 500,
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    })
  } catch (error) {
    console.error('[WhatsApp retention] Scheduled cleanup failed', error)
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 })
  }
}
