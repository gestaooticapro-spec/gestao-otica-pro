import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateDailyStoreHealthReport, generatePeriodicStoreHealthSnapshot } from '@/lib/daily-store-health'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim()
  const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
  if (!secret || !provided) return false
  const expected = Buffer.from(secret)
  const actual = Buffer.from(provided)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  try {
    const admin = createAdminClient({ noStore: true })
    const { data: stores, error: storesError } = await (admin.from('stores') as any).select('id').order('id', { ascending: true })
    if (storesError) throw storesError

    const reports = []
    for (const store of (stores || []) as Array<{ id: number }>) {
      const report = await generateDailyStoreHealthReport(Number(store.id))
      await Promise.all([
        generatePeriodicStoreHealthSnapshot(Number(store.id), 'weekly', report.reportDate),
        generatePeriodicStoreHealthSnapshot(Number(store.id), 'monthly', report.reportDate),
      ])
      reports.push(report)
    }

    return NextResponse.json({ success: true, reports, processedStores: reports.length })
  } catch (error) {
    console.error('[Daily health] scheduled generation failed', error)
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 })
  }
}
