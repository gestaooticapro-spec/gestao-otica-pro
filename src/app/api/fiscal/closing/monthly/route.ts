import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { runMonthlyAccountantClosingJob } from '@/lib/accounting/monthly-closing'

export const runtime = 'nodejs'
export const maxDuration = 300

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET
  const authorization = request.headers.get('authorization') || ''
  const provided = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!secret || !provided) return false
  const expectedBuffer = Buffer.from(secret)
  const providedBuffer = Buffer.from(provided)
  return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer)
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    return NextResponse.json(await runMonthlyAccountantClosingJob())
  } catch (error) {
    console.error('[Accountant closing] monthly job failed', error)
    return NextResponse.json({ error: 'Não foi possível executar o fechamento mensal.' }, { status: 500 })
  }
}
