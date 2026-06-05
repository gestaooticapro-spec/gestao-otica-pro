import path from 'path'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Erro: configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const storeIdArg = Number(process.argv.find((arg) => arg.startsWith('--store='))?.split('=')[1] || '1')
const queryChunkSize = 150
const pageSize = 1000

function chunkValues(values, size = queryChunkSize) {
  const chunks = []
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }
  return chunks
}

function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

async function fetchAll(builder) {
  const rows = []

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1
    const { data, error } = await builder().range(from, to)
    if (error) throw error

    const page = data || []
    rows.push(...page)
    if (page.length < pageSize) break
  }

  return rows
}

async function fetchIn(table, columns, field, values) {
  if (!values.length) return []

  const rows = []
  for (const chunk of chunkValues(values)) {
    rows.push(
      ...(await fetchAll(() =>
        supabase
          .from(table)
          .select(columns)
          .in(field, chunk),
      )),
    )
  }
  return rows
}

async function countIn(table, field, values) {
  let total = 0
  for (const chunk of chunkValues(values)) {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true })
      .in(field, chunk)
    if (error) throw error
    total += count || 0
  }
  return total
}

function summarizeCategoryRows(rows, categoryGetter) {
  const counts = new Map()
  for (const row of rows) {
    const category = categoryGetter(row) || 'null'
    counts.set(category, (counts.get(category) || 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([category, count]) => `${category}:${count}`)
    .join(', ')
}

async function audit() {
  const activations = await fetchAll(() =>
    supabase
      .from('tenant_catalog_activations')
      .select('id,store_id,global_version_id,status,activated_at')
      .eq('store_id', storeIdArg)
      .eq('status', 'active')
      .order('activated_at', { ascending: false }),
  )

  if (!activations.length) {
    console.log(`Loja ${storeIdArg}: nenhuma tabela ativa.`)
    return
  }

  const versionIds = [...new Set(activations.map((activation) => activation.global_version_id))]
  const versions = await fetchIn('global_catalog_versions', 'id,laboratorio,versao', 'id', versionIds)
  const versionById = new Map(versions.map((version) => [version.id, version]))

  const activationIds = activations.map((activation) => activation.id)
  const allTenantRows = await fetchIn(
    'tenant_commercial_offers',
    'id,activation_id,global_offer_id,display_name,is_active',
    'activation_id',
    activationIds,
  )
  const tenantRows = allTenantRows.filter((row) => row.is_active === true)

  const tenantOfferIds = [...new Set(tenantRows.map((row) => row.global_offer_id))]
  const uiGlobalOffers = await fetchIn(
    'global_lens_offers',
    'id,family_id,raw_label,canonical_label,clinical_category,material,indice_refracao,base_price,is_atomic_offer,allows_composition',
    'id',
    tenantOfferIds,
  )
  const familyIdsFromUiOffers = [...new Set(uiGlobalOffers.map((offer) => offer.family_id))]
  const uiFamilies = await fetchIn(
    'global_lens_families',
    'id,version_id,nome,clinical_category,design',
    'id',
    familyIdsFromUiOffers,
  )

  const allFamiliesForVersions = await fetchIn(
    'global_lens_families',
    'id,version_id,nome,clinical_category',
    'version_id',
    versionIds,
  )
  const allFamilyIdsForVersions = allFamiliesForVersions.map((family) => family.id)
  const allGlobalOffersForVersions = await fetchIn(
    'global_lens_offers',
    'id,family_id,raw_label,canonical_label,clinical_category',
    'family_id',
    allFamilyIdsForVersions,
  )

  const offerById = new Map(uiGlobalOffers.map((offer) => [offer.id, offer]))
  const familyById = new Map(uiFamilies.map((family) => [family.id, family]))
  const activationById = new Map(activations.map((activation) => [activation.id, activation]))
  const allFamilyById = new Map(allFamiliesForVersions.map((family) => [family.id, family]))

  const tenantRowsByActivation = new Map()
  for (const row of tenantRows) {
    const rows = tenantRowsByActivation.get(row.activation_id) || []
    rows.push(row)
    tenantRowsByActivation.set(row.activation_id, rows)
  }

  const globalOffersByVersion = new Map()
  for (const offer of allGlobalOffersForVersions) {
    const family = allFamilyById.get(offer.family_id)
    if (!family) continue
    const rows = globalOffersByVersion.get(family.version_id) || []
    rows.push(offer)
    globalOffersByVersion.set(family.version_id, rows)
  }

  const allGlobalOfferIdsByVersion = new Map()
  for (const [versionId, offers] of globalOffersByVersion.entries()) {
    allGlobalOfferIdsByVersion.set(versionId, new Set(offers.map((offer) => offer.id)))
  }

  console.log(`Loja ${storeIdArg}: ${activations.length} tabelas ativas`)
  console.log('')

  for (const activation of activations) {
    const version = versionById.get(activation.global_version_id)
    const label = `${version?.laboratorio || activation.global_version_id} | ${version?.versao || ''}`
    const rows = tenantRowsByActivation.get(activation.id) || []
    const allRowsForActivation = allTenantRows.filter((row) => row.activation_id === activation.id)
    const rowOfferIds = rows.map((row) => row.global_offer_id)
    const uniqueOfferIds = [...new Set(rowOfferIds)]
    const duplicateTenantRows = rowOfferIds.length - uniqueOfferIds.length
    const inactiveRows = allRowsForActivation.filter((row) => row.is_active === false).length
    const missingGlobalOfferRows = rows.filter((row) => !offerById.has(row.global_offer_id)).length
    const versionOfferIds = allGlobalOfferIdsByVersion.get(activation.global_version_id) || new Set()
    const missingTenantRows = [...versionOfferIds].filter((offerId) => !uniqueOfferIds.includes(offerId))

    let missingFamilyRows = 0
    let versionMismatchRows = 0
    let deterministicClinicalMismatchRows = 0
    let uiVisibleLabOffers = 0
    const indefinidaRows = []

    for (const offerId of uniqueOfferIds) {
      const offer = offerById.get(offerId)
      if (!offer) continue

      const family = familyById.get(offer.family_id)
      if (!family) {
        missingFamilyRows += 1
        continue
      }

      uiVisibleLabOffers += 1
      if (family.version_id !== activation.global_version_id) versionMismatchRows += 1
      if (
        family.clinical_category !== 'mista' &&
        family.clinical_category !== 'indefinida' &&
        offer.clinical_category !== family.clinical_category
      ) {
        deterministicClinicalMismatchRows += 1
      }
      if (offer.clinical_category === 'indefinida') indefinidaRows.push(offer)
    }

    const exactCompatibilities = await countIn('global_offer_treatments_compatibility', 'offer_id', uniqueOfferIds)
    const exactGrids = await countIn('global_offer_diopter_grids', 'offer_id', uniqueOfferIds)

    console.log(label)
    console.log(`  tenant rows ativas: ${rows.length} (${uniqueOfferIds.length} ofertas unicas)`)
    console.log(`  UI laboratorio: ${uiVisibleLabOffers} ofertas agrupaveis`)
    console.log(`  catalogo global da versao: ${versionOfferIds.size} ofertas`)
    console.log(`  faltando ativar para UI: ${missingTenantRows.length}`)
    console.log(`  tenant duplicadas: ${duplicateTenantRows}`)
    console.log(`  tenant is_active=false filtradas da UI: ${inactiveRows}`)
    console.log(`  global_offer ausente: ${missingGlobalOfferRows}`)
    console.log(`  family ausente: ${missingFamilyRows}`)
    console.log(`  mismatch versao: ${versionMismatchRows}`)
    console.log(`  mismatch categoria deterministica: ${deterministicClinicalMismatchRows}`)
    console.log(`  ofertas indefinidas visiveis: ${indefinidaRows.length}`)
    console.log(`  compatibilidades exatas: ${exactCompatibilities}`)
    console.log(`  grades exatas: ${exactGrids}`)
    console.log('')
  }

  let crossVersionMismatch = 0
  let crossClinicalMismatch = 0
  let crossMissingFamily = 0
  let crossMissingGlobal = 0
  const uiSearchRows = []

  for (const row of tenantRows) {
    const activation = activationById.get(row.activation_id)
    const offer = offerById.get(row.global_offer_id)
    if (!offer) {
      crossMissingGlobal += 1
      continue
    }

    const family = familyById.get(offer.family_id)
    if (!family) {
      crossMissingFamily += 1
      continue
    }

    if (family.version_id !== activation.global_version_id) crossVersionMismatch += 1
    if (
      family.clinical_category !== 'mista' &&
      family.clinical_category !== 'indefinida' &&
      offer.clinical_category !== family.clinical_category
    ) {
      crossClinicalMismatch += 1
    }

    const version = versionById.get(activation.global_version_id)
    uiSearchRows.push({
      laboratorio: version?.laboratorio || '',
      versionId: activation.global_version_id,
      familyName: family.nome,
      familyCategory: family.clinical_category,
      offerCategory: offer.clinical_category,
      label: offer.canonical_label || offer.raw_label,
      key: `${activation.global_version_id}:${row.global_offer_id}`,
      normalizedFamily: normalizeName(family.nome),
    })
  }

  const duplicateSearchKeys = uiSearchRows.length - new Set(uiSearchRows.map((row) => row.key)).size

  console.log('Resumo UI pesquisa por lente')
  console.log(`  linhas renderizaveis: ${uiSearchRows.length}`)
  console.log(`  duplicadas por ativacao/oferta: ${duplicateSearchKeys}`)
  console.log(`  missing global: ${crossMissingGlobal}`)
  console.log(`  missing family: ${crossMissingFamily}`)
  console.log(`  mismatch versao: ${crossVersionMismatch}`)
  console.log(`  mismatch categoria deterministica: ${crossClinicalMismatch}`)
  console.log(`  categorias: ${summarizeCategoryRows(uiSearchRows, (row) => row.offerCategory)}`)
  console.log('')

  const essilorRows = uiSearchRows.filter((row) => row.laboratorio === 'Essilor')
  const gamalabRows = uiSearchRows.filter((row) => row.laboratorio === 'Gamalab')
  const essilorFamilies = new Map()
  const gamalabFamilies = new Map()
  for (const row of essilorRows) essilorFamilies.set(row.normalizedFamily, row.familyName)
  for (const row of gamalabRows) gamalabFamilies.set(row.normalizedFamily, row.familyName)
  const commonFamilies = [...essilorFamilies.keys()].filter((key) => gamalabFamilies.has(key))
  const essilorOnlyFamilies = [...essilorFamilies.keys()].filter((key) => !gamalabFamilies.has(key))
  const gamalabOnlyFamilies = [...gamalabFamilies.keys()].filter((key) => !essilorFamilies.has(key))

  console.log('Essilor x Gamalab na UI')
  console.log(`  Essilor ofertas: ${essilorRows.length}; familias: ${essilorFamilies.size}`)
  console.log(`  Gamalab ofertas: ${gamalabRows.length}; familias: ${gamalabFamilies.size}`)
  console.log(`  familias com mesmo nome normalizado nos dois: ${commonFamilies.length}`)
  console.log(`  familias so Essilor: ${essilorOnlyFamilies.length}`)
  console.log(`  familias so Gamalab: ${gamalabOnlyFamilies.length}`)

  if (commonFamilies.length > 0) {
    console.log('  comuns:')
    for (const key of commonFamilies.slice(0, 20)) {
      console.log(`    - ${essilorFamilies.get(key)} / ${gamalabFamilies.get(key)}`)
    }
  }
}

audit().catch((error) => {
  console.error('Falha na auditoria:', error.message || error)
  process.exit(1)
})
