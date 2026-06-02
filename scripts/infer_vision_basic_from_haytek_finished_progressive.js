import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const commit = process.argv.includes('--commit')
const OUT_MD = path.join('tmp', 'vision_basic_haytek_finished_progressive_review.md')
const OUT_JSON = path.join('tmp', 'vision_basic_haytek_finished_progressive_review.json')

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

async function fetchAll(table, columns, buildQuery = (query) => query) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await buildQuery(supabase.from(table).select(columns).range(from, from + 999))
    if (error) throw error
    rows.push(...(data || []))
    if ((data || []).length < 1000) break
  }
  return rows
}

function gridSignature(grid) {
  return [grid.sph_min, grid.sph_max, grid.cyl_min, grid.cyl_max, grid.add_min, grid.add_max]
    .map((value) => (value == null ? '' : String(Number(value))))
    .join('|')
}

function withFeatures(offer, sourceFamily, segmentCount) {
  const features = offer.features && typeof offer.features === 'object' ? offer.features : {}
  return {
    ...features,
    grade_inferida_de_haytek: true,
    grade_inferida_provisoria: true,
    grade_inferida_confidence: 'provavel_logista_basic_acabada_haytek',
    grade_inferida_familia_haytek: sourceFamily.nome,
    grade_inferida_observacao:
      'Vision Plus Basic preenchida como espelho provavel da Haytek Progressivas Acabadas, conforme interpretacao do audio do lojista. Confirmar disponibilidade quando necessario.',
    grade_inferida_em: new Date().toISOString(),
    grade_inferida_segmentos: segmentCount,
  }
}

async function main() {
  const [versions, families, offers, grids] = await Promise.all([
    fetchAll('global_catalog_versions', 'id,laboratorio,versao'),
    fetchAll('global_lens_families', 'id,version_id,nome,clinical_category'),
    fetchAll(
      'global_lens_offers',
      'id,family_id,canonical_label,raw_label,material,indice_refracao,clinical_category,features,source_page_reference',
    ),
    fetchAll('global_offer_diopter_grids', 'id,offer_id,sph_min,sph_max,cyl_min,cyl_max,add_min,add_max,metadata'),
  ])

  const versionByLab = new Map(versions.map((version) => [normalize(version.laboratorio), version]))
  const visionVersion = versionByLab.get('vision')
  const haytekVersion = versionByLab.get('haytek')
  if (!visionVersion || !haytekVersion) throw new Error('Versoes Vision/Haytek nao encontradas.')

  const familyById = new Map(families.map((family) => [family.id, family]))
  const familyByVersionAndName = new Map(families.map((family) => [`${family.version_id}|${normalize(family.nome)}`, family]))
  const visionFamily = familyByVersionAndName.get(`${visionVersion.id}|${normalize('Vision Plus Basic')}`)
  const haytekFamily = familyByVersionAndName.get(`${haytekVersion.id}|${normalize('Haytek Progressivas Acabadas')}`)
  if (!visionFamily || !haytekFamily) throw new Error('Familias Vision Plus Basic/Haytek Progressivas Acabadas nao encontradas.')

  const gridsByOfferId = new Map()
  for (const grid of grids) {
    const rows = gridsByOfferId.get(grid.offer_id) || []
    rows.push(grid)
    gridsByOfferId.set(grid.offer_id, rows)
  }

  const haytekOffers = offers.filter((offer) => offer.family_id === haytekFamily.id)
  const sourceBySignature = new Map()
  for (const offer of haytekOffers) {
    for (const grid of gridsByOfferId.get(offer.id) || []) {
      const signature = gridSignature(grid)
      const current = sourceBySignature.get(signature)
      const sourceOffer = { id: offer.id, label: offer.canonical_label || offer.raw_label }
      if (!current) sourceBySignature.set(signature, { grid, source_offers: [sourceOffer] })
      else current.source_offers.push(sourceOffer)
    }
  }
  const sourceGrids = [...sourceBySignature.values()]
  if (!sourceGrids.length) throw new Error('Haytek Progressivas Acabadas sem grade fonte.')

  const inserts = []
  const updates = []
  const skipped = []

  for (const offer of offers.filter((row) => row.family_id === visionFamily.id)) {
    const existing = gridsByOfferId.get(offer.id) || []
    if (existing.length) {
      skipped.push({ reason: 'grade_existente_respeitada', offer: offer.canonical_label || offer.raw_label })
      continue
    }

    for (const item of sourceGrids) {
      const grid = item.grid
      inserts.push({
        offer_id: offer.id,
        sph_min: grid.sph_min,
        sph_max: grid.sph_max,
        cyl_min: grid.cyl_min,
        cyl_max: grid.cyl_max,
        add_min: grid.add_min,
        add_max: grid.add_max,
        metadata: {
          ...(grid.metadata || {}),
          inferred_for_vision: true,
          inferred_from_haytek: true,
          provisional: true,
          source_kind: 'vision_basic_haytek_finished_progressive_equivalence',
          vision_family: visionFamily.nome,
          vision_offer_label: offer.canonical_label || offer.raw_label,
          source_family: haytekFamily.nome,
          source_offer_ids: item.source_offers.map((source) => source.id),
          source_offer_labels: item.source_offers.map((source) => source.label),
          confidence: 'provavel_logista_basic_acabada_haytek',
          note:
            'Grade copiada da Haytek Progressivas Acabadas. Fonte Haytek indica progressiva acabada pronta: esfera 0 a +3, cilindro 0, adicao +1 a +3.5.',
        },
      })
    }

    updates.push({
      id: offer.id,
      label: offer.canonical_label || offer.raw_label,
      features: withFeatures(offer, haytekFamily, sourceGrids.length),
    })
  }

  if (commit && inserts.length) {
    const { error } = await supabase.from('global_offer_diopter_grids').insert(inserts)
    if (error) throw error
  }

  if (commit) {
    for (const update of updates) {
      const { error } = await supabase.from('global_lens_offers').update({ features: update.features }).eq('id', update.id)
      if (error) throw error
    }
  }

  const report = {
    generated_at: new Date().toISOString(),
    commit,
    vision_family: visionFamily.nome,
    source_family: haytekFamily.nome,
    source_unique_grids_count: sourceGrids.length,
    inserts_count: inserts.length,
    feature_updates_count: updates.length,
    skipped_count: skipped.length,
    skipped,
    sample_source_grids: sourceGrids.map((item) => ({
      sph_min: item.grid.sph_min,
      sph_max: item.grid.sph_max,
      cyl_min: item.grid.cyl_min,
      cyl_max: item.grid.cyl_max,
      add_min: item.grid.add_min,
      add_max: item.grid.add_max,
      source_offer_labels: item.source_offers.map((source) => source.label),
    })),
    sample_updates: updates.slice(0, 12).map((update) => ({ label: update.label, feature_keys: Object.keys(update.features).sort() })),
  }

  const md = [
    '# Vision Plus Basic -> Haytek Progressivas Acabadas',
    '',
    `Gerado em: ${report.generated_at}`,
    `Modo: ${commit ? 'COMMIT aplicado' : 'dry-run'}`,
    '',
    '## Decisao',
    '',
    '- `Vision Plus Basic` foi tratada como espelho provavel de `Haytek Progressivas Acabadas`.',
    '- Motivo: o lojista informou que `Basic` sao lentes acabadas, sem indicar Gamalab; a Haytek tem familia explicita de progressivas acabadas.',
    '- Esta inferencia e provisoria e fica marcada em `features` e `metadata` para auditoria futura.',
    '',
    '## Grade fonte',
    '',
    ...report.sample_source_grids.map(
      (grid) =>
        `- Esf ${grid.sph_min} a ${grid.sph_max}; Cil ${grid.cyl_min} a ${grid.cyl_max}; Add ${grid.add_min} a ${grid.add_max}; fontes: ${grid.source_offer_labels.join(' | ')}`,
    ),
    '',
    '## Resultado',
    '',
    `- Grades inseridas: ${report.inserts_count}`,
    `- Ofertas marcadas em features: ${report.feature_updates_count}`,
    `- Puladas: ${report.skipped_count}`,
    '',
    '## Observacao',
    '',
    '- O preco da Vision nao foi alterado.',
    '- A grade copiada nao significa confirmacao oficial de disponibilidade Vision; significa equivalencia operacional provisoria com Haytek.',
  ].join('\n')

  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2))
  fs.writeFileSync(OUT_MD, md)
  console.log(md)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
