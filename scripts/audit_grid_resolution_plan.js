import fs from 'fs'
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

const ORIGINAL_LABS = new Set(['haytek', 'essilor', 'hoya', 'gamalab', 'optilab'])
const PAGE_SIZE = 1000

async function fetchAll(table, columns) {
  const rows = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    rows.push(...(data || []))
    if ((data || []).length < PAGE_SIZE) break
  }
  return rows
}

function labKey(value) {
  return String(value || '').trim().toLowerCase()
}

function n(value) {
  return value == null ? null : Number(value)
}

function isHighIndex(value) {
  const index = n(value)
  return index != null && index >= 1.67
}

function gridSignature(grid) {
  return [
    grid.sph_min ?? '',
    grid.sph_max ?? '',
    grid.cyl_min ?? '',
    grid.cyl_max ?? '',
    grid.add_min ?? '',
    grid.add_max ?? '',
  ].join('|')
}

function hasMissingGradeMarker(offer) {
  const features = offer.features && typeof offer.features === 'object' ? offer.features : {}
  const metadataText = JSON.stringify([features, offer.source_page_reference || '', offer.raw_label || '', offer.canonical_label || ''])
    .toLowerCase()
  return (
    features.grade_nao_informada_na_fonte === true ||
    features.grade_nao_informada === true ||
    features.missing_grade === true ||
    metadataText.includes('grade_status') ||
    metadataText.includes('not_visible_on_source_price_page')
  )
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

function countBy(rows, keyFn) {
  const out = {}
  for (const row of rows) {
    const key = keyFn(row)
    out[key] = (out[key] || 0) + 1
  }
  return out
}

function versionLabel(version) {
  return `${version?.laboratorio || '?'} | ${version?.versao || '?'}`
}

function offerMode(offer) {
  if (offer.is_atomic_offer) return 'atomic'
  if (offer.already_includes_treatment) return 'embedded'
  if (offer.allows_composition) return 'composable'
  return 'other'
}

function priorityForMissingGrid(version, offer) {
  const lab = labKey(version?.laboratorio)
  const mode = offerMode(offer)
  if (hasMissingGradeMarker(offer)) return 'documentado_sem_grade_na_fonte'
  if (mode === 'composable' || mode === 'embedded') return lab === 'gamalab' ? 'revisar_fonte_gamalab' : 'revisar_fonte'
  return 'revisar_fonte'
}

async function main() {
  const [versions, families, offers, grids] = await Promise.all([
    fetchAll('global_catalog_versions', 'id,laboratorio,versao'),
    fetchAll('global_lens_families', 'id,version_id,nome,clinical_category'),
    fetchAll(
      'global_lens_offers',
      'id,family_id,raw_label,canonical_label,material,indice_refracao,clinical_category,source_page_reference,features,is_atomic_offer,already_includes_treatment,allows_composition',
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

  const originalOffers = offers.filter((offer) => {
    const family = familyById.get(offer.family_id)
    const version = versionById.get(family?.version_id)
    return ORIGINAL_LABS.has(labKey(version?.laboratorio))
  })

  const rows = originalOffers.map((offer) => {
    const family = familyById.get(offer.family_id)
    const version = versionById.get(family?.version_id)
    const offerGrids = gridsByOfferId.get(offer.id) || []
    const signatures = new Set(offerGrids.map(gridSignature))
    return {
      version_id: version?.id,
      lab: labKey(version?.laboratorio),
      version: versionLabel(version),
      family: family?.nome || '?',
      family_category: family?.clinical_category || null,
      offer_id: offer.id,
      offer: offer.canonical_label || offer.raw_label,
      page: offer.source_page_reference || null,
      category: offer.clinical_category || null,
      mode: offerMode(offer),
      index: offer.indice_refracao,
      material: offer.material,
      grid_count: offerGrids.length,
      grid_signature_count: signatures.size,
      has_missing_grade_marker: hasMissingGradeMarker(offer),
      broad_single_grid_candidate: isBroadSingleGridCandidate(offer, offerGrids),
      missing_grid_priority: offerGrids.length ? null : priorityForMissingGrid(version, offer),
    }
  })

  const missingGrid = rows.filter((row) => row.grid_count === 0)
  const broadSingleGrid = rows.filter((row) => row.broad_single_grid_candidate)
  const duplicateOrSegmented = rows.filter((row) => row.grid_count > 1)

  const summary = {
    generated_at: new Date().toISOString(),
    offers_original_labs: rows.length,
    missing_grid: missingGrid.length,
    broad_single_grid_candidates: broadSingleGrid.length,
    multiple_grid_offers: duplicateOrSegmented.length,
    missing_grid_by_lab: countBy(missingGrid, (row) => row.lab),
    missing_grid_by_priority: countBy(missingGrid, (row) => row.missing_grid_priority),
    broad_single_grid_by_lab: countBy(broadSingleGrid, (row) => row.lab),
    multiple_grid_by_lab: countBy(duplicateOrSegmented, (row) => row.lab),
  }

  const groupCounts = (items, keyFn) =>
    Object.entries(countBy(items, keyFn)).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))

  const lines = [
    '# Plano de Resolucao de Grades',
    '',
    `Gerado em: ${summary.generated_at}`,
    '',
    '## Resumo',
    '',
    `- Ofertas em laboratorios originais: ${summary.offers_original_labs}`,
    `- Ofertas sem grade: ${summary.missing_grid}`,
    `- Suspeitas de grade unica ampla: ${summary.broad_single_grid_candidates}`,
    `- Ofertas com multiplos segmentos de grade: ${summary.multiple_grid_offers}`,
    '',
    '## Leitura Pratica',
    '',
    '- O motor de recomendacao considera oferta sem grade como elegivel na validacao de grau.',
    '- Portanto, oferta sem grade e mais perigosa do que falso positivo de grade ampla ja validada.',
    '- `documentado_sem_grade_na_fonte` nao deve ser preenchido por chute; deve ficar permissivo ou receber regra conservadora explicitamente aprovada.',
    '- `revisar_fonte_gamalab` e o primeiro bloco pratico, porque concentra ofertas sem grade em catalogo original.',
    '',
    '## Ofertas Sem Grade Por Prioridade',
    '',
    ...groupCounts(missingGrid, (row) => `${row.missing_grid_priority} | ${row.lab}`).map(([key, count]) => `- ${count} | ${key}`),
    '',
    '## Ofertas Sem Grade Por Familia',
    '',
    ...groupCounts(missingGrid, (row) => `${row.lab} | ${row.family} | ${row.page || '?'}`).map(([key, count]) => `- ${count} | ${key}`),
    '',
    '## Grade Unica Ampla Por Familia',
    '',
    ...groupCounts(broadSingleGrid, (row) => `${row.lab} | ${row.family} | ${row.page || '?'}`).map(([key, count]) => `- ${count} | ${key}`),
    '',
    '## Amostra de Ofertas Sem Grade que Precisam Fonte',
    '',
    ...missingGrid
      .filter((row) => row.missing_grid_priority !== 'documentado_sem_grade_na_fonte')
      .slice(0, 120)
      .map((row) => `- ${row.missing_grid_priority} | ${row.version} | ${row.family} | ${row.offer} | ${row.page || '?'}`),
  ]

  fs.writeFileSync(path.join('tmp', 'grid_resolution_plan.json'), JSON.stringify({ summary, rows }, null, 2))
  fs.writeFileSync(path.join('tmp', 'grid_resolution_plan.md'), lines.join('\n'))

  console.log(JSON.stringify(summary, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
