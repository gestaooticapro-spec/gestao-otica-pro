import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateTowerDevice } from '@/lib/server/tower-device-auth'
import { TOWER_CUSTOMER_REPORT_BUCKET } from '@/lib/server/tower-customer-report-share'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const ParamsSchema = z.object({ reportId: z.string().uuid(), assetId: z.string().uuid() })
const MAX_ASSET_BYTES = 4 * 1024 * 1024

export async function PUT(request: NextRequest, context: { params: Promise<{ reportId: string; assetId: string }> }) {
  const authentication = await authenticateTowerDevice(request)
  if (authentication.status === 'invalid') return NextResponse.json({ success: false, message: 'Credencial de dispositivo invalida.' }, { status: 401 })
  if (authentication.status === 'unavailable') return NextResponse.json({ success: false, message: 'Autenticacao da Torre indisponivel.' }, { status: 503 })
  const parsed = ParamsSchema.safeParse(await context.params)
  if (!parsed.success) return NextResponse.json({ success: false, message: 'Imagem do relatorio invalida.' }, { status: 400 })
  const bytes = Buffer.from(await request.arrayBuffer())
  // O Chromium/Electron pode controlar Content-Length internamente e rejeita
  // cabecalhos definidos pela aplicacao. O limite e a integridade sao validados
  // pelo corpo efetivamente recebido e pelo tamanho/hash registrados no preparo.
  if (bytes.length < 1 || bytes.length > MAX_ASSET_BYTES) return NextResponse.json({ success: false, message: 'Tamanho da imagem invalido.' }, { status: 413 })

  const admin = createAdminClient()
  const { data: report } = await (admin.from('tower_customer_report_shares') as any).select('id,status').eq('id', parsed.data.reportId).eq('tenant_id', authentication.device.tenantId).eq('store_id', authentication.device.storeId).eq('source_device_id', authentication.device.id).maybeSingle()
  if (!report || report.status !== 'preparing') return NextResponse.json({ success: false, message: 'Relatorio indisponivel para upload.' }, { status: 409 })
  const { data: asset, error: assetError } = await (admin.from('tower_customer_report_assets') as any).select('*').eq('source_asset_id', parsed.data.assetId).eq('report_id', report.id).maybeSingle()
  if (assetError || !asset) return NextResponse.json({ success: false, message: 'Imagem nao pertence a este relatorio.' }, { status: 404 })
  if (request.headers.get('content-type') !== asset.mime_type || bytes.length !== asset.byte_size || createHash('sha256').update(bytes).digest('hex') !== asset.content_hash) return NextResponse.json({ success: false, message: 'Integridade da imagem invalida.' }, { status: 400 })

  const { error: uploadError } = await admin.storage.from(TOWER_CUSTOMER_REPORT_BUCKET).upload(asset.storage_path, bytes, { contentType: asset.mime_type, upsert: true })
  if (uploadError) return NextResponse.json({ success: false, message: 'Nao foi possivel armazenar a imagem.' }, { status: 500 })
  const { error: updateError } = await (admin.from('tower_customer_report_assets') as any).update({ status: 'uploaded', uploaded_at: new Date().toISOString() }).eq('id', asset.id).eq('report_id', report.id)
  if (updateError) return NextResponse.json({ success: false, message: 'Imagem armazenada, mas nao confirmada.' }, { status: 500 })
  return NextResponse.json({ success: true, message: 'Imagem protegida no relatorio.' })
}
