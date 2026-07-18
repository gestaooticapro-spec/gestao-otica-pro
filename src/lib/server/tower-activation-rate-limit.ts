import 'server-only'

import { createHash } from 'crypto'
import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const WINDOW_SECONDS = 10 * 60
const MAX_ATTEMPTS = 8

type RateLimitRow = {
  allowed: boolean
  retry_after_seconds: number
}

function getClientIdentifier(request: NextRequest) {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const address = forwardedFor || request.headers.get('x-real-ip') || 'unknown-address'
  return createHash('sha256').update(address, 'utf8').digest('hex')
}

function getScope(request: NextRequest) {
  return request.nextUrl.pathname.slice(0, 60)
}

export async function registerTowerActivationAttempt(request: NextRequest) {
  const key = getClientIdentifier(request)
  const scope = getScope(request)
  const admin = createAdminClient() as unknown as {
    rpc: (name: 'consume_tower_activation_rate_limit', args: Record<string, unknown>) => PromiseLike<{
      data: RateLimitRow[] | null
      error: unknown
    }>
  }
  const { data, error } = await admin.rpc('consume_tower_activation_rate_limit', {
    p_key_hash: key,
    p_scope: scope,
    p_max_attempts: MAX_ATTEMPTS,
    p_window_seconds: WINDOW_SECONDS,
  })

  if (error || !data?.[0]) {
    console.error('[Torre] Rate limit compartilhado indisponivel:', error)
    return { allowed: false, retryAfterSeconds: 60, key, scope, unavailable: true }
  }

  return {
    allowed: data[0].allowed,
    retryAfterSeconds: data[0].retry_after_seconds,
    key,
    scope,
    unavailable: false,
  }
}

export async function clearTowerActivationAttempts(key: string, scope: string) {
  const admin = createAdminClient() as unknown as {
    rpc: (name: 'clear_tower_activation_rate_limit', args: Record<string, unknown>) => PromiseLike<{
      error: unknown
    }>
  }
  const { error } = await admin.rpc('clear_tower_activation_rate_limit', {
    p_key_hash: key,
    p_scope: scope,
  })
  if (error) console.error('[Torre] Falha ao limpar rate limit:', error)
}
