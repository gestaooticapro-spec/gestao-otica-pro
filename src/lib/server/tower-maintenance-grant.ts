import 'server-only'

import { createHmac, timingSafeEqual } from 'crypto'
import type { AuthenticatedTowerDevice } from '@/lib/server/tower-device-auth'

const GRANT_LIFETIME_SECONDS = 5 * 60

type MaintenanceGrant = {
  version: 1
  deviceId: string
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
    .update(`tower-maintenance-grant:v1:${payload}`, 'utf8')
    .digest('base64url')
}

export function issueTowerMaintenanceGrant(device: AuthenticatedTowerDevice) {
  const payload: MaintenanceGrant = {
    version: 1,
    deviceId: device.id,
    storeId: device.storeId,
    expiresAt: Math.floor(Date.now() / 1000) + GRANT_LIFETIME_SECONDS,
  }
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  return `${encoded}.${signature(encoded)}`
}

export function verifyTowerMaintenanceGrant(
  token: string | null,
  device: AuthenticatedTowerDevice,
) {
  if (!token) return false
  const [encoded, suppliedSignature, extra] = token.split('.')
  if (!encoded || !suppliedSignature || extra) return false
  const expectedSignature = signature(encoded)
  const supplied = Buffer.from(suppliedSignature, 'utf8')
  const expected = Buffer.from(expectedSignature, 'utf8')
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return false
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as MaintenanceGrant
    return payload.version === 1
      && payload.deviceId === device.id
      && payload.storeId === device.storeId
      && payload.expiresAt > Math.floor(Date.now() / 1000)
  } catch {
    return false
  }
}
