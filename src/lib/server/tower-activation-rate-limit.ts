import { createHash } from 'crypto'
import type { NextRequest } from 'next/server'

const WINDOW_MS = 10 * 60 * 1000
const MAX_ATTEMPTS = 8

type AttemptWindow = {
  count: number
  resetAt: number
}

const attemptWindows = new Map<string, AttemptWindow>()

function getClientIdentifier(request: NextRequest) {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const address = forwardedFor || request.headers.get('x-real-ip') || 'unknown-address'
  const userAgent = request.headers.get('user-agent') || 'unknown-agent'

  return createHash('sha256')
    .update(`${address}|${userAgent}`, 'utf8')
    .digest('hex')
}

export function registerTowerActivationAttempt(request: NextRequest) {
  const now = Date.now()
  const key = getClientIdentifier(request)
  const current = attemptWindows.get(key)

  if (!current || current.resetAt <= now) {
    attemptWindows.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return { allowed: true, retryAfterSeconds: 0, key }
  }

  if (current.count >= MAX_ATTEMPTS) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
      key,
    }
  }

  current.count += 1
  return { allowed: true, retryAfterSeconds: 0, key }
}

export function clearTowerActivationAttempts(key: string) {
  attemptWindows.delete(key)
}
