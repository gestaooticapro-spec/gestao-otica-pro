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

const pageSize = 1000

async function fetchAll(table, columns) {
  const rows = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + pageSize - 1)

    if (error) throw error
    rows.push(...(data || []))
    if ((data || []).length < pageSize) break
  }
  return rows
}

function n(value) {
  return value == null ? null : Number(value)
}

function noAcc(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function describeGrid(grid) {
  return `esf ${grid.sph_min}..${grid.sph_max} cil ${grid.cyl_min}..${grid.cyl_max} add ${grid.add_min}..${grid.add_max}`
}

function versionKey(version) {
  return `${version.laboratorio || '?'} | ${version.versao || '?'}`
}

function isHighIndex(index) {
  const value = n(index)
  return value != null && value >= 1.67
}

function isBroadSingleGridCandidate(offer, grids) {
  if (!isHighIndex(offer.indice_refracao) || grids.length !== 1) return false
  const grid = grids[0]
  if (isReviewedBroadGrid(grid)) return false
  const sphMin = n(grid.sph_min)
  const sphMax = n(grid.sph_max)
  const cylMin = n(grid.cyl_min)

  return sphMin != null && sphMax != null && cylMin != null && sphMin <= -10 && sphMax >= 6 && cylMin <= -6
}

function isReviewedBroadGrid(grid) {
  const metadata = grid?.metadata && typeof grid.metadata === 'object' ? grid.metadata : {}
  return ['source_validated_not_flattening', 'inferred_source_validated_not_flattening'].includes(
    metadata.flattened_grid_review_status,
  )
}

function isLikelySegmentedLabel(offer) {
  const text = noAcc(`${offer.raw_label} ${offer.canonical_label} ${offer.material}`)
  return (
    text.includes('1.67') ||
    text.includes('1.74') ||
    text.includes('stylis') ||
    text.includes('eynoa') ||
    text.includes('eyvia')
  )
}

async function main() {
  const [versions, families, offers, grids] = await Promise.all([
    fetchAll('global_catalog_versions', 'id,laboratorio,versao'),
    fetchAll('global_lens_families', 'id,version_id,nome,clinical_category'),
    fetchAll(
      'global_lens_offers',
      'id,family_id,raw_label,canonical_label,material,indice_refracao,clinical_category,source_page_reference',
    ),
    fetchAll('global_offer_diopter_grids', 'id,offer_id,sph_min,sph_max,cyl_min,cyl_max,add_min,add_max,metadata'),
  ])

  const versionById = new Map(versions.map((version) => [version.id, version]))
  const familyById = new Map(families.map((family) => [family.id, family]))
  const gridsByOfferId = new Map()

  for (const grid of grids) {
    const list = gridsByOfferId.get(grid.offer_id) || []
    list.push(grid)
    gridsByOfferId.set(grid.offer_id, list)
  }

  const offersWithMultipleGrids = offers.filter((offer) => (gridsByOfferId.get(offer.id) || []).length > 1)
  const offersWithOneGrid = offers.filter((offer) => (gridsByOfferId.get(offer.id) || []).length === 1)
  const offersWithoutGrid = offers.filter((offer) => !(gridsByOfferId.get(offer.id) || []).length)

  const broadSingleGridCandidates = offers
    .filter((offer) => isBroadSingleGridCandidate(offer, gridsByOfferId.get(offer.id) || []))
    .sort((a, b) => {
      const fa = familyById.get(a.family_id)
      const fb = familyById.get(b.family_id)
      const va = versionById.get(fa?.version_id)
      const vb = versionById.get(fb?.version_id)
      return versionKey(va || {}).localeCompare(versionKey(vb || {})) || String(a.canonical_label || a.raw_label).localeCompare(String(b.canonical_label || b.raw_label))
    })

  const likelySegmentedButSingle = broadSingleGridCandidates.filter(isLikelySegmentedLabel)

  const byVersion = new Map()
  for (const offer of broadSingleGridCandidates) {
    const family = familyById.get(offer.family_id)
    const version = versionById.get(family?.version_id)
    const key = versionKey(version || {})
    byVersion.set(key, (byVersion.get(key) || 0) + 1)
  }

  console.log('=== Global grid flattening audit ===')
  console.log(`versions: ${versions.length}`)
  console.log(`families: ${families.length}`)
  console.log(`offers: ${offers.length}`)
  console.log(`grid rows: ${grids.length}`)
  console.log(`offers without grid: ${offersWithoutGrid.length}`)
  console.log(`offers with one grid: ${offersWithOneGrid.length}`)
  console.log(`offers with multiple grids: ${offersWithMultipleGrids.length}`)
  console.log(`broad single-grid high-index candidates: ${broadSingleGridCandidates.length}`)
  console.log(`likely segmented labels among candidates: ${likelySegmentedButSingle.length}`)

  console.log('\n=== Candidates by version ===')
  for (const [key, count] of [...byVersion.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    console.log(`${count.toString().padStart(4)}  ${key}`)
  }

  console.log('\n=== Sample candidates ===')
  for (const offer of likelySegmentedButSingle.slice(0, 80)) {
    const family = familyById.get(offer.family_id)
    const version = versionById.get(family?.version_id)
    const grid = (gridsByOfferId.get(offer.id) || [])[0]
    console.log(
      [
        versionKey(version || {}),
        family?.nome || offer.family_id,
        offer.source_page_reference || '?',
        offer.indice_refracao,
        offer.material || '',
        offer.canonical_label || offer.raw_label,
        describeGrid(grid),
      ].join(' | '),
    )
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
