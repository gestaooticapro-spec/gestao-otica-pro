import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'

const COOKIE_PREFIX = 'daily_health_manager_'
const MAX_AGE_SECONDS = 15 * 60

type ManagerGrant = { storeId: number; employeeId: number; expiresAt: number }

function signingSecret() {
  return process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
}

function signature(value: string) {
  return createHmac('sha256', signingSecret()).update(value).digest('base64url')
}

export function createDailyHealthGrant(storeId: number, employeeId: number) {
  const payload: ManagerGrant = { storeId, employeeId, expiresAt: Date.now() + MAX_AGE_SECONDS * 1000 }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${encoded}.${signature(encoded)}`
}

export function readDailyHealthGrant(value: string | undefined, storeId: number): ManagerGrant | null {
  if (!value || !signingSecret()) return null
  const [encoded, suppliedSignature] = value.split('.')
  if (!encoded || !suppliedSignature) return null
  const expectedSignature = signature(encoded)
  const left = Buffer.from(suppliedSignature)
  const right = Buffer.from(expectedSignature)
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as ManagerGrant
    const valid = payload.storeId === storeId
      && payload.expiresAt > Date.now()
      && payload.expiresAt <= Date.now() + MAX_AGE_SECONDS * 1000
    return valid ? payload : null
  } catch {
    return null
  }
}

export function verifyDailyHealthGrant(value: string | undefined, storeId: number) {
  return readDailyHealthGrant(value, storeId) !== null
}

export async function hasDailyHealthManagerGrant(storeId: number) {
  const cookieStore = cookies()
  return verifyDailyHealthGrant(cookieStore.get(`${COOKIE_PREFIX}${storeId}`)?.value, storeId)
}

export async function getDailyHealthManagerGrant(storeId: number) {
  const cookieStore = cookies()
  return readDailyHealthGrant(cookieStore.get(`${COOKIE_PREFIX}${storeId}`)?.value, storeId)
}

export function dailyHealthCookieName(storeId: number) {
  return `${COOKIE_PREFIX}${storeId}`
}

export const dailyHealthGrantMaxAge = MAX_AGE_SECONDS
