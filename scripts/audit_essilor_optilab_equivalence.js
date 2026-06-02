import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const ESSILOR_VERSION_ID = '99497d03-50bf-46b7-a7ab-8cb19e80db5a'
const OPTILAB_VERSION_ID = 'a4886a73-bc92-4b14-9c47-152ef0c78078'

const FAMILY_EQUIVALENCES = [
  ['varilux xr series', 'varilux xr series'],
  ['varilux physio', 'varilux physio extensee'],
  ['varilux comfort', 'varilux comfort'],
  ['varilux comfort max', 'varilux comfort max'],
  ['varilux liberty', 'varilux liberty'],
  ['varilux liberty 3.0', 'varilux liberty 3.0'],
  ['varilux digitime.mid', 'varilux activities'],
  ['varilux digitime.near', 'varilux activities'],
  ['varilux roadpilot', 'varilux activities'],
  ['varilux sport', 'varilux activities'],
  ['lentes essilor', 'lentes essilor'],
  ['vs essilor surfacada', 'lentes essilor'],
  ['kodak', 'kodak'],
  ['stellest', 'linha kids'],
]

async function fetchAll(table, select, build = (query) => query) {
  const pageSize = 1000
  let from = 0
  const rows = []

  while (true) {
    const query = build(supabase.from(table).select(select)).range(from, from + pageSize - 1)
    const { data, error } = await query
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < pageSize) break
    from += pageSize
  }

  return rows
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[®™]/g, '')
    .replace(/[^a-z0-9.]+/gi, ' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function sortedArray(value) {
  return [...(value || [])].sort()
}

function arraySignature(value) {
  return sortedArray(value).join('|')
}

function categoryCounts(rows) {
  const counts = {}
  for (const row of rows) {
    const key = row.clinical_category || 'sem_categoria'
    counts[key] = (counts[key] || 0) + 1
  }
  return counts
}

function featureCounts(rows) {
  const counts = {
    solar: 0,
    transitions: 0,
    blue_uv: 0,
    coloracao: 0,
    xperio: 0,
    photofusion: 0,
    antirreflexo: 0,
  }

  for (const row of rows) {
    const features = row.features || {}
    for (const key of Object.keys(counts)) {
      if (features[key]) counts[key] += 1
    }
  }

  return counts
}

function offerNameTokens(label) {
  const text = normalize(label)
  const tokens = []
  for (const token of [
    'xr',
    'physio',
    'comfort max',
    'comfort',
    'liberty 3.0',
    'liberty',
    'digitime mid',
    'digitime.mid',
    'digitime near',
    'digitime.near',
    'roadpilot',
    'sport',
    'sportwrap',
    'interview',
    'single sun',
    'easy sun',
    'single',
    'stellest',
  ]) {
    if (text.includes(token)) tokens.push(token)
  }
  return tokens
}

function summarizeFamily(family, offers, profile, gridsByOfferId) {
  const familyOffers = offers.filter((offer) => offer.family_id === family.id)
  let withGrid = 0
  let gridRows = 0
  const indexes = {}
  const materials = {}
  const tokenCounts = {}

  for (const offer of familyOffers) {
    if (offer.indice_refracao != null) indexes[String(offer.indice_refracao)] = (indexes[String(offer.indice_refracao)] || 0) + 1
    if (offer.material) materials[offer.material] = (materials[offer.material] || 0) + 1

    const grids = gridsByOfferId.get(offer.id) || []
    if (grids.length) withGrid += 1
    gridRows += grids.length

    for (const token of offerNameTokens(`${offer.canonical_label || ''} ${offer.raw_label || ''}`)) {
      tokenCounts[token] = (tokenCounts[token] || 0) + 1
    }
  }

  return {
    id: family.id,
    name: family.nome,
    design: family.design,
    clinical_category: family.clinical_category,
    tags_uso: family.tags_uso || [],
    tags_beneficios: family.tags_beneficios || [],
    profile: profile
      ? {
          usage_tags: profile.usage_tags || [],
          benefit_tags: profile.benefit_tags || [],
          commercial_summary: profile.commercial_summary,
          recommendation_notes: profile.recommendation_notes,
        }
      : null,
    offers: familyOffers.length,
    offer_categories: categoryCounts(familyOffers),
    indexes,
    materials,
    feature_counts: featureCounts(familyOffers),
    token_counts: tokenCounts,
    offers_with_grid: withGrid,
    grid_rows: gridRows,
    samples: familyOffers.slice(0, 8).map((offer) => offer.canonical_label || offer.raw_label),
  }
}

function diffSummary(essilor, optilab) {
  const diffs = []
  if (!essilor || !optilab) return ['missing_family']
  if (essilor.clinical_category !== optilab.clinical_category) diffs.push('family_category')
  if (arraySignature(essilor.tags_uso) !== arraySignature(optilab.tags_uso)) diffs.push('family_usage_tags')
  if (arraySignature(essilor.tags_beneficios) !== arraySignature(optilab.tags_beneficios)) diffs.push('family_benefit_tags')
  if (Boolean(essilor.profile) !== Boolean(optilab.profile)) diffs.push('missing_profile')
  if (
    essilor.profile &&
    optilab.profile &&
    (arraySignature(essilor.profile.usage_tags) !== arraySignature(optilab.profile.usage_tags) ||
      arraySignature(essilor.profile.benefit_tags) !== arraySignature(optilab.profile.benefit_tags))
  )
    diffs.push('profile_tags')
  return diffs
}

async function main() {
  const families = await fetchAll('global_lens_families', '*', (query) =>
    query.in('version_id', [ESSILOR_VERSION_ID, OPTILAB_VERSION_ID]),
  )
  const familyIds = families.map((family) => family.id)
  const offers = await fetchAll(
    'global_lens_offers',
    'id,family_id,raw_label,canonical_label,material,indice_refracao,clinical_category,features,source_page_reference',
    (query) => query.in('family_id', familyIds),
  )
  const profiles = await fetchAll(
    'global_usage_profiles',
    'id,family_id,profile_scope,usage_tags,benefit_tags,commercial_summary,recommendation_notes',
    (query) => query.in('family_id', familyIds).eq('profile_scope', 'family'),
  )
  const offerIds = new Set(offers.map((offer) => offer.id))
  const grids = (
    await fetchAll('global_offer_diopter_grids', 'offer_id,sph_min,sph_max,cyl_min,cyl_max,add_min,add_max')
  ).filter((grid) => offerIds.has(grid.offer_id))

  const familyByKey = new Map(families.map((family) => [`${family.version_id}:${normalize(family.nome)}`, family]))
  const profileByFamilyId = new Map(profiles.map((profile) => [profile.family_id, profile]))
  const gridsByOfferId = new Map()
  for (const grid of grids) {
    const rows = gridsByOfferId.get(grid.offer_id) || []
    rows.push(grid)
    gridsByOfferId.set(grid.offer_id, rows)
  }

  const rows = FAMILY_EQUIVALENCES.map(([essilorKey, optilabKey]) => {
    const essilorFamily = familyByKey.get(`${ESSILOR_VERSION_ID}:${essilorKey}`)
    const optilabFamily = familyByKey.get(`${OPTILAB_VERSION_ID}:${optilabKey}`)
    const essilor = essilorFamily ? summarizeFamily(essilorFamily, offers, profileByFamilyId.get(essilorFamily.id), gridsByOfferId) : null
    const optilab = optilabFamily ? summarizeFamily(optilabFamily, offers, profileByFamilyId.get(optilabFamily.id), gridsByOfferId) : null
    return {
      essilor_key: essilorKey,
      optilab_key: optilabKey,
      essilor,
      optilab,
      diffs: diffSummary(essilor, optilab),
    }
  })

  fs.writeFileSync('tmp/essilor_optilab_equivalence_audit.json', JSON.stringify(rows, null, 2))

  const lines = ['# Auditoria Essilor x Optilab - Equivalencias', '', `Gerado em: ${new Date().toISOString()}`, '']
  for (const row of rows) {
    lines.push(`## ${row.essilor_key} <=> ${row.optilab_key}`)
    lines.push(`- Diffs: ${row.diffs.length ? row.diffs.join(', ') : 'nenhum'}`)
    if (!row.essilor || !row.optilab) {
      lines.push(`- Missing: Essilor=${Boolean(row.essilor)}; Optilab=${Boolean(row.optilab)}`, '')
      continue
    }
    lines.push(`- Nomes: Essilor \`${row.essilor.name}\`; Optilab \`${row.optilab.name}\``)
    lines.push(`- Categoria familia: \`${row.essilor.clinical_category}\` | \`${row.optilab.clinical_category}\``)
    lines.push(`- Ofertas: ${row.essilor.offers} | ${row.optilab.offers}`)
    lines.push(`- Categorias ofertas: \`${JSON.stringify(row.essilor.offer_categories)}\` | \`${JSON.stringify(row.optilab.offer_categories)}\``)
    lines.push(
      `- Grades: ${row.essilor.offers_with_grid}/${row.essilor.offers} ofertas, ${row.essilor.grid_rows} linhas | ${row.optilab.offers_with_grid}/${row.optilab.offers} ofertas, ${row.optilab.grid_rows} linhas`,
    )
    lines.push(`- Tags uso: \`${arraySignature(row.essilor.tags_uso)}\` | \`${arraySignature(row.optilab.tags_uso)}\``)
    lines.push(
      `- Tags beneficios: \`${arraySignature(row.essilor.tags_beneficios)}\` | \`${arraySignature(row.optilab.tags_beneficios)}\``,
    )
    lines.push(`- Flags agregadas: \`${JSON.stringify(row.essilor.feature_counts)}\` | \`${JSON.stringify(row.optilab.feature_counts)}\``)
    lines.push(`- Tokens ofertas: \`${JSON.stringify(row.essilor.token_counts)}\` | \`${JSON.stringify(row.optilab.token_counts)}\``)
    lines.push('')
  }

  fs.writeFileSync('tmp/essilor_optilab_equivalence_audit.md', lines.join('\n'))
  console.log(lines.join('\n'))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
