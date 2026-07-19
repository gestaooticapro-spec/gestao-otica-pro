import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { authorizeTowerRemoteConfigSession } from '@/lib/server/tower-remote-config-session'
import { readTowerRemoteConfig } from '@/lib/server/tower-remote-config'
import { normalizeTowerRemoteConfig, towerRemoteConfigSchema, type TowerRemoteConfig } from '@/lib/tower/remote-config'

export const dynamic = 'force-dynamic'
const paramsSchema = z.object({ publicCode: z.string().regex(/^[A-Za-z0-9_-]{32}$/) })

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
  if (!authorization) return json({ success: false, message: 'Sessao comercial expirada.' }, 401)
  const config = await readTowerRemoteConfig(authorization.session.storeId)
  if (!config) return json({ success: false, message: 'Configuracao indisponivel.' }, 503)
  return json({ success: true, storeId: authorization.session.storeId, config })
}

export async function PUT(request: NextRequest, context: { params: Promise<{ publicCode: string }> }) {
  const authorization = await authorize(context)
  if (!authorization) return json({ success: false, message: 'Sessao comercial expirada.' }, 401)
  let body: unknown
  try { body = await request.json() } catch { return json({ success: false, message: 'Configuracao invalida.' }, 400) }
  const parsed = towerRemoteConfigSchema.safeParse(body)
  if (!parsed.success) return json({ success: false, message: parsed.error.issues[0]?.message || 'Revise a configuracao.' }, 400)

  const nextConfig = normalizeTowerRemoteConfig({
    tower_remote_config: { ...parsed.data, updatedAt: new Date().toISOString() },
  })
  const admin = createAdminClient() as unknown as {
    rpc: (name: 'set_tower_remote_config', args: { p_store_id: number; p_config: TowerRemoteConfig }) => PromiseLike<{ error: unknown }>
  }
  const { error } = await admin.rpc('set_tower_remote_config', {
    p_store_id: authorization.session.storeId,
    p_config: nextConfig,
  })
  if (error) return json({ success: false, message: 'Nao foi possivel publicar. Aplique a migracao do passo 8.' }, 503)
  revalidatePath(`/torre/${authorization.session.storeId}`)
  return json({ success: true, message: 'Configuracao publicada na Torre.', config: nextConfig })
}
