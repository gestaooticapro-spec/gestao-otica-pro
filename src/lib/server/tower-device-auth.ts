import { createHash } from 'crypto'
import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { TOWER_DEVICE_CREDENTIAL_PATTERN } from '@/lib/tower/device-activation-contract'

export type AuthenticatedTowerDevice = {
  id: string
  assetId: string
  publicCode: string
  tenantId: string
  storeId: number
  deviceLabel: string
  pairedAt: string
}

export type TowerDeviceAuthenticationResult =
  | { status: 'authenticated'; device: AuthenticatedTowerDevice }
  | { status: 'invalid' }
  | { status: 'unavailable' }

type TowerDeviceAuthRow = {
  id: string
  asset_id: string
  tower_assets: { public_code: string } | Array<{ public_code: string }> | null
  tenant_id: string
  store_id: number
  device_label: string
  paired_at: string
  status: 'active'
}

export async function authenticateTowerDevice(
  request: NextRequest,
): Promise<TowerDeviceAuthenticationResult> {
  const authorization = request.headers.get('authorization') || ''
  const [scheme, credential, extra] = authorization.trim().split(/\s+/)

  if (scheme !== 'Bearer' || extra || !TOWER_DEVICE_CREDENTIAL_PATTERN.test(credential || '')) {
    return { status: 'invalid' }
  }

  const credentialHash = createHash('sha256')
    .update(credential, 'utf8')
    .digest('hex')
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('tower_devices')
    .select('id,asset_id,tenant_id,store_id,device_label,paired_at,status,tower_assets(public_code)')
    .eq('credential_hash', credentialHash)
    .eq('status', 'active')
    .maybeSingle()

  if (error) {
    console.error('[Torre] Falha ao autenticar dispositivo:', error)
    return { status: 'unavailable' }
  }

  const device = data as TowerDeviceAuthRow | null
  const relatedAsset = Array.isArray(device?.tower_assets)
    ? device?.tower_assets[0]
    : device?.tower_assets
  if (!device || !device.asset_id || !relatedAsset?.public_code) return { status: 'invalid' }

  return {
    status: 'authenticated',
    device: {
      id: device.id,
      assetId: device.asset_id,
      publicCode: relatedAsset.public_code,
      tenantId: device.tenant_id,
      storeId: device.store_id,
      deviceLabel: device.device_label,
      pairedAt: device.paired_at,
    },
  }
}
