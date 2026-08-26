import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
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
    const report = await generateDailyStoreHealthReport(1)
    await Promise.all([
      generatePeriodicStoreHealthSnapshot(1, 'weekly', report.reportDate),
      generatePeriodicStoreHealthSnapshot(1, 'monthly', report.reportDate),
    ])
    return NextResponse.json({ success: true, report })
  } catch (error) {
    console.error('[Daily health] scheduled generation failed', error)
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 })
  }
}
