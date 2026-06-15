import { timingSafeEqual } from 'node:crypto'

function safeEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

export function isValidWhatsAppInternalRequest(request: Request) {
  const expectedSecret = process.env.WHATSAPP_INTERNAL_SECRET
  if (!expectedSecret) return false

  const authorization = request.headers.get('authorization') ?? ''
  const providedSecret = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : ''

  return Boolean(providedSecret) && safeEquals(providedSecret, expectedSecret)
}
