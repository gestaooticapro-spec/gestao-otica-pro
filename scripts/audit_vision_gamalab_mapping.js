import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const VISION_VERSION_ID = 'f6f01d3d-eba4-476c-a0e1-a481fac7d338'
const GAMALAB_VERSION_ID = 'bcdd6a40-3476-438a-b0cf-b86fc7bb0c03'

const VISION_TARGETS = ['Vision Plus Basic', 'Vision Plus Lite', 'Vision Plus', 'Vision Plus Extensee']
const GAMALAB_CANDIDATES = [
  'Gama Acabadas',
  'Gama HD',
  'Dynamic Premium',
  'Dynamic Pro',
  'Life',
  'Gamavision Freeform',
  'Gamavision Pro Individual',
  'Gamavision 4K',
  'Easy M',
  'Espace',
  'Espace Short',
  'Espace Plus',
]

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function isPhoto(offer) {
  const f = offer.features && typeof offer.features === 'object' ? offer.features : {}
  const text = normalize(`${offer.canonical_label} ${offer.raw_label}`)
  return Boolean(f.foto || f.fotossensivel || f.transitions || text.includes('fotossensivel') || text.includes('transitions') || text.includes('photo'))
}

function keyForOffer(offer) {
  return `idx=${Number(offer.indice_refracao).toFixed(2)} photo=${isPhoto(offer)}`
}

async function fetchAll(table, columns, buildQuery = (query) => query) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await buildQuery(
      supabase.from(table).select(columns).range(from, from + 999),
    )
    if (error) throw error
    rows.push(...(data || []))
    if ((data || []).length < 1000) break
  }
  return rows
}

function summarizeFamily(family, offers, gridsByOfferId) {
  const rows = offers.filter((offer) => offer.family_id === family.id)
  const keys = {}
  let withGrid = 0
  let withMissingGradeMarker = 0
  for (const offer of rows) {
    const key = keyForOffer(offer)
    keys[key] = (keys[key] || 0) + 1
    if ((gridsByOfferId.get(offer.id) || []).length) withGrid += 1
    const features = offer.features && typeof offer.features === 'object' ? offer.features : {}
    if (features.grade_nao_informada_na_fonte) withMissingGradeMarker += 1
  }
  return {
    family_id: family.id,
    name: family.nome,
    category: family.clinical_category,
    design: family.design,
    offers: rows.length,
    offers_with_grid: withGrid,
    offers_without_grid: rows.length - withGrid,
    offers_with_missing_grade_marker: withMissingGradeMarker,
    keys,
    sample_offers: rows.slice(0, 12).map((offer) => ({
      label: offer.canonical_label || offer.raw_label,
      index: offer.indice_refracao,
      photo: isPhoto(offer),
      category: offer.clinical_category,
      has_grid: (gridsByOfferId.get(offer.id) || []).length > 0,
      page: offer.source_page_reference,
    })),
  }
}

function overlapScore(visionSummary, candidateSummary) {
  const visionKeys = new Set(Object.keys(visionSummary.keys))
  const candidateKeys = new Set(Object.keys(candidateSummary.keys))
  const intersection = [...visionKeys].filter((key) => candidateKeys.has(key)).length
  const union = new Set([...visionKeys, ...candidateKeys]).size || 1
  const categoryBonus = visionSummary.category === candidateSummary.category ? 0.25 : 0
  const gridBonus = candidateSummary.offers_with_grid > 0 ? 0.15 : 0
  return Number((intersection / union + categoryBonus + gridBonus).toFixed(3))
}

async function main() {
  const [families, offers, grids] = await Promise.all([
    fetchAll('global_lens_families', 'id,version_id,nome,clinical_category,design,tags_uso,tags_beneficios'),
    fetchAll('global_lens_offers', 'id,family_id,canonical_label,raw_label,indice_refracao,clinical_category,features,source_page_reference'),
    fetchAll('global_offer_diopter_grids', 'offer_id,sph_min,sph_max,cyl_min,cyl_max,add_min,add_max,metadata'),
  ])

  const gridsByOfferId = new Map()
  for (const grid of grids) {
    const rows = gridsByOfferId.get(grid.offer_id) || []
    rows.push(grid)
    gridsByOfferId.set(grid.offer_id, rows)
  }

  const visionFamilies = families.filter((family) => family.version_id === VISION_VERSION_ID && VISION_TARGETS.includes(family.nome))
  const gamalabFamilies = families.filter((family) => family.version_id === GAMALAB_VERSION_ID && GAMALAB_CANDIDATES.includes(family.nome))

  const visionSummaries = visionFamilies.map((family) => summarizeFamily(family, offers, gridsByOfferId))
  const gamalabSummaries = gamalabFamilies.map((family) => summarizeFamily(family, offers, gridsByOfferId))

  const comparisons = []
  for (const vision of visionSummaries) {
    for (const candidate of gamalabSummaries) {
      comparisons.push({
        vision_family: vision.name,
        gamalab_family: candidate.name,
        score: overlapScore(vision, candidate),
        same_category: vision.category === candidate.category,
        vision_category: vision.category,
        gamalab_category: candidate.category,
        vision_keys: vision.keys,
        gamalab_keys: candidate.keys,
        gamalab_offers_with_grid: candidate.offers_with_grid,
        gamalab_offers_without_grid: candidate.offers_without_grid,
        gamalab_missing_grade_markers: candidate.offers_with_missing_grade_marker,
      })
    }
  }

  comparisons.sort((a, b) => b.score - a.score || a.vision_family.localeCompare(b.vision_family))

  const summary = {
    generated_at: new Date().toISOString(),
    vision_targets: visionSummaries,
    gamalab_candidates: gamalabSummaries,
    top_matches: VISION_TARGETS.map((name) => ({
      vision_family: name,
      candidates: comparisons.filter((row) => row.vision_family === name).slice(0, 8),
    })),
  }

  fs.writeFileSync(path.join('tmp', 'vision_gamalab_mapping_audit.json'), JSON.stringify({ summary, comparisons }, null, 2))
  fs.writeFileSync(
    path.join('tmp', 'vision_gamalab_mapping_audit.md'),
    [
      '# Auditoria Vision x Gamalab',
      '',
      `Gerado em: ${summary.generated_at}`,
      '',
      '## Leitura',
      '',
      '- Foco: Vision Plus Basic, Lite, Vision Plus e Extensee.',
      '- Esta auditoria nao altera o BD.',
      '- Score combina sobreposicao de indices/foto, categoria e existencia de grades na candidata Gamalab.',
      '',
      '## Top Candidatas',
      '',
      ...summary.top_matches.flatMap((group) => [
        `### ${group.vision_family}`,
        '',
        ...group.candidates.map(
          (row) =>
            `- score ${row.score} | ${row.gamalab_family} | cat ${row.gamalab_category} | grades ${row.gamalab_offers_with_grid}/${row.gamalab_offers_with_grid + row.gamalab_offers_without_grid} | sem-grade-doc ${row.gamalab_missing_grade_markers}`,
        ),
        '',
      ]),
      '## Resumo Vision',
      '',
      ...visionSummaries.map(
        (row) =>
          `- ${row.name}: cat ${row.category}, ofertas ${row.offers}, grades ${row.offers_with_grid}/${row.offers}, keys ${JSON.stringify(row.keys)}`,
      ),
      '',
      '## Resumo Gamalab Candidatas',
      '',
      ...gamalabSummaries.map(
        (row) =>
          `- ${row.name}: cat ${row.category}, ofertas ${row.offers}, grades ${row.offers_with_grid}/${row.offers}, sem-grade-doc ${row.offers_with_missing_grade_marker}, keys ${JSON.stringify(row.keys)}`,
      ),
    ].join('\n'),
  )

  console.log(JSON.stringify({
    generated_at: summary.generated_at,
    vision_targets: visionSummaries.map((row) => ({ name: row.name, category: row.category, offers: row.offers, grids: row.offers_with_grid, keys: row.keys })),
    top_matches: summary.top_matches.map((group) => ({ vision_family: group.vision_family, candidates: group.candidates.slice(0, 5).map((row) => ({ gamalab_family: row.gamalab_family, score: row.score, category: row.gamalab_category, grids: `${row.gamalab_offers_with_grid}/${row.gamalab_offers_with_grid + row.gamalab_offers_without_grid}` })) })),
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
