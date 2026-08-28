import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'

const COOKIE_PREFIX = 'pix_machine_access_'
const MAX_AGE_SECONDS = 8 * 60 * 60

type PixMachineGrant = {
  version: 1
  storeId: number
  employeeId: number
  expiresAt: number
}

function signingSecret() {
  const value = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!value || value.length < 32) throw new Error('Segredo de acesso da maquininha nao configurado.')
  return value
}

function signature(encoded: string) {
  return createHmac('sha256', signingSecret())
    .update(`pix-machine-access:v1:${encoded}`, 'utf8')
    .digest('base64url')
}

export function pixMachineCookieName(storeId: number) {
  return `${COOKIE_PREFIX}${storeId}`
}

export function createPixMachineGrant(storeId: number, employeeId: number) {
  const payload: PixMachineGrant = {
    version: 1,
    storeId,
    employeeId,
    expiresAt: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS,
  }
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  return `${encoded}.${signature(encoded)}`
}

export function verifyPixMachineGrant(value: string | undefined, storeId: number) {
  if (!value) return false
  const [encoded, suppliedSignature, extra] = value.split('.')
  if (!encoded || !suppliedSignature || extra) return false

  const expectedSignature = Buffer.from(signature(encoded), 'utf8')
  const supplied = Buffer.from(suppliedSignature, 'utf8')
  if (expectedSignature.length !== supplied.length || !timingSafeEqual(expectedSignature, supplied)) return false

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as PixMachineGrant
    return payload.version === 1
      && payload.storeId === storeId
      && Number.isSafeInteger(payload.employeeId)
      && payload.employeeId > 0
      && Number.isSafeInteger(payload.expiresAt)
      && payload.expiresAt > Math.floor(Date.now() / 1000)
  } catch {
    return false
  }
}

export async function hasPixMachineGrant(storeId: number) {
  return verifyPixMachineGrant(cookies().get(pixMachineCookieName(storeId))?.value, storeId)
}

export const pixMachineGrantMaxAge = MAX_AGE_SECONDS
