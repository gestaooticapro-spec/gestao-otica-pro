import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const commit = process.argv.includes('--commit')
const OUT_MD = path.join('tmp', 'conservative_missing_grids_review.md')
const OUT_JSON = path.join('tmp', 'conservative_missing_grids_review.json')

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const ORIGINAL_LABS = new Set(['gamalab', 'optilab'])

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
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

function isFinishedOffer(offer, family) {
  const features = offer.features && typeof offer.features === 'object' ? offer.features : {}
  const text = normalize(`${family.nome} ${family.design || ''} ${offer.raw_label || ''} ${offer.canonical_label || ''}`)
  return (
    offer.is_atomic_offer === true ||
    features.pronta === true ||
    features.pronta_entrega === true ||
    features.fulfillment_mode === 'pronta' ||
    text.includes('acabada') ||
    text.includes('acabadas') ||
    text.includes('pronta') ||
    text.includes('solares')
  )
}

function isAddCategory(category) {
  return ['multifocal', 'bifocal', 'ocupacional', 'mista'].includes(category)
}

function resolveEffectiveCategory(offer, family) {
  return offer.clinical_category || family.clinical_category || null
}

function conservativeGridFor(offer, family) {
  const category = resolveEffectiveCategory(offer, family)
  const finished = isFinishedOffer(offer, family)
  const addCategory = isAddCategory(category)

  const sphMin = finished ? -4 : -6
  const sphMax = finished ? 4 : 6
  const cylMin = finished ? -2 : -4

  return {
    sph_min: sphMin,
    sph_max: sphMax,
    cyl_min: cylMin,
    cyl_max: 0,
    add_min: addCategory ? 0.75 : null,
    add_max: addCategory ? 3.0 : null,
    model: finished ? 'conservadora_pronta_acabada' : 'conservadora_surfacada',
    category,
  }
}

function nextFeatures(offer, grid, family, version) {
  const features = offer.features && typeof offer.features === 'object' ? offer.features : {}
  return {
    ...features,
    grade_conservadora: true,
    grade_consultar_laboratorio: true,
    grade_nao_informada_na_fonte: true,
    grade_conservadora_modelo: grid.model,
    grade_conservadora_regra:
      grid.model === 'conservadora_pronta_acabada'
        ? 'Pronta/acabada: esf -4 a +4, cil ate -2; add ate +3 quando aplicavel.'
        : 'Surfacada/sob demanda: esf -6 a +6, cil ate -4; add ate +3 quando aplicavel.',
    grade_conservadora_em: new Date().toISOString(),
    grade_conservadora_fonte:
      'Fonte nao informa grade tecnica completa; regra conservadora aprovada pelo usuario para evitar elegibilidade livre.',
    grade_conservadora_lab: version.laboratorio,
    grade_conservadora_familia: family.nome,
  }
}

async function main() {
  const [versions, families, offers, grids] = await Promise.all([
    fetchAll('global_catalog_versions', 'id,laboratorio,versao'),
    fetchAll('global_lens_families', 'id,version_id,nome,clinical_category,design'),
    fetchAll(
      'global_lens_offers',
      'id,family_id,canonical_label,raw_label,clinical_category,features,source_page_reference,is_atomic_offer,allows_composition,already_includes_treatment',
    ),
    fetchAll('global_offer_diopter_grids', 'id,offer_id'),
  ])

  const versionById = new Map(versions.map((version) => [version.id, version]))
  const familyById = new Map(families.map((family) => [family.id, family]))
  const offerIdsWithGrid = new Set(grids.map((grid) => grid.offer_id))

  const targets = offers
    .filter((offer) => !offerIdsWithGrid.has(offer.id))
    .map((offer) => {
      const family = familyById.get(offer.family_id)
      const version = versionById.get(family?.version_id)
      return { offer, family, version }
    })
    .filter((row) => row.family && row.version && ORIGINAL_LABS.has(normalize(row.version.laboratorio)))

  const inserts = []
  const updates = []
  const skipped = []

  for (const row of targets) {
    const { offer, family, version } = row
    const grid = conservativeGridFor(offer, family)

    inserts.push({
      offer_id: offer.id,
      sph_min: grid.sph_min,
      sph_max: grid.sph_max,
      cyl_min: grid.cyl_min,
      cyl_max: grid.cyl_max,
      add_min: grid.add_min,
      add_max: grid.add_max,
      metadata: {
        source_kind: 'conservative_missing_source_grid',
        provisional: true,
        grade_conservadora: true,
        grade_consultar_laboratorio: true,
        grade_nao_informada_na_fonte: true,
        conservative_model: grid.model,
        effective_category: grid.category,
        source_lab: version.laboratorio,
        source_version: version.versao,
        source_family: family.nome,
        source_page_reference: offer.source_page_reference,
        note:
          'Grade conservadora inserida porque a fonte local nao informa disponibilidade tecnica completa. Confirmar disponibilidade com laboratorio antes de fechar pedido.',
      },
    })

    updates.push({
      id: offer.id,
      lab: version.laboratorio,
      family: family.nome,
      category: grid.category,
      model: grid.model,
      label: offer.canonical_label || offer.raw_label,
      features: nextFeatures(offer, grid, family, version),
    })
  }

  if (commit) {
    if (inserts.length) {
      const { error } = await supabase.from('global_offer_diopter_grids').insert(inserts)
      if (error) throw error
    }
    for (const update of updates) {
      const { error } = await supabase.from('global_lens_offers').update({ features: update.features }).eq('id', update.id)
      if (error) throw error
    }
  }

  const byModel = updates.reduce((acc, row) => {
    acc[row.model] = (acc[row.model] || 0) + 1
    return acc
  }, {})
  const byFamily = updates.reduce((acc, row) => {
    const key = `${row.lab} | ${row.family} | ${row.model}`
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})

  const report = {
    generated_at: new Date().toISOString(),
    commit,
    targets_count: targets.length,
    inserts_count: inserts.length,
    updates_count: updates.length,
    skipped,
    by_model: byModel,
    by_family: byFamily,
    sample: updates.slice(0, 40).map(({ lab, family, category, model, label }) => ({ lab, family, category, model, label })),
  }

  const md = [
    '# Grades Conservadoras Para Ofertas Sem Grade',
    '',
    `Gerado em: ${report.generated_at}`,
    `Modo: ${commit ? 'COMMIT aplicado' : 'dry-run'}`,
    '',
    '## Regra aplicada',
    '',
    '- Prontas/acabadas/solares: esf -4.00 a +4.00, cil ate -2.00.',
    '- Multifocais/bifocais/ocupacionais prontas/acabadas: mesma grade, add +0.75 a +3.00.',
    '- Surfacadas/sob demanda: esf -6.00 a +6.00, cil ate -4.00.',
    '- Multifocais/bifocais/ocupacionais surfacadas: mesma grade, add +0.75 a +3.00.',
    '- Todas as ofertas recebem flag para consultar disponibilidade com o laboratorio.',
    '',
    '## Resultado',
    '',
    `- Ofertas alvo: ${report.targets_count}`,
    `- Grades inseridas: ${report.inserts_count}`,
    `- Ofertas marcadas em features: ${report.updates_count}`,
    `- Puladas: ${report.skipped.length}`,
    '',
    '## Por modelo',
    '',
    ...Object.entries(byModel).map(([model, count]) => `- ${model}: ${count}`),
    '',
    '## Por familia',
    '',
    ...Object.entries(byFamily)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([key, count]) => `- ${count} | ${key}`),
  ].join('\n')

  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2))
  fs.writeFileSync(OUT_MD, md)
  console.log(md)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
