import { NextResponse } from 'next/server'
import { processWhatsAppRedesignShadowTurns } from '@/lib/whatsapp/redesign/shadow-processor'
import { isWhatsAppRedesignInternalRequestAuthorized } from '@/lib/whatsapp/redesign/internal-auth'

export const runtime = 'nodejs'
export const maxDuration = 60

async function run(request: Request) {
  if (!isWhatsAppRedesignInternalRequestAuthorized(request)) {
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
