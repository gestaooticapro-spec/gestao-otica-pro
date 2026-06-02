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

const pageSize = 1000
const OUTPUT_JSON = 'tmp/original_catalogs_deep_audit.json'
const OUTPUT_MD = 'tmp/original_catalogs_deep_audit.md'
const ORIGINAL_LABS = new Set(['haytek', 'essilor', 'hoya', 'gamalab', 'optilab'])

const localSources = {
  haytek: [
    '.tabelas/tabela haytek 09-2025.pdf',
    '.tabelas/haytek_pvc_imgs',
    'HAYTEK_IMPORTACAO_NOTAS.md',
    'tmp/haytek_semantics_2025_09.json',
    'tmp/haytek_import_manifest_2025_09.md',
  ],
  essilor: [
    '.tabelas/V2 - Tabela PVC ABRIL 26 WEB.pdf',
    '.tabelas/V2 - Tabela PVO ABRIL 26.pdf',
    '.tabelas/essilor_pvc_imgs',
    '.tabelas/essilor_pvo_imgs',
  ],
  hoya: [
    '.tabelas/hoya-bm-20251113011825405.pdf',
    '.tabelas/hoya_pvc_imgs',
    '.tabelas/hoya_catalog_extraction_2025.json',
  ],
  gamalab: [
    '.tabelas/Gamalab_TabelaPrecos2025_02Mar2026.pdf',
    '.tabelas/gamalab_pvc_imgs',
  ],
  optilab: [
    '.tabelas/Tabela Optilab 2026 - PVC - Digital v2.pdf',
    '.tabelas/optilab_pvc_imgs',
  ],
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function compact(value, max = 120) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 3)}...` : text
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

function versionLabel(version) {
  return `${version?.laboratorio || 'sem lab'} | ${version?.versao || 'sem versao'}`
}

function labKey(versionOrLab) {
  return normalize(typeof versionOrLab === 'string' ? versionOrLab : versionOrLab?.laboratorio)
}

function isOriginalVersion(version) {
  return ORIGINAL_LABS.has(labKey(version))
}

function countBy(rows, getter) {
  const counts = new Map()
  for (const row of rows) {
    const key = getter(row)
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))))
}

function n(value) {
  return value == null ? null : Number(value)
}

function isHighIndex(index) {
  const value = n(index)
  return value != null && value >= 1.67
}

function isBroadSingleGridCandidate(offer, grids) {
  if (!isHighIndex(offer.indice_refracao) || grids.length !== 1) return false
  const grid = grids[0]
  if (isReviewedBroadGrid(grid)) return false
  const sphMin = n(grid.sph_min)
  const sphMax = n(grid.sph_max)
  const cylMin = n(grid.cyl_min)
  return sphMin != null && sphMax != null && cylMin != null && sphMin <= -10 && sphMax >= 6 && cylMin <= -6
}

function isReviewedBroadGrid(grid) {
  const metadata = grid?.metadata && typeof grid.metadata === 'object' ? grid.metadata : {}
  return ['source_validated_not_flattening', 'inferred_source_validated_not_flattening'].includes(
    metadata.flattened_grid_review_status,
  )
}

function inferCategoryFromText(text) {
  const t = normalize(text)
  if (!t) return null
  if (/\b(stellest|miyosmart|controle miopia|myosmart)\b/.test(t)) return 'controle_miopia'
  if (/\b(bifocal|kriptok|kryptok|panop|flat top|ultex)\b/.test(t)) return 'bifocal'
  if (/\b(office|workstyle|work smart|worksmart|digitime|interview|softwear|ocupacional|near|desk)\b/.test(t)) return 'ocupacional'
  if (/\b(kodak easy sun|espace)\b/.test(t)) return 'multifocal'
  if (/\bkodak single sun\b/.test(t) && /\b(solar|sun|coloracao|xperio)\b/.test(t)) return 'plana_solar'
  if (/\b(varilux|hoyalux|progressiv[a-z]*|multifocal|xr|physio|liberty|comfort|pro id|haytek smart|haytek top|haytek light|haytek go|easy m|quantum|gamavision|unique|network|precise)\b/.test(t)) return 'multifocal'
  if (/\b(eyezen|sync|relax|visao simples|single|nulux|hilux|vs |surfacada|acabada|pronta)\b/.test(t)) return 'visao_simples'
  if (/\b(solar|sun|xperio|polarizad)\b/.test(t)) return 'plana_solar'
  return null
}

function likelyFalsePositiveCategory(family, offer, inferred) {
  const text = normalize(`${family?.nome || ''} ${offer?.raw_label || ''} ${offer?.canonical_label || ''}`)
  if (text.includes('stellest') && inferred === 'visao_simples') return true
  if (text.includes('haytek progressivas acabadas') && inferred === 'visao_simples') return true
  if (
    offer?.clinical_category === 'plana_solar' &&
    inferred === 'visao_simples' &&
    /\b(solar|sun|xperio|polarizad|coloracao)\b/.test(text)
  )
    return true
  if (text.includes('solares planas') && inferred === 'visao_simples') return true
  if (text.includes('activities') && inferred === 'multifocal') return true
  if (text.includes('varilux sport') && inferred === 'multifocal') return true
  if (
    offer?.clinical_category === 'multifocal' &&
    inferred === 'plana_solar' &&
    /\b(argos|amplitude)\b/.test(text) &&
    text.includes('coloridas') &&
    text.includes('sun pro')
  )
    return true
  return false
}

function hasSemanticProfile(row) {
  const features = row.features && typeof row.features === 'object' ? row.features : {}
  return Boolean(features.semantic_profile && typeof features.semantic_profile === 'object')
}

function describeOffer(offer, family, version) {
  return {
    version: versionLabel(version),
    family: family?.nome || offer.family_id,
    offer: compact(offer.canonical_label || offer.raw_label),
    page: offer.source_page_reference || null,
    category: offer.clinical_category || null,
    material: offer.material || null,
    index: offer.indice_refracao ?? null,
  }
}

async function main() {
  const [versions, families, offers, grids, treatments, compatibilities, usageProfiles] = await Promise.all([
    fetchAll('global_catalog_versions', 'id,laboratorio,versao'),
    fetchAll('global_lens_families', 'id,version_id,nome,design,clinical_category,tags_uso,tags_beneficios'),
    fetchAll(
      'global_lens_offers',
      'id,family_id,raw_label,canonical_label,material,indice_refracao,clinical_category,features,base_price,is_atomic_offer,allows_composition,already_includes_treatment,source_page_reference',
    ),
    fetchAll('global_offer_diopter_grids', 'id,offer_id,sph_min,sph_max,cyl_min,cyl_max,add_min,add_max,metadata'),
    fetchAll('global_treatments', 'id,version_id,nome,tipo,features'),
    fetchAll('global_offer_treatments_compatibility', 'offer_id,treatment_id,special_price,price_mode'),
    fetchAll('global_usage_profiles', 'id,family_id,profile_scope,usage_tags,benefit_tags,commercial_summary,recommendation_notes'),
  ])

  const originalVersions = versions.filter(isOriginalVersion)
  const originalVersionIds = new Set(originalVersions.map((version) => version.id))
  const versionById = new Map(versions.map((version) => [version.id, version]))
  const familiesById = new Map(families.map((family) => [family.id, family]))
  const originalFamilies = families.filter((family) => originalVersionIds.has(family.version_id))
  const originalFamilyIds = new Set(originalFamilies.map((family) => family.id))
  const originalOffers = offers.filter((offer) => originalFamilyIds.has(offer.family_id))
  const originalTreatments = treatments.filter((treatment) => originalVersionIds.has(treatment.version_id))

  const gridsByOfferId = new Map()
  for (const grid of grids) {
    const rows = gridsByOfferId.get(grid.offer_id) || []
    rows.push(grid)
    gridsByOfferId.set(grid.offer_id, rows)
  }

  const compatByOfferId = new Map()
  for (const compatibility of compatibilities) {
    const rows = compatByOfferId.get(compatibility.offer_id) || []
    rows.push(compatibility)
    compatByOfferId.set(compatibility.offer_id, rows)
  }

  const usageByFamilyId = new Map()
  for (const profile of usageProfiles) {
    const rows = usageByFamilyId.get(profile.family_id) || []
    rows.push(profile)
    usageByFamilyId.set(profile.family_id, rows)
  }

  const labSummaries = []
  const findings = []

  for (const version of originalVersions.sort((a, b) => labKey(a).localeCompare(labKey(b)))) {
    const lab = labKey(version)
    const versionFamilies = originalFamilies.filter((family) => family.version_id === version.id)
    const familyIds = new Set(versionFamilies.map((family) => family.id))
    const versionOffers = originalOffers.filter((offer) => familyIds.has(offer.family_id))
    const versionTreatments = originalTreatments.filter((treatment) => treatment.version_id === version.id)

    const offersWithoutGrid = []
    const broadSingleGridCandidates = []
    const categorySuspects = []
    const missingComposition = []
    const atomicFlagSuspects = []

    for (const offer of versionOffers) {
      const family = familiesById.get(offer.family_id)
      const offerGrids = gridsByOfferId.get(offer.id) || []
      const compatRows = compatByOfferId.get(offer.id) || []
      // Infer category from the offer label itself. Grouped families can mix VS,
      // occupational, solar and myopia-control offers, so family text is too noisy here.
      const text = `${offer.raw_label || ''} ${offer.canonical_label || ''}`
      const inferred = inferCategoryFromText(text)

      if (!offerGrids.length) {
        offersWithoutGrid.push(describeOffer(offer, family, version))
      }

      if (isBroadSingleGridCandidate(offer, offerGrids)) {
        broadSingleGridCandidates.push({
          ...describeOffer(offer, family, version),
          grid: offerGrids[0],
        })
      }

      if (
        inferred &&
        offer.clinical_category !== inferred &&
        offer.clinical_category !== 'mista' &&
        !likelyFalsePositiveCategory(family, offer, inferred)
      ) {
        categorySuspects.push({
          ...describeOffer(offer, family, version),
          inferred,
        })
      }

      if (!offer.is_atomic_offer && !offer.already_includes_treatment && !compatRows.length) {
        missingComposition.push(describeOffer(offer, family, version))
      }

      if (offer.is_atomic_offer && offer.allows_composition) {
        atomicFlagSuspects.push({
          ...describeOffer(offer, family, version),
          issue: 'is_atomic_offer=true mas allows_composition=true',
        })
      }
    }

    const familiesWithoutUsage = versionFamilies.filter((family) => !(usageByFamilyId.get(family.id) || []).length)
    const treatmentsWithoutSemantic = versionTreatments.filter((treatment) => !hasSemanticProfile(treatment))
    const invalidPriceModes = compatibilities.filter((compat) => {
      if (!['final', 'surcharge'].includes(compat.price_mode)) {
        const offer = originalOffers.find((candidate) => candidate.id === compat.offer_id)
        return offer && familyIds.has(offer.family_id)
      }
      return false
    })

    const labSummary = {
      lab,
      version: versionLabel(version),
      sources: localSources[lab] || [],
      families: versionFamilies.length,
      offers: versionOffers.length,
      treatments: versionTreatments.length,
      compatibilities: versionOffers.reduce((sum, offer) => sum + (compatByOfferId.get(offer.id) || []).length, 0),
      grid_rows: versionOffers.reduce((sum, offer) => sum + (gridsByOfferId.get(offer.id) || []).length, 0),
      offers_without_grid: offersWithoutGrid.length,
      broad_single_grid_candidates: broadSingleGridCandidates.length,
      category_suspects: categorySuspects.length,
      families_without_usage_profile: familiesWithoutUsage.length,
      treatments_without_semantic_profile: treatmentsWithoutSemantic.length,
      composable_without_compatibility: missingComposition.length,
      atomic_flag_suspects: atomicFlagSuspects.length,
      invalid_price_modes: invalidPriceModes.length,
      categories: countBy(versionOffers, (offer) => offer.clinical_category || 'null'),
      offer_modes: countBy(versionOffers, (offer) => {
        if (offer.is_atomic_offer) return 'atomic'
        if (offer.already_includes_treatment) return 'embedded'
        if (offer.allows_composition) return 'composable'
        return 'other'
      }),
    }

    labSummaries.push(labSummary)

    for (const row of broadSingleGridCandidates.slice(0, 80)) {
      findings.push({ severity: 'alta', type: 'possible_flattened_grid', ...row })
    }
    for (const row of categorySuspects.slice(0, 80)) {
      findings.push({ severity: 'media', type: 'category_suspect_needs_pdf_check', ...row })
    }
    for (const row of missingComposition.slice(0, 80)) {
      findings.push({ severity: 'media', type: 'composable_without_treatment_compatibility', ...row })
    }
    for (const row of familiesWithoutUsage.slice(0, 80)) {
      findings.push({
        severity: lab === 'haytek' ? 'media' : 'baixa',
        type: 'family_without_usage_profile',
        version: versionLabel(version),
        family: row.nome,
        category: row.clinical_category,
      })
    }
    for (const row of treatmentsWithoutSemantic.slice(0, 80)) {
      findings.push({
        severity: ['haytek', 'hoya', 'essilor', 'gamalab'].includes(lab) ? 'media' : 'baixa',
        type: 'treatment_without_semantic_profile',
        version: versionLabel(version),
        treatment: row.nome,
        treatment_type: row.tipo,
      })
    }
    for (const row of atomicFlagSuspects.slice(0, 80)) {
      findings.push({ severity: 'alta', type: 'atomic_flag_suspect', ...row })
    }
  }

  const summary = {
    generated_at: new Date().toISOString(),
    original_labs: [...ORIGINAL_LABS],
    versions: originalVersions.length,
    families: originalFamilies.length,
    offers: originalOffers.length,
    treatments: originalTreatments.length,
    findings_total: findings.length,
    findings_by_severity: countBy(findings, (finding) => finding.severity),
    findings_by_type: countBy(findings, (finding) => finding.type),
  }

  const payload = { summary, lab_summaries: labSummaries, findings }
  await fs.mkdir(path.dirname(OUTPUT_JSON), { recursive: true })
  await fs.writeFile(OUTPUT_JSON, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')

  const lines = [
    '# Auditoria Profunda - Catalogos Originais',
    '',
    `Gerado em: ${summary.generated_at}`,
    '',
    'Escopo: Haytek, Essilor, HOYA, Gamalab e Optilab. Vision esta congelada para etapa posterior.',
    '',
    '## Resumo Geral',
    '',
    `- Versoes: ${summary.versions}`,
    `- Familias: ${summary.families}`,
    `- Ofertas: ${summary.offers}`,
    `- Tratamentos: ${summary.treatments}`,
    `- Findings: ${summary.findings_total}`,
    `- Findings por severidade: ${JSON.stringify(summary.findings_by_severity)}`,
    `- Findings por tipo: ${JSON.stringify(summary.findings_by_type)}`,
    '',
    '## Resumo Por Laboratorio',
    '',
  ]

  for (const lab of labSummaries) {
    lines.push(`### ${lab.version}`)
    lines.push('')
    lines.push(`- Fontes locais: ${lab.sources.join('; ') || 'nao mapeadas'}`)
    lines.push(`- Familias: ${lab.families}`)
    lines.push(`- Ofertas: ${lab.offers}`)
    lines.push(`- Tratamentos: ${lab.treatments}`)
    lines.push(`- Compatibilidades: ${lab.compatibilities}`)
    lines.push(`- Linhas de grade: ${lab.grid_rows}`)
    lines.push(`- Ofertas sem grade: ${lab.offers_without_grid}`)
    lines.push(`- Suspeitas de grade achatada: ${lab.broad_single_grid_candidates}`)
    lines.push(`- Suspeitas de categoria: ${lab.category_suspects}`)
    lines.push(`- Familias sem usage_profile: ${lab.families_without_usage_profile}`)
    lines.push(`- Tratamentos sem semantic_profile: ${lab.treatments_without_semantic_profile}`)
    lines.push(`- Ofertas componiveis sem compatibilidade: ${lab.composable_without_compatibility}`)
    lines.push(`- Suspeitas de flag atomica: ${lab.atomic_flag_suspects}`)
    lines.push(`- Price modes invalidos: ${lab.invalid_price_modes}`)
    lines.push(`- Categorias: ${JSON.stringify(lab.categories)}`)
    lines.push(`- Modos de oferta: ${JSON.stringify(lab.offer_modes)}`)
    lines.push('')
  }

  lines.push('## Achados Prioritarios', '')
  const priority = findings.filter((finding) => finding.severity === 'alta')
  if (!priority.length) {
    lines.push('- Nenhum achado de alta severidade nesta auditoria.')
  } else {
    for (const finding of priority.slice(0, 200)) {
      lines.push(`- ${finding.type} | ${finding.version} | ${finding.family || ''} | ${finding.offer || finding.treatment || ''} | pagina=${finding.page || 'n/a'}`)
    }
    if (priority.length > 200) lines.push(`- ... mais ${priority.length - 200}`)
  }

  lines.push('', '## Achados Medios Para Conferir No PDF', '')
  const medium = findings.filter((finding) => finding.severity === 'media')
  if (!medium.length) {
    lines.push('- Nenhum.')
  } else {
    for (const finding of medium.slice(0, 220)) {
      lines.push(`- ${finding.type} | ${finding.version} | ${finding.family || ''} | ${finding.offer || finding.treatment || ''} | pagina=${finding.page || 'n/a'}`)
    }
    if (medium.length > 220) lines.push(`- ... mais ${medium.length - 220}`)
  }

  await fs.writeFile(OUTPUT_MD, `${lines.join('\n')}\n`, 'utf8')

  console.log('Auditoria profunda dos catalogos originais concluida.')
  console.log(`JSON: ${OUTPUT_JSON}`)
  console.log(`MD: ${OUTPUT_MD}`)
  console.log(JSON.stringify(summary, null, 2))
}

main().catch((error) => {
  console.error('Falha na auditoria profunda:', error.message || error)
  process.exit(1)
})
