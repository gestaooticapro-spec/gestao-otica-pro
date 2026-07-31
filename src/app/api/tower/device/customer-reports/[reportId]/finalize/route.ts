import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateTowerDevice } from '@/lib/server/tower-device-auth'
import { createTowerCustomerReportToken, hashTowerCustomerReportToken, TOWER_CUSTOMER_REPORT_TTL_SECONDS } from '@/lib/server/tower-customer-report-share'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const ParamsSchema = z.object({ reportId: z.string().uuid() })

export async function POST(request: NextRequest, context: { params: Promise<{ reportId: string }> }) {
  const authentication = await authenticateTowerDevice(request)
  if (authentication.status === 'invalid') return NextResponse.json({ success: false, message: 'Credencial de dispositivo invalida.' }, { status: 401 })
  if (authentication.status === 'unavailable') return NextResponse.json({ success: false, message: 'Autenticacao da Torre indisponivel.' }, { status: 503 })
  const parsed = ParamsSchema.safeParse(await context.params)
  if (!parsed.success) return NextResponse.json({ success: false, message: 'Relatorio invalido.' }, { status: 400 })

  const admin = createAdminClient()
  const reports = admin.from('tower_customer_report_shares') as any
  const { data: report, error } = await reports.select('*').eq('id', parsed.data.reportId).eq('tenant_id', authentication.device.tenantId).eq('store_id', authentication.device.storeId).eq('source_device_id', authentication.device.id).maybeSingle()
  if (error || !report) return NextResponse.json({ success: false, message: 'Relatorio nao encontrado.' }, { status: 404 })
  if (!['preparing', 'published'].includes(report.status)) return NextResponse.json({ success: false, message: 'Este relatorio nao pode mais ser publicado.' }, { status: 409 })
  const { data: assets, error: assetError } = await (admin.from('tower_customer_report_assets') as any).select('id,status').eq('report_id', report.id)
  const expectedAssetCount = Array.isArray(report.asset_manifest) ? report.asset_manifest.length : -1
  if (assetError || expectedAssetCount !== (assets ?? []).length || (assets ?? []).some((asset: any) => asset.status !== 'uploaded')) return NextResponse.json({ success: false, message: 'Ainda existem imagens pendentes.' }, { status: 409 })

  const token = createTowerCustomerReportToken(report.id, report.created_at)
  const reportUrl = new URL(`/relatorio/${token}`, request.nextUrl.origin).toString()
  if (report.status === 'published') return NextResponse.json({ success: true, message: 'Relatorio ja estava publicado.', data: { reportId: report.id, url: reportUrl, expiresAt: report.expires_at } })
  const publishedAt = new Date()
  const expiresAt = new Date(publishedAt.getTime() + TOWER_CUSTOMER_REPORT_TTL_SECONDS * 1000)
  const { data: published, error: updateError } = await reports.update({ status: 'published', public_token_hash: hashTowerCustomerReportToken(token), published_at: publishedAt.toISOString(), expires_at: expiresAt.toISOString() }).eq('id', report.id).eq('status', 'preparing').select('id').maybeSingle()
  if (updateError) return NextResponse.json({ success: false, message: 'Nao foi possivel publicar o relatorio.' }, { status: 500 })
  if (!published) return NextResponse.json({ success: false, message: 'O estado do relatorio mudou. Tente novamente.' }, { status: 409 })
  return NextResponse.json({ success: true, message: 'Relatorio publicado por sete dias.', data: { reportId: report.id, url: reportUrl, expiresAt: expiresAt.toISOString() } })
}
