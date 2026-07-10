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
const OUTPUT_JSON = 'tmp/global_catalog_semantic_audit.json'
const OUTPUT_MD = 'tmp/global_catalog_semantic_audit.md'

const allowedCategories = new Set([
  'multifocal',
  'visao_simples',
  'ocupacional',
  'bifocal',
  'controle_miopia',
  'plana_solar',
  'mista',
  'indefinida',
])

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function compactLabel(value, max = 120) {
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

function textForOffer(offer, family) {
  return normalize(`${family?.nome || ''} ${family?.design || ''} ${offer.raw_label || ''} ${offer.canonical_label || ''} ${offer.material || ''}`)
}

function inferClinicalCategoryFromText(text) {
  if (!text) return null
  if (/\b(bifocal|flat top|kryptok|ultex)\b/.test(text)) return 'bifocal'
  if (/\b(miyosmart|myosmart|controle miopia|miopia control)\b/.test(text)) return 'controle_miopia'
  if (/\b(office|ocupacional|workstyle|work smart|worksmart|room|near|interview|desk|computer)\b/.test(text)) return 'ocupacional'
  if (/\b(progressiv|varilux|hoyalux|multifocal|pro id|top|smart|light|go|drive|physio|xr|liberty|comfort|e series|balansis|argos|amplitude|easy m|solamax digital)\b/.test(text)) {
    return 'multifocal'
  }
  if (/\b(relax|sync|eyezen|visao simples|visao single|single vision|vs |nulux|hilux|pronta|acabada|surfacada|monofocal|easy)\b/.test(text)) {
    return 'visao_simples'
  }
  if (/\b(solar|solares|sun|xperio|polarizad)\b/.test(text)) return 'plana_solar'
  return null
}

function detectEmbeddedSignals(label, features = {}) {
  const text = normalize(label)
  const signals = []
  const checks = [
    {
      key: 'blue_uv',
      pattern: /\b(blue uv|blue cut|bluecontrol|blue control|filtro azul|luz azul|prevencia)\b/,
      hasFeature: Boolean(features.blue_uv || features.blue_control || features.protecao_luz_azul),
    },
    {
      key: 'photochromic',
      pattern: /\b(transitions|sensity|fotocrom|foto haytek|fotossensivel|photochromic|gen s)\b/,
      hasFeature: Boolean(features.transitions || features.sensity || features.fotossensivel || features.photochromic),
    },
    {
      key: 'polarized',
      pattern: /\b(polarizad|xperio)\b/,
      hasFeature: Boolean(features.polarizado || features.polarized),
    },
    {
      key: 'antirreflexo',
      pattern: /\b(antirreflexo|anti reflexo|ar verde|ar azul|ar prem|crizal|hi vision|longlife|no risk|sigma|cleanextra|no reflex)\b/,
      hasFeature: Boolean(features.antirreflexo || features.ar || features.has_antirreflexo),
    },
  ]

  for (const check of checks) {
    if (check.pattern.test(text)) {
      signals.push({ key: check.key, hasFeature: check.hasFeature })
    }
  }
  return signals
}

function normalizeMaterial(material, label) {
  const text = normalize(`${material || ''} ${label || ''}`)
  if (/\b(1 59|poli|poly|policarbonato|airwear)\b/.test(text)) return 'policarbonato_1.59'
  if (/\btrivex|pnx\b/.test(text)) return 'trivex'
  if (/\b1 74\b/.test(text)) return 'alto_indice_1.74'
  if (/\b1 67\b/.test(text)) return 'alto_indice_1.67'
  if (/\b1 61\b/.test(text)) return 'alto_indice_1.61'
  if (/\b1 60\b/.test(text)) return 'alto_indice_1.60'
  if (/\b1 56\b/.test(text)) return 'resina_1.56'
  if (/\b1 50|cr 39|cr39\b/.test(text)) return 'resina_1.50'
  return text || 'indefinido'
}

function addFinding(findings, severity, type, row) {
  findings.push({ severity, type, ...row })
}

function countBy(rows, getter) {
  const counts = new Map()
  for (const row of rows) {
    const key = getter(row)
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
}

function limitRows(rows, max = 80) {
  return rows.slice(0, max)
}

async function main() {
  const [versions, families, offers, treatments, compatibilities, usageProfiles] = await Promise.all([
    fetchAll('global_catalog_versions', 'id,laboratorio,versao'),
    fetchAll('global_lens_families', 'id,version_id,nome,design,tags_uso,tags_beneficios,clinical_category'),
    fetchAll(
      'global_lens_offers',
      'id,family_id,raw_label,canonical_label,material,indice_refracao,clinical_category,features,base_price,is_atomic_offer,allows_composition,already_includes_treatment,source_page_reference',
    ),
    fetchAll('global_treatments', 'id,version_id,nome,tipo,features'),
    fetchAll('global_offer_treatments_compatibility', 'offer_id,treatment_id,special_price,price_mode'),
    fetchAll('global_usage_profiles', 'id,family_id,profile_scope,usage_tags,benefit_tags,commercial_summary,recommendation_notes'),
  ])

  const versionById = new Map(versions.map((version) => [version.id, version]))
  const familyById = new Map(families.map((family) => [family.id, family]))
  const usageByFamilyId = new Map()
  for (const profile of usageProfiles) {
    const rows = usageByFamilyId.get(profile.family_id) || []
    rows.push(profile)
    usageByFamilyId.set(profile.family_id, rows)
  }

  const compatibilityByOfferId = new Map()
  for (const compatibility of compatibilities) {
    const rows = compatibilityByOfferId.get(compatibility.offer_id) || []
    rows.push(compatibility)
    compatibilityByOfferId.set(compatibility.offer_id, rows)
  }

  const findings = []
  const familyVersionSummary = []

  for (const family of families) {
    const version = versionById.get(family.version_id)
    const familyText = normalize(`${family.nome} ${family.design || ''}`)
    const inferred = inferClinicalCategoryFromText(familyText)
    const usageProfilesForFamily = usageByFamilyId.get(family.id) || []

    if (!allowedCategories.has(family.clinical_category)) {
      addFinding(findings, 'alta', 'categoria_familia_invalida', {
        version: versionLabel(version),
        family: family.nome,
        current: family.clinical_category,
      })
    }

    if (family.clinical_category === 'indefinida') {
      addFinding(findings, 'media', 'familia_indefinida', {
        version: versionLabel(version),
        family: family.nome,
        inferred,
      })
    }

    if (inferred && family.clinical_category !== inferred && family.clinical_category !== 'mista') {
      addFinding(findings, 'media', 'familia_categoria_suspeita', {
        version: versionLabel(version),
        family: family.nome,
        current: family.clinical_category,
        inferred,
      })
    }

    if (!usageProfilesForFamily.length) {
      addFinding(findings, 'baixa', 'familia_sem_usage_profile', {
        version: versionLabel(version),
        family: family.nome,
        category: family.clinical_category,
      })
    }

    familyVersionSummary.push({
      version: versionLabel(version),
      category: family.clinical_category || 'null',
    })
  }

  for (const offer of offers) {
    const family = familyById.get(offer.family_id)
    const version = versionById.get(family?.version_id)
    const label = `${offer.raw_label || ''} ${offer.canonical_label || ''}`
    const text = textForOffer(offer, family)
    const inferred = inferClinicalCategoryFromText(text)
    const features = offer.features && typeof offer.features === 'object' ? offer.features : {}
    const compatRows = compatibilityByOfferId.get(offer.id) || []

    if (!allowedCategories.has(offer.clinical_category)) {
      addFinding(findings, 'alta', 'categoria_oferta_invalida', {
        version: versionLabel(version),
        family: family?.nome || offer.family_id,
        offer: compactLabel(offer.canonical_label || offer.raw_label),
        current: offer.clinical_category,
      })
    }

    if (
      family &&
      family.clinical_category !== 'mista' &&
      family.clinical_category !== 'indefinida' &&
      offer.clinical_category !== family.clinical_category
    ) {
      addFinding(findings, 'alta', 'oferta_diferente_da_familia_deterministica', {
        version: versionLabel(version),
        family: family.nome,
        offer: compactLabel(offer.canonical_label || offer.raw_label),
        familyCategory: family.clinical_category,
        offerCategory: offer.clinical_category,
        page: offer.source_page_reference,
      })
    }

    if (offer.clinical_category === 'indefinida') {
      addFinding(findings, 'media', 'oferta_indefinida', {
        version: versionLabel(version),
        family: family?.nome || offer.family_id,
        offer: compactLabel(offer.canonical_label || offer.raw_label),
        inferred,
        page: offer.source_page_reference,
      })
    }

    if (inferred && offer.clinical_category !== inferred && offer.clinical_category !== 'mista') {
      addFinding(findings, 'media', 'oferta_categoria_suspeita_por_nome', {
        version: versionLabel(version),
        family: family?.nome || offer.family_id,
        offer: compactLabel(offer.canonical_label || offer.raw_label),
        current: offer.clinical_category,
        inferred,
        page: offer.source_page_reference,
      })
    }

    const embeddedSignals = detectEmbeddedSignals(label, features)
    for (const signal of embeddedSignals) {
      if (!signal.hasFeature) {
        addFinding(findings, 'media', 'rotulo_indica_tratamento_sem_feature', {
          version: versionLabel(version),
          family: family?.nome || offer.family_id,
          offer: compactLabel(offer.canonical_label || offer.raw_label),
          signal: signal.key,
          page: offer.source_page_reference,
        })
      }
    }

    if (embeddedSignals.length && !offer.already_includes_treatment && offer.is_atomic_offer) {
      addFinding(findings, 'alta', 'oferta_atomica_com_tratamento_mas_nao_marca_embutido', {
        version: versionLabel(version),
        family: family?.nome || offer.family_id,
        offer: compactLabel(offer.canonical_label || offer.raw_label),
        page: offer.source_page_reference,
      })
    }

    if (offer.is_atomic_offer && offer.allows_composition) {
      addFinding(findings, 'alta', 'oferta_atomica_permite_composicao', {
        version: versionLabel(version),
        family: family?.nome || offer.family_id,
        offer: compactLabel(offer.canonical_label || offer.raw_label),
        page: offer.source_page_reference,
      })
    }

    if (!offer.is_atomic_offer && !offer.already_includes_treatment && !compatRows.length) {
      addFinding(findings, 'media', 'oferta_componivel_sem_compatibilidade_tratamento', {
        version: versionLabel(version),
        family: family?.nome || offer.family_id,
        offer: compactLabel(offer.canonical_label || offer.raw_label),
        page: offer.source_page_reference,
      })
    }

    if (compatRows.some((row) => !['final', 'surcharge'].includes(row.price_mode))) {
      addFinding(findings, 'alta', 'price_mode_invalido', {
        version: versionLabel(version),
        family: family?.nome || offer.family_id,
        offer: compactLabel(offer.canonical_label || offer.raw_label),
        priceModes: [...new Set(compatRows.map((row) => row.price_mode))],
      })
    }
  }

  const treatmentsWithoutSemantic = []
  const treatmentTypeGroups = new Map()
  for (const treatment of treatments) {
    const version = versionById.get(treatment.version_id)
    const features = treatment.features && typeof treatment.features === 'object' ? treatment.features : {}
    const semantic = features.semantic_profile
    if (!semantic || typeof semantic !== 'object') {
      treatmentsWithoutSemantic.push({
        version: versionLabel(version),
        treatment: treatment.nome,
        tipo: treatment.tipo,
      })
    }
    const key = normalize(treatment.nome)
    const rows = treatmentTypeGroups.get(key) || []
    rows.push({ version: versionLabel(version), treatment: treatment.nome, tipo: treatment.tipo, features })
    treatmentTypeGroups.set(key, rows)
  }

  for (const rows of treatmentTypeGroups.values()) {
    const tipos = [...new Set(rows.map((row) => row.tipo || 'null'))]
    if (rows.length > 1 && tipos.length > 1) {
      addFinding(findings, 'media', 'mesmo_tratamento_tipo_diferente', {
        treatment: rows[0].treatment,
        variants: rows.map((row) => `${row.version}: ${row.tipo || 'null'}`),
      })
    }
  }

  const materialGroups = new Map()
  for (const offer of offers) {
    const family = familyById.get(offer.family_id)
    const version = versionById.get(family?.version_id)
    const label = compactLabel(offer.canonical_label || offer.raw_label, 80)
    const normalizedMaterial = normalizeMaterial(offer.material, `${family?.nome || ''} ${label} ${offer.indice_refracao || ''}`)
    const key = `${normalizedMaterial}::${offer.indice_refracao ?? 'null'}`
    const rows = materialGroups.get(key) || []
    rows.push({
      version: versionLabel(version),
      family: family?.nome || offer.family_id,
      offer: label,
      material: offer.material,
      index: offer.indice_refracao,
    })
    materialGroups.set(key, rows)
  }

  const materialExamples = [...materialGroups.entries()]
    .filter(([, rows]) => {
      const rawMaterials = new Set(rows.map((row) => normalize(row.material)))
      return rows.length > 3 && rawMaterials.size > 1
    })
    .map(([key, rows]) => ({ key, examples: rows.slice(0, 12) }))

  const summary = {
    generated_at: new Date().toISOString(),
    versions: versions.length,
    families: families.length,
    offers: offers.length,
    treatments: treatments.length,
    compatibilities: compatibilities.length,
    usage_profiles: usageProfiles.length,
    findings_total: findings.length,
    findings_by_severity: Object.fromEntries(countBy(findings, (row) => row.severity)),
    findings_by_type: Object.fromEntries(countBy(findings, (row) => row.type)),
    families_by_version_category: countBy(familyVersionSummary, (row) => `${row.version} :: ${row.category}`),
    treatments_without_semantic: treatmentsWithoutSemantic.length,
    material_alias_groups: materialExamples.length,
  }

  const payload = {
    summary,
    findings,
    treatments_without_semantic: treatmentsWithoutSemantic,
    material_alias_groups: materialExamples,
  }

  await fs.mkdir(path.dirname(OUTPUT_JSON), { recursive: true })
  await fs.writeFile(OUTPUT_JSON, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')

  const lines = [
    '# Auditoria Semantica Global do Catalogo',
    '',
    `Gerado em: ${summary.generated_at}`,
    '',
    '## Resumo',
    '',
    `- Versoes: ${summary.versions}`,
    `- Familias: ${summary.families}`,
    `- Ofertas: ${summary.offers}`,
    `- Tratamentos: ${summary.treatments}`,
    `- Compatibilidades: ${summary.compatibilities}`,
    `- Usage profiles: ${summary.usage_profiles}`,
    `- Findings: ${summary.findings_total}`,
    `- Findings por severidade: ${JSON.stringify(summary.findings_by_severity)}`,
    `- Tratamentos sem semantic_profile: ${summary.treatments_without_semantic}`,
    `- Grupos de material com aliases possiveis: ${summary.material_alias_groups}`,
    '',
    '## Findings por Tipo',
    '',
    ...Object.entries(summary.findings_by_type).map(([type, count]) => `- ${type}: ${count}`),
    '',
    '## Achados Alta Severidade',
    '',
  ]

  const high = findings.filter((row) => row.severity === 'alta')
  if (!high.length) {
    lines.push('- Nenhum.')
  } else {
    for (const item of limitRows(high, 120)) {
      lines.push(`- ${item.type} | ${item.version || ''} | ${item.family || ''} | ${item.offer || item.treatment || ''} | ${JSON.stringify(item)}`)
    }
    if (high.length > 120) lines.push(`- ... mais ${high.length - 120}`)
  }

  lines.push('', '## Achados Media Severidade', '')
  const medium = findings.filter((row) => row.severity === 'media')
  if (!medium.length) {
    lines.push('- Nenhum.')
  } else {
    for (const item of limitRows(medium, 160)) {
      lines.push(`- ${item.type} | ${item.version || ''} | ${item.family || ''} | ${item.offer || item.treatment || ''} | ${JSON.stringify(item)}`)
    }
    if (medium.length > 160) lines.push(`- ... mais ${medium.length - 160}`)
  }

  lines.push('', '## Tratamentos Sem Semantic Profile', '')
  for (const item of limitRows(treatmentsWithoutSemantic, 120)) {
    lines.push(`- ${item.version} | ${item.treatment} | tipo=${item.tipo || 'null'}`)
  }
  if (treatmentsWithoutSemantic.length > 120) lines.push(`- ... mais ${treatmentsWithoutSemantic.length - 120}`)

  lines.push('', '## Aliases de Material Possiveis', '')
  for (const group of limitRows(materialExamples, 40)) {
    lines.push(`- ${group.key}`)
    for (const example of group.examples.slice(0, 5)) {
      lines.push(`  - ${example.version} | ${example.family} | ${example.offer} | material=${example.material || 'null'} | index=${example.index}`)
    }
  }

  await fs.writeFile(OUTPUT_MD, `${lines.join('\n')}\n`, 'utf8')

  console.log('Auditoria semantica global concluida.')
  console.log(`JSON: ${OUTPUT_JSON}`)
  console.log(`MD: ${OUTPUT_MD}`)
  console.log(`Findings: ${summary.findings_total}`)
  console.log(`Severidade: ${JSON.stringify(summary.findings_by_severity)}`)
  console.log(`Tipos: ${JSON.stringify(summary.findings_by_type)}`)
}

main().catch((error) => {
  console.error('Falha na auditoria semantica global:', error.message || error)
  process.exit(1)
})
