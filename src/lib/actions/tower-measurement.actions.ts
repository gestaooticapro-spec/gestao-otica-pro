'use server'

import { z } from 'zod'
import type { Database } from '@/lib/database.types'
import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

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

const SaveTowerMeasurementResultSchema = z.object({
  storeId: z.coerce.number().int().positive(),
  towerSessionId: z.string().uuid(),
  lensMode: z.enum(['multifocal', 'bifocal']),
  referenceMm: z.number().finite().positive().max(1000),
  frontMeasurements: FrontMeasurementsSchema,
  profileMeasurements: ProfileMeasurementsSchema,
  attentionCodes: z.array(AttentionCodeSchema),
  algorithmVersion: z.string().trim().min(1).max(80),
})

type ActionResult = { success: boolean; message: string; data?: { id: string; version: number } }

export async function saveTowerMeasurementResult(
  input: z.input<typeof SaveTowerMeasurementResultSchema>,
): Promise<ActionResult> {
  const parsed = SaveTowerMeasurementResultSchema.safeParse(input)
  if (!parsed.success) return { success: false, message: 'As medidas informadas nao sao validas.' }

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, message: 'Usuario nao autenticado.' }

  const profile = (await getProfileByAdmin(user.id)) as Database['public']['Tables']['profiles']['Row'] | null
  if (!profile?.tenant_id) return { success: false, message: 'Perfil do usuario sem tenant.' }
  if (profile.role !== 'admin' && profile.store_id !== parsed.data.storeId) {
    return { success: false, message: 'Acesso negado para esta loja.' }
  }

  const admin = createAdminClient()
  // O client administrativo deste projeto ainda nao infere corretamente as tabelas locais adicionadas por migration.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessions = admin.from('tower_sessions') as any
  const { data: session, error: sessionError } = await sessions
    .select('id, tenant_id, store_id, customer_id, optical_evaluation_id, status')
    .eq('id', parsed.data.towerSessionId)
    .eq('store_id', parsed.data.storeId)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle()

  if (sessionError || !session) {
    return { success: false, message: sessionError?.message || 'Sessao da Torre nao encontrada.' }
  }
  if (session.status !== 'active') return { success: false, message: 'A sessao da Torre nao esta ativa.' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results = admin.from('tower_measurement_results') as any
  const { data: previous, error: previousError } = await results
    .select('version')
    .eq('tower_session_id', session.id)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (previousError) return { success: false, message: previousError.message }
  const version = (previous?.version ?? 0) + 1
  const { data: saved, error: saveError } = await results
    .insert({
      tenant_id: profile.tenant_id,
      store_id: parsed.data.storeId,
      tower_session_id: session.id,
      customer_id: session.customer_id,
      optical_evaluation_id: session.optical_evaluation_id,
      created_by_user_id: user.id,
      version,
      lens_mode: parsed.data.lensMode,
      reference_mm: parsed.data.referenceMm,
      front_measurements: parsed.data.frontMeasurements,
      profile_measurements: parsed.data.profileMeasurements,
      attention_codes: parsed.data.attentionCodes,
      algorithm_version: parsed.data.algorithmVersion,
    })
    .select('id, version')
    .single()

  if (saveError || !saved) {
    return { success: false, message: saveError?.message || 'Nao foi possivel salvar as medidas.' }
  }

  return {
    success: true,
    message: 'Medidas salvas.',
    data: { id: saved.id as string, version: saved.version as number },
  }
}
