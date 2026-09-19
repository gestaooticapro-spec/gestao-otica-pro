import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { processWhatsAppRedesignShadowTurns } from '@/lib/whatsapp/redesign/shadow-processor'

export const runtime = 'nodejs'
export const maxDuration = 60

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

async function run(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const requestedLimit = Number(url.searchParams.get('limit') || 10)
  const requestedStoreId = Number(url.searchParams.get('storeId') || 0)
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(20, Math.floor(requestedLimit))) : 10
  const storeId = Number.isInteger(requestedStoreId) && requestedStoreId > 0
    ? requestedStoreId
    : undefined

  try {
    const result = await processWhatsAppRedesignShadowTurns({ limit, storeId })
    return NextResponse.json(result)
  } catch (error) {
    console.error('[WhatsApp redesign] Shadow processing failed:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export const GET = run
export const POST = run
