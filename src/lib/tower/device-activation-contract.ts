export const TOWER_QR_PREFIX = 'MBTOWER:1:'
export const TOWER_QR_PAYLOAD_PATTERN = /^MBTOWER:1:[A-Za-z0-9_-]{43}$/
export const TOWER_FALLBACK_CODE_PATTERN = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/

export type TowerActivationMethod = 'qr' | 'code'

export type TowerActivationValidationResponse =
  | {
      success: true
      status: 'validated'
      expiresAt: string
    }
  | {
      success: false
      message: string
    }

export const TOWER_DEVICE_CREDENTIAL_PATTERN = /^tower_device_v1_[A-Za-z0-9_-]{43}$/

export type TowerDevicePairingResponse =
  | {
      success: true
      status: 'paired'
      deviceId: string
      assetId: string
      publicCode: string
      tenantId: string
      storeId: number
      deviceCredential: string
      pairedAt: string
    }
  | {
      success: false
      message: string
    }

export type TowerDeviceStatusResponse =
  | {
      success: true
      status: 'active'
      deviceId: string
      assetId: string
      publicCode: string
      tenantId: string
      storeId: number
      deviceLabel: string
      pairedAt: string
    }
  | {
      success: false
      message: string
    }

export function normalizeTowerFallbackCode(value: string) {
  const normalized = value
    .toUpperCase()
    .replace(/[^23456789ABCDEFGHJKLMNPQRSTUVWXYZ]/g, '')
    .slice(0, 8)

  return normalized.length > 4
    ? `${normalized.slice(0, 4)}-${normalized.slice(4)}`
    : normalized
}

export function extractTowerActivationSecret(
  method: TowerActivationMethod,
  credential: string,
) {
  const normalized = credential.trim()

  if (method === 'qr') {
    return TOWER_QR_PAYLOAD_PATTERN.test(normalized)
      ? normalized.slice(TOWER_QR_PREFIX.length)
      : null
  }

  const fallbackCode = normalizeTowerFallbackCode(normalized)
  return TOWER_FALLBACK_CODE_PATTERN.test(fallbackCode) ? fallbackCode : null
}
