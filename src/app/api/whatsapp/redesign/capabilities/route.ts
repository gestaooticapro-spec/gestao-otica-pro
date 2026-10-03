import { NextResponse } from 'next/server'
import { isWhatsAppRedesignInternalRequestAuthorized } from '@/lib/whatsapp/redesign/internal-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Read-only probe; never processes turns or creates messages. */
export async function GET(request: Request) {
  if (!isWhatsAppRedesignInternalRequestAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json({ decisionProcessorVersion: 2, fullRoutingStoreIds: [1] }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
