import fs from 'fs'
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

const STORE_ID = Number(process.argv.find((arg) => arg.startsWith('--store='))?.split('=')[1] || '1')
const DRAFT_PATH =
  process.argv.find((arg) => arg.startsWith('--draft='))?.split('=')[1] ||
  'tmp/omegalux_prolife_catalog_draft_2026_07.json'
const OUT_JSON = 'tmp/omegalux_prolife_import_audit.json'
const OUT_MD = 'tmp/omegalux_prolife_import_audit.md'

const EXPECTED_LAB = 'OMEGALUX / PRO LIFE'
const EXPECTED_VERSION = 'OMEGALUX PRO LIFE Julho 2026'
const GEOMETRY_EXPECTED = new Map([
  ['OMEGALUX IN', 'Varilux Liberty 3.0'],
  ['OMEGALUX DIGITAL', 'Varilux Comfort Max'],
  ['OMEGALUX 4K', 'Varilux XR Pro'],
])

function readJson(filePath) {
  const absolute = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath)
  return JSON.parse(fs.readFileSync(absolute, 'utf8'))
}

async function fetchAll(queryFactory, pageSize = 1000) {
  const rows = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await queryFactory().range(from, from + pageSize - 1)
    if (error) throw error
    rows.push(...(data || []))
    if ((data || []).length < pageSize) break
  }
  return rows
}

function normalizeNumber(value) {
  if (value == null) return null
  return Number(Number(value).toFixed(2))
}

function normalizeArray(value) {
  return [...(value || [])].sort()
}

function normalizeFeatureValue(value) {
  if (typeof value === 'number') return normalizeNumber(value)
  if (Array.isArray(value)) return normalizeArray(value)
  return value
}

function pickAuditedFeatures(features = {}) {
  const keys = [
    'catalog_brand',
    'treatment_column',
    'photo',
    'marca_propria',
    'antirreflexo',
    'blue_uv',
    'blue_control',
    'uv',
    'uv_control',
    'antirrisco',
    'facil_limpeza',
    'fotossensivel',
    'transitions',
    'equivalent_family',
    'semantic_source',
    'geometry_source',
    'positioning',
    'same_semantics_not_same_commercial_lens',
    'semantic_pending',
    'semantic_pending_reason',
  ]
  const out = {}
  for (const key of keys) {
    if (features[key] !== undefined) out[key] = normalizeFeatureValue(features[key])
  }
  return out
}

function buildOfferImportKey(offer) {
  const canonical = offer.canonical_label || offer.raw_label || 'sem-label'
  const page = offer.source_page_reference || 'sem-pagina'
  const price = offer.base_price ?? 'sem-preco'
  const legacy = offer.legacy_code || 'sem-codigo'
  return `${page} | ${canonical} | ${price} | ${legacy}`
}

function expectedRowsFromDraft(draft) {
  const families = draft.families || []
  const treatments = draft.treatments || []
  const offers = []
  for (const family of families) {
    for (const offer of family.offers || []) {
      offers.push({
        familyName: family.name,
        familyCategory: family.clinical_category,
        familyDesign: family.design,
        importKey: buildOfferImportKey(offer),
        rawLabel: offer.raw_label,
        canonicalLabel: offer.canonical_label || null,
        clinicalCategory: offer.clinical_category || family.clinical_category || 'indefinida',
        material: offer.material || null,
        indiceRefracao: normalizeNumber(offer.indice_refracao),
        basePrice: normalizeNumber(offer.base_price),
        isAtomicOffer: offer.is_atomic_offer === true,
        allowsComposition: offer.allows_composition !== false,
        alreadyIncludesTreatment: offer.already_includes_treatment === true,
        features: pickAuditedFeatures(offer.features || {}),
      })
    }
  }
  return { families, treatments, offers }
}

function rowByKey(rows, keyGetter) {
  return new Map(rows.map((row) => [keyGetter(row), row]))
}

function compareObjects(expected, actual, fields) {
  const mismatches = []
  for (const field of fields) {
    const left = expected[field]
    const right = actual[field]
    if (JSON.stringify(left) !== JSON.stringify(right)) {
      mismatches.push({ field, expected: left, actual: right })
    }
  }
  return mismatches
}

async function main() {
  const draft = readJson(DRAFT_PATH)
  const expected = expectedRowsFromDraft(draft)

  const { data: version, error: versionError } = await supabase
    .from('global_catalog_versions')
    .select('id,laboratorio,versao,status')
    .eq('laboratorio', EXPECTED_LAB)
    .eq('versao', EXPECTED_VERSION)
    .single()
  if (versionError) throw versionError

  const families = await fetchAll(() =>
    supabase
      .from('global_lens_families')
      .select('id,nome,clinical_category,design,tags_uso,tags_beneficios,source_page_reference')
      .eq('version_id', version.id),
  )
  const familyIds = families.map((family) => family.id)
  const offers = await fetchAll(() =>
    supabase
      .from('global_lens_offers')
      .select(
        'id,family_id,import_key,raw_label,canonical_label,clinical_category,material,indice_refracao,is_atomic_offer,allows_composition,already_includes_treatment,features,base_price,source_page_reference,confidence_level',
      )
      .in('family_id', familyIds),
  )
  const treatments = await fetchAll(() =>
    supabase
      .from('global_treatments')
      .select('id,nome,tipo,tags,features')
      .eq('version_id', version.id),
  )

  const { data: activation, error: activationError } = await supabase
    .from('tenant_catalog_activations')
    .select('id,status,store_id,global_version_id,activated_at,last_synced_at')
    .eq('store_id', STORE_ID)
    .eq('global_version_id', version.id)
    .single()
  if (activationError) throw activationError

  const tenantOffers = await fetchAll(() =>
    supabase
      .from('tenant_commercial_offers')
      .select('id,activation_id,global_offer_id,display_name,price_cost,price_sell,is_active')
      .eq('activation_id', activation.id),
  )

  const geometries = await fetchAll(() =>
    supabase
      .from('global_lens_geometry')
      .select('family_name,visual_design_type,distance_width,intermediate_width,corridor_opening,near_width,lateral_blur,fitting_height,pins')
      .in('family_name', [...GEOMETRY_EXPECTED.keys(), ...GEOMETRY_EXPECTED.values()]),
  )

  const familyById = rowByKey(families, (row) => row.id)
  const dbFamiliesByName = rowByKey(families, (row) => row.nome)
  const dbOffersByImportKey = rowByKey(offers, (row) => row.import_key)
  const tenantByGlobalOfferId = rowByKey(tenantOffers, (row) => row.global_offer_id)
  const geometryByName = rowByKey(geometries, (row) => row.family_name)

  const findings = []
  const missingFamilies = []
  const extraFamilies = []
  const familyMismatches = []

  for (const family of expected.families) {
    const dbFamily = dbFamiliesByName.get(family.name)
    if (!dbFamily) {
      missingFamilies.push(family.name)
      continue
    }
    const mismatches = compareObjects(
      { clinical_category: family.clinical_category, design: family.design },
      { clinical_category: dbFamily.clinical_category, design: dbFamily.design },
      ['clinical_category', 'design'],
    )
    if (mismatches.length) familyMismatches.push({ family: family.name, mismatches })
  }
  for (const family of families) {
    if (!(expected.families || []).some((item) => item.name === family.nome)) extraFamilies.push(family.nome)
  }

  const missingOffers = []
  const extraOffers = []
  const offerMismatches = []
  const expectedOfferKeys = new Set(expected.offers.map((offer) => offer.importKey))

  for (const expectedOffer of expected.offers) {
    const actual = dbOffersByImportKey.get(expectedOffer.importKey)
    if (!actual) {
      missingOffers.push(expectedOffer)
      continue
    }
    const family = familyById.get(actual.family_id)
    const actualComparable = {
      familyName: family?.nome || null,
      rawLabel: actual.raw_label,
      canonicalLabel: actual.canonical_label || null,
      clinicalCategory: actual.clinical_category,
      material: actual.material || null,
      indiceRefracao: normalizeNumber(actual.indice_refracao),
      basePrice: normalizeNumber(actual.base_price),
      isAtomicOffer: actual.is_atomic_offer === true,
      allowsComposition: actual.allows_composition !== false,
      alreadyIncludesTreatment: actual.already_includes_treatment === true,
      features: pickAuditedFeatures(actual.features || {}),
    }
    const mismatches = compareObjects(expectedOffer, actualComparable, [
      'familyName',
      'rawLabel',
      'canonicalLabel',
      'clinicalCategory',
      'material',
      'indiceRefracao',
      'basePrice',
      'isAtomicOffer',
      'allowsComposition',
      'alreadyIncludesTreatment',
      'features',
    ])
    if (mismatches.length) {
      offerMismatches.push({ importKey: expectedOffer.importKey, label: expectedOffer.canonicalLabel, mismatches })
    }
  }
  for (const offer of offers) {
    if (!expectedOfferKeys.has(offer.import_key)) extraOffers.push(offer.import_key)
  }

  const missingTreatments = []
  const extraTreatments = []
  const treatmentMismatches = []
  const dbTreatmentByName = rowByKey(treatments, (row) => row.nome)
  const expectedTreatmentNames = new Set((expected.treatments || []).map((row) => row.name))
  for (const expectedTreatment of expected.treatments || []) {
    const actual = dbTreatmentByName.get(expectedTreatment.name)
    if (!actual) {
      missingTreatments.push(expectedTreatment.name)
      continue
    }
    const mismatches = compareObjects(
      {
        tipo: expectedTreatment.type || 'Tratamento',
        tags: normalizeArray(expectedTreatment.tags || []),
        features: pickAuditedFeatures(expectedTreatment.features || {}),
      },
      {
        tipo: actual.tipo,
        tags: normalizeArray(actual.tags || []),
        features: pickAuditedFeatures(actual.features || {}),
      },
      ['tipo', 'tags', 'features'],
    )
    if (mismatches.length) treatmentMismatches.push({ treatment: expectedTreatment.name, mismatches })
  }
  for (const treatment of treatments) {
    if (!expectedTreatmentNames.has(treatment.nome)) extraTreatments.push(treatment.nome)
  }

  const tenantMissingOffers = []
  const tenantExtraOffers = []
  const tenantInactiveOffers = tenantOffers.filter((row) => row.is_active === false)
  const tenantDisplayMismatches = []
  for (const offer of offers) {
    const tenant = tenantByGlobalOfferId.get(offer.id)
    if (!tenant) {
      tenantMissingOffers.push(offer.import_key)
      continue
    }
    const expectedDisplay = offer.canonical_label || offer.raw_label || null
    if (tenant.display_name !== expectedDisplay) {
      tenantDisplayMismatches.push({
        offer: offer.canonical_label || offer.raw_label,
        expected: expectedDisplay,
        actual: tenant.display_name,
      })
    }
  }
  const dbOfferIds = new Set(offers.map((offer) => offer.id))
  for (const tenant of tenantOffers) {
    if (!dbOfferIds.has(tenant.global_offer_id)) tenantExtraOffers.push(tenant.global_offer_id)
  }

  const geometryResults = []
  for (const [target, sourceName] of GEOMETRY_EXPECTED.entries()) {
    const targetGeometry = geometryByName.get(target)
    const sourceGeometry = geometryByName.get(sourceName)
    if (!targetGeometry || !sourceGeometry) {
      geometryResults.push({ target, source: sourceName, status: 'missing', targetFound: !!targetGeometry, sourceFound: !!sourceGeometry })
      continue
    }
    const fields = ['visual_design_type', 'distance_width', 'intermediate_width', 'corridor_opening', 'near_width', 'lateral_blur', 'fitting_height']
    const mismatches = compareObjects(sourceGeometry, targetGeometry, fields)
    geometryResults.push({
      target,
      source: sourceName,
      status: mismatches.length ? 'mismatch' : 'ok',
      mismatches,
    })
  }

  const summary = {
    storeId: STORE_ID,
    versionId: version.id,
    activationId: activation.id,
    activationStatus: activation.status,
    expectedFamilies: expected.families.length,
    dbFamilies: families.length,
    expectedOffers: expected.offers.length,
    dbOffers: offers.length,
    expectedTreatments: expected.treatments.length,
    dbTreatments: treatments.length,
    tenantRows: tenantOffers.length,
    tenantActiveRows: tenantOffers.filter((row) => row.is_active === true).length,
    missingFamilies: missingFamilies.length,
    extraFamilies: extraFamilies.length,
    familyMismatches: familyMismatches.length,
    missingOffers: missingOffers.length,
    extraOffers: extraOffers.length,
    offerMismatches: offerMismatches.length,
    missingTreatments: missingTreatments.length,
    extraTreatments: extraTreatments.length,
    treatmentMismatches: treatmentMismatches.length,
    tenantMissingOffers: tenantMissingOffers.length,
    tenantExtraOffers: tenantExtraOffers.length,
    tenantInactiveOffers: tenantInactiveOffers.length,
    tenantDisplayMismatches: tenantDisplayMismatches.length,
    geometryOk: geometryResults.filter((row) => row.status === 'ok').length,
    geometryIssues: geometryResults.filter((row) => row.status !== 'ok').length,
  }

  if (missingFamilies.length) findings.push({ severity: 'high', area: 'families', count: missingFamilies.length, items: missingFamilies })
  if (extraFamilies.length) findings.push({ severity: 'medium', area: 'families_extra', count: extraFamilies.length, items: extraFamilies })
  if (familyMismatches.length) findings.push({ severity: 'high', area: 'family_mismatches', count: familyMismatches.length, items: familyMismatches })
  if (missingOffers.length) findings.push({ severity: 'high', area: 'offers_missing', count: missingOffers.length, items: missingOffers.slice(0, 20) })
  if (extraOffers.length) findings.push({ severity: 'medium', area: 'offers_extra', count: extraOffers.length, items: extraOffers.slice(0, 20) })
  if (offerMismatches.length) findings.push({ severity: 'high', area: 'offer_mismatches', count: offerMismatches.length, items: offerMismatches.slice(0, 20) })
  if (missingTreatments.length) findings.push({ severity: 'high', area: 'treatments_missing', count: missingTreatments.length, items: missingTreatments })
  if (extraTreatments.length) findings.push({ severity: 'medium', area: 'treatments_extra', count: extraTreatments.length, items: extraTreatments })
  if (treatmentMismatches.length) findings.push({ severity: 'medium', area: 'treatment_mismatches', count: treatmentMismatches.length, items: treatmentMismatches })
  if (tenantMissingOffers.length) findings.push({ severity: 'high', area: 'tenant_missing_offers', count: tenantMissingOffers.length, items: tenantMissingOffers.slice(0, 20) })
  if (tenantExtraOffers.length) findings.push({ severity: 'medium', area: 'tenant_extra_offers', count: tenantExtraOffers.length, items: tenantExtraOffers.slice(0, 20) })
  if (tenantInactiveOffers.length) findings.push({ severity: 'medium', area: 'tenant_inactive_offers', count: tenantInactiveOffers.length, items: tenantInactiveOffers.slice(0, 20) })
  if (tenantDisplayMismatches.length) findings.push({ severity: 'low', area: 'tenant_display_mismatches', count: tenantDisplayMismatches.length, items: tenantDisplayMismatches.slice(0, 20) })
  if (summary.geometryIssues) findings.push({ severity: 'medium', area: 'geometry', count: summary.geometryIssues, items: geometryResults.filter((row) => row.status !== 'ok') })

  const audit = {
    generatedAt: new Date().toISOString(),
    draftPath: DRAFT_PATH,
    version,
    activation,
    summary,
    findings,
    familyCounts: families.map((family) => ({
      family: family.nome,
      category: family.clinical_category,
      offers: offers.filter((offer) => offer.family_id === family.id).length,
    })).sort((a, b) => a.family.localeCompare(b.family)),
    geometryResults,
  }

  fs.writeFileSync(OUT_JSON, JSON.stringify(audit, null, 2), 'utf8')

  const lines = [
    '# Auditoria OMEGALUX / PRO LIFE',
    '',
    `- Gerado em: ${audit.generatedAt}`,
    `- Store: ${STORE_ID}`,
    `- Version ID: ${version.id}`,
    `- Activation ID: ${activation.id}`,
    `- Status da ativacao: ${activation.status}`,
    '',
    '## Resumo',
    '',
    `- Familias esperadas/BD: ${summary.expectedFamilies}/${summary.dbFamilies}`,
    `- Ofertas esperadas/BD: ${summary.expectedOffers}/${summary.dbOffers}`,
    `- Tratamentos esperados/BD: ${summary.expectedTreatments}/${summary.dbTreatments}`,
    `- Tenant rows/ativas: ${summary.tenantRows}/${summary.tenantActiveRows}`,
    `- Geometrias OK/issues: ${summary.geometryOk}/${summary.geometryIssues}`,
    '',
    '## Familias',
    '',
    ...audit.familyCounts.map((row) => `- ${row.family}: ${row.offers} ofertas (${row.category})`),
    '',
    '## Findings',
    '',
  ]
  if (!findings.length) {
    lines.push('- Nenhum problema encontrado.')
  } else {
    for (const finding of findings) {
      lines.push(`- ${finding.severity.toUpperCase()} ${finding.area}: ${finding.count}`)
    }
  }
  lines.push('', '## Geometria', '')
  for (const row of geometryResults) {
    lines.push(`- ${row.target} <- ${row.source}: ${row.status}`)
  }

  fs.writeFileSync(OUT_MD, lines.join('\n') + '\n', 'utf8')

  console.log(JSON.stringify({ summary, findings, reports: { json: OUT_JSON, md: OUT_MD } }, null, 2))
}

main().catch((error) => {
  console.error('Falha na auditoria OMEGALUX / PRO LIFE:', error.message || error)
  process.exit(1)
})
