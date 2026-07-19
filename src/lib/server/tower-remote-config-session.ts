import 'server-only'

import { createHmac, timingSafeEqual } from 'crypto'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

export const TOWER_REMOTE_CONFIG_SESSION_COOKIE = 'tower_remote_config_session_v1'
export const TOWER_REMOTE_CONFIG_SESSION_SECONDS = 8 * 60 * 60

type RemoteSession = {
  version: 1
  publicCode: string
  storeId: number
  expiresAt: number
}

function secret() {
  const value = process.env.TOWER_DEVICE_WEB_SESSION_SECRET?.trim()
    || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!value || value.length < 32) throw new Error('Segredo da Torre nao configurado.')
  return value
}

function signature(payload: string) {
  return createHmac('sha256', secret())
    .update(`tower-remote-config-session:v1:${payload}`, 'utf8')
    .digest('base64url')
}

export function issueTowerRemoteConfigSession(publicCode: string, storeId: number) {
  const expiresAt = Math.floor(Date.now() / 1000) + TOWER_REMOTE_CONFIG_SESSION_SECONDS
  const payload = Buffer.from(JSON.stringify({
    version: 1,
    publicCode,
    storeId,
    expiresAt,
  } satisfies RemoteSession), 'utf8').toString('base64url')
  return { token: `${payload}.${signature(payload)}`, expiresAt }
}

function verify(token: string): RemoteSession | null {
  const [payload, suppliedSignature, extra] = token.split('.')
  if (!payload || !suppliedSignature || extra) return null
  const expectedSignature = signature(payload)
  const supplied = Buffer.from(suppliedSignature, 'utf8')
  const expected = Buffer.from(expectedSignature, 'utf8')
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null
  try {
    const value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as RemoteSession
    if (value.version !== 1
      || !/^[A-Za-z0-9_-]{32}$/.test(value.publicCode)
      || !Number.isSafeInteger(value.storeId)
      || value.storeId <= 0
      || value.expiresAt <= Math.floor(Date.now() / 1000)) return null
    return value
  } catch {
    return null
  }
}

export async function authorizeTowerRemoteConfigSession(publicCode: string) {
  const cookieStore = await cookies()
  const token = cookieStore.get(TOWER_REMOTE_CONFIG_SESSION_COOKIE)?.value
  if (!token) return null
  const session = verify(token)
  if (!session || session.publicCode !== publicCode) return null

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('tower_remote_config_access' as never)
    .select('store_id,public_code')
    .eq('store_id', session.storeId)
    .eq('public_code', session.publicCode)
    .maybeSingle()
  if (error || !data) return null
  return session
}
