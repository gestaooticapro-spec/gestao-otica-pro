import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const commit = process.argv.includes('--commit')
const OUT_MD = path.join('tmp', 'conservative_solar_planar_grid_fix_review.md')
const OUT_JSON = path.join('tmp', 'conservative_solar_planar_grid_fix_review.json')

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

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

async function main() {
  const [versions, families, offers, grids] = await Promise.all([
    fetchAll('global_catalog_versions', 'id,laboratorio,versao'),
    fetchAll('global_lens_families', 'id,version_id,nome,clinical_category'),
    fetchAll('global_lens_offers', 'id,family_id,canonical_label,raw_label,clinical_category,features,source_page_reference'),
    fetchAll('global_offer_diopter_grids', 'id,offer_id,sph_min,sph_max,cyl_min,cyl_max,add_min,add_max,metadata'),
  ])

  const familyById = new Map(families.map((family) => [family.id, family]))
  const versionById = new Map(versions.map((version) => [version.id, version]))
  const offerById = new Map(offers.map((offer) => [offer.id, offer]))

  const targets = grids
    .map((grid) => {
      const offer = offerById.get(grid.offer_id)
      const family = familyById.get(offer?.family_id)
      const version = versionById.get(family?.version_id)
      return { grid, offer, family, version }
    })
    .filter(({ grid, offer, family }) => {
      const metadata = grid.metadata && typeof grid.metadata === 'object' ? grid.metadata : {}
      return (
        metadata.source_kind === 'conservative_missing_source_grid' &&
        metadata.conservative_model === 'conservadora_pronta_acabada' &&
        (offer?.clinical_category === 'plana_solar' || family?.clinical_category === 'plana_solar')
      )
    })

  const gridUpdates = []
  const offerUpdates = []

  for (const row of targets) {
    const { grid, offer, family, version } = row
    const metadata = grid.metadata && typeof grid.metadata === 'object' ? grid.metadata : {}
    const features = offer.features && typeof offer.features === 'object' ? offer.features : {}

    gridUpdates.push({
      id: grid.id,
      sph_min: 0,
      sph_max: 0,
      cyl_min: 0,
      cyl_max: 0,
      add_min: null,
      add_max: null,
      metadata: {
        ...metadata,
        conservative_model: 'plana_solar_sem_grau',
        grade_plana_sem_grau: true,
        grade_consultar_laboratorio: true,
        corrected_from_conservative_degree_grid: true,
        corrected_at: new Date().toISOString(),
        correction_note:
          'Tabela solar plana nao informa grau; grade conservadora -4/+4 foi substituida por plano puro para evitar indicacao com receita.',
      },
    })

    offerUpdates.push({
      id: offer.id,
      lab: version?.laboratorio,
      family: family?.nome,
      label: offer.canonical_label || offer.raw_label,
      features: {
        ...features,
        grade_conservadora: true,
        grade_consultar_laboratorio: true,
        grade_nao_informada_na_fonte: true,
        grade_plana_sem_grau: true,
        grade_conservadora_modelo: 'plana_solar_sem_grau',
        grade_conservadora_regra: 'Solar plana/acabada sem mencao de grau na fonte: somente plano 0.00 / 0.00.',
        grade_conservadora_fonte:
          'Fonte lista produto solar por cor/curva/indice/preco, sem faixa de grau; nao indicar para receita com grau.',
      },
    })
  }

  if (commit) {
    for (const update of gridUpdates) {
      const { error } = await supabase
        .from('global_offer_diopter_grids')
        .update({
          sph_min: update.sph_min,
          sph_max: update.sph_max,
          cyl_min: update.cyl_min,
          cyl_max: update.cyl_max,
          add_min: update.add_min,
          add_max: update.add_max,
          metadata: update.metadata,
        })
        .eq('id', update.id)
      if (error) throw error
    }

    for (const update of offerUpdates) {
      const { error } = await supabase.from('global_lens_offers').update({ features: update.features }).eq('id', update.id)
      if (error) throw error
    }
  }

  const byFamily = offerUpdates.reduce((acc, row) => {
    const key = `${row.lab} | ${row.family}`
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})

  const report = {
    generated_at: new Date().toISOString(),
    commit,
    targets_count: targets.length,
    by_family: byFamily,
    sample: offerUpdates.slice(0, 40).map(({ lab, family, label }) => ({ lab, family, label })),
  }

  const md = [
    '# Correcao de Solares Planas Conservadoras',
    '',
    `Gerado em: ${report.generated_at}`,
    `Modo: ${commit ? 'COMMIT aplicado' : 'dry-run'}`,
    '',
    '## Decisao',
    '',
    '- Lentes solares planas sem mencao de grau na fonte nao devem receber grade -4/+4.',
    '- A grade foi corrigida para plano puro: esf 0 a 0, cil 0 a 0, sem adicao.',
    '- Elas continuam aparecendo na tabela de precos, mas nao devem passar no motor para receita com grau.',
    '',
    '## Resultado',
    '',
    `- Grades corrigidas: ${report.targets_count}`,
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
