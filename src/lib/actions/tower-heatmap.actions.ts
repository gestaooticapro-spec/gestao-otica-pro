'use server'

/* eslint-disable @typescript-eslint/no-explicit-any -- tabelas da Torre ainda nao constam integralmente nos tipos gerados do Supabase */

import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/database.types'
import { authorizeTowerStoreAccess } from '@/lib/server/tower-device-web-session'

const HEATMAP_ALGORITHM_VERSION = 'head-only-v1'
const HEATMAP_TARGET_PLAN_VERSION = 'balanced-19-v1'

const SessionIdSchema = z.string().uuid()
const StoreIdSchema = z.coerce.number().int().positive()
const RatioSchema = z.number().finite().min(0).max(1)
const AxisSchema = z.number().finite().min(-2).max(2)

const HeatmapSummarySchema = z.object({
  eyeShare: RatioSchema,
  headShare: RatioSchema,
  eyeShareX: RatioSchema,
  headShareX: RatioSchema,
  eyeShareY: RatioSchema,
  headShareY: RatioSchema,
  heatSpreadX: z.number().finite().min(0).max(1),
  heatSpreadY: z.number().finite().min(0).max(1),
  sampleCount: z.number().int().min(0).max(100),
  wideScore: RatioSchema,
  narrowScore: RatioSchema,
  distanceCoverage: RatioSchema,
  intermediateCoverage: RatioSchema,
  nearCoverage: RatioSchema,
  isReliable: z.boolean(),
  label: z.string().min(1).max(160),
  message: z.string().min(1).max(800),
})

const HeatmapTargetSampleSchema = z.object({
  eyeX: AxisSchema,
  eyeY: AxisSchema,
  headX: AxisSchema,
  headY: AxisSchema,
  targetX: RatioSchema,
  targetY: RatioSchema,
  lensX: RatioSchema,
  lensY: RatioSchema,
  headOnlyProjection: z.boolean().optional(),
  verticalHeadDebug: z.boolean().optional(),
})

const CreateSessionSchema = z.object({
  storeId: StoreIdSchema,
  evaluationId: z.coerce.number().int().positive(),
  customerId: z.coerce.number().int().positive(),
})

const CreateTowerSessionHeatmapSchema = z.object({
  storeId: StoreIdSchema,
  towerSessionId: SessionIdSchema,
})

const SessionCommandSchema = z.object({
  storeId: StoreIdSchema,
  sessionId: SessionIdSchema,
})

const CompleteSessionSchema = SessionCommandSchema.extend({
  summary: HeatmapSummarySchema,
  targetSamples: z.array(HeatmapTargetSampleSchema).min(1).max(40),
})

const SaveDemoTemplateSchema = SessionCommandSchema
const LoadDemoTemplateSchema = z.object({
  storeId: StoreIdSchema,
})

export type PersistedTowerHeatmapResult = {
  evaluationId: number | null
  customerId: number | null
  recommendations: unknown[]
  summary: z.infer<typeof HeatmapSummarySchema>
  targetSamples: z.infer<typeof HeatmapTargetSampleSchema>[]
}

type TowerHeatmapSessionRow = Database['public']['Tables']['tower_heatmap_sessions']['Row']
type TowerHeatmapSessionInsert = Database['public']['Tables']['tower_heatmap_sessions']['Insert']
type TowerHeatmapSessionUpdate = Database['public']['Tables']['tower_heatmap_sessions']['Update']
type HeatmapActionResult<T = undefined> = {
  success: boolean
  message: string
  data?: T
}
type QueryError = { message: string }
type SingleResult<T> = Promise<{ data: T | null; error: QueryError | null }>
type SessionLookup = Pick<TowerHeatmapSessionRow, 'id' | 'store_id' | 'status' | 'tower_session_id'>
type EvaluationLookup = {
  id: number
  tenant_id: string
  store_id: number
  evaluated_customer_id: number | null
}
type TowerSessionLookup = {
  id: string
  tenant_id: string
  store_id: number
  customer_id: number | null
  optical_evaluation_id: number | null
  status: 'active' | 'completed' | 'discarded' | 'expired'
}
type TwoFilterSelect<T> = {
  eq: (column: string, value: string | number) => TwoFilterSelect<T>
  maybeSingle: () => SingleResult<T>
}
type TowerHeatmapSessionsTableApi = {
  select: (columns: string) => TwoFilterSelect<SessionLookup>
  insert: (values: TowerHeatmapSessionInsert) => {
    select: (columns: string) => {
      single: () => SingleResult<TowerHeatmapSessionRow>
    }
  }
  update: (values: TowerHeatmapSessionUpdate) => {
    eq: (column: string, value: string | number) => {
      eq: (column: string, value: string | number) => Promise<{ error: QueryError | null }>
    }
  }
}
type OpticalEvaluationsLookupTableApi = {
  select: (columns: string) => TwoFilterSelect<EvaluationLookup>
}
type CompletedSessionLookup = Pick<TowerHeatmapSessionRow, 'id' | 'store_id' | 'customer_id' | 'optical_evaluation_id' | 'status' | 'result_summary' | 'target_samples'>
type CompletedSessionTableApi = {
  select: (columns: string) => TwoFilterSelect<CompletedSessionLookup>
}

async function getSessionForStore(sessionId: string, storeId: number) {
  const sessions = createAdminClient().from('tower_heatmap_sessions') as unknown as TowerHeatmapSessionsTableApi
  const { data, error } = await sessions
    .select('id, store_id, status')
    .eq('id', sessionId)
    .eq('store_id', storeId)
    .maybeSingle()

  if (error) return { session: null, message: error.message }
  if (!data) return { session: null, message: 'Sessao de mapa visual nao encontrada para esta loja.' }
  return { session: data, message: null }
}

export async function createTowerHeatmapSession(
  input: z.input<typeof CreateSessionSchema>,
): Promise<HeatmapActionResult<TowerHeatmapSessionRow>> {
  const parsed = CreateSessionSchema.safeParse(input)
  if (!parsed.success) return { success: false, message: parsed.error.issues[0]?.message || 'Dados da sessao invalidos.' }

  const data = parsed.data
  const auth = await authorizeTowerStoreAccess(data.storeId)
  if (!auth.ok) return { success: false, message: auth.message }

  const evaluations = createAdminClient().from('optical_evaluations') as unknown as OpticalEvaluationsLookupTableApi
  const { data: evaluation, error: evaluationError } = await evaluations
    .select('id, tenant_id, store_id, evaluated_customer_id')
    .eq('id', data.evaluationId)
    .eq('store_id', data.storeId)
    .maybeSingle()

  if (evaluationError) return { success: false, message: evaluationError.message }
  if (!evaluation) return { success: false, message: 'Avaliacao nao encontrada para esta loja.' }
  if (evaluation.tenant_id !== auth.tenantId || evaluation.evaluated_customer_id !== data.customerId) {
    return { success: false, message: 'Cliente e avaliacao nao formam um vinculo valido para o mapa visual.' }
  }

  const sessions = createAdminClient().from('tower_heatmap_sessions') as unknown as TowerHeatmapSessionsTableApi
  const { data: session, error } = await sessions
    .insert({
      tenant_id: auth.tenantId,
      store_id: data.storeId,
      customer_id: data.customerId,
      optical_evaluation_id: data.evaluationId,
      created_by_user_id: auth.userId,
      status: 'created',
      algorithm_version: HEATMAP_ALGORITHM_VERSION,
      target_plan_version: HEATMAP_TARGET_PLAN_VERSION,
    })
    .select('*')
    .single()

  if (error || !session) return { success: false, message: error?.message || 'Nao foi possivel criar a sessao do mapa visual.' }
  return { success: true, message: 'Sessao de mapa visual criada.', data: session }
}

export async function getOrCreateTowerHeatmapSessionForTowerSession(
  input: z.input<typeof CreateTowerSessionHeatmapSchema>,
): Promise<HeatmapActionResult<TowerHeatmapSessionRow>> {
  const parsed = CreateTowerSessionHeatmapSchema.safeParse(input)
  if (!parsed.success) return { success: false, message: 'Sessao da Torre invalida para o mapa visual.' }

  const data = parsed.data
  const auth = await authorizeTowerStoreAccess(data.storeId)
  if (!auth.ok) return { success: false, message: auth.message }

  const towerSessions = createAdminClient().from('tower_sessions') as any
  const { data: towerSession, error: towerSessionError } = await towerSessions
    .select('id, tenant_id, store_id, customer_id, optical_evaluation_id, status')
    .eq('id', data.towerSessionId)
    .eq('store_id', data.storeId)
    .maybeSingle() as { data: TowerSessionLookup | null; error: QueryError | null }

  if (towerSessionError || !towerSession) {
    return { success: false, message: towerSessionError?.message || 'Sessao da Torre nao encontrada.' }
  }
  if (towerSession.tenant_id !== auth.tenantId || towerSession.status !== 'active') {
    return { success: false, message: 'Sessao da Torre nao esta disponivel para o Campo Visual.' }
  }

  const sessions = createAdminClient().from('tower_heatmap_sessions') as any
  const { data: existing, error: existingError } = await sessions
    .select('*')
    .eq('tower_session_id', data.towerSessionId)
    .in('status', ['created', 'running', 'completed'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle() as { data: TowerHeatmapSessionRow | null; error: QueryError | null }

  if (existingError) return { success: false, message: existingError.message }
  if (existing) return { success: true, message: 'Sessao de mapa visual retomada.', data: existing }

  const { data: session, error } = await sessions
    .insert({
      tenant_id: auth.tenantId,
      store_id: data.storeId,
      tower_session_id: data.towerSessionId,
      customer_id: towerSession.customer_id,
      optical_evaluation_id: towerSession.optical_evaluation_id,
      created_by_user_id: auth.userId,
      status: 'created',
      algorithm_version: HEATMAP_ALGORITHM_VERSION,
      target_plan_version: HEATMAP_TARGET_PLAN_VERSION,
    })
    .select('*')
    .single() as { data: TowerHeatmapSessionRow | null; error: QueryError | null }

  if (error || !session) return { success: false, message: error?.message || 'Nao foi possivel criar o Campo Visual.' }
  return { success: true, message: 'Campo Visual preparado na sessao da Torre.', data: session }
}

export async function startTowerHeatmapSession(
  input: z.input<typeof SessionCommandSchema>,
): Promise<HeatmapActionResult> {
  const parsed = SessionCommandSchema.safeParse(input)
  if (!parsed.success) return { success: false, message: 'Sessao de mapa visual invalida.' }

  const data = parsed.data
  const auth = await authorizeTowerStoreAccess(data.storeId)
  if (!auth.ok) return { success: false, message: auth.message }

  const found = await getSessionForStore(data.sessionId, data.storeId)
  if (!found.session) return { success: false, message: found.message || 'Sessao nao encontrada.' }
  if (found.session.status === 'completed' || found.session.status === 'cancelled') {
    return { success: false, message: 'Esta sessao nao pode mais ser iniciada.' }
  }

  const sessions = createAdminClient().from('tower_heatmap_sessions') as unknown as TowerHeatmapSessionsTableApi
  const { error } = await sessions
    .update({ status: 'running', started_at: new Date().toISOString(), cancelled_at: null })
    .eq('id', data.sessionId)
    .eq('store_id', data.storeId)

  if (error) return { success: false, message: error.message }
  return { success: true, message: 'Sessao iniciada.' }
}

export async function completeTowerHeatmapSession(
  input: z.input<typeof CompleteSessionSchema>,
): Promise<HeatmapActionResult> {
  const parsed = CompleteSessionSchema.safeParse(input)
  if (!parsed.success) return { success: false, message: parsed.error.issues[0]?.message || 'Resultado do mapa visual invalido.' }

  const data = parsed.data
  const auth = await authorizeTowerStoreAccess(data.storeId)
  if (!auth.ok) return { success: false, message: auth.message }

  const found = await getSessionForStore(data.sessionId, data.storeId)
  if (!found.session) return { success: false, message: found.message || 'Sessao nao encontrada.' }
  if (found.session.status === 'cancelled') return { success: false, message: 'Esta sessao foi cancelada e nao pode ser concluida.' }
  if (found.session.status === 'completed') return { success: true, message: 'Mapa visual ja estava salvo.' }

  const sessions = createAdminClient().from('tower_heatmap_sessions') as unknown as TowerHeatmapSessionsTableApi
  const completedAt = new Date().toISOString()
  const { error } = await sessions
    .update({
      status: 'completed',
      result_summary: data.summary,
      target_samples: data.targetSamples,
      completed_at: completedAt,
      cancelled_at: null,
    })
    .eq('id', data.sessionId)
    .eq('store_id', data.storeId)

  if (error) return { success: false, message: error.message }

  return { success: true, message: 'Mapa visual salvo. A sessao da Torre aguarda a decisao do funcionario.' }
}

export async function saveTowerHeatmapDemoTemplate(
  input: z.input<typeof SaveDemoTemplateSchema>,
): Promise<HeatmapActionResult> {
  const parsed = SaveDemoTemplateSchema.safeParse(input)
  if (!parsed.success) return { success: false, message: 'Sessao de mapa visual invalida.' }

  const data = parsed.data
  const auth = await authorizeTowerStoreAccess(data.storeId)
  if (!auth.ok) return { success: false, message: auth.message }

  const sessions = createAdminClient().from('tower_heatmap_sessions') as any
  const { data: session, error: sessionError } = await sessions
    .select('id, tenant_id, store_id, status, algorithm_version, target_plan_version, result_summary, target_samples')
    .eq('id', data.sessionId)
    .eq('store_id', data.storeId)
    .maybeSingle()

  if (sessionError || !session) {
    return { success: false, message: sessionError?.message || 'Sessao de mapa visual nao encontrada.' }
  }
  if (session.tenant_id !== auth.tenantId || session.status !== 'completed') {
    return { success: false, message: 'Conclua uma leitura valida antes de gravar o mapa demonstrativo.' }
  }

  const persistedResult = CompleteSessionSchema.safeParse({
    storeId: data.storeId,
    sessionId: data.sessionId,
    summary: session.result_summary,
    targetSamples: session.target_samples,
  })
  if (!persistedResult.success) {
    return { success: false, message: 'O resultado salvo desta leitura esta incompleto.' }
  }

  const templates = createAdminClient().from('tower_heatmap_demo_templates') as any
  const { error } = await templates.upsert({
    tenant_id: auth.tenantId,
    store_id: data.storeId,
    source_heatmap_session_id: session.id,
    created_by_user_id: auth.userId,
    algorithm_version: session.algorithm_version,
    target_plan_version: session.target_plan_version,
    result_summary: persistedResult.data.summary,
    target_samples: persistedResult.data.targetSamples,
  }, { onConflict: 'store_id' })

  if (error) return { success: false, message: error.message }
  return { success: true, message: 'Mapa demonstrativo gravado para esta loja.' }
}

export type PersistedTowerHeatmapDemoTemplate = {
  summary: z.infer<typeof HeatmapSummarySchema>
  targetSamples: z.infer<typeof HeatmapTargetSampleSchema>[]
  algorithmVersion: string
  targetPlanVersion: string
}

export async function loadTowerHeatmapDemoTemplate(
  input: z.input<typeof LoadDemoTemplateSchema>,
): Promise<HeatmapActionResult<PersistedTowerHeatmapDemoTemplate>> {
  const parsed = LoadDemoTemplateSchema.safeParse(input)
  if (!parsed.success) return { success: false, message: 'Loja invalida para carregar o mapa demonstrativo.' }

  const data = parsed.data
  const auth = await authorizeTowerStoreAccess(data.storeId)
  if (!auth.ok) return { success: false, message: auth.message }

  const templates = createAdminClient().from('tower_heatmap_demo_templates') as any
  const { data: template, error } = await templates
    .select('tenant_id, store_id, algorithm_version, target_plan_version, result_summary, target_samples')
    .eq('tenant_id', auth.tenantId)
    .eq('store_id', data.storeId)
    .maybeSingle()

  if (error || !template) {
    return { success: false, message: error?.message || 'Nenhum mapa demonstrativo foi gravado para esta loja.' }
  }

  const persistedResult = CompleteSessionSchema.safeParse({
    storeId: data.storeId,
    sessionId: '00000000-0000-0000-0000-000000000000',
    summary: template.result_summary,
    targetSamples: template.target_samples,
  })
  if (!persistedResult.success) {
    return { success: false, message: 'O mapa demonstrativo salvo esta incompleto.' }
  }

  return {
    success: true,
    message: 'Mapa demonstrativo carregado.',
    data: {
      summary: persistedResult.data.summary,
      targetSamples: persistedResult.data.targetSamples,
      algorithmVersion: template.algorithm_version,
      targetPlanVersion: template.target_plan_version,
    },
  }
}

export async function resetTowerHeatmapSession(
  input: z.input<typeof SessionCommandSchema>,
): Promise<HeatmapActionResult> {
  const parsed = SessionCommandSchema.safeParse(input)
  if (!parsed.success) return { success: false, message: 'Sessao de mapa visual invalida.' }

  const data = parsed.data
  const auth = await authorizeTowerStoreAccess(data.storeId)
  if (!auth.ok) return { success: false, message: auth.message }

  const found = await getSessionForStore(data.sessionId, data.storeId)
  if (!found.session) return { success: false, message: found.message || 'Sessao nao encontrada.' }
  if (found.session.status === 'running') return { success: false, message: 'A leitura atual precisa ser interrompida antes de recomecar.' }

  const sessions = createAdminClient().from('tower_heatmap_sessions') as unknown as TowerHeatmapSessionsTableApi
  const { error } = await sessions
    .update({
      status: 'created',
      result_summary: null,
      target_samples: null,
      started_at: null,
      completed_at: null,
      cancelled_at: null,
    })
    .eq('id', data.sessionId)
    .eq('store_id', data.storeId)

  if (error) return { success: false, message: error.message }
  return { success: true, message: 'Leitura preparada para recomecar.' }
}

export async function cancelTowerHeatmapSession(
  input: z.input<typeof SessionCommandSchema>,
): Promise<HeatmapActionResult> {
  const parsed = SessionCommandSchema.safeParse(input)
  if (!parsed.success) return { success: false, message: 'Sessao de mapa visual invalida.' }

  const data = parsed.data
  const auth = await authorizeTowerStoreAccess(data.storeId)
  if (!auth.ok) return { success: false, message: auth.message }

  const found = await getSessionForStore(data.sessionId, data.storeId)
  if (!found.session) return { success: false, message: found.message || 'Sessao nao encontrada.' }
  if (found.session.status === 'completed') return { success: false, message: 'Uma sessao concluida nao pode ser cancelada.' }
  if (found.session.status === 'cancelled') return { success: true, message: 'Sessao ja estava cancelada.' }

  const sessions = createAdminClient().from('tower_heatmap_sessions') as unknown as TowerHeatmapSessionsTableApi
  const { error } = await sessions
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('id', data.sessionId)
    .eq('store_id', data.storeId)

  if (error) return { success: false, message: error.message }
  return { success: true, message: 'Sessao cancelada.' }
}

export async function getCompletedTowerHeatmapResult(
  input: z.input<typeof SessionCommandSchema>,
): Promise<HeatmapActionResult<PersistedTowerHeatmapResult>> {
  const parsed = SessionCommandSchema.safeParse(input)
  if (!parsed.success) return { success: false, message: 'Sessao de mapa visual invalida.' }

  const data = parsed.data
  const auth = await authorizeTowerStoreAccess(data.storeId)
  if (!auth.ok) return { success: false, message: auth.message }

  const sessions = createAdminClient().from('tower_heatmap_sessions') as unknown as CompletedSessionTableApi
  const { data: session, error } = await sessions
    .select('id, store_id, customer_id, optical_evaluation_id, status, result_summary, target_samples')
    .eq('id', data.sessionId)
    .eq('store_id', data.storeId)
    .maybeSingle()

  if (error || !session) return { success: false, message: error?.message || 'Sessao de mapa visual nao encontrada.' }
  if (session.status !== 'completed') return { success: false, message: 'O mapa visual ainda nao foi concluido.' }

  const result = CompleteSessionSchema.safeParse({
    storeId: data.storeId,
    sessionId: data.sessionId,
    summary: session.result_summary,
    targetSamples: session.target_samples,
  })
  if (!result.success) return { success: false, message: 'O resultado salvo do mapa visual esta incompleto.' }

  let recommendations: unknown[] = []
  if (session.optical_evaluation_id) {
    const { data: evaluation, error: evaluationError } = await (createAdminClient().from('optical_evaluations') as any)
      .select('recommended_items')
      .eq('id', session.optical_evaluation_id)
      .eq('store_id', data.storeId)
      .maybeSingle()
    if (evaluationError) return { success: false, message: evaluationError.message }
    recommendations = Array.isArray(evaluation?.recommended_items) ? evaluation.recommended_items : []
  }

  return { success: true, message: 'Mapa visual recuperado.', data: {
    evaluationId: session.optical_evaluation_id,
    customerId: session.customer_id,
    recommendations,
    summary: result.data.summary,
    targetSamples: result.data.targetSamples,
  } }
}
