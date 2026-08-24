import 'server-only'

import { createHmac, timingSafeEqual } from 'crypto'

const AUTHORIZATION_LIFETIME_SECONDS = 5 * 60

export type EmployeeAuthorizationPurpose =
  | 'evaluation_unlink'
  | 'installment_receipt_reversal'
  | 'pix_charge_create'
  | 'pix_charge_cancel'
  | 'pix_charge_recover'
  | 'daily_health_access'

type EmployeeAuthorizationPayload = {
  version: 1
  userId: string
  tenantId: string
  storeId: number
  employeeId: number
  purpose: EmployeeAuthorizationPurpose
  context: string
  expiresAt: number
}

function getSigningSecret() {
  const value = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!value || value.length < 32) {
    throw new Error('Segredo de autorizacao de funcionario nao configurado.')
  }
  return value
}

function sign(encodedPayload: string) {
  return createHmac('sha256', getSigningSecret())
    .update(`employee-authorization:v1:${encodedPayload}`, 'utf8')
    .digest('base64url')
}

export function issueEmployeeAuthorization(input: {
  userId: string
  tenantId: string
  storeId: number
  employeeId: number
  purpose: EmployeeAuthorizationPurpose
  context: string
}) {
  const payload: EmployeeAuthorizationPayload = {
    version: 1,
    ...input,
    expiresAt: Math.floor(Date.now() / 1000) + AUTHORIZATION_LIFETIME_SECONDS,
  }
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  return `${encodedPayload}.${sign(encodedPayload)}`
}

export function verifyEmployeeAuthorization(
  token: string | null,
  expected: {
    userId: string
    tenantId: string
    storeId: number
    purpose: EmployeeAuthorizationPurpose
    context: string
  },
): EmployeeAuthorizationPayload | null {
  if (!token) return null

  const [encodedPayload, suppliedSignature, extra] = token.split('.')
  if (!encodedPayload || !suppliedSignature || extra) return null

  const expectedSignature = sign(encodedPayload)
  const supplied = Buffer.from(suppliedSignature, 'utf8')
  const signature = Buffer.from(expectedSignature, 'utf8')
  if (supplied.length !== signature.length || !timingSafeEqual(supplied, signature)) return null

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8')
    ) as EmployeeAuthorizationPayload

    if (
      payload.version !== 1
      || payload.userId !== expected.userId
      || payload.tenantId !== expected.tenantId
      || payload.storeId !== expected.storeId
      || payload.purpose !== expected.purpose
      || payload.context !== expected.context
      || !Number.isSafeInteger(payload.employeeId)
      || payload.employeeId <= 0
      || !Number.isSafeInteger(payload.expiresAt)
      || payload.expiresAt <= Math.floor(Date.now() / 1000)
    ) {
      return null
    }

    return payload
  } catch {
    return null
  }
}
