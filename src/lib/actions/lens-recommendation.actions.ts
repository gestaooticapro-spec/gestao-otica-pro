'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import {
  continueRecommendationConversation,
  startRecommendationConversation,
  type RecommendationCaseInput,
  type RecommendationConversationState,
} from '@/lib/server/lens-recommendation'
import { getAiSuggestionConfig } from '@/lib/actions/store.actions'
import { getAllLensGeometries } from '@/lib/actions/lens-geometry.actions'
import { getCompletedTowerHeatmapResult } from '@/lib/actions/tower-heatmap.actions'

const RecommendationCaseSchema = z.object({
  storeId: z.number().int().positive().optional(),
  versionId: z.string().uuid(),
  versionIds: z.array(z.string().uuid()).optional(),
  idade: z.number().int().positive().optional().nullable(),
  marca_atual: z.string().optional().nullable(),
  esferico: z.number().nullable(),
  cilindrico: z.number().nullable(),
  adicao: z.number().optional().nullable(),
  rotina_tags: z.array(z.string()).default([]),
  objetivo_tags: z.array(z.string()).default([]),
  desired_benefits: z.array(z.string()).default([]),
  preferred_features: z.array(z.string()).default([]),
  rejected_features: z.array(z.string()).default([]),
  budget_mode: z.enum(['economico', 'intermediario', 'premium']).optional().default('intermediario'),
  budget_signal: z.enum(['informado', 'nao_informado']).optional(),
  adaptation_difficulty: z.enum(['baixa', 'media', 'alta']).optional().nullable(),
  notes: z.string().optional().nullable(),
  targetPrice: z.number().optional().nullable(),
  topN: z.number().int().min(1).max(10).optional().default(3),
  heatmapSessionId: z.string().uuid().optional(),
})

const RecommendationConversationSchema = z.object({
  state: z.custom<RecommendationConversationState>(),
  userMessage: z.string().min(2),
  topN: z.number().int().min(1).max(10).optional().default(3),
})

export type LensRecommendationActionResult = {
  success: boolean
  message: string
  data?: unknown
}

async function ensureAuthenticated() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Usuário não autenticado.')
  }
}

function toCaseInput(payload: z.infer<typeof RecommendationCaseSchema>): RecommendationCaseInput {
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

export async function generateLensRecommendationsAction(
  input: unknown,
): Promise<LensRecommendationActionResult> {
  try {
    await ensureAuthenticated()
    const parsed = RecommendationCaseSchema.parse(input)

    const aiConfig = parsed.storeId
      ? await getAiSuggestionConfig(parsed.storeId)
      : undefined
    let heatmap: { samples: Array<{ x: number; y: number; targetX: number; targetY: number }>; geometries: Awaited<ReturnType<typeof getAllLensGeometries>> } | undefined

    if (parsed.heatmapSessionId && parsed.storeId) {
      const heatmapResult = await getCompletedTowerHeatmapResult({
        storeId: parsed.storeId,
        sessionId: parsed.heatmapSessionId,
      })
      if (heatmapResult.success && heatmapResult.data?.summary.isReliable) {
        heatmap = {
          samples: heatmapResult.data.targetSamples.map((sample) => ({
            x: sample.lensX,
            y: sample.lensY,
            targetX: sample.targetX,
            targetY: sample.targetY,
          })),
          geometries: await getAllLensGeometries(),
        }
      }
    }

    const result = await startRecommendationConversation({
      versionId: parsed.versionId,
      versionIds: parsed.versionIds,
      caseInput: toCaseInput(parsed),
      aiConfig,
      topN: parsed.topN,
      heatmap,
    })

    return {
      success: true,
      message: 'Recomendações geradas.',
      data: result,
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Erro ao gerar recomendações.',
    }
  }
}

export async function continueLensRecommendationConversationAction(
  input: unknown,
): Promise<LensRecommendationActionResult> {
  try {
    await ensureAuthenticated()
    const parsed = RecommendationConversationSchema.parse(input)

    const result = await continueRecommendationConversation({
      state: parsed.state,
      userMessage: parsed.userMessage,
      topN: parsed.topN,
    })

    return {
      success: true,
      message: 'Conversa de recomendação atualizada.',
      data: result,
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Erro ao continuar recomendação.',
    }
  }
}
