import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateTowerDevice } from '@/lib/server/tower-device-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SectionSchema = z.enum(['customer', 'prescription', 'lensRecommendations', 'decisionCriteria', 'heatmap', 'measurement', 'visagismo', 'thickness'])
const AssetSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(['visagismo', 'measurement_front', 'measurement_profile']),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  byteSize: z.number().int().min(1).max(4 * 1024 * 1024),
  capturedAt: z.string().datetime(),
})
const PrepareSchema = z.object({
  reportId: z.string().uuid(),
  sessionId: z.string().uuid(),
  audience: z.literal('customer'),
  sourceReportId: z.string().uuid(),
  sourceReportVersion: z.number().int().positive(),
  selectedSections: z.array(SectionSchema).min(1).max(8),
  snapshot: z.record(z.string(), z.unknown()),
  assets: z.array(AssetSchema).max(3),
})
const extensionByMime = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const

export async function POST(request: NextRequest) {
  const authentication = await authenticateTowerDevice(request)
  if (authentication.status === 'invalid') return NextResponse.json({ success: false, message: 'Credencial de dispositivo invalida.' }, { status: 401 })
  if (authentication.status === 'unavailable') return NextResponse.json({ success: false, message: 'Autenticacao da Torre indisponivel.' }, { status: 503 })

  const parsed = PrepareSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ success: false, message: 'Composicao do relatorio invalida.' }, { status: 400 })
  const assetManifest = [...parsed.data.assets].sort((left, right) => left.id.localeCompare(right.id))
  const snapshotJson = JSON.stringify({ sourceReportId: parsed.data.sourceReportId, sourceReportVersion: parsed.data.sourceReportVersion, selectedSections: parsed.data.selectedSections, snapshot: parsed.data.snapshot, assets: assetManifest })
  if (Buffer.byteLength(snapshotJson, 'utf8') > 512 * 1024) return NextResponse.json({ success: false, message: 'O relatorio excede o limite permitido.' }, { status: 413 })
  const snapshotHash = createHash('sha256').update(snapshotJson, 'utf8').digest('hex')
  const admin = createAdminClient()
  const device = authentication.device
  const { data: session, error: sessionError } = await (admin.from('tower_sessions') as any)
    .select('id,customer_id,status').eq('id', parsed.data.sessionId).eq('tenant_id', device.tenantId).eq('store_id', device.storeId).maybeSingle()
  if (sessionError) return NextResponse.json({ success: false, message: 'Nao foi possivel validar a sessao.' }, { status: 500 })
  if (!session || ['discarded', 'expired'].includes(session.status)) return NextResponse.json({ success: false, message: 'Sessao indisponivel para publicacao.' }, { status: 409 })
  if (!session.customer_id) return NextResponse.json({ success: false, message: 'Vincule o cliente antes de publicar seu relatorio.' }, { status: 409 })
  const snapshotSession = parsed.data.snapshot.session
  const snapshotCustomer = parsed.data.snapshot.customer
  if (!snapshotSession || typeof snapshotSession !== 'object'
      || Array.isArray(snapshotSession)
      || (snapshotSession as Record<string, unknown>).id !== session.id) {
    return NextResponse.json({ success: false, message: 'A sessao do snapshot nao confere com a publicacao.' }, { status: 400 })
  }
  if (snapshotCustomer !== null && snapshotCustomer !== undefined) {
    const customerId = typeof snapshotCustomer === 'object' && !Array.isArray(snapshotCustomer)
      ? (snapshotCustomer as Record<string, unknown>).id
      : null
    if (customerId !== session.customer_id && customerId !== String(session.customer_id)) {
      return NextResponse.json({ success: false, message: 'O cliente do snapshot nao confere com a sessao.' }, { status: 409 })
    }
  }

  const reports = admin.from('tower_customer_report_shares') as any
  const { data: existing, error: existingError } = await reports.select('id,tower_session_id,audience,snapshot_hash,status').eq('id', parsed.data.reportId).maybeSingle()
  if (existingError) return NextResponse.json({ success: false, message: 'Nao foi possivel preparar o relatorio.' }, { status: 500 })
  if (existing && (existing.tower_session_id !== session.id || existing.audience !== parsed.data.audience || existing.snapshot_hash !== snapshotHash)) return NextResponse.json({ success: false, message: 'Este identificador ja foi usado por outro relatorio.' }, { status: 409 })
  if (existing && existing.status !== 'preparing') return NextResponse.json({ success: false, message: 'Este relatorio ja foi finalizado.' }, { status: 409 })

  if (!existing) {
    const { error } = await reports.insert({ id: parsed.data.reportId, tenant_id: device.tenantId, store_id: device.storeId, tower_session_id: session.id, customer_id: session.customer_id, source_device_id: device.id, audience: parsed.data.audience, schema_version: 1, snapshot: JSON.parse(snapshotJson), snapshot_hash: snapshotHash, asset_manifest: assetManifest, status: 'preparing' })
    if (error) return NextResponse.json({ success: false, message: 'Nao foi possivel preparar o relatorio.' }, { status: 500 })
  }

  if (parsed.data.assets.length) {
    const assetRows = parsed.data.assets.map((asset) => ({ source_asset_id: asset.id, report_id: parsed.data.reportId, kind: asset.kind, mime_type: asset.mimeType, content_hash: asset.contentHash, byte_size: asset.byteSize, captured_at: asset.capturedAt, storage_path: `${device.tenantId}/${device.storeId}/${parsed.data.reportId}/${asset.id}.${extensionByMime[asset.mimeType]}`, status: 'expected' }))
    const { error } = await (admin.from('tower_customer_report_assets') as any).upsert(assetRows, { onConflict: 'report_id,source_asset_id', ignoreDuplicates: true })
    if (error) return NextResponse.json({ success: false, message: 'Nao foi possivel preparar as imagens do relatorio.' }, { status: 500 })
  }
  return NextResponse.json({ success: true, message: 'Relatorio preparado para upload.', data: { reportId: parsed.data.reportId, snapshotHash, status: 'preparing' } }, { status: existing ? 200 : 201 })
}
