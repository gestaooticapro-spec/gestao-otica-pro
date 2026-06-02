import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const commit = process.argv.includes('--commit')
const OUT_MD = path.join('tmp', 'gamalab_inferred_haytek_grids_review.md')
const OUT_JSON = path.join('tmp', 'gamalab_inferred_haytek_grids_review.json')

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const FAMILY_MAPPING = {
  // Progressivas Gamalab. Estas grades sao inferidas por equivalencia tecnica provavel com Haytek.
  'Quantum A.I.': { haytek: 'Haytek Pro ID', confidence: 'provavel_tier_topo' },
  'Gamavision 4K': { haytek: 'Haytek Top', confidence: 'provavel_nome_4k' },
  'Gamavision Pro Individual': { haytek: 'Haytek Smart', confidence: 'provavel_individual_personalizada' },
  'Gamavision Freeform': { haytek: 'Haytek Light', confidence: 'provavel_freeform_intermediaria' },
  'Dynamic Premium': { haytek: 'Haytek Top', confidence: 'provavel_premium' },
  'Dynamic Pro': { haytek: 'Haytek Light', confidence: 'provavel_pro_intermediaria' },
  'Life': { haytek: 'Haytek Go!', confidence: 'provavel_entrada' },
  'Gama HD': { haytek: 'Haytek Go!', confidence: 'provavel_hd_entrada' },
  'Solamax Digital': { haytek: 'Haytek Go!', confidence: 'provavel_multifocal_entrada' },
  'Easy M': { haytek: 'Haytek Go!', confidence: 'provavel_multifocal_entrada' },

  // Visao simples / apoio acomodativo / ocupacionais.
  'Dynamic Relax': { haytek: 'Haytek Easy', confidence: 'provavel_baixa_adicao_visao_simples' },
  'Dynamic Single': { haytek: 'Haytek Visao Simples', confidence: 'provavel_visao_simples' },
  'Visão Simples Surfaçadas Digital': { haytek: 'Haytek Visao Simples', confidence: 'provavel_visao_simples_surfacada' },
  'Dynamic Work': { haytek: 'Haytek Office', confidence: 'provavel_ocupacional' },
  Interview: { haytek: 'Haytek Office', confidence: 'provavel_ocupacional' },

  // Acabadas sem grade na fonte Gamalab. Nao afeta ofertas que ja possuem grade do PDF.
  'Gama HD Acabadas': { haytek: 'Haytek Visao Simples Acabadas', confidence: 'provavel_acabada_sem_grade_fonte' },
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

function isBlue(offer) {
  const features = offer.features && typeof offer.features === 'object' ? offer.features : {}
  const text = normalize(`${offer.canonical_label} ${offer.raw_label}`)
  return Boolean(features.filtro_azul === true || features.blue === true || text.includes('blue') || text.includes('filtro azul'))
}

function desiredIndexKey(offer) {
  const original = indexKey(offer.indice_refracao)
  return INDEX_ALIASES[original] || original
}

function gridLookupKeys(offer) {
  const idx = desiredIndexKey(offer)
  const photo = isPhoto(offer)
  const keys = [`idx=${idx}|photo=${photo}`]

  // Transitions/fotossensiveis da Haytek pagina 9 tem grade global por indice e pode existir em
  // menos variantes que a Gamalab. Se nao achar photo=true, o script tenta a grade base do indice.
  if (photo) keys.push(`idx=${idx}|photo=false`)

  return keys
}

function haytekGridKey(offer) {
  return `idx=${indexKey(offer.indice_refracao)}|photo=${isPhoto(offer)}`
}

function gridSignature(grid) {
  return [grid.sph_min, grid.sph_max, grid.cyl_min, grid.cyl_max, grid.add_min, grid.add_max]
    .map((value) => (value == null ? '' : String(Number(value))))
    .join('|')
}

function uniqueGridsFromCandidates(candidates) {
  const bySignature = new Map()
  for (const candidate of candidates) {
    for (const grid of candidate.grids) {
      const signature = gridSignature(grid)
      const current = bySignature.get(signature)
      if (!current) {
        bySignature.set(signature, {
          grid,
          source_offers: [
            {
              id: candidate.offer.id,
              label: candidate.offer.canonical_label || candidate.offer.raw_label,
            },
          ],
        })
      } else if (!current.source_offers.some((source) => source.id === candidate.offer.id)) {
        current.source_offers.push({
          id: candidate.offer.id,
          label: candidate.offer.canonical_label || candidate.offer.raw_label,
        })
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

function buildFeaturesWithInference(offer, mapping, haytekFamily, copiedCount) {
  const features = offer.features && typeof offer.features === 'object' ? offer.features : {}
  return {
    ...features,
    grade_inferida_de_haytek: true,
    grade_inferida_provisoria: true,
    grade_inferida_confidence: mapping.confidence,
    grade_inferida_familia_haytek: haytekFamily.nome,
    grade_inferida_observacao:
      'Grade preenchida por equivalencia provavel Gamalab x Haytek. Confirmar disponibilidade com laboratorio quando necessario.',
    grade_inferida_em: new Date().toISOString(),
    grade_inferida_segmentos: copiedCount,
  }
}

async function main() {
  const [versions, families, offers, grids] = await Promise.all([
    fetchAll('global_catalog_versions', 'id,laboratorio,versao'),
    fetchAll('global_lens_families', 'id,version_id,nome,clinical_category'),
    fetchAll('global_lens_offers', 'id,family_id,canonical_label,raw_label,material,indice_refracao,clinical_category,features,source_page_reference'),
    fetchAll('global_offer_diopter_grids', 'id,offer_id,sph_min,sph_max,cyl_min,cyl_max,add_min,add_max,metadata'),
  ])

  const gamalabVersion = versions.find((version) => normalize(version.laboratorio) === 'gamalab')
  const haytekVersion = versions.find((version) => normalize(version.laboratorio) === 'haytek')
  if (!gamalabVersion || !haytekVersion) throw new Error('Versoes Gamalab/Haytek nao encontradas.')

  const familyById = new Map(families.map((family) => [family.id, family]))
  const haytekFamilyByName = new Map(
    families.filter((family) => family.version_id === haytekVersion.id).map((family) => [normalize(family.nome), family]),
  )

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
    const key = `${normalize(family.nome)}|${haytekGridKey(offer)}`
    const rows = haytekByFamilyAndKey.get(key) || []
    rows.push({ offer, grids: offerGrids })
    haytekByFamilyAndKey.set(key, rows)
  }

  const inserts = []
  const featureUpdates = []
  const skipped = []

  for (const offer of offers) {
    const family = familyById.get(offer.family_id)
    if (!family || family.version_id !== gamalabVersion.id) continue
    const mapping = FAMILY_MAPPING[family.nome]
    if (!mapping) continue

    const existingGrids = gridsByOfferId.get(offer.id) || []
    if (existingGrids.length) {
      skipped.push({ reason: 'grade_existente_respeitada', family: family.nome, offer: offer.canonical_label || offer.raw_label })
      continue
    }

    const haytekFamily = haytekFamilyByName.get(normalize(mapping.haytek))
    if (!haytekFamily) {
      skipped.push({ reason: 'familia_haytek_nao_encontrada', family: family.nome, offer: offer.canonical_label || offer.raw_label, mapping })
      continue
    }

    const triedKeys = gridLookupKeys(offer)
    let match = null
    let usedKey = null
    let ambiguous = false
    for (const key of triedKeys) {
      const candidates = haytekByFamilyAndKey.get(`${normalize(haytekFamily.nome)}|${key}`) || []
      if (!candidates.length) continue
      const uniqueGrids = uniqueGridsFromCandidates(candidates)
      const uniqueGridCountPerCandidate = new Set(candidates.map((candidate) => new Set(candidate.grids.map(gridSignature)).size))
      if (uniqueGridCountPerCandidate.size > 1 && normalize(haytekFamily.nome).includes('acabadas')) {
        skipped.push({
          reason: 'grade_haytek_ambigua',
          family: family.nome,
          offer: offer.canonical_label || offer.raw_label,
          haytek: haytekFamily.nome,
          key,
          candidates: candidates.length,
          unique_grids: uniqueGrids.length,
        })
        ambiguous = true
        match = null
        usedKey = null
        break
      }
      match = {
        offer: candidates[0].offer,
        grids: uniqueGrids,
        source_candidates: candidates,
      }
      usedKey = key
      break
    }

    if (!match) {
      if (ambiguous) continue
      skipped.push({
        reason: 'grade_haytek_nao_encontrada',
        family: family.nome,
        offer: offer.canonical_label || offer.raw_label,
        index: offer.indice_refracao,
        mapped_index: desiredIndexKey(offer),
        photo: isPhoto(offer),
        blue: isBlue(offer),
        haytek: haytekFamily.nome,
        tried_keys: triedKeys,
      })
      continue
    }

    const aliasFrom = indexKey(offer.indice_refracao)
    const aliasTo = desiredIndexKey(offer)
    const sourcePhotoFallback = isPhoto(offer) && usedKey.endsWith('photo=false')

    for (const item of match.grids) {
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
          inferred_from_haytek: true,
          provisional: true,
          source_kind: 'haytek_probable_equivalence',
          source_family: haytekFamily.nome,
          source_offer_id: match.offer.id,
          source_offer_label: match.offer.canonical_label || match.offer.raw_label,
          source_offer_ids: item.source_offers.map((source) => source.id),
          source_offer_labels: item.source_offers.map((source) => source.label),
          source_key: usedKey,
          gamalab_family: family.nome,
          gamalab_offer_label: offer.canonical_label || offer.raw_label,
          confidence: mapping.confidence,
          index_alias_from: aliasFrom !== aliasTo ? aliasFrom : null,
          index_alias_to: aliasFrom !== aliasTo ? aliasTo : null,
          photo_grid_fallback_to_base: sourcePhotoFallback,
          warning: 'Grade inferida/provisoria. Confirmar disponibilidade com laboratorio quando necessario.',
        },
      })
    }

    featureUpdates.push({
      id: offer.id,
      family: family.nome,
      label: offer.canonical_label || offer.raw_label,
      features: buildFeaturesWithInference(offer, mapping, haytekFamily, match.grids.length),
    })
  }

  const byReason = skipped.reduce((acc, item) => {
    acc[item.reason] = (acc[item.reason] || 0) + 1
    return acc
  }, {})
  const byFamily = inserts.reduce((acc, item) => {
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
    skipped_by_reason: byReason,
    inserts_by_family: byFamily,
    preview_inserts: inserts.slice(0, 80).map((insert) => {
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
        metadata: insert.metadata,
      }
    }),
    skipped_preview: skipped.slice(0, 150),
  }

  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2))
  fs.writeFileSync(
    OUT_MD,
    [
      '# Grades Gamalab Inferidas da Haytek',
      '',
      `Gerado em: ${report.generated_at}`,
      `Commit: ${commit ? 'sim' : 'nao'}`,
      '',
      '## Regra',
      '',
      '- Nao sobrescreve ofertas Gamalab que ja possuem grade.',
      '- Insere apenas grades em ofertas sem grade.',
      '- Toda grade inserida recebe metadata `inferred_from_haytek: true` e `provisional: true`.',
      '- As ofertas recebem flags em `features` para a UI poder avisar consulta de disponibilidade futuramente.',
      '',
      '## Mapeamento',
      '',
      ...Object.entries(FAMILY_MAPPING).map(([gama, map]) => `- ${gama} -> ${map.haytek} (${map.confidence})`),
      '',
      '## Resultado',
      '',
      `- Grades a inserir/inseridas: ${report.inserts_count}`,
      `- Ofertas a marcar/marcadas com inferencia: ${report.feature_updates_count}`,
      `- Puladas: ${report.skipped_count}`,
      `- Motivos pulados: ${JSON.stringify(report.skipped_by_reason)}`,
      '',
      '## Inserts Por Familia',
      '',
      ...Object.entries(report.inserts_by_family).map(([family, count]) => `- ${family}: ${count}`),
      '',
      '## Preview',
      '',
      ...report.preview_inserts.slice(0, 40).map(
        (row) =>
          `- ${row.family} | ${row.offer} | sph ${row.sph_min}..${row.sph_max} | cyl ${row.cyl_min}..${row.cyl_max} | add ${row.add_min ?? ''}..${row.add_max ?? ''} | fonte ${row.metadata.source_family}`,
      ),
      report.preview_inserts.length > 40 ? `- ... ${report.preview_inserts.length - 40} linhas adicionais no JSON` : '',
      '',
      '## Puladas Preview',
      '',
      ...report.skipped_preview.slice(0, 60).map((row) => `- ${row.reason} | ${row.family || ''} | ${row.offer || ''}`),
    ].join('\n'),
  )

  console.log(
    JSON.stringify(
      {
        commit,
        reports: [OUT_MD, OUT_JSON],
        inserts_count: inserts.length,
        feature_updates_count: featureUpdates.length,
        skipped_by_reason: byReason,
        inserts_by_family: byFamily,
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
