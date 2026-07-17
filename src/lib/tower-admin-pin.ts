import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'

const PIN_HASH_PREFIX = 'scrypt'

export function hashTowerAdminPin(pin: string) {
  const salt = randomBytes(16).toString('hex')
  const digest = scryptSync(pin, salt, 64).toString('hex')
  return `${PIN_HASH_PREFIX}$${salt}$${digest}`
}

export function verifyTowerAdminPin(pin: string, storedHash: string) {
  const [prefix, salt, expectedDigest] = storedHash.split('$')
  if (prefix !== PIN_HASH_PREFIX || !salt || !expectedDigest) return false

  const actualDigest = scryptSync(pin, salt, 64).toString('hex')
  const expected = Buffer.from(expectedDigest, 'hex')
  const actual = Buffer.from(actualDigest, 'hex')

  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
