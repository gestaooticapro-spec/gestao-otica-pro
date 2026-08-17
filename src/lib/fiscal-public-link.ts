import { createHmac, timingSafeEqual } from 'node:crypto'

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000

function secret() {
  const value = process.env.FISCAL_PUBLIC_LINK_SECRET || process.env.WHATSAPP_INTERNAL_SECRET
  if (!value) throw new Error('FISCAL_PUBLIC_LINK_SECRET is required')
  return value
}

function signature(invoiceId: number, expiresAt: number) {
  return createHmac('sha256', secret())
    .update(`fiscal-print:${invoiceId}:${expiresAt}`)
    .digest('base64url')
}

export function createFiscalPublicLinkToken(invoiceId: number, ttlMs = DEFAULT_TTL_MS) {
  const expiresAt = Date.now() + ttlMs
  return `${expiresAt}.${signature(invoiceId, expiresAt)}`
}

export function verifyFiscalPublicLinkToken(invoiceId: number, token: string | null) {
  if (!token) return false
  const [expiresAtRaw, suppliedSignature, ...rest] = token.split('.')
  const expiresAt = Number(expiresAtRaw)
  if (rest.length > 0 || !Number.isSafeInteger(expiresAt) || expiresAt <= Date.now() || !suppliedSignature) return false

  const expectedSignature = signature(invoiceId, expiresAt)
  const supplied = Buffer.from(suppliedSignature)
  const expected = Buffer.from(expectedSignature)
  return supplied.length === expected.length && timingSafeEqual(supplied, expected)
}
