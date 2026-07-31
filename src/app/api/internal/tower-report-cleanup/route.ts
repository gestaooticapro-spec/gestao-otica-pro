import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { cleanupExpiredTowerCustomerReports } from '@/lib/server/tower-customer-report-share'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim()
  const authorization = request.headers.get('authorization') ?? ''
  const provided = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!secret || !provided) return false
  const expectedBuffer = Buffer.from(secret)
  const providedBuffer = Buffer.from(provided)
  return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer)
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const result = await cleanupExpiredTowerCustomerReports()
    return NextResponse.json({ success: true, ...result }, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    })
  } catch (error) {
    console.error('[Tower reports] cleanup failed', error)
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 })
  }
}
