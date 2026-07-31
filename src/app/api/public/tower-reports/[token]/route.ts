import { NextRequest, NextResponse } from 'next/server'
import { loadPublicTowerCustomerReport } from '@/lib/server/tower-customer-report-share'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params
  const report = await loadPublicTowerCustomerReport(token)
  const headers = { 'Cache-Control': 'private, no-store, max-age=0' }
  if (!report) return NextResponse.json({ success: false, message: 'Relatorio indisponivel ou expirado.' }, { status: 404, headers })
  return NextResponse.json({ success: true, data: report }, { headers })
}
