import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getAiSuggestionConfig } from '@/lib/actions/store.actions'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateTowerDevice } from '@/lib/server/tower-device-auth'
import { readTowerRemoteConfig } from '@/lib/server/tower-remote-config'
import {
  TOWER_CONFIGURATION_SNAPSHOT_VERSION,
  type TowerActiveCatalogSnapshot,
  type TowerConfigurationSnapshot,
} from '@/lib/tower/configuration-snapshot'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ActivationRow = {
  id: string
  global_version_id: string
  activated_at: string
  last_synced_at: string | null
}

type VersionRow = { id: string; laboratorio: string; versao: string }

export async function GET(request: NextRequest) {
  const authentication = await authenticateTowerDevice(request)
  if (authentication.status === 'invalid') {
    return NextResponse.json({ success: false, message: 'Credencial de dispositivo invalida.' }, { status: 401 })
  }
  if (authentication.status === 'unavailable') {
    return NextResponse.json({ success: false, message: 'Configuracao da Torre indisponivel.' }, { status: 503 })
  }

  const storeId = authentication.device.storeId
  const admin = createAdminClient()
  const [{ data: activationData, error: activationError }, remoteConfig, aiSuggestionConfig] = await Promise.all([
    admin
      .from('tenant_catalog_activations')
      .select('id,global_version_id,activated_at,last_synced_at')
      .eq('store_id', storeId)
      .eq('status', 'active')
      .order('activated_at', { ascending: false }),
    readTowerRemoteConfig(storeId),
    getAiSuggestionConfig(storeId),
  ])

  if (activationError || !remoteConfig) {
    return NextResponse.json({ success: false, message: 'Configuracao da loja indisponivel.' }, { status: 503 })
  }

  const activations = (activationData ?? []) as ActivationRow[]
  const versionIds = [...new Set(activations.map((item) => item.global_version_id))]
  let versions: VersionRow[] = []
  if (versionIds.length) {
    const { data, error } = await admin
      .from('global_catalog_versions')
      .select('id,laboratorio,versao')
      .in('id', versionIds)
    if (error) {
      return NextResponse.json({ success: false, message: 'Catalogo da loja indisponivel.' }, { status: 503 })
    }
    versions = (data ?? []) as VersionRow[]
  }

  const versionById = new Map(versions.map((version) => [version.id, version]))
  const catalogs: TowerActiveCatalogSnapshot[] = activations.flatMap((activation) => {
    const version = versionById.get(activation.global_version_id)
    return version ? [{
      activationId: activation.id,
      versionId: version.id,
      laboratorio: version.laboratorio,
      versao: version.versao,
      activatedAt: activation.activated_at,
      lastSyncedAt: activation.last_synced_at,
    }] : []
  })

  const revisionPayload = { storeId, remoteConfig, catalogs, aiSuggestionConfig }
  const snapshot: TowerConfigurationSnapshot = {
    schemaVersion: TOWER_CONFIGURATION_SNAPSHOT_VERSION,
    revision: createHash('sha256').update(JSON.stringify(revisionPayload), 'utf8').digest('hex'),
    generatedAt: new Date().toISOString(),
    ...revisionPayload,
  }

  return NextResponse.json({ success: true, snapshot }, {
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  })
}

