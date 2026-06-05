import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const commit = process.argv.includes('--commit')
const OUT_MD = path.join('tmp', 'vision_haytek_remaining_grids_review.md')
const OUT_JSON = path.join('tmp', 'vision_haytek_remaining_grids_review.json')

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const FAMILY_MAPPING = {
  'Vision Drive': { haytek: 'Haytek Drive', confidence: 'confirmado_logista_nome_direto' },
  'Vision Office': { haytek: 'Haytek Office', confidence: 'confirmado_logista_nome_direto' },
  'Vision Plus 4K Premium': { haytek: 'Haytek Pro ID', confidence: 'confirmado_logista' },
  'Vision Plus 4K': { haytek: 'Haytek Top', confidence: 'confirmado_logista' },
  'Vision Plus Individual': { haytek: 'Haytek Smart', confidence: 'confirmado_logista' },
  'Vision Plus Pro': { haytek: 'Haytek Light', confidence: 'confirmado_logista' },
  'Vision Plus HD': { haytek: 'Haytek Go!', confidence: 'confirmado_logista' },
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

function isPhoto(offer) {
  const features = offer.features && typeof offer.features === 'object' ? offer.features : {}
  const text = normalize(`${offer.canonical_label} ${offer.raw_label}`)
  return Boolean(
    features.foto === true ||
      features.fotossensivel === true ||
      features.transitions === true ||
      text.includes('foto') ||
      text.includes('fotossensivel') ||
      text.includes('transitions') ||
      text.includes('photofusion') ||
      text.includes('sensity'),
  )
}

function desiredIndexKey(offer) {
  const original = indexKey(offer.indice_refracao)
  return INDEX_ALIASES[original] || original
}

function lookupKeys(offer) {
  const idx = desiredIndexKey(offer)
  const photo = isPhoto(offer)
  const keys = [`idx=${idx}|photo=${photo}`]
  if (photo) keys.push(`idx=${idx}|photo=false`)
  return keys
}

function sourceKey(offer) {
  return `idx=${indexKey(offer.indice_refracao)}|photo=${isPhoto(offer)}`
}

function gridSignature(grid) {
  return [grid.sph_min, grid.sph_max, grid.cyl_min, grid.cyl_max, grid.add_min, grid.add_max]
    .map((value) => (value == null ? '' : String(Number(value))))
    .join('|')
}

function uniqueGrids(candidates) {
  const bySignature = new Map()
  for (const candidate of candidates) {
    for (const grid of candidate.grids) {
      const signature = gridSignature(grid)
      const current = bySignature.get(signature)
      const source = { id: candidate.offer.id, label: candidate.offer.canonical_label || candidate.offer.raw_label }
      if (!current) bySignature.set(signature, { grid, source_offers: [source] })
      else if (!current.source_offers.some((row) => row.id === source.id)) current.source_offers.push(source)
    }
  }
  return [...bySignature.values()]
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

function withFeatures(offer, mapping, haytekFamily, count) {
  const features = offer.features && typeof offer.features === 'object' ? offer.features : {}
  return {
    ...features,
    grade_inferida_de_haytek: true,
    grade_inferida_provisoria: true,
    grade_inferida_confidence: mapping.confidence,
    grade_inferida_familia_haytek: haytekFamily.nome,
    grade_inferida_observacao:
      'Grade Vision preenchida por equivalencia confirmada/provavel com Haytek. Confirmar disponibilidade quando necessario.',
    grade_inferida_em: new Date().toISOString(),
    grade_inferida_segmentos: count,
  }
}

async function main() {
  const [versions, families, offers, grids] = await Promise.all([
    fetchAll('global_catalog_versions', 'id,laboratorio,versao'),
    fetchAll('global_lens_families', 'id,version_id,nome,clinical_category'),
    fetchAll('global_lens_offers', 'id,family_id,canonical_label,raw_label,indice_refracao,features'),
    fetchAll('global_offer_diopter_grids', 'id,offer_id,sph_min,sph_max,cyl_min,cyl_max,add_min,add_max,metadata'),
  ])

  const visionVersion = versions.find((version) => normalize(version.laboratorio) === 'vision')
  const haytekVersion = versions.find((version) => normalize(version.laboratorio) === 'haytek')
  if (!visionVersion || !haytekVersion) throw new Error('Versoes Vision/Haytek nao encontradas.')

  const familyById = new Map(families.map((family) => [family.id, family]))
  const familyByVersionAndName = new Map(families.map((family) => [`${family.version_id}|${normalize(family.nome)}`, family]))

  const gridsByOfferId = new Map()
  for (const grid of grids) {
    const rows = gridsByOfferId.get(grid.offer_id) || []
    rows.push(grid)
    gridsByOfferId.set(grid.offer_id, rows)
  }

  const haytekByFamilyAndKey = new Map()
  for (const offer of offers) {
    const family = familyById.get(offer.family_id)
    if (!family || family.version_id !== haytekVersion.id) continue
    const offerGrids = gridsByOfferId.get(offer.id) || []
    if (!offerGrids.length) continue
    const key = `${normalize(family.nome)}|${sourceKey(offer)}`
    const rows = haytekByFamilyAndKey.get(key) || []
    rows.push({ offer, grids: offerGrids })
    haytekByFamilyAndKey.set(key, rows)
  }

  const inserts = []
  const updates = []
  const skipped = []

  for (const [visionName, mapping] of Object.entries(FAMILY_MAPPING)) {
    const visionFamily = familyByVersionAndName.get(`${visionVersion.id}|${normalize(visionName)}`)
    const haytekFamily = familyByVersionAndName.get(`${haytekVersion.id}|${normalize(mapping.haytek)}`)
    if (!visionFamily || !haytekFamily) {
      skipped.push({ reason: 'familia_nao_encontrada', visionName, mapping })
      continue
    }

    for (const offer of offers.filter((row) => row.family_id === visionFamily.id)) {
      if ((gridsByOfferId.get(offer.id) || []).length) {
        skipped.push({ reason: 'grade_existente_respeitada', family: visionName, offer: offer.canonical_label || offer.raw_label })
        continue
      }

      let match = null
      let usedKey = null
      for (const key of lookupKeys(offer)) {
        const candidates = haytekByFamilyAndKey.get(`${normalize(haytekFamily.nome)}|${key}`) || []
        if (candidates.length) {
          match = uniqueGrids(candidates)
          usedKey = key
          break
        }
      }

      if (!match?.length) {
        skipped.push({
          reason: 'grade_haytek_nao_encontrada',
          family: visionName,
          offer: offer.canonical_label || offer.raw_label,
          index: offer.indice_refracao,
          mapped_index: desiredIndexKey(offer),
          photo: isPhoto(offer),
        })
        continue
      }

      const aliasFrom = indexKey(offer.indice_refracao)
      const aliasTo = desiredIndexKey(offer)
      const photoFallback = isPhoto(offer) && usedKey.endsWith('photo=false')

      for (const item of match) {
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
            source_kind: 'vision_haytek_confirmed_equivalence_completion',
            vision_family: visionName,
            vision_offer_label: offer.canonical_label || offer.raw_label,
            source_family: haytekFamily.nome,
            source_offer_ids: item.source_offers.map((source) => source.id),
            source_offer_labels: item.source_offers.map((source) => source.label),
            source_key: usedKey,
            confidence: mapping.confidence,
            index_alias_from: aliasFrom !== aliasTo ? aliasFrom : null,
            index_alias_to: aliasFrom !== aliasTo ? aliasTo : null,
            photo_grid_fallback_to_base: photoFallback,
          },
        })
      }

      updates.push({
        id: offer.id,
        family: visionName,
        label: offer.canonical_label || offer.raw_label,
        features: withFeatures(offer, mapping, haytekFamily, match.length),
      })
    }
  }

  const skippedByReason = skipped.reduce((acc, row) => {
    acc[row.reason] = (acc[row.reason] || 0) + 1
    return acc
  }, {})
  const insertsByFamily = inserts.reduce((acc, row) => {
    const offer = offers.find((item) => item.id === row.offer_id)
    const family = familyById.get(offer?.family_id)
    acc[family?.nome || '?'] = (acc[family?.nome || '?'] || 0) + 1
    return acc
  }, {})

  const report = {
    generated_at: new Date().toISOString(),
    commit,
    inserts_count: inserts.length,
    feature_updates_count: updates.length,
    skipped_by_reason: skippedByReason,
    inserts_by_family: insertsByFamily,
    skipped_preview: skipped.slice(0, 100),
  }
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2))
  fs.writeFileSync(
    OUT_MD,
    [
      '# Grades Vision x Haytek Restantes',
      '',
      `Gerado em: ${report.generated_at}`,
      `Commit: ${commit ? 'sim' : 'nao'}`,
      '',
      '- Completa buracos em familias Vision confirmadas como Haytek.',
      '- Nao sobrescreve grades existentes.',
      '- Usa aliases de indice quando necessario.',
      '',
      `Grades: ${report.inserts_count}`,
      `Ofertas marcadas: ${report.feature_updates_count}`,
      `Puladas: ${JSON.stringify(report.skipped_by_reason)}`,
      '',
      ...Object.entries(report.inserts_by_family).map(([family, count]) => `- ${family}: ${count}`),
    ].join('\n'),
  )

  console.log(JSON.stringify({ commit, reports: [OUT_MD, OUT_JSON], ...report }, null, 2))

  if (!commit) return
  if (inserts.length) {
    const { error } = await supabase.from('global_offer_diopter_grids').insert(inserts)
    if (error) throw error
  }
  for (const update of updates) {
    const { error } = await supabase.from('global_lens_offers').update({ features: update.features }).eq('id', update.id)
    if (error) throw error
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
