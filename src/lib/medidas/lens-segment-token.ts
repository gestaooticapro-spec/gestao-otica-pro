import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const LENS_SEGMENT_TOKEN_TTL_SECONDS = 120

function safeEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

export function getLensSegmentInternalSecret() {
  const secret = process.env.LENS_SEGMENT_INTERNAL_SECRET ?? ''
  return secret.length >= 32 ? secret : null
}

export function getLensSegmentServiceUrl() {
  const value = process.env.LENS_SEGMENT_URL?.trim() ?? ''
  if (!value) return null
  try {
    const url = new URL(value)
    const isLocalAddress = ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocalAddress)) return null
    return url.toString().replace(/\/+$/, '')
  } catch {
    return null
  }
}

export function issueLensSegmentToken(storeId: number, secret: string, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!Number.isInteger(storeId) || storeId < 1) throw new Error('Loja invalida para o token de analise.')
  const exp = nowSeconds + LENS_SEGMENT_TOKEN_TTL_SECONDS
  const jti = randomBytes(16).toString('hex')
  const payload = `${storeId}.${exp}.${jti}`
  const signature = createHmac('sha256', secret).update(payload).digest('base64url')
  return { token: `${payload}.${signature}`, exp, jti }
}

export function verifyLensSegmentToken(token: string, secret: string, nowSeconds = Math.floor(Date.now() / 1000)) {
  const parts = token.split('.')
  if (parts.length !== 4) return null
  const [storeRaw, expRaw, jti, signature] = parts
  const storeId = Number(storeRaw)
  const exp = Number(expRaw)
  if (!Number.isInteger(storeId) || storeId < 1 || !Number.isInteger(exp) || !jti || jti.length < 16) return null
  if (!/^[0-9a-f]+$/i.test(jti)) return null
  if (exp < nowSeconds) return null
  const payload = `${storeId}.${exp}.${jti}`
  const expected = createHmac('sha256', secret).update(payload).digest('base64url')
  if (!safeEquals(signature, expected)) return null
  return { storeId, exp, jti }
}
