import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getAiSuggestionConfig } from '@/lib/actions/store.actions'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateTowerDevice } from '@/lib/server/tower-device-auth'
import { readTowerRemoteConfig } from '@/lib/server/tower-remote-config'
import { loadRecommendationCatalogMulti } from '@/lib/server/lens-recommendation'
import {
  loadTowerOperationalCatalog,
  loadTowerOperationalFrames,
  loadTowerOperationalGeometries,
} from '@/lib/server/tower-operational-catalog'
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
type CustomerRow = {
  id: number
  full_name: string
  fone_movel: string | null
  updated_at: string | null
}

function requestedCatalogIds(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('catalogs')
  if (!raw) return null
  const ids = [...new Set(raw.split(',').map((value) => value.trim()).filter(Boolean))]
  return ids.length && ids.every((id) => /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id))
    ? ids
    : []
}

async function loadStoreCustomers(admin: ReturnType<typeof createAdminClient>, tenantId: string, storeId: number) {
  const pageSize = 1000
  const customers: CustomerRow[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await (admin.from('customers') as any)
      .select('id,full_name,fone_movel,updated_at')
      .eq('tenant_id', tenantId)
      .eq('store_id', storeId)
      .order('id')
      .range(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    const page = (data ?? []) as CustomerRow[]
    customers.push(...page)
    if (page.length < pageSize) break
  }
  return customers.map((customer) => ({
    id: customer.id,
    fullName: customer.full_name,
    mobilePhone: customer.fone_movel,
    updatedAt: customer.updated_at,
  }))
}

export async function GET(request: NextRequest) {
  const authentication = await authenticateTowerDevice(request)
  if (authentication.status === 'invalid') {
    return NextResponse.json({ success: false, message: 'Credencial de dispositivo invalida.' }, { status: 401 })
  }
  if (authentication.status === 'unavailable') {
    return NextResponse.json({ success: false, message: 'Configuracao da Torre indisponivel.' }, { status: 503 })
  }

  const storeId = authentication.device.storeId
  const selectedByTower = requestedCatalogIds(request)
  if (selectedByTower?.length === 0) {
    return NextResponse.json({ success: false, message: 'Selecao de catalogos invalida.' }, { status: 400 })
  }
  const admin = createAdminClient()
  const [{ data: activationData, error: activationError }, remoteConfig, aiSuggestionConfig] = await Promise.all([
    admin
      .from('tenant_catalog_activations')
      .select('id,global_version_id,activated_at,last_synced_at')
      .eq('tenant_id', authentication.device.tenantId)
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

  const availableIds = new Set(catalogs.map((catalog) => catalog.versionId))
  if (selectedByTower?.some((id) => !availableIds.has(id))) {
    return NextResponse.json({ success: false, message: 'Um catalogo escolhido nao esta disponivel para esta loja.' }, { status: 409 })
  }
  const installedIds = selectedByTower ?? catalogs.map((catalog) => catalog.versionId)
  const installedCatalogs = catalogs.filter((catalog) => installedIds.includes(catalog.versionId))

  let operationalCatalog: TowerConfigurationSnapshot['operationalCatalog']
  let customers: TowerConfigurationSnapshot['customers']
  try {
    const [catalog, geometries, frames, recommendationData, customerSnapshot] = await Promise.all([
      loadTowerOperationalCatalog(admin, authentication.device.tenantId, storeId),
      loadTowerOperationalGeometries(admin),
      loadTowerOperationalFrames(admin),
      installedIds.length ? loadRecommendationCatalogMulti(installedIds) : Promise.resolve(null),
      loadStoreCustomers(admin, authentication.device.tenantId, storeId),
    ])
    customers = customerSnapshot
    operationalCatalog = recommendationData
      ? { catalog, geometries, frames, recommendationData }
      : undefined
  } catch (error) {
    console.error('[Torre] Falha ao montar instalacao offline:', error)
    return NextResponse.json({ success: false, message: 'Dados para instalacao offline indisponiveis.' }, { status: 503 })
  }

  const revisionPayload = {
    storeId,
    remoteConfig,
    catalogs: installedCatalogs,
    availableCatalogs: catalogs,
    aiSuggestionConfig,
    customers,
    operationalCatalog,
  }
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
