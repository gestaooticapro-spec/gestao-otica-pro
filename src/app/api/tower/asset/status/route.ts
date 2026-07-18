import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  TOWER_ASSET_CREDENTIAL_PATTERN,
  type TowerAssetStatusResponse,
} from '@/lib/tower/asset-enrollment-contract'

export const dynamic = 'force-dynamic'

function json(payload: TowerAssetStatusResponse, status = 200) {
  return NextResponse.json(payload, { status, headers: { 'Cache-Control': 'no-store, max-age=0' } })
}

export async function GET(request: NextRequest) {
  const authorization = request.headers.get('authorization') || ''
  const credential = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!TOWER_ASSET_CREDENTIAL_PATTERN.test(credential)) {
    return json({ success: false, message: 'Identidade fisica invalida.' }, 401)
  }

  const credentialHash = createHash('sha256').update(credential, 'utf8').digest('hex')
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('tower_assets')
    .select('id,public_code,status')
    .eq('enrollment_credential_hash', credentialHash)
    .maybeSingle()
  const asset = data as { id: string; public_code: string; status: 'prepared' | 'in_stock' | 'assigned' | 'maintenance' | 'retired' } | null
  if (error || !asset || asset.status === 'retired') {
    return json({ success: false, message: 'Identidade fisica revogada ou inexistente.' }, 401)
  }

  return json({ success: true, status: asset.status, assetId: asset.id, publicCode: asset.public_code })
}
