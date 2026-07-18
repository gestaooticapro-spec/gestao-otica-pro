export const TOWER_ASSET_PUBLIC_CODE_PATTERN = /^MBT-[0-9]{4}-[0-9]{6}$/
export const TOWER_ASSET_QR_PREFIX = 'MBTOWER-ASSET:1:'
export const TOWER_ASSET_QR_PATTERN = /^MBTOWER-ASSET:1:(MBT-[0-9]{4}-[0-9]{6}):([A-Za-z0-9_-]{43})$/
export const TOWER_ASSET_CREDENTIAL_PATTERN = /^tower_asset_v1_[A-Za-z0-9_-]{43}$/
export const TOWER_ASSET_FALLBACK_CODE_PATTERN = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/

export type TowerAssetEnrollmentMethod = 'qr' | 'code'

export type TowerAssetEnrollmentResponse =
  | {
      success: true
      status: 'enrolled'
      assetId: string
      publicCode: string
      assetCredential: string
      enrolledAt: string
    }
  | { success: false; message: string }

export type TowerAssetStatusResponse =
  | {
      success: true
      status: 'prepared' | 'in_stock' | 'assigned' | 'maintenance'
      assetId: string
      publicCode: string
    }
  | { success: false; message: string }

export function normalizeTowerAssetPublicCode(value: string) {
  return value.trim().toUpperCase()
}

export function normalizeTowerAssetFallbackCode(value: string) {
  const normalized = value
    .toUpperCase()
    .replace(/[^23456789ABCDEFGHJKLMNPQRSTUVWXYZ]/g, '')
    .slice(0, 8)
  return normalized.length > 4
    ? `${normalized.slice(0, 4)}-${normalized.slice(4)}`
    : normalized
}

export function extractTowerAssetEnrollment(
  method: TowerAssetEnrollmentMethod,
  publicCodeInput: string,
  credentialInput: string,
) {
  if (method === 'qr') {
    const match = credentialInput.trim().match(TOWER_ASSET_QR_PATTERN)
    return match ? { publicCode: match[1], secret: match[2] } : null
  }

  const publicCode = normalizeTowerAssetPublicCode(publicCodeInput)
  const secret = normalizeTowerAssetFallbackCode(credentialInput)
  return TOWER_ASSET_PUBLIC_CODE_PATTERN.test(publicCode)
    && TOWER_ASSET_FALLBACK_CODE_PATTERN.test(secret)
    ? { publicCode, secret }
    : null
}
