import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const commit = process.argv.includes('--commit')
const OUT_MD = path.join('tmp', 'vision_gamalab_haytek_grids_review.md')
const OUT_JSON = path.join('tmp', 'vision_gamalab_haytek_grids_review.json')

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const FAMILY_MAPPING = {
  'Vision Plus Lite': {
    gamalab: 'Life',
    haytekFallback: 'Haytek Go!',
    confidence: 'provavel_logista_gama_linha_entrada',
    rationale: 'Lojista informou que Plus Lite vem da Gama; por preco/posicionamento, Life e uma candidata de entrada.',
  },
  'Vision Plus': {
    gamalab: 'Solamax Digital',
    haytekFallback: 'Haytek Go!',
    confidence: 'provavel_logista_gama_digital',
    rationale: 'Lojista informou Vision Plus com Gama; ordem comercial sugere que Vision Plus e a linha Digital.',
  },
  'Vision Plus Extensee': {
    gamalab: 'Dynamic Pro',
    haytekFallback: 'Haytek Light',
    confidence: 'provavel_logista_gama_extensee',
    rationale: 'Lojista informou Extensee com Gama; preco/posicionamento aproximam de Dynamic Pro.',
  },
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

function offerLookupKeys(offer) {
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
      const source = {
        id: candidate.offer.id,
        label: candidate.offer.canonical_label || candidate.offer.raw_label,
        family: candidate.family.nome,
      }
      if (!current) {
        bySignature.set(signature, { grid, source_offers: [source] })
      } else if (!current.source_offers.some((row) => row.id === source.id)) {
        current.source_offers.push(source)
      }
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

function withInferenceFeatures(offer, mapping, sourceFamily, segmentCount) {
  const features = offer.features && typeof offer.features === 'object' ? offer.features : {}
  return {
    ...features,
    grade_inferida_de_gamalab_haytek: true,
    grade_inferida_provisoria: true,
    grade_inferida_confidence: mapping.confidence,
    grade_inferida_familia_gamalab: mapping.gamalab,
    grade_inferida_familia_haytek_fallback: mapping.haytekFallback,
    grade_inferida_fonte_usada: sourceFamily,
    grade_inferida_observacao:
      'Grade Vision preenchida por equivalencia provavel com Gamalab/Haytek. Confirmar disponibilidade com laboratorio quando necessario.',
    grade_inferida_em: new Date().toISOString(),
    grade_inferida_segmentos: segmentCount,
  }
}

async function main() {
  const [versions, families, offers, grids] = await Promise.all([
    fetchAll('global_catalog_versions', 'id,laboratorio,versao'),
    fetchAll('global_lens_families', 'id,version_id,nome,clinical_category'),
    fetchAll('global_lens_offers', 'id,family_id,canonical_label,raw_label,material,indice_refracao,clinical_category,features,source_page_reference'),
    fetchAll('global_offer_diopter_grids', 'id,offer_id,sph_min,sph_max,cyl_min,cyl_max,add_min,add_max,metadata'),
  ])

  const versionByLab = new Map(versions.map((version) => [normalize(version.laboratorio), version]))
  const visionVersion = versionByLab.get('vision')
  const gamalabVersion = versionByLab.get('gamalab')
  const haytekVersion = versionByLab.get('haytek')
  if (!visionVersion || !gamalabVersion || !haytekVersion) throw new Error('Versoes Vision/Gamalab/Haytek nao encontradas.')

  const familyById = new Map(families.map((family) => [family.id, family]))
  const familyByVersionAndName = new Map(families.map((family) => [`${family.version_id}|${normalize(family.nome)}`, family]))

  const gridsByOfferId = new Map()
  for (const grid of grids) {
    const rows = gridsByOfferId.get(grid.offer_id) || []
    rows.push(grid)
    gridsByOfferId.set(grid.offer_id, rows)
  }

  const sourceByFamilyAndKey = new Map()
  for (const offer of offers) {
    const family = familyById.get(offer.family_id)
    if (!family) continue
    if (![gamalabVersion.id, haytekVersion.id].includes(family.version_id)) continue
    const offerGrids = gridsByOfferId.get(offer.id) || []
    if (!offerGrids.length) continue
    const key = `${family.version_id}|${normalize(family.nome)}|${sourceKey(offer)}`
    const rows = sourceByFamilyAndKey.get(key) || []
    rows.push({ family, offer, grids: offerGrids })
    sourceByFamilyAndKey.set(key, rows)
  }

  const inserts = []
  const featureUpdates = []
  const skipped = []

  for (const [visionName, mapping] of Object.entries(FAMILY_MAPPING)) {
    const visionFamily = familyByVersionAndName.get(`${visionVersion.id}|${normalize(visionName)}`)
    const gamalabFamily = familyByVersionAndName.get(`${gamalabVersion.id}|${normalize(mapping.gamalab)}`)
    const haytekFamily = familyByVersionAndName.get(`${haytekVersion.id}|${normalize(mapping.haytekFallback)}`)

    if (!visionFamily || !gamalabFamily || !haytekFamily) {
      skipped.push({ reason: 'familia_nao_encontrada', visionName, mapping })
      continue
    }

    const visionOffers = offers.filter((offer) => offer.family_id === visionFamily.id)
    for (const offer of visionOffers) {
      const existing = gridsByOfferId.get(offer.id) || []
      if (existing.length) {
        skipped.push({ reason: 'grade_existente_respeitada', family: visionName, offer: offer.canonical_label || offer.raw_label })
        continue
      }

      let match = null
      let sourceFamily = null
      let usedKey = null
      for (const key of offerLookupKeys(offer)) {
        const gamalabCandidates =
          sourceByFamilyAndKey.get(`${gamalabVersion.id}|${normalize(gamalabFamily.nome)}|${key}`) || []
        if (gamalabCandidates.length) {
          match = uniqueGrids(gamalabCandidates)
          sourceFamily = gamalabFamily.nome
          usedKey = key
          break
        }

        const haytekCandidates =
          sourceByFamilyAndKey.get(`${haytekVersion.id}|${normalize(haytekFamily.nome)}|${key}`) || []
        if (haytekCandidates.length) {
          match = uniqueGrids(haytekCandidates)
          sourceFamily = haytekFamily.nome
          usedKey = key
          break
        }
      }

      if (!match?.length) {
        skipped.push({
          reason: 'grade_fonte_nao_encontrada',
          family: visionName,
          offer: offer.canonical_label || offer.raw_label,
          index: offer.indice_refracao,
          mapped_index: desiredIndexKey(offer),
          photo: isPhoto(offer),
          mapping,
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
            provisional: true,
            source_kind: 'vision_gamalab_haytek_probable_equivalence',
            vision_family: visionName,
            vision_offer_label: offer.canonical_label || offer.raw_label,
            source_family: sourceFamily,
            source_gamalab_preferred_family: gamalabFamily.nome,
            source_haytek_fallback_family: haytekFamily.nome,
            source_offer_ids: item.source_offers.map((source) => source.id),
            source_offer_labels: item.source_offers.map((source) => `${source.family}: ${source.label}`),
            source_key: usedKey,
            confidence: mapping.confidence,
            rationale: mapping.rationale,
            index_alias_from: aliasFrom !== aliasTo ? aliasFrom : null,
            index_alias_to: aliasFrom !== aliasTo ? aliasTo : null,
            photo_grid_fallback_to_base: photoFallback,
            warning: 'Grade Vision inferida/provisoria. Confirmar disponibilidade com laboratorio quando necessario.',
          },
        })
      }

      featureUpdates.push({
        id: offer.id,
        family: visionName,
        label: offer.canonical_label || offer.raw_label,
        features: withInferenceFeatures(offer, mapping, sourceFamily, match.length),
      })
    }
  }

  const skippedByReason = skipped.reduce((acc, item) => {
    acc[item.reason] = (acc[item.reason] || 0) + 1
    return acc
  }, {})
  const insertsByFamily = inserts.reduce((acc, item) => {
    const offer = offers.find((row) => row.id === item.offer_id)
    const family = familyById.get(offer?.family_id)
    acc[family?.nome || '?'] = (acc[family?.nome || '?'] || 0) + 1
    return acc
  }, {})

  const report = {
    generated_at: new Date().toISOString(),
    commit,
    family_mapping: FAMILY_MAPPING,
    index_aliases: INDEX_ALIASES,
    inserts_count: inserts.length,
    feature_updates_count: featureUpdates.length,
    skipped_count: skipped.length,
    skipped_by_reason: skippedByReason,
    inserts_by_family: insertsByFamily,
    preview_inserts: inserts.slice(0, 120).map((insert) => {
      const offer = offers.find((row) => row.id === insert.offer_id)
      const family = familyById.get(offer?.family_id)
      return {
        family: family?.nome,
        offer: offer?.canonical_label || offer?.raw_label,
        sph_min: insert.sph_min,
        sph_max: insert.sph_max,
        cyl_min: insert.cyl_min,
        cyl_max: insert.cyl_max,
        add_min: insert.add_min,
        add_max: insert.add_max,
        source_family: insert.metadata.source_family,
      }
    }),
    skipped_preview: skipped.slice(0, 120),
  }

  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2))
  fs.writeFileSync(
    OUT_MD,
    [
      '# Grades Vision Inferidas de Gamalab/Haytek',
      '',
      `Gerado em: ${report.generated_at}`,
      `Commit: ${commit ? 'sim' : 'nao'}`,
      '',
      '## Regra',
      '',
      '- Nao sobrescreve ofertas Vision que ja possuem grade.',
      '- Usa Gamalab como fonte preferida e Haytek como fallback quando a familia Gamalab nao tem aquele indice/variante.',
      '- Nao aplica `Vision Plus Basic` porque o lojista chamou de acabada, mas o cadastro atual esta como multifocal.',
      '- Toda grade inserida recebe metadata provisoria para futura UI de consulta de disponibilidade.',
      '',
      '## Mapeamento',
      '',
      ...Object.entries(FAMILY_MAPPING).map(([vision, mapping]) => `- ${vision} -> ${mapping.gamalab} (fallback ${mapping.haytekFallback}) | ${mapping.confidence}`),
      '',
      '## Resultado',
      '',
      `- Grades a inserir/inseridas: ${report.inserts_count}`,
      `- Ofertas a marcar/marcadas: ${report.feature_updates_count}`,
      `- Puladas: ${report.skipped_count}`,
      `- Motivos pulados: ${JSON.stringify(report.skipped_by_reason)}`,
      '',
      '## Inserts Por Familia',
      '',
      ...Object.entries(report.inserts_by_family).map(([family, count]) => `- ${family}: ${count}`),
      '',
      '## Preview',
      '',
      ...report.preview_inserts.slice(0, 50).map(
        (row) =>
          `- ${row.family} | ${row.offer} | sph ${row.sph_min}..${row.sph_max} | cyl ${row.cyl_min}..${row.cyl_max} | add ${row.add_min ?? ''}..${row.add_max ?? ''} | fonte ${row.source_family}`,
      ),
    ].join('\n'),
  )

  console.log(
    JSON.stringify(
      {
        commit,
        reports: [OUT_MD, OUT_JSON],
        inserts_count: inserts.length,
        feature_updates_count: featureUpdates.length,
        skipped_by_reason: skippedByReason,
        inserts_by_family: insertsByFamily,
      },
      null,
      2,
    ),
  )

  if (!commit) return

  if (inserts.length) {
    const { error } = await supabase.from('global_offer_diopter_grids').insert(inserts)
    if (error) throw error
  }

  for (const update of featureUpdates) {
    const { error } = await supabase.from('global_lens_offers').update({ features: update.features }).eq('id', update.id)
    if (error) throw error
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
