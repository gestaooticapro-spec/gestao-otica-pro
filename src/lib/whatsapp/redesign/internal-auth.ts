import { timingSafeEqual } from 'node:crypto'

export function isWhatsAppRedesignInternalRequestAuthorized(request: Request) {
  const authorization = request.headers.get('authorization') ?? ''
  const provided = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!provided) return false
  const providedBuffer = Buffer.from(provided)
  return [process.env.WHATSAPP_INTERNAL_SECRET, process.env.CRON_SECRET]
    .filter((secret): secret is string => Boolean(secret))
    .some(secret => {
      const secretBuffer = Buffer.from(secret)
      return providedBuffer.length === secretBuffer.length && timingSafeEqual(providedBuffer, secretBuffer)
    })
}
