import 'server-only'

import { createHmac, timingSafeEqual } from 'crypto'
import { cookies } from 'next/headers'
import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'
import { createAsyncClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/database.types'
import type { AuthenticatedTowerDevice } from '@/lib/server/tower-device-auth'

export const TOWER_DEVICE_WEB_SESSION_COOKIE = 'tower_device_web_session_v1'
const SESSION_LIFETIME_SECONDS = 15 * 60

type TowerDeviceWebSession = {
  version: 1
  deviceId: string
  assetId: string
  tenantId: string
  storeId: number
  expiresAt: number
}

type TowerStoreAccess = {
  ok: true
  tenantId: string
  userId: string | null
  deviceId: string | null
  source: 'user' | 'device'
}

type TowerStoreAccessFailure = { ok: false; message: string }

function getSigningSecret() {
  const secret = process.env.TOWER_DEVICE_WEB_SESSION_SECRET?.trim()
    || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!secret || secret.length < 32) {
    throw new Error('Segredo da sessao web da Torre nao configurado.')
  }
  return secret
}

function encode(value: string) {
  return Buffer.from(value, 'utf8').toString('base64url')
}

function sign(encodedPayload: string) {
  return createHmac('sha256', getSigningSecret())
    .update(`tower-device-web-session:v1:${encodedPayload}`, 'utf8')
    .digest('base64url')
}

export function issueTowerDeviceWebSession(device: AuthenticatedTowerDevice) {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_LIFETIME_SECONDS
  const payload: TowerDeviceWebSession = {
    version: 1,
    deviceId: device.id,
    assetId: device.assetId,
    tenantId: device.tenantId,
    storeId: device.storeId,
    expiresAt,
  }
  const encodedPayload = encode(JSON.stringify(payload))
  return {
    token: `${encodedPayload}.${sign(encodedPayload)}`,
    expiresAt,
  }
}

function verifyTowerDeviceWebSession(token: string): TowerDeviceWebSession | null {
  const [encodedPayload, suppliedSignature, extra] = token.split('.')
  if (!encodedPayload || !suppliedSignature || extra) return null

  const expectedSignature = sign(encodedPayload)
  const supplied = Buffer.from(suppliedSignature, 'utf8')
  const expected = Buffer.from(expectedSignature, 'utf8')
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as TowerDeviceWebSession
    if (payload.version !== 1
        || !/^[0-9a-f-]{36}$/i.test(payload.deviceId)
        || !/^[0-9a-f-]{36}$/i.test(payload.assetId)
        || !/^[0-9a-f-]{36}$/i.test(payload.tenantId)
        || !Number.isSafeInteger(payload.storeId)
        || payload.storeId <= 0
        || !Number.isSafeInteger(payload.expiresAt)
        || payload.expiresAt <= Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

export async function authenticateTowerDeviceWebSessionToken(
  token: string,
  expectedStoreId: number,
): Promise<TowerStoreAccess | TowerStoreAccessFailure> {
  const session = verifyTowerDeviceWebSession(token)
  if (!session || session.storeId !== expectedStoreId) {
    return { ok: false, message: 'Sessao local da Torre invalida para esta loja.' }
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('tower_devices')
    .select('id')
    .eq('id', session.deviceId)
    .eq('asset_id', session.assetId)
    .eq('tenant_id', session.tenantId)
    .eq('store_id', session.storeId)
    .eq('status', 'active')
    .maybeSingle()

  if (error || !data) return { ok: false, message: 'Credencial da Torre revogada ou indisponivel.' }
  return {
    ok: true,
    tenantId: session.tenantId,
    userId: null,
    deviceId: session.deviceId,
    source: 'device',
  }
}

async function authorizeDeviceCookie(storeId: number): Promise<TowerStoreAccess | TowerStoreAccessFailure> {
  const cookieStore = await cookies()
  const token = cookieStore.get(TOWER_DEVICE_WEB_SESSION_COOKIE)?.value
  if (!token) return { ok: false, message: 'Torre nao autenticada.' }

  return authenticateTowerDeviceWebSessionToken(token, storeId)
}

export async function authorizeTowerStoreAccess(
  storeId: number,
): Promise<TowerStoreAccess | TowerStoreAccessFailure> {
  const deviceAccess = await authorizeDeviceCookie(storeId)
  if (deviceAccess.ok) return deviceAccess

  const supabase = await createAsyncClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    const profile = (await getProfileByAdmin(user.id)) as Database['public']['Tables']['profiles']['Row'] | null
    if (!profile?.tenant_id) return { ok: false, message: 'Perfil do usuario sem tenant.' }
    if (profile.role !== 'admin' && profile.store_id !== storeId) {
      return { ok: false, message: 'Acesso negado para esta loja.' }
    }
    return {
      ok: true,
      tenantId: profile.tenant_id,
      userId: user.id,
      deviceId: null,
      source: 'user',
    }
  }

  return deviceAccess
}
