import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAiConfigCatalogData, getAiSuggestionConfig } from '@/lib/actions/store.actions'
import { sanitizeAiSuggestionConfig } from '@/lib/ai-suggestion-config'
import type { AiSuggestionConfig } from '@/lib/types/ai-config.types'
import type { Json } from '@/lib/database.types'
import { authorizeTowerRemoteConfigSession } from '@/lib/server/tower-remote-config-session'

export const dynamic = 'force-dynamic'

const paramsSchema = z.object({ publicCode: z.string().regex(/^[A-Za-z0-9_-]{32}$/) })
type StoreSettingsRow = { settings: Json | null }
type TowerStoresApi = {
  select: (columns: string) => {
    eq: (column: string, value: number) => {
      single: () => PromiseLike<{ data: StoreSettingsRow | null; error: unknown }>
    }
  }
  update: (values: { settings: Json }) => {
    eq: (column: string, value: number) => PromiseLike<{ error: unknown }>
  }
}

function json(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, { status, headers: { 'Cache-Control': 'no-store, max-age=0' } })
}

async function authorize(context: { params: Promise<{ publicCode: string }> }) {
  const parsed = paramsSchema.safeParse(await context.params)
  if (!parsed.success) return null
  const session = await authorizeTowerRemoteConfigSession(parsed.data.publicCode)
  return session ? { publicCode: parsed.data.publicCode, session } : null
}

export async function GET(_request: NextRequest, context: { params: Promise<{ publicCode: string }> }) {
  const authorization = await authorize(context)
  if (!authorization) return json({ error: 'Sessão comercial expirada.' }, 401)

  try {
    const [config, catalogData] = await Promise.all([
      getAiSuggestionConfig(authorization.session.storeId),
      getAiConfigCatalogData(authorization.session.storeId),
    ])
    return json({ config, ...catalogData })
  } catch {
    return json({ error: 'Não foi possível carregar as decisões comerciais.' }, 503)
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ publicCode: string }> }) {
  const authorization = await authorize(context)
  if (!authorization) return json({ error: 'Sessão comercial expirada.' }, 401)

  let body: AiSuggestionConfig
  try { body = await request.json() as AiSuggestionConfig } catch { return json({ error: 'Configuração inválida.' }, 400) }

  try {
    const nextConfig = sanitizeAiSuggestionConfig(body)
    const stores = createAdminClient().from('stores') as unknown as TowerStoresApi
    const { data: store, error: storeError } = await stores
      .select('settings')
      .eq('id', authorization.session.storeId)
      .single()
    if (storeError || !store) return json({ error: 'Loja da Torre indisponível.' }, 404)

    const currentSettings = store.settings && typeof store.settings === 'object' && !Array.isArray(store.settings)
      ? store.settings
      : {}
    const { error } = await stores
      .update({ settings: { ...currentSettings, ai_suggestion_config: nextConfig } as unknown as Json })
      .eq('id', authorization.session.storeId)
    if (error) return json({ error: 'Não foi possível salvar as decisões comerciais.' }, 503)

    revalidatePath(`/torre/${authorization.session.storeId}`)
    return json({ success: true, message: 'Decisões comerciais salvas.' })
  } catch {
    return json({ error: 'Configuração inválida.' }, 400)
  }
}
