import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { clearTowerActivationAttempts, registerTowerActivationAttempt } from '@/lib/server/tower-activation-rate-limit'
import {
  issueTowerRemoteConfigSession,
  TOWER_REMOTE_CONFIG_SESSION_COOKIE,
  TOWER_REMOTE_CONFIG_SESSION_SECONDS,
} from '@/lib/server/tower-remote-config-session'
import { verifyTowerAdminPin } from '@/lib/tower-admin-pin'

export const dynamic = 'force-dynamic'

const paramsSchema = z.object({ publicCode: z.string().regex(/^[A-Za-z0-9_-]{32}$/) })
const bodySchema = z.object({ pin: z.string().regex(/^\d{6}$/) }).strict()
type AccessRow = { store_id: number; pin_hash: string; locked_until: string | null }
type AttemptRow = { pin_verified: boolean; pin_store_id: number; pin_failed_attempts: number; pin_locked_until: string | null }

function json(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, { status, headers: { 'Cache-Control': 'no-store, max-age=0' } })
}

export async function POST(request: NextRequest, context: { params: Promise<{ publicCode: string }> }) {
  const parsedParams = paramsSchema.safeParse(await context.params)
  if (!parsedParams.success) return json({ success: false, message: 'Link invalido.' }, 404)

  let body: unknown
  try { body = await request.json() } catch { return json({ success: false, message: 'Informe o PIN comercial.' }, 400) }
  const parsedBody = bodySchema.safeParse(body)
  if (!parsedBody.success) return json({ success: false, message: 'Informe o PIN comercial de seis digitos.' }, 400)

  const rateLimit = await registerTowerActivationAttempt(request)
  if (!rateLimit.allowed) {
    return json({ success: false, message: 'Muitas tentativas. Aguarde antes de tentar novamente.', retryAfterSeconds: rateLimit.retryAfterSeconds }, 429)
  }

  const admin = createAdminClient() as unknown as {
    from: (table: 'tower_remote_config_access') => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          maybeSingle: () => PromiseLike<{ data: AccessRow | null; error: unknown }>
        }
      }
    }
    rpc: (name: 'record_tower_remote_config_pin_attempt', args: Record<string, unknown>) => PromiseLike<{ data: AttemptRow[] | null; error: unknown }>
  }
  const { data: access, error } = await admin.from('tower_remote_config_access')
    .select('store_id,pin_hash,locked_until')
    .eq('public_code', parsedParams.data.publicCode)
    .maybeSingle()
  if (error || !access) return json({ success: false, message: 'Link invalido ou substituido.' }, 404)
  if (access.locked_until && new Date(access.locked_until).getTime() > Date.now()) {
    return json({ success: false, message: 'Acesso bloqueado por 15 minutos.', lockedUntil: access.locked_until }, 423)
  }

  const verified = verifyTowerAdminPin(parsedBody.data.pin, access.pin_hash)
  const { data: attempts, error: attemptError } = await admin.rpc('record_tower_remote_config_pin_attempt', {
    p_public_code: parsedParams.data.publicCode,
    p_expected_pin_hash: access.pin_hash,
    p_verified: verified,
  })
  if (attemptError || !attempts?.[0]) return json({ success: false, message: 'Nao foi possivel validar o PIN.' }, 503)
  const result = attempts[0]
  if (!result.pin_verified) {
    return json({
      success: false,
      message: result.pin_locked_until ? 'Acesso bloqueado por 15 minutos.' : 'PIN comercial incorreto.',
      failedAttempts: result.pin_failed_attempts,
      lockedUntil: result.pin_locked_until,
    }, result.pin_locked_until ? 423 : 401)
  }

  await clearTowerActivationAttempts(rateLimit.key, rateLimit.scope)
  const session = issueTowerRemoteConfigSession(parsedParams.data.publicCode, result.pin_store_id)
  const response = json({ success: true, message: 'Acesso liberado.' })
  response.cookies.set({
    name: TOWER_REMOTE_CONFIG_SESSION_COOKIE,
    value: session.token,
    httpOnly: true,
    secure: request.nextUrl.protocol === 'https:',
    sameSite: 'strict',
    path: '/',
    maxAge: TOWER_REMOTE_CONFIG_SESSION_SECONDS,
  })
  return response
}

export async function DELETE(request: NextRequest) {
  const response = json({ success: true })
  response.cookies.set({
    name: TOWER_REMOTE_CONFIG_SESSION_COOKIE,
    value: '',
    httpOnly: true,
    secure: request.nextUrl.protocol === 'https:',
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  })
  return response
}
