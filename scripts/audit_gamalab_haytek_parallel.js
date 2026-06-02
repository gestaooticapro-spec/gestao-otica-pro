import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const OUTPUT_JSON = path.join('tmp', 'gamalab_haytek_parallel_audit.json')
const OUTPUT_MD = path.join('tmp', 'gamalab_haytek_parallel_audit.md')

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function n(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? Number(number.toFixed(2)) : null
}

function sortedEntries(object) {
  return Object.entries(object).sort(([a], [b]) => a.localeCompare(b))
}

async function fetchAll(table, columns) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + 999)
    if (error) throw error
    rows.push(...(data || []))
    if ((data || []).length < 1000) break
  }
  return rows
}

function isPhoto(offer) {
  const features = offer.features && typeof offer.features === 'object' ? offer.features : {}
  const text = normalize(`${offer.canonical_label} ${offer.raw_label} ${JSON.stringify(features)}`)
  return Boolean(
    features.foto ||
      features.fotossensivel ||
      features.transitions ||
      text.includes('foto') ||
      text.includes('fotossensivel') ||
      text.includes('transitions') ||
      text.includes('sensity') ||
      text.includes('photofusion'),
  )
}

function isBlue(offer) {
  const features = offer.features && typeof offer.features === 'object' ? offer.features : {}
  const text = normalize(`${offer.canonical_label} ${offer.raw_label} ${JSON.stringify(features)}`)
  return Boolean(features.filtro_azul || features.blue || text.includes('blue') || text.includes('filtro azul'))
}

function materialKey(offer) {
  const text = normalize(`${offer.material} ${offer.canonical_label} ${offer.raw_label}`)
  if (text.includes('poli') || text.includes('poly') || text.includes('1 59')) return 'poly'
  if (text.includes('trivex') || text.includes('1 53')) return 'trivex'
  return String(n(offer.indice_refracao) ?? 'sem-indice')
}

function offerKey(offer) {
  return [
    `idx=${n(offer.indice_refracao)}`,
    `mat=${materialKey(offer)}`,
    `photo=${isPhoto(offer)}`,
    `blue=${isBlue(offer)}`,
  ].join('|')
}

function gridKey(grid) {
  const metadata = grid.metadata && typeof grid.metadata === 'object' ? grid.metadata : {}
  const minHeight = grid.min_fitting_height_mm ?? metadata.min_fitting_height_mm ?? metadata.altura_minima_mm ?? metadata.min_height_mm
  return [
    `sph=${n(grid.sph_min)}..${n(grid.sph_max)}`,
    `cyl=${n(grid.cyl_min)}..${n(grid.cyl_max)}`,
    `add=${n(grid.add_min)}..${n(grid.add_max)}`,
    `h=${n(minHeight)}`,
  ].join('|')
}

function countBy(rows, keyFn) {
  const out = {}
  for (const row of rows) {
    const key = keyFn(row)
    out[key] = (out[key] || 0) + 1
  }
  return out
}

function overlap(left, right) {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)])
  if (!keys.size) return { score: 0, intersection: 0, union: 0 }
  let intersection = 0
  let union = 0
  for (const key of keys) {
    intersection += Math.min(left[key] || 0, right[key] || 0)
    union += Math.max(left[key] || 0, right[key] || 0)
  }
  return { score: intersection / union, intersection, union }
}

function summarizeFamily(family, offers, gridsByOfferId) {
  const familyOffers = offers.filter((offer) => offer.family_id === family.id)
  const grids = familyOffers.flatMap((offer) =>
    (gridsByOfferId.get(offer.id) || []).map((grid) => ({
      ...grid,
      offer,
    })),
  )
  const offerKeys = countBy(familyOffers, offerKey)
  const gridKeys = countBy(grids, gridKey)
  const categories = countBy(familyOffers, (offer) => offer.clinical_category || family.clinical_category || 'sem-categoria')
  const sourcePages = [...new Set(familyOffers.map((offer) => offer.source_page_reference).filter(Boolean))].sort()
  const missingGradeMarkers = familyOffers.filter((offer) => {
    const features = offer.features && typeof offer.features === 'object' ? offer.features : {}
    return features.grade_nao_informada_na_fonte || features.grade_nao_informada || features.missing_grade
  }).length

  return {
    family_id: family.id,
    name: family.nome,
    category: family.clinical_category,
    design: family.design,
    offers: familyOffers.length,
    grids: grids.length,
    offers_with_grid: familyOffers.filter((offer) => (gridsByOfferId.get(offer.id) || []).length > 0).length,
    missing_grade_markers: missingGradeMarkers,
    source_pages: sourcePages,
    offer_keys: offerKeys,
    grid_keys: gridKeys,
    categories,
    sample_offers: familyOffers.slice(0, 8).map((offer) => ({
      label: offer.canonical_label || offer.raw_label,
      index: offer.indice_refracao,
      material: offer.material,
      category: offer.clinical_category,
      key: offerKey(offer),
      grids: (gridsByOfferId.get(offer.id) || []).map(gridKey),
      page: offer.source_page_reference,
    })),
  }
}

function compareFamilies(gama, haytek) {
  const offerOverlap = overlap(gama.offer_keys, haytek.offer_keys)
  const gridOverlap = overlap(gama.grid_keys, haytek.grid_keys)
  const sameCategory = gama.category === haytek.category
  const score = Number(
    (
      offerOverlap.score * 0.45 +
      gridOverlap.score * 0.4 +
      (sameCategory ? 0.15 : 0)
    ).toFixed(4),
  )

  return {
    gamalab_family: gama.name,
    haytek_family: haytek.name,
    score,
    same_category: sameCategory,
    gamalab_category: gama.category,
    haytek_category: haytek.category,
    offer_overlap: offerOverlap,
    grid_overlap: gridOverlap,
    gamalab_offers: gama.offers,
    haytek_offers: haytek.offers,
    gamalab_grids: gama.grids,
    haytek_grids: haytek.grids,
    gamalab_missing_grade_markers: gama.missing_grade_markers,
    gamalab_pages: gama.source_pages,
    haytek_pages: haytek.source_pages,
  }
}

async function main() {
  const [versions, families, offers, grids] = await Promise.all([
    fetchAll('global_catalog_versions', 'id,laboratorio,versao'),
    fetchAll('global_lens_families', 'id,version_id,nome,clinical_category,design'),
    fetchAll('global_lens_offers', 'id,family_id,raw_label,canonical_label,material,indice_refracao,clinical_category,features,source_page_reference'),
    fetchAll('global_offer_diopter_grids', 'id,offer_id,sph_min,sph_max,cyl_min,cyl_max,add_min,add_max,metadata'),
  ])

  const haytekVersion = versions.find((version) => normalize(version.laboratorio) === 'haytek')
  const gamalabVersion = versions.find((version) => normalize(version.laboratorio) === 'gamalab')
  if (!haytekVersion || !gamalabVersion) {
    throw new Error(`Versoes nao encontradas. Haytek=${haytekVersion?.id} Gamalab=${gamalabVersion?.id}`)
  }

  const gridsByOfferId = new Map()
  for (const grid of grids) {
    const rows = gridsByOfferId.get(grid.offer_id) || []
    rows.push(grid)
    gridsByOfferId.set(grid.offer_id, rows)
  }

  const haytekSummaries = families
    .filter((family) => family.version_id === haytekVersion.id)
    .map((family) => summarizeFamily(family, offers, gridsByOfferId))
    .filter((family) => family.offers > 0)

  const gamalabSummaries = families
    .filter((family) => family.version_id === gamalabVersion.id)
    .map((family) => summarizeFamily(family, offers, gridsByOfferId))
    .filter((family) => family.offers > 0)

  const comparisons = []
  for (const gama of gamalabSummaries) {
    for (const haytek of haytekSummaries) {
      comparisons.push(compareFamilies(gama, haytek))
    }
  }

  comparisons.sort((a, b) => b.score - a.score || b.grid_overlap.score - a.grid_overlap.score)

  const topByGamalab = gamalabSummaries.map((gama) => ({
    gamalab_family: gama.name,
    category: gama.category,
    offers: gama.offers,
    grids: gama.grids,
    offers_with_grid: gama.offers_with_grid,
    missing_grade_markers: gama.missing_grade_markers,
    pages: gama.source_pages,
    top_haytek_candidates: comparisons
      .filter((comparison) => comparison.gamalab_family === gama.name)
      .slice(0, 8),
  }))

  const payload = {
    generated_at: new Date().toISOString(),
    versions: {
      gamalab: gamalabVersion,
      haytek: haytekVersion,
    },
    gamalab_families: gamalabSummaries,
    haytek_families: haytekSummaries,
    top_by_gamalab: topByGamalab,
    comparisons,
  }

  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(payload, null, 2))

  const md = [
    '# Auditoria Gamalab x Haytek',
    '',
    `Gerado em: ${payload.generated_at}`,
    '',
    '## Como Ler',
    '',
    '- Esta auditoria nao altera o banco.',
    '- Score considera assinatura de ofertas, assinatura de grades e categoria clinica.',
    '- Preco nao entra no score, porque a hipotese e mesma fonte com tabelas comerciais diferentes.',
    '- Quando a Gamalab nao tem grade esf/cil na fonte, o score de grade naturalmente fica baixo ou zero.',
    '',
    '## Top Por Familia Gamalab',
    '',
    ...topByGamalab.flatMap((group) => [
      `### ${group.gamalab_family}`,
      '',
      `Categoria: ${group.category} | ofertas: ${group.offers} | grades: ${group.grids} | ofertas com grade: ${group.offers_with_grid} | marcadas sem grade na fonte: ${group.missing_grade_markers}`,
      group.pages.length ? `Paginas/fontes: ${group.pages.join(', ')}` : 'Paginas/fontes: n/a',
      '',
      ...group.top_haytek_candidates.slice(0, 5).map((row) => {
        const grid = `${row.grid_overlap.intersection}/${row.grid_overlap.union}`
        const offers = `${row.offer_overlap.intersection}/${row.offer_overlap.union}`
        return `- score ${row.score} | ${row.haytek_family} | cat ${row.haytek_category} | offer overlap ${offers} | grid overlap ${grid} | Haytek pages ${row.haytek_pages.join(', ') || 'n/a'}`
      }),
      '',
    ]),
    '## Familias Haytek Resumo',
    '',
    ...haytekSummaries.map(
      (row) =>
        `- ${row.name}: cat ${row.category}, ofertas ${row.offers}, grades ${row.grids}, offer_keys ${JSON.stringify(Object.fromEntries(sortedEntries(row.offer_keys)))}`,
    ),
    '',
  ].join('\n')

  fs.writeFileSync(OUTPUT_MD, md)

  console.log(
    JSON.stringify(
      {
        generated_at: payload.generated_at,
        reports: [OUTPUT_MD, OUTPUT_JSON],
        top_examples: topByGamalab
          .filter((group) => ['Gamavision 4K', 'Gamavision Pro Individual', 'Dynamic Premium', 'Gama Acabadas', 'Gama HD'].includes(group.gamalab_family))
          .map((group) => ({
            gamalab_family: group.gamalab_family,
            category: group.category,
            offers: group.offers,
            grids: group.grids,
            top: group.top_haytek_candidates.slice(0, 3).map((row) => ({
              haytek_family: row.haytek_family,
              score: row.score,
              offer_overlap: row.offer_overlap,
              grid_overlap: row.grid_overlap,
            })),
          })),
      },
      null,
      2,
    ),
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
