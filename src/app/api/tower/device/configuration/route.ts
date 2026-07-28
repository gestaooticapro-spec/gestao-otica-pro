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
  type TowerCatalogSnapshot,
  type TowerConfigurationSnapshot,
} from '@/lib/tower/configuration-snapshot'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type VersionRow = { id: string; laboratorio: string; versao: string; published_at: string | null }
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
  const [{ data: versionData, error: versionError }, remoteConfig, aiSuggestionConfig] = await Promise.all([
    admin
      .from('global_catalog_versions')
      .select('id,laboratorio,versao,published_at')
      .eq('status', 'published')
      .order('published_at', { ascending: false }),
    readTowerRemoteConfig(storeId),
    getAiSuggestionConfig(storeId),
  ])

  if (versionError || !remoteConfig) {
    return NextResponse.json({ success: false, message: 'Configuracao da loja indisponivel.' }, { status: 503 })
  }

  const catalogs: TowerCatalogSnapshot[] = ((versionData ?? []) as VersionRow[]).map((version) => ({
    versionId: version.id,
    laboratorio: version.laboratorio,
    versao: version.versao,
    publishedAt: version.published_at,
  }))

  const availableIds = new Set(catalogs.map((catalog) => catalog.versionId))
  if (selectedByTower?.some((id) => !availableIds.has(id))) {
    return NextResponse.json({ success: false, message: 'Um catalogo escolhido nao esta disponivel para esta loja.' }, { status: 409 })
  }
  // A primeira consulta serve apenas para listar os recursos disponiveis.
  // Nenhum catalogo pesado deve ser instalado implicitamente: a Torre envia
  // a selecao explicita feita na configuracao local.
  const installedIds = selectedByTower ?? []
  const installedCatalogs = catalogs.filter((catalog) => installedIds.includes(catalog.versionId))

  let operationalCatalog: TowerConfigurationSnapshot['operationalCatalog']
  let customers: TowerConfigurationSnapshot['customers']
  try {
    const recommendationData = installedIds.length
      ? await loadRecommendationCatalogMulti(installedIds)
      : null
    const selectedFamilyNames = recommendationData?.families?.map((family) => family.nome) ?? []
    const [catalog, geometries, frames, customerSnapshot] = await Promise.all([
      loadTowerOperationalCatalog(admin, storeId, installedIds),
      loadTowerOperationalGeometries(admin, selectedFamilyNames),
      loadTowerOperationalFrames(admin),
      loadStoreCustomers(admin, authentication.device.tenantId, storeId),
    ])
    customers = customerSnapshot
    operationalCatalog = recommendationData
      ? { catalog, geometries, recommendationData }
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
    visagismoFrames: frames,
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
