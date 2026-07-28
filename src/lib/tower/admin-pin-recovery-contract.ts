export const TOWER_PIN_RECOVERY_QR_PREFIX = 'MBTOWER-PIN:1:'
export const TOWER_PIN_RECOVERY_QR_PATTERN = /^MBTOWER-PIN:1:[A-Za-z0-9_-]{43}$/
export const TOWER_PIN_RECOVERY_CODE_PATTERN = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/

export type TowerPinRecoveryMethod = 'qr' | 'code'

export function normalizeTowerPinRecoveryCode(value: string) {
  const normalized = value
    .toUpperCase()
    .replace(/[^23456789ABCDEFGHJKLMNPQRSTUVWXYZ]/g, '')
    .slice(0, 8)

  return normalized.length > 4
    ? `${normalized.slice(0, 4)}-${normalized.slice(4)}`
    : normalized
}

export function extractTowerPinRecoverySecret(
  method: TowerPinRecoveryMethod,
  credential: string,
) {
  const normalized = credential.trim()
  if (method === 'qr') {
    return TOWER_PIN_RECOVERY_QR_PATTERN.test(normalized)
      ? normalized.slice(TOWER_PIN_RECOVERY_QR_PREFIX.length)
      : null
  }

  const code = normalizeTowerPinRecoveryCode(normalized)
  return TOWER_PIN_RECOVERY_CODE_PATTERN.test(code) ? code : null
}
