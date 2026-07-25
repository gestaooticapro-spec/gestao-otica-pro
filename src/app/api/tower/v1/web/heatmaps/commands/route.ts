import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateTowerDeviceWebSessionToken } from '@/lib/server/tower-device-web-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HEATMAP_ALGORITHM_VERSION = 'head-only-v1'
const HEATMAP_TARGET_PLAN_VERSION = 'balanced-19-v1'
const StoreIdSchema = z.coerce.number().int().positive()
const SessionIdSchema = z.string().uuid()
const RatioSchema = z.number().finite().min(0).max(1)
const AxisSchema = z.number().finite().min(-2).max(2)
const SummarySchema = z.object({
  eyeShare: RatioSchema,
  headShare: RatioSchema,
  eyeShareX: RatioSchema,
  headShareX: RatioSchema,
  eyeShareY: RatioSchema,
  headShareY: RatioSchema,
  heatSpreadX: RatioSchema,
  heatSpreadY: RatioSchema,
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
const TargetSampleSchema = z.object({
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
const BaseSchema = z.object({ storeId: StoreIdSchema })
const SessionSchema = BaseSchema.extend({ sessionId: SessionIdSchema })
const CommandSchema = z.discriminatedUnion('command', [
  BaseSchema.extend({ command: z.literal('create-evaluation'), evaluationId: z.coerce.number().int().positive(), customerId: z.coerce.number().int().positive() }),
  BaseSchema.extend({ command: z.literal('get-or-create-tower-session'), towerSessionId: SessionIdSchema }),
  SessionSchema.extend({ command: z.literal('start') }),
  SessionSchema.extend({ command: z.literal('complete'), summary: SummarySchema, targetSamples: z.array(TargetSampleSchema).min(1).max(40) }),
  SessionSchema.extend({ command: z.literal('save-demo-template') }),
  BaseSchema.extend({ command: z.literal('load-demo-template') }),
  SessionSchema.extend({ command: z.literal('reset') }),
  SessionSchema.extend({ command: z.literal('cancel') }),
  SessionSchema.extend({ command: z.literal('get-completed-result') }),
])

const json = (success: boolean, message: string, status = 200, data?: unknown) =>
  NextResponse.json(data === undefined ? { success, message } : { success, message, data }, { status })

export async function POST(request: NextRequest) {
  const parsed = CommandSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return json(false, 'Comando do mapa visual invalido.', 400)

  const authorization = request.headers.get('authorization') ?? ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!token) return json(false, 'Torre nao autenticada.', 401)
  const auth = await authenticateTowerDeviceWebSessionToken(token, parsed.data.storeId)
  if (!auth.ok) return json(false, auth.message, 401)

  const input = parsed.data
  const admin = createAdminClient()
  const sessions = admin.from('tower_heatmap_sessions') as any

  if (input.command === 'create-evaluation') {
    const { data: evaluation, error: evaluationError } = await (admin.from('optical_evaluations') as any)
      .select('id, tenant_id, store_id, evaluated_customer_id')
      .eq('id', input.evaluationId)
      .eq('store_id', input.storeId)
      .eq('tenant_id', auth.tenantId)
      .maybeSingle()
    if (evaluationError) return json(false, evaluationError.message, 500)
    if (!evaluation) return json(false, 'Avaliacao nao encontrada para esta loja.', 404)
    if (evaluation.evaluated_customer_id !== input.customerId) {
      return json(false, 'Cliente e avaliacao nao formam um vinculo valido para o mapa visual.', 409)
    }
    const { data, error } = await sessions.insert({
      tenant_id: auth.tenantId,
      store_id: input.storeId,
      customer_id: input.customerId,
      optical_evaluation_id: input.evaluationId,
      created_by_user_id: auth.userId,
      status: 'created',
      algorithm_version: HEATMAP_ALGORITHM_VERSION,
      target_plan_version: HEATMAP_TARGET_PLAN_VERSION,
    }).select('*').single()
    if (error || !data) return json(false, error?.message || 'Nao foi possivel criar a sessao do mapa visual.', 500)
    return json(true, 'Sessao de mapa visual criada.', 200, data)
  }

  if (input.command === 'get-or-create-tower-session') {
    const towerSessions = admin.from('tower_sessions') as any
    const { data: towerSession, error: towerSessionError } = await towerSessions
      .select('id, tenant_id, store_id, customer_id, optical_evaluation_id, status')
      .eq('id', input.towerSessionId)
      .eq('store_id', input.storeId)
      .eq('tenant_id', auth.tenantId)
      .maybeSingle()
    if (towerSessionError) return json(false, towerSessionError.message, 500)
    if (!towerSession) return json(false, 'Sessao da Torre nao encontrada.', 404)
    if (towerSession.status !== 'active') return json(false, 'Sessao da Torre nao esta disponivel para o Campo Visual.', 409)

    const { data: existing, error: existingError } = await sessions
      .select('*')
      .eq('tower_session_id', input.towerSessionId)
      .eq('store_id', input.storeId)
      .eq('tenant_id', auth.tenantId)
      .in('status', ['created', 'running', 'completed'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (existingError) return json(false, existingError.message, 500)
    if (existing) return json(true, 'Sessao de mapa visual retomada.', 200, existing)

    const { data, error } = await sessions.insert({
      tenant_id: auth.tenantId,
      store_id: input.storeId,
      tower_session_id: input.towerSessionId,
      customer_id: towerSession.customer_id,
      optical_evaluation_id: towerSession.optical_evaluation_id,
      created_by_user_id: auth.userId,
      status: 'created',
      algorithm_version: HEATMAP_ALGORITHM_VERSION,
      target_plan_version: HEATMAP_TARGET_PLAN_VERSION,
    }).select('*').single()
    if (error || !data) return json(false, error?.message || 'Nao foi possivel criar o Campo Visual.', 500)
    return json(true, 'Campo Visual preparado na sessao da Torre.', 200, data)
  }

  if (input.command === 'load-demo-template') {
    const { data: template, error } = await (admin.from('tower_heatmap_demo_templates') as any)
      .select('algorithm_version, target_plan_version, result_summary, target_samples')
      .eq('tenant_id', auth.tenantId)
      .eq('store_id', input.storeId)
      .maybeSingle()
    if (error) return json(false, error.message, 500)
    if (!template) return json(false, 'Nenhum mapa demonstrativo foi gravado para esta loja.', 404)
    const result = z.object({ summary: SummarySchema, targetSamples: z.array(TargetSampleSchema).min(1).max(40) }).safeParse({
      summary: template.result_summary,
      targetSamples: template.target_samples,
    })
    if (!result.success) return json(false, 'O mapa demonstrativo salvo esta incompleto.', 409)
    return json(true, 'Mapa demonstrativo carregado.', 200, {
      ...result.data,
      algorithmVersion: template.algorithm_version,
      targetPlanVersion: template.target_plan_version,
    })
  }

  const { data: session, error: sessionError } = await sessions
    .select('*')
    .eq('id', input.sessionId)
    .eq('store_id', input.storeId)
    .eq('tenant_id', auth.tenantId)
    .maybeSingle()
  if (sessionError) return json(false, sessionError.message, 500)
  if (!session) return json(false, 'Sessao de mapa visual nao encontrada para esta loja.', 404)

  if (input.command === 'start') {
    if (session.status === 'completed' || session.status === 'cancelled') return json(false, 'Esta sessao nao pode mais ser iniciada.', 409)
    if (session.status === 'running') return json(true, 'Sessao ja estava iniciada.')
    const { error } = await sessions.update({ status: 'running', started_at: new Date().toISOString(), cancelled_at: null })
      .eq('id', input.sessionId).eq('store_id', input.storeId).eq('tenant_id', auth.tenantId)
    return error ? json(false, error.message, 500) : json(true, 'Sessao iniciada.')
  }

  if (input.command === 'complete') {
    if (session.status === 'cancelled') return json(false, 'Esta sessao foi cancelada e nao pode ser concluida.', 409)
    if (session.status === 'completed') {
      const sameResult = JSON.stringify(session.result_summary) === JSON.stringify(input.summary)
        && JSON.stringify(session.target_samples) === JSON.stringify(input.targetSamples)
      return sameResult
        ? json(true, 'Mapa visual ja estava salvo.')
        : json(false, 'Esta sessao ja foi concluida com outro resultado.', 409)
    }
    const { error } = await sessions.update({
      status: 'completed',
      result_summary: input.summary,
      target_samples: input.targetSamples,
      completed_at: new Date().toISOString(),
      cancelled_at: null,
    }).eq('id', input.sessionId).eq('store_id', input.storeId).eq('tenant_id', auth.tenantId)
    return error
      ? json(false, error.message, 500)
      : json(true, 'Mapa visual salvo. A sessao da Torre aguarda a decisao do funcionario.')
  }

  if (input.command === 'save-demo-template') {
    if (session.status !== 'completed') return json(false, 'Conclua uma leitura valida antes de gravar o mapa demonstrativo.', 409)
    const result = z.object({ summary: SummarySchema, targetSamples: z.array(TargetSampleSchema).min(1).max(40) }).safeParse({
      summary: session.result_summary,
      targetSamples: session.target_samples,
    })
    if (!result.success) return json(false, 'O resultado salvo desta leitura esta incompleto.', 409)
    const { error } = await (admin.from('tower_heatmap_demo_templates') as any).upsert({
      tenant_id: auth.tenantId,
      store_id: input.storeId,
      source_heatmap_session_id: session.id,
      created_by_user_id: auth.userId,
      algorithm_version: session.algorithm_version,
      target_plan_version: session.target_plan_version,
      result_summary: result.data.summary,
      target_samples: result.data.targetSamples,
    }, { onConflict: 'store_id' })
    return error ? json(false, error.message, 500) : json(true, 'Mapa demonstrativo gravado para esta loja.')
  }

  if (input.command === 'reset') {
    if (session.status === 'running') return json(false, 'A leitura atual precisa ser interrompida antes de recomecar.', 409)
    const { error } = await sessions.update({
      status: 'created', result_summary: null, target_samples: null,
      started_at: null, completed_at: null, cancelled_at: null,
    }).eq('id', input.sessionId).eq('store_id', input.storeId).eq('tenant_id', auth.tenantId)
    return error ? json(false, error.message, 500) : json(true, 'Leitura preparada para recomecar.')
  }

  if (input.command === 'cancel') {
    if (session.status === 'completed') return json(false, 'Uma sessao concluida nao pode ser cancelada.', 409)
    if (session.status === 'cancelled') return json(true, 'Sessao ja estava cancelada.')
    const { error } = await sessions.update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
      .eq('id', input.sessionId).eq('store_id', input.storeId).eq('tenant_id', auth.tenantId)
    return error ? json(false, error.message, 500) : json(true, 'Sessao cancelada.')
  }

  if (session.status !== 'completed') return json(false, 'O mapa visual ainda nao foi concluido.', 409)
  const result = z.object({ summary: SummarySchema, targetSamples: z.array(TargetSampleSchema).min(1).max(40) }).safeParse({
    summary: session.result_summary,
    targetSamples: session.target_samples,
  })
  if (!result.success) return json(false, 'O resultado salvo do mapa visual esta incompleto.', 409)

  let recommendations: unknown[] = []
  if (session.optical_evaluation_id) {
    const { data: evaluation, error: evaluationError } = await (admin.from('optical_evaluations') as any)
      .select('recommended_items')
      .eq('id', session.optical_evaluation_id)
      .eq('tenant_id', auth.tenantId)
      .eq('store_id', input.storeId)
      .maybeSingle()
    if (evaluationError) return json(false, evaluationError.message, 500)
    recommendations = Array.isArray(evaluation?.recommended_items) ? evaluation.recommended_items : []
  }

  return json(true, 'Mapa visual recuperado.', 200, {
    evaluationId: session.optical_evaluation_id,
    customerId: session.customer_id,
    recommendations,
    ...result.data,
  })
}
