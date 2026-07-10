import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const commit = process.argv.includes('--commit')
const OUT_MD = path.join('tmp', 'vision_legacy_haytek_grid_realign_review.md')
const OUT_JSON = path.join('tmp', 'vision_legacy_haytek_grid_realign_review.json')

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const FAMILY_MAPPING = {
  'Vision Plus Individual': 'Haytek Smart',
  'Vision Plus 4K Premium': 'Haytek Pro ID',
}

const INDEX_ALIASES = {
  '1.50': '1.56',
  '1.53': '1.56',
  '1.60': '1.61',
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function indexKey(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  if (!Number.isFinite(number)) return null
  return number.toFixed(2)
}

function desiredIndexKey(offer) {
  const key = indexKey(offer.indice_refracao)
  return INDEX_ALIASES[key] || key
}

function gridSignature(grid) {
  return [grid.sph_min, grid.sph_max, grid.cyl_min, grid.cyl_max, grid.add_min, grid.add_max]
    .map((value) => (value == null ? '' : String(Number(value))))
    .join('|')
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

function chooseSourceGrids(sourceRows) {
  // Preferir a pagina principal da familia (p.3/p.4), porque p.9 e bloco Transitions global.
  const primary = sourceRows.filter((row) => row.grid.metadata?.variant == null && [3, 4].includes(Number(row.grid.metadata?.source_page)))
  const rows = primary.length ? primary : sourceRows
  const unique = new Map()
  for (const row of rows) {
    const signature = gridSignature(row.grid)
    if (!unique.has(signature)) unique.set(signature, { grid: row.grid, sourceOffers: [] })
    unique.get(signature).sourceOffers.push(row.offer)
  }
  return [...unique.values()]
}

function nextFeatures(offer, haytekFamily, segmentCount) {
  const features = offer.features && typeof offer.features === 'object' ? offer.features : {}
  return {
    ...features,
    grade_realinhada_de_haytek: true,
    grade_realinhada_familia_haytek: haytekFamily.nome,
    grade_realinhada_motivo: 'Substituida grade Vision legada achatada por segmentos da familia Haytek equivalente.',
    grade_realinhada_em: new Date().toISOString(),
    grade_realinhada_segmentos: segmentCount,
  }
}

async function main() {
  const [versions, families, offers, grids] = await Promise.all([
    fetchAll('global_catalog_versions', 'id,laboratorio,versao'),
    fetchAll('global_lens_families', 'id,version_id,nome'),
    fetchAll('global_lens_offers', 'id,family_id,canonical_label,raw_label,indice_refracao,features'),
    fetchAll('global_offer_diopter_grids', 'id,offer_id,sph_min,sph_max,cyl_min,cyl_max,add_min,add_max,metadata'),
  ])

  const versionByLab = new Map(versions.map((version) => [normalize(version.laboratorio), version]))
  const visionVersion = versionByLab.get('vision')
  const haytekVersion = versionByLab.get('haytek')
  if (!visionVersion || !haytekVersion) throw new Error('Versoes Vision/Haytek nao encontradas.')

  const familyByVersionAndName = new Map(families.map((family) => [`${family.version_id}|${normalize(family.nome)}`, family]))
  const gridsByOfferId = new Map()
  for (const grid of grids) {
    const rows = gridsByOfferId.get(grid.offer_id) || []
    rows.push(grid)
    gridsByOfferId.set(grid.offer_id, rows)
  }

  const deletes = []
  const inserts = []
  const featureUpdates = []
  const skipped = []

  for (const [visionName, haytekName] of Object.entries(FAMILY_MAPPING)) {
    const visionFamily = familyByVersionAndName.get(`${visionVersion.id}|${normalize(visionName)}`)
    const haytekFamily = familyByVersionAndName.get(`${haytekVersion.id}|${normalize(haytekName)}`)
    if (!visionFamily || !haytekFamily) {
      skipped.push({ reason: 'familia_nao_encontrada', visionName, haytekName })
      continue
    }

    const sourceByIndex = new Map()
    for (const offer of offers.filter((row) => row.family_id === haytekFamily.id)) {
      const key = indexKey(offer.indice_refracao)
      const rows = sourceByIndex.get(key) || []
      for (const grid of gridsByOfferId.get(offer.id) || []) rows.push({ offer, grid })
      sourceByIndex.set(key, rows)
    }

    for (const offer of offers.filter((row) => row.family_id === visionFamily.id)) {
      const existingGrids = gridsByOfferId.get(offer.id) || []
      deletes.push(...existingGrids.map((grid) => grid.id))

      const sourceRows = sourceByIndex.get(desiredIndexKey(offer)) || []
      const sourceGrids = chooseSourceGrids(sourceRows)
      if (!sourceGrids.length) {
        skipped.push({
          reason: 'grade_fonte_nao_encontrada',
          visionName,
          offer: offer.canonical_label || offer.raw_label,
          index: offer.indice_refracao,
          mappedIndex: desiredIndexKey(offer),
        })
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
            source_kind: 'vision_legacy_haytek_grid_realign',
            vision_family: visionFamily.nome,
            vision_offer_label: offer.canonical_label || offer.raw_label,
            source_family: haytekFamily.nome,
            source_offer_ids: item.sourceOffers.map((source) => source.id),
            source_offer_labels: item.sourceOffers.map((source) => source.canonical_label || source.raw_label),
            replaced_legacy_flattened_grid: true,
            index_alias_from: indexKey(offer.indice_refracao) !== desiredIndexKey(offer) ? indexKey(offer.indice_refracao) : null,
            index_alias_to: indexKey(offer.indice_refracao) !== desiredIndexKey(offer) ? desiredIndexKey(offer) : null,
          },
        })
      }

      featureUpdates.push({
        id: offer.id,
        family: visionName,
        label: offer.canonical_label || offer.raw_label,
        features: nextFeatures(offer, haytekFamily, sourceGrids.length),
      })
    }
  }

  if (commit) {
    if (deletes.length) {
      const { error } = await supabase.from('global_offer_diopter_grids').delete().in('id', deletes)
      if (error) throw error
    }
    if (inserts.length) {
      const { error } = await supabase.from('global_offer_diopter_grids').insert(inserts)
      if (error) throw error
    }
    for (const update of featureUpdates) {
      const { error } = await supabase.from('global_lens_offers').update({ features: update.features }).eq('id', update.id)
      if (error) throw error
    }
  }

  const insertedByFamily = inserts.reduce((acc, row) => {
    const update = featureUpdates.find((item) => item.id === row.offer_id)
    acc[update?.family || '?'] = (acc[update?.family || '?'] || 0) + 1
    return acc
  }, {})

  const report = {
    generated_at: new Date().toISOString(),
    commit,
    deleted_grids_count: deletes.length,
    inserted_grids_count: inserts.length,
    feature_updates_count: featureUpdates.length,
    inserted_by_family: insertedByFamily,
    skipped,
  }

  const md = [
    '# Realinhamento de Grades Vision Legadas',
    '',
    `Gerado em: ${report.generated_at}`,
    `Modo: ${commit ? 'COMMIT aplicado' : 'dry-run'}`,
    '',
    '## Familias',
    '',
    ...Object.entries(FAMILY_MAPPING).map(([vision, haytek]) => `- ${vision} -> ${haytek}`),
    '',
    '## Resultado',
    '',
    `- Grades antigas removidas: ${report.deleted_grids_count}`,
    `- Grades novas inseridas: ${report.inserted_grids_count}`,
    `- Ofertas marcadas em features: ${report.feature_updates_count}`,
    `- Puladas: ${report.skipped.length}`,
    '',
    '## Insercoes por familia',
    '',
    ...Object.entries(insertedByFamily).map(([family, count]) => `- ${family}: ${count}`),
  ].join('\n')

  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2))
  fs.writeFileSync(OUT_MD, md)
  console.log(md)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
