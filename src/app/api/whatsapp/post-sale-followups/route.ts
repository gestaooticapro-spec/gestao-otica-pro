import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { runPostSaleFollowupJob } from '@/lib/whatsapp/post-sale-followups'

export const runtime = 'nodejs'

function safeEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function isAuthorized(request: Request) {
  const authorization = request.headers.get('authorization') ?? ''
  const providedSecret = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : ''

  const allowedSecrets = [
    process.env.WHATSAPP_INTERNAL_SECRET,
    process.env.CRON_SECRET,
  ].filter((value): value is string => Boolean(value))

  return Boolean(providedSecret) && allowedSecrets.some((secret) => safeEquals(providedSecret, secret))
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runPostSaleFollowupJob()
    return NextResponse.json(result)
  } catch (error) {
    console.error('[WhatsApp] Post-sale follow-up job failed:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
