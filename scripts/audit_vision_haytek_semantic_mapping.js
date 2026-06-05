import fs from 'fs/promises'
import path from 'path'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Erro: configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const TMP = path.join(process.cwd(), 'tmp')
const CONFIRMED_MAP = path.join(TMP, 'vision_hayteck_name_map.json')
const DRAFT_MAP = path.join(TMP, 'vision_hayteck_name_map_draft.json')
const VISION_BUILD_REPORT = path.join(TMP, 'vision_catalog_build_report_2025_09.md')
const OUTPUT_JSON = path.join(TMP, 'vision_haytek_semantic_mapping_audit.json')
const OUTPUT_MD = path.join(TMP, 'vision_haytek_semantic_mapping_audit.md')

const pageSize = 1000

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function compact(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

async function fetchAll(table, columns) {
  const rows = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + pageSize - 1)
    if (error) throw error
    rows.push(...(data || []))
    if ((data || []).length < pageSize) break
  }
  return rows
}

async function readJsonIfExists(file) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch {
    return null
  }
}

async function readTextIfExists(file) {
  try {
    return await fs.readFile(file, 'utf8')
  } catch {
    return ''
  }
}

function loadMapping(data) {
  const out = new Map()
  for (const row of data?.mapping || []) {
    const vision = compact(row.vision_family_name)
    if (!vision) continue
    out.set(normalize(vision), {
      vision_family_name: vision,
      haytek_model: compact(row.hayteck_model),
      suggested: compact(row.suggested),
      notes: compact(row.notes),
    })
  }
  return out
}

function familyVersion(version) {
  return `${version?.laboratorio || '?'} | ${version?.versao || '?'}`
}

function categoryRank(category) {
  const order = {
    multifocal: 1,
    visao_simples: 2,
    ocupacional: 3,
    bifocal: 4,
    controle_miopia: 5,
    plana_solar: 6,
    mista: 7,
    indefinida: 8,
  }
  return order[category] || 99
}

function findHaytekFamilyByModel(haytekFamilies, modelName) {
  const normalizedModel = normalize(modelName)
  if (!normalizedModel) return null

  return (
    haytekFamilies.find((candidate) => normalize(candidate.nome) === normalizedModel) ||
    haytekFamilies.find((candidate) => {
      const candidateName = normalize(candidate.nome)
      return candidateName && (normalizedModel.includes(candidateName) || candidateName.includes(normalizedModel))
    }) ||
    null
  )
}

function summarizeOffers(offers) {
  const byCategory = new Map()
  const byIndex = new Map()
  let withGridLikeMetadata = 0
  let withHaytekSource = 0
  let withMissingGrade = 0

  for (const offer of offers) {
    byCategory.set(offer.clinical_category || 'null', (byCategory.get(offer.clinical_category || 'null') || 0) + 1)
    byIndex.set(String(offer.indice_refracao ?? 'null'), (byIndex.get(String(offer.indice_refracao ?? 'null')) || 0) + 1)

    const features = offer.features && typeof offer.features === 'object' ? offer.features : {}
    const metadataText = JSON.stringify(features)
    if (metadataText.includes('hayteck') || metadataText.includes('haytek')) withHaytekSource += 1
    if (metadataText.includes('grade') || metadataText.includes('diopter') || metadataText.includes('sph')) withGridLikeMetadata += 1
    if (features.grade_nao_informada || features.missing_grade || metadataText.includes('grade nao informada')) withMissingGrade += 1
  }

  return {
    total: offers.length,
    categories: [...byCategory.entries()].sort((a, b) => categoryRank(a[0]) - categoryRank(b[0]) || a[0].localeCompare(b[0])),
    indices: [...byIndex.entries()].sort((a, b) => Number(a[0]) - Number(b[0]) || a[0].localeCompare(b[0])),
    with_haytek_source_in_features: withHaytekSource,
    with_grid_like_metadata: withGridLikeMetadata,
    with_missing_grade_marker: withMissingGrade,
  }
}

async function main() {
  const [confirmedRaw, draftRaw, buildReport, versions, families, offers, grids] = await Promise.all([
    readJsonIfExists(CONFIRMED_MAP),
    readJsonIfExists(DRAFT_MAP),
    readTextIfExists(VISION_BUILD_REPORT),
    fetchAll('global_catalog_versions', 'id,laboratorio,versao'),
    fetchAll('global_lens_families', 'id,version_id,nome,design,clinical_category,tags_uso,tags_beneficios'),
    fetchAll('global_lens_offers', 'id,family_id,raw_label,canonical_label,material,indice_refracao,clinical_category,features,source_page_reference'),
    fetchAll('global_offer_diopter_grids', 'id,offer_id,sph_min,sph_max,cyl_min,cyl_max,add_min,add_max,metadata'),
  ])

  const versionById = new Map(versions.map((version) => [version.id, version]))
  const visionVersion = versions.find((version) => normalize(version.laboratorio) === 'vision')
  const haytekVersion = versions.find((version) => normalize(version.laboratorio) === 'haytek')

  const confirmedMap = loadMapping(confirmedRaw)
  const draftMap = loadMapping(draftRaw)

  const visionFamilies = families
    .filter((family) => family.version_id === visionVersion?.id)
    .sort((a, b) => normalize(a.nome).localeCompare(normalize(b.nome)))
  const haytekFamilies = families
    .filter((family) => family.version_id === haytekVersion?.id)
    .sort((a, b) => normalize(a.nome).localeCompare(normalize(b.nome)))

  const offersByFamily = new Map()
  for (const offer of offers) {
    const rows = offersByFamily.get(offer.family_id) || []
    rows.push(offer)
    offersByFamily.set(offer.family_id, rows)
  }

  const gridsByOfferId = new Map()
  for (const grid of grids) {
    const rows = gridsByOfferId.get(grid.offer_id) || []
    rows.push(grid)
    gridsByOfferId.set(grid.offer_id, rows)
  }

  const haytekByNormName = new Map(haytekFamilies.map((family) => [normalize(family.nome), family]))
  const rows = []

  for (const family of visionFamilies) {
    const normName = normalize(family.nome)
    const confirmed = confirmedMap.get(normName)
    const draft = draftMap.get(normName)
    const mappedName = confirmed?.haytek_model || ''
    const suggestedName = confirmed?.suggested || draft?.suggested || ''
    const mappedHaytekFamily = haytekByNormName.get(normalize(mappedName)) || findHaytekFamilyByModel(haytekFamilies, mappedName)
    const suggestedHaytekFamily = haytekByNormName.get(normalize(suggestedName)) || findHaytekFamilyByModel(haytekFamilies, suggestedName)

    const familyOffers = offersByFamily.get(family.id) || []
    const offerIds = new Set(familyOffers.map((offer) => offer.id))
    const gridCount = [...offerIds].reduce((total, offerId) => total + (gridsByOfferId.get(offerId) || []).length, 0)

    rows.push({
      vision_family_id: family.id,
      vision_family_name: family.nome,
      vision_category: family.clinical_category,
      mapping_status: mappedName ? 'confirmed_file' : suggestedName ? 'suggested_only' : 'unmapped',
      mapped_haytek_model_raw: mappedName || null,
      mapped_haytek_family: mappedHaytekFamily?.nome || null,
      mapped_haytek_category: mappedHaytekFamily?.clinical_category || null,
      suggested_haytek_model_raw: suggestedName || null,
      suggested_haytek_family: suggestedHaytekFamily?.nome || null,
      suggested_haytek_category: suggestedHaytekFamily?.clinical_category || null,
      category_matches_confirmed_haytek: mappedHaytekFamily ? family.clinical_category === mappedHaytekFamily.clinical_category : null,
      offer_summary: summarizeOffers(familyOffers),
      grid_rows: gridCount,
      source_evidence: {
        primary_price_source: '.tabelas/tabela tab charles.csv',
        technical_semantic_source: mappedName ? 'tmp/vision_hayteck_name_map.json + tmp/hayteck_profiles_2025_09.json' : suggestedName ? 'tmp/vision_hayteck_name_map_draft.json (heuristic)' : null,
        build_report_mentions_mapping: buildReport.includes('Vision->Hayteck mappings loaded'),
      },
    })
  }

  const summary = {
    generated_at: new Date().toISOString(),
    vision_version: visionVersion ? { id: visionVersion.id, label: familyVersion(visionVersion) } : null,
    haytek_version: haytekVersion ? { id: haytekVersion.id, label: familyVersion(haytekVersion) } : null,
    vision_families: visionFamilies.length,
    haytek_families: haytekFamilies.length,
    confirmed_mappings: rows.filter((row) => row.mapping_status === 'confirmed_file').length,
    suggested_only_mappings: rows.filter((row) => row.mapping_status === 'suggested_only').length,
    unmapped: rows.filter((row) => row.mapping_status === 'unmapped').length,
    confirmed_category_mismatches: rows.filter((row) => row.category_matches_confirmed_haytek === false).length,
    vision_families_without_grids: rows.filter((row) => row.grid_rows === 0).length,
    build_report_excerpt: buildReport.split(/\r?\n/).slice(0, 20),
  }

  const payload = { summary, rows }
  await fs.writeFile(OUTPUT_JSON, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')

  const lines = [
    '# Auditoria Vision x Haytek',
    '',
    `Gerado em: ${summary.generated_at}`,
    '',
    '## Resumo',
    '',
    `- Vision version: ${summary.vision_version?.label || 'nao encontrada'}`,
    `- Haytek version: ${summary.haytek_version?.label || 'nao encontrada'}`,
    `- Familias Vision: ${summary.vision_families}`,
    `- Familias Haytek: ${summary.haytek_families}`,
    `- Mapeamentos confirmados em arquivo: ${summary.confirmed_mappings}`,
    `- Mapeamentos apenas sugeridos: ${summary.suggested_only_mappings}`,
    `- Sem mapeamento: ${summary.unmapped}`,
    `- Mismatches de categoria em mapeamento confirmado: ${summary.confirmed_category_mismatches}`,
    `- Familias Vision sem grades: ${summary.vision_families_without_grids}`,
    '',
    '## Evidencia Local',
    '',
    '- Fonte de preco Vision: `.tabelas/tabela tab charles.csv`.',
    '- Fonte tecnica usada no import antigo: `tmp/hayteck_profiles_2025_09.json`.',
    '- Mapa confirmado antigo: `tmp/vision_hayteck_name_map.json`.',
    '- Mapa heuristico antigo: `tmp/vision_hayteck_name_map_draft.json`.',
    '- Observacao: Hayteck/Haytek sao o mesmo fornecedor neste historico; o arquivo PDF atual foi renomeado para `.tabelas/tabela haytek 09-2025.pdf`.',
    '',
    '## Familias Vision',
    '',
  ]

  for (const row of rows) {
    lines.push(`### ${row.vision_family_name}`)
    lines.push('')
    lines.push(`- Categoria Vision: ${row.vision_category}`)
    lines.push(`- Status do mapa: ${row.mapping_status}`)
    lines.push(`- Haytek confirmado: ${row.mapped_haytek_family || row.mapped_haytek_model_raw || 'nenhum'}`)
    lines.push(`- Haytek sugerido: ${row.suggested_haytek_family || row.suggested_haytek_model_raw || 'nenhum'}`)
    lines.push(`- Categoria Haytek confirmada: ${row.mapped_haytek_category || 'n/a'}`)
    lines.push(`- Categoria bate com Haytek confirmado: ${row.category_matches_confirmed_haytek === null ? 'n/a' : row.category_matches_confirmed_haytek}`)
    lines.push(`- Ofertas: ${row.offer_summary.total}`)
    lines.push(`- Grades no BD: ${row.grid_rows}`)
    lines.push(`- Categorias nas ofertas: ${row.offer_summary.categories.map(([key, count]) => `${key}:${count}`).join(', ')}`)
    lines.push(`- Indices: ${row.offer_summary.indices.map(([key, count]) => `${key}:${count}`).join(', ')}`)
    lines.push('')
  }

  await fs.writeFile(OUTPUT_MD, `${lines.join('\n')}\n`, 'utf8')

  console.log('Auditoria Vision x Haytek concluida.')
  console.log(`JSON: ${path.relative(process.cwd(), OUTPUT_JSON)}`)
  console.log(`MD: ${path.relative(process.cwd(), OUTPUT_MD)}`)
  console.log(JSON.stringify(summary, null, 2))
}

main().catch((error) => {
  console.error('Falha na auditoria Vision x Haytek:', error.message || error)
  process.exit(1)
})
