import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateTowerDeviceWebSessionToken } from '@/lib/server/tower-device-web-session'
import { getAiSuggestionConfig } from '@/lib/actions/store.actions'
import {
  continueRecommendationConversation,
  startRecommendationConversation,
  type RecommendationCaseInput,
  type RecommendationConversationState,
} from '@/lib/server/lens-recommendation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const StoreSchema = z.object({ storeId: z.coerce.number().int().positive() })
const CaseSchema = StoreSchema.extend({
  command: z.literal('generate'),
  versionId: z.string().uuid(),
  versionIds: z.array(z.string().uuid()).max(20).optional(),
  idade: z.number().int().positive().max(120).optional().nullable(),
  marca_atual: z.string().max(160).optional().nullable(),
  esferico: z.number().finite().min(-30).max(30).nullable(),
  cilindrico: z.number().finite().min(-15).max(15).nullable(),
  adicao: z.number().finite().min(0).max(8).optional().nullable(),
  rotina_tags: z.array(z.string().max(80)).max(30).default([]),
  objetivo_tags: z.array(z.string().max(80)).max(30).default([]),
  desired_benefits: z.array(z.string().max(80)).max(30).default([]),
  preferred_features: z.array(z.string().max(80)).max(30).default([]),
  rejected_features: z.array(z.string().max(80)).max(30).default([]),
  budget_mode: z.enum(['economico', 'intermediario', 'premium']).default('intermediario'),
  budget_signal: z.enum(['informado', 'nao_informado']).optional(),
  adaptation_difficulty: z.enum(['baixa', 'media', 'alta']).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  targetPrice: z.number().finite().min(0).max(1_000_000).optional().nullable(),
  topN: z.number().int().min(1).max(10).default(3),
  heatmapSessionId: z.string().uuid().optional(),
})
const ContinueSchema = StoreSchema.extend({
  command: z.literal('continue'),
  state: z.object({
    versionId: z.string().uuid(),
    versionIds: z.array(z.string().uuid()).max(20).optional(),
  }).passthrough().transform((state) => state as RecommendationConversationState),
  userMessage: z.string().trim().min(2).max(2000),
  topN: z.number().int().min(1).max(10).default(3),
})
const CommandSchema = z.discriminatedUnion('command', [CaseSchema, ContinueSchema])

function toCaseInput(payload: z.infer<typeof CaseSchema>): RecommendationCaseInput {
  return {
    idade: payload.idade,
    marca_atual: payload.marca_atual,
    esferico: payload.esferico,
    cilindrico: payload.cilindrico,
    adicao: payload.adicao,
    rotina_tags: payload.rotina_tags,
    objetivo_tags: payload.objetivo_tags,
    desired_benefits: payload.desired_benefits,
    preferred_features: payload.preferred_features,
    rejected_features: payload.rejected_features,
    budget_mode: payload.budget_mode,
    budget_signal: payload.budget_signal,
    adaptation_difficulty: payload.adaptation_difficulty,
    notes: payload.notes,
    targetPrice: payload.targetPrice ?? null,
  }
}

async function assertActiveVersions(
  admin: ReturnType<typeof createAdminClient>, tenantId: string, storeId: number, versionIds: string[],
) {
  const uniqueIds = [...new Set(versionIds)]
  const { data, error } = await (admin.from('tenant_catalog_activations') as any)
    .select('global_version_id')
    .eq('tenant_id', tenantId)
    .eq('store_id', storeId)
    .eq('status', 'active')
    .in('global_version_id', uniqueIds)
  if (error) throw new Error(error.message)
  const activeIds = new Set((data ?? []).map((item: any) => item.global_version_id))
  if (uniqueIds.some((id) => !activeIds.has(id))) throw new Error('Catalogo nao esta ativo para esta loja.')
}

async function loadHeatmapContext(
  admin: ReturnType<typeof createAdminClient>, tenantId: string, storeId: number, sessionId: string,
) {
  const { data: session, error } = await (admin.from('tower_heatmap_sessions') as any)
    .select('status, result_summary, target_samples')
    .eq('id', sessionId)
    .eq('tenant_id', tenantId)
    .eq('store_id', storeId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!session || session.status !== 'completed' || session.result_summary?.isReliable !== true || !Array.isArray(session.target_samples)) return undefined

  const samples = session.target_samples.flatMap((sample: any) =>
    [sample.lensX, sample.lensY, sample.targetX, sample.targetY].every(Number.isFinite)
      ? [{ x: sample.lensX, y: sample.lensY, targetX: sample.targetX, targetY: sample.targetY }]
      : [],
  )
  if (!samples.length) return undefined

  const baseColumns = 'id, family_name, visual_design_type, distance_present, distance_width, intermediate_present, intermediate_width, near_present, near_width, corridor_length, lateral_blur, inset, distance_reference_height, near_reference_height, fitting_height, pins'
  let { data: geometries, error: geometryError } = await admin.from('global_lens_geometry').select(`${baseColumns}, corridor_opening`).order('family_name')
  if (geometryError && geometryError.message?.toLowerCase().includes('corridor_opening')) {
    const fallback = await admin.from('global_lens_geometry').select(baseColumns).order('family_name')
    geometries = fallback.data
    geometryError = fallback.error
  }
  if (geometryError) throw new Error(geometryError.message)
  return { samples, geometries: geometries ?? [] }
}

export async function POST(request: NextRequest) {
  const parsed = CommandSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ success: false, message: parsed.error.issues[0]?.message || 'Solicitacao de recomendacao invalida.' }, { status: 400 })

  const authorization = request.headers.get('authorization') ?? ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!token) return NextResponse.json({ success: false, message: 'Torre nao autenticada.' }, { status: 401 })
  const auth = await authenticateTowerDeviceWebSessionToken(token, parsed.data.storeId)
  if (!auth.ok) return NextResponse.json({ success: false, message: auth.message }, { status: 401 })

  try {
    const admin = createAdminClient()
    if (parsed.data.command === 'continue') {
      const stateVersionIds = parsed.data.state.versionIds?.length
        ? parsed.data.state.versionIds
        : [parsed.data.state.versionId]
      await assertActiveVersions(admin, auth.tenantId, parsed.data.storeId, stateVersionIds)
      const result = await continueRecommendationConversation({
        state: parsed.data.state,
        userMessage: parsed.data.userMessage,
        topN: parsed.data.topN,
      })
      return NextResponse.json({ success: true, message: 'Conversa de recomendacao atualizada.', data: result })
    }

    const versionIds = parsed.data.versionIds?.length ? parsed.data.versionIds : [parsed.data.versionId]
    if (!versionIds.includes(parsed.data.versionId)) versionIds.unshift(parsed.data.versionId)
    await assertActiveVersions(admin, auth.tenantId, parsed.data.storeId, versionIds)
    const [aiConfig, heatmap] = await Promise.all([
      getAiSuggestionConfig(parsed.data.storeId),
      parsed.data.heatmapSessionId
        ? loadHeatmapContext(admin, auth.tenantId, parsed.data.storeId, parsed.data.heatmapSessionId)
        : Promise.resolve(undefined),
    ])
    const result = await startRecommendationConversation({
      versionId: parsed.data.versionId,
      versionIds,
      caseInput: toCaseInput(parsed.data),
      aiConfig,
      topN: parsed.data.topN,
      heatmap,
    })
    return NextResponse.json({ success: true, message: 'Recomendacoes geradas.', data: result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao gerar recomendacoes.'
    const status = message === 'Catalogo nao esta ativo para esta loja.' ? 409 : 500
    return NextResponse.json({ success: false, message }, { status })
  }
}
