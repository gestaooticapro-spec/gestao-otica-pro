import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  activateGlobalCatalogForTowerRemote,
  getGlobalCatalogOverviewForTowerRemote,
} from '@/lib/actions/global-catalog.actions'
import { authorizeTowerRemoteConfigSession } from '@/lib/server/tower-remote-config-session'

export const dynamic = 'force-dynamic'

const paramsSchema = z.object({ publicCode: z.string().regex(/^[A-Za-z0-9_-]{32}$/) })
const bodySchema = z.object({ versionId: z.string().uuid() }).strict()

function json(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, status === 200 ? { headers: { 'Cache-Control': 'no-store, max-age=0' } } : { status, headers: { 'Cache-Control': 'no-store, max-age=0' } })
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

  try {
    const overview = await getGlobalCatalogOverviewForTowerRemote(authorization.publicCode)
    return json({ success: true, overview })
  } catch {
    return json({ success: false, message: 'Nao foi possivel carregar as tabelas.' }, 503)
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ publicCode: string }> }) {
  const authorization = await authorize(context)
  if (!authorization) return json({ success: false, message: 'Sessao comercial expirada.' }, 401)

  let body: unknown
  try { body = await request.json() } catch { return json({ success: false, message: 'Selecione uma tabela valida.' }, 400) }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return json({ success: false, message: 'Selecione uma tabela valida.' }, 400)

  const result = await activateGlobalCatalogForTowerRemote(authorization.publicCode, parsed.data.versionId)
  return json(result, result.success ? 200 : 400)
}
