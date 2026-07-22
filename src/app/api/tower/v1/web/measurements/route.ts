import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateTowerDeviceWebSessionToken } from '@/lib/server/tower-device-web-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FiniteMeasurementSchema = z.number().finite().min(-1000).max(1000)
const FrontMeasurementsSchema = z.object({
  dp: FiniteMeasurementSchema,
  dnpOD: FiniteMeasurementSchema,
  dnpOE: FiniteMeasurementSchema,
  altOD: FiniteMeasurementSchema,
  altOE: FiniteMeasurementSchema,
  ponte: FiniteMeasurementSchema,
  horizontal: FiniteMeasurementSchema,
  vertical: FiniteMeasurementSchema,
  diagonal: FiniteMeasurementSchema,
  diamOD: FiniteMeasurementSchema,
  diamOE: FiniteMeasurementSchema,
  palpebraOD: FiniteMeasurementSchema,
  palpebraOE: FiniteMeasurementSchema,
})
const ProfileMeasurementsSchema = z.object({
  vertexDistance: FiniteMeasurementSchema,
  pantoscopicAngle: FiniteMeasurementSchema,
})
const AttentionCodeSchema = z.enum([
  'low_fitting_height',
  'high_vertex_distance',
  'high_pantoscopic_angle',
  'dnp_difference',
])
const SaveMeasurementSchema = z.object({
  operationId: z.string().uuid(),
  storeId: z.coerce.number().int().positive(),
  towerSessionId: z.string().uuid(),
  lensMode: z.enum(['multifocal', 'bifocal']),
  referenceMm: z.number().finite().positive().max(1000),
  frontMeasurements: FrontMeasurementsSchema,
  profileMeasurements: ProfileMeasurementsSchema,
  attentionCodes: z.array(AttentionCodeSchema),
  algorithmVersion: z.string().trim().min(1).max(80),
})

export async function POST(request: NextRequest) {
  const parsed = SaveMeasurementSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: 'As medidas informadas nao sao validas.' }, { status: 400 })
  }

  const authorization = request.headers.get('authorization') ?? ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!token) return NextResponse.json({ success: false, message: 'Torre nao autenticada.' }, { status: 401 })

  const auth = await authenticateTowerDeviceWebSessionToken(token, parsed.data.storeId)
  if (!auth.ok) return NextResponse.json({ success: false, message: auth.message }, { status: 401 })

  const admin = createAdminClient() as unknown as {
    rpc: (name: string, args: Record<string, unknown>) => Promise<{
      data: Array<{ id: string; version: number }> | null
      error: { message: string } | null
    }>
  }
  const { data, error } = await admin.rpc('save_tower_web_measurement', {
    p_tenant_id: auth.tenantId,
    p_store_id: parsed.data.storeId,
    p_result_id: parsed.data.operationId,
    p_tower_session_id: parsed.data.towerSessionId,
    p_lens_mode: parsed.data.lensMode,
    p_reference_mm: parsed.data.referenceMm,
    p_front_measurements: parsed.data.frontMeasurements,
    p_profile_measurements: parsed.data.profileMeasurements,
    p_attention_codes: parsed.data.attentionCodes,
    p_algorithm_version: parsed.data.algorithmVersion,
  })

  if (error) {
    const conflict = /TOWER_WEB_MEASUREMENT_(SESSION_INACTIVE|SESSION_NOT_FOUND|ID_CONFLICT)/.test(error.message)
    return NextResponse.json(
      { success: false, message: conflict ? 'A sessao da Torre nao esta ativa ou a operacao e invalida.' : error.message },
      { status: conflict ? 409 : 500 },
    )
  }

  const saved = data?.[0]
  if (!saved) {
    return NextResponse.json({ success: false, message: 'Nao foi possivel salvar as medidas.' }, { status: 500 })
  }

  return NextResponse.json({ success: true, message: 'Medidas salvas.', data: saved })
}
