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
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

const args = process.argv.slice(2)
const inputArg = args.find((arg) => !arg.startsWith('--')) || 'tmp/gamalab_catalog_draft.json'
const shouldCommit = args.includes('--commit')
const IMPORT_THROTTLE_MS = Number(process.env.IMPORT_THROTTLE_MS || '0')
const IMPORT_OFFER_THROTTLE_MS = Number(process.env.IMPORT_OFFER_THROTTLE_MS || '0')
const IMPORT_RETRY_ATTEMPTS = Number(process.env.IMPORT_RETRY_ATTEMPTS || '5')
const IMPORT_FAMILY_START = Number(process.env.IMPORT_FAMILY_START || '0')
const IMPORT_FAMILY_END = Number(process.env.IMPORT_FAMILY_END || '0')
const IMPORT_FAMILY_NAMES = (process.env.IMPORT_FAMILY_NAMES || '')
  .split(',')
  .map((name) => name.trim())
  .filter(Boolean)
const IMPORT_LOG_OFFERS = process.env.IMPORT_LOG_OFFERS === '1'
const IMPORT_SKIP_EXISTING = process.env.IMPORT_SKIP_EXISTING === '1'

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function shouldRetryError(error) {
  const message = (error?.message || '').toLowerCase()
  return (
    message.includes('fetch failed') ||
    message.includes('econnreset') ||
    message.includes('etimedout') ||
    message.includes('network') ||
    message.includes('timeout')
  )
}

async function withRetry(task, label) {
  let lastError = null
  for (let attempt = 1; attempt <= IMPORT_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await task()
    } catch (error) {
      lastError = error
      const message = error?.message || error
      const cause = error?.cause?.message || error?.cause
      console.warn(`[retry] ${label} erro: ${message}${cause ? ` (cause: ${cause})` : ''}`)
      if (!shouldRetryError(error) || attempt === IMPORT_RETRY_ATTEMPTS) {
        throw error
      }
      const waitMs = 500 * attempt
      console.warn(`[retry] ${label} falhou (tentativa ${attempt}). Aguardando ${waitMs}ms...`)
      await sleep(waitMs)
    }
  }
  throw lastError
}

function buildOfferImportKey(offer) {
  const canonical = offer.canonical_label || offer.raw_label || 'sem-label'
  const page = offer.source_page_reference || 'sem-pagina'
  const price = offer.base_price ?? 'sem-preco'
  const legacy = offer.legacy_code || 'sem-codigo'
  return `${page} | ${canonical} | ${price} | ${legacy}`
}

function normalizeText(value) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function normalizeOfferIndex(offer) {
  if (offer.indice_refracao != null) return offer.indice_refracao

  const text = normalizeText([offer.raw_label, offer.canonical_label, offer.material].filter(Boolean).join(' '))

  if (text.includes('airwear') || text.includes('poly') || text.includes('policarbonato')) {
    return 1.59
  }

  if (text.includes('orma') || text.includes('cr-39')) {
    return 1.5
  }

  return 1.5
}

function normalizeOfferCost(offer) {
  const direct = offer.cost_price
  if (direct != null && Number.isFinite(Number(direct))) return Number(direct)

  const featureCost = offer.features?.cost_price
  if (featureCost != null && Number.isFinite(Number(featureCost))) return Number(featureCost)

  return null
}

function buildComparableOfferFeatures(offer) {
  return {
    ...(offer.features || {}),
    ...(normalizeOfferCost(offer) != null ? { cost_price: normalizeOfferCost(offer) } : {}),
  }
}

function inferFulfillmentMode(offer) {
  const existing = offer.features?.fulfillment_mode
  if (existing === 'pronta' || existing === 'sob_demanda') {
    return existing
  }

  const descriptor = normalizeText(
    [offer.raw_label, offer.canonical_label, offer.material, offer.source_page_reference]
      .filter(Boolean)
      .join(' ')
  )

  const hasProntaSignals = /(pronta|stock|acabada|acabado|lentes prontas|pronta entrega)/.test(descriptor)
  const hasSobDemandaSignals = /(surfac|surfa|sob demanda|digital)/.test(descriptor)

  if (offer.allows_composition === true && offer.is_atomic_offer !== true) {
    return 'sob_demanda'
  }
  if (offer.is_atomic_offer === true || offer.already_includes_treatment === true) {
    return 'pronta'
  }
  if (hasSobDemandaSignals && !hasProntaSignals) {
    return 'sob_demanda'
  }
  if (hasProntaSignals) {
    return 'pronta'
  }

  return 'pronta'
}

function enrichFulfillmentFeatures(offer, features) {
  const mode = inferFulfillmentMode(offer)
  return {
    ...features,
    fulfillment_mode: mode,
    pronta: mode === 'pronta',
    sob_demanda: mode === 'sob_demanda',
    potential_thinner_lighter: mode === 'sob_demanda',
    longer_lead_time: mode === 'sob_demanda',
    pronta_entrega: mode === 'pronta',
  }
}

function enrichEmbeddedTreatmentFeatures(offer, features) {
  const descriptor = normalizeText(
    [offer.raw_label, offer.canonical_label, offer.material, offer.source_page_reference]
      .filter(Boolean)
      .join(' '),
  )
  const flags = { ...features }

  if (/(blue\s?control|blue\s?uv|uv\s?filter)/.test(descriptor)) {
    flags.blue_control = true
    flags.blue_uv = true
  }

  if (/(sensity|photofusion|photochrom|transitions|fotossens)/.test(descriptor)) {
    flags.fotossensivel = true
    flags.transitions = true
  }

  if (/(polarizad|polarized)/.test(descriptor)) {
    flags.polarizado = true
    flags.solar = true
  }

  if (/(mirror|espelhado)/.test(descriptor)) {
    flags.espelhado = true
  }

  if (/(uv\s?control)/.test(descriptor)) {
    flags.uv = true
    flags.uv_control = true
  }

  if (/(sun\s?pro|solar|solares|sunwear)/.test(descriptor)) {
    flags.solar = true
  }

  if (/(meiryo|longlife|hard|cleanextra|anti-?reflex|antirreflex)/.test(descriptor)) {
    flags.antirreflexo = true
  }

  return flags
}

function buildIncomingOfferSemantic(offer) {
  const base = {
    ...offer,
    indice_refracao: normalizeOfferIndex(offer),
    features: buildComparableOfferFeatures(offer),
  }
  const enrichedFeatures = enrichEmbeddedTreatmentFeatures(offer, base.features || {})
  return {
    ...base,
    features: enrichFulfillmentFeatures(offer, enrichedFeatures),
  }
}

function inferFamilyClinicalCategory(family) {
  const text = normalizeText(
    [family.name, family.design, family.description_marketing, family.source_page_reference].filter(Boolean).join(' ')
  )

  if (text.includes('solares planas acabadas')) return 'plana_solar'
  if (text.includes('bifocais')) return 'bifocal'
  if (text.includes('stellest') || text.includes('controle da miopia')) return 'controle_miopia'
  if (text.includes('eyezen')) return text.includes('kids') ? 'mista' : 'visao_simples'
  if (text.includes('start stock')) return 'visao_simples'
  if (text.includes('activities') || text.includes('kodak') || text.includes('lentes essilor') || text.includes('itop') || text.includes('espace')) return 'mista'
  if (text.includes('varilux')) return 'multifocal'

  return 'indefinida'
}

function inferOfferClinicalCategory(offer, family, familyClinicalCategory) {
  const text = normalizeText([family.name, offer.canonical_label, offer.raw_label, offer.source_page_reference].filter(Boolean).join(' '))
  const hasAddGrid = (offer.diopter_grids || []).some((grid) => grid.add_min != null || grid.add_max != null)

  if (text.includes('stellest')) return 'controle_miopia'
  if (text.includes('bifocal') || text.includes('flap top') || text.includes('ultex')) return 'bifocal'
  if (text.includes('solares planas acabadas')) return 'plana_solar'
  if (text.includes('interview') || text.includes('digitime') || text.includes('softwear') || text.includes('roadpilot') || text.includes('sportwrap') || text.includes('sport ')) {
    return 'ocupacional'
  }
  if (
    text.includes('eyezen') ||
    text.includes('single') ||
    text.includes('visao simples') ||
    text.includes('kodak city') ||
    text.includes('kodak intro') ||
    text.includes('kodak blue')
  ) {
    return 'visao_simples'
  }
  if (
    hasAddGrid ||
    text.includes('varilux') ||
    text.includes('unique') ||
    text.includes('network') ||
    text.includes('precise') ||
    text.includes('comfort') ||
    text.includes('liberty') ||
    text.includes('physio') ||
    text.includes('xr series')
  ) {
    return 'multifocal'
  }
  if (familyClinicalCategory !== 'mista' && familyClinicalCategory !== 'indefinida') {
    return familyClinicalCategory
  }

  return 'indefinida'
}

function readJson(filePath) {
  const absolute = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath)
  if (!fs.existsSync(absolute)) {
    throw new Error(`Arquivo nao encontrado: ${absolute}`)
  }
  return JSON.parse(fs.readFileSync(absolute, 'utf8'))
}

function buildSummary(payload) {
  return {
    version: payload.catalog_version?.versao,
    laboratorio: payload.catalog_version?.laboratorio,
    familias: payload.families?.length || 0,
    ofertas: (payload.families || []).reduce((acc, family) => acc + (family.offers?.length || 0), 0),
    tratamentos: payload.treatments?.length || 0,
    paginas: payload.source_document?.pages?.length || 0,
  }
}

async function upsertSingle(table, row, onConflict) {
  const { data, error } = await withRetry(
    () =>
      supabase
        .from(table)
        .upsert(row, { onConflict })
        .select('*'),
    `upsert:${table}`
  )

  if (error) {
    error.message = `[${table}] ${error.message}`
    throw error
  }
  if (!data || data.length === 0) {
    throw new Error(`[${table}] nenhum registro retornado apos upsert`)
  }
  return data[0]
}

async function updateSingleById(table, id, row) {
  const { data, error } = await withRetry(
    () =>
      supabase
        .from(table)
        .update(row)
        .eq('id', id)
        .select('*'),
    `update:${table}#${id}`
  )

  if (error) {
    error.message = `[${table}#${id}] ${error.message}`
    throw error
  }
  if (!data || data.length === 0) {
    throw new Error(`[${table}#${id}] nenhum registro retornado apos update`)
  }
  return data[0]
}

function sortObjectKeys(value) {
  if (Array.isArray(value)) {
    return value.map(sortObjectKeys)
  }
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = sortObjectKeys(value[key])
        return acc
      }, {})
  }
  return value
}

function sortCompatibleTreatments(items) {
  return [...(items || [])]
    .map((item) => ({
      treatment_name: item.treatment_name,
      special_price: item.special_price ?? null,
      price_mode: item.price_mode || 'final',
    }))
    .sort((a, b) => `${a.treatment_name}|${a.special_price}|${a.price_mode}`.localeCompare(`${b.treatment_name}|${b.special_price}|${b.price_mode}`))
}

function sortDiopterGrids(items) {
  return [...(items || [])]
    .map((grid) => ({
      sph_min: grid.sph_min,
      sph_max: grid.sph_max,
      cyl_min: grid.cyl_min ?? 0,
      cyl_max: grid.cyl_max ?? grid.cyl_min ?? 0,
      add_min: grid.add_min ?? null,
      add_max: grid.add_max ?? null,
      metadata: sortObjectKeys(grid.metadata || {}),
    }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
}

function buildWeakOfferSignature(offer) {
  return JSON.stringify(
    {
      canonical_label: normalizeText(offer.canonical_label || null),
      raw_label: normalizeText(offer.raw_label || null),
      material: offer.material || null,
      indice_refracao: offer.indice_refracao ?? null,
      is_atomic_offer: offer.is_atomic_offer === true,
      allows_composition: offer.allows_composition !== false,
      already_includes_treatment: offer.already_includes_treatment === true,
      treatment_names: sortCompatibleTreatments(offer.compatible_treatments || []).map((item) => normalizeText(item.treatment_name)),
    },
    null,
    0
  )
}

function buildSoftOfferSignature(offer) {
  return JSON.stringify(
    {
      raw_label: normalizeText(offer.raw_label || null),
      material: offer.material || null,
      indice_refracao: offer.indice_refracao ?? null,
      treatment_names: sortCompatibleTreatments(offer.compatible_treatments || []).map((item) => normalizeText(item.treatment_name)),
    },
    null,
    0
  )
}

function buildFullOfferSignature(offer) {
  return JSON.stringify(
    {
      canonical_label: offer.canonical_label || null,
      raw_label: offer.raw_label || null,
      material: offer.material || null,
      indice_refracao: offer.indice_refracao ?? null,
      is_atomic_offer: offer.is_atomic_offer === true,
      allows_composition: offer.allows_composition !== false,
      already_includes_treatment: offer.already_includes_treatment === true,
      features: sortObjectKeys(offer.features || {}),
      base_price: offer.base_price ?? null,
      compatible_treatments: sortCompatibleTreatments(offer.compatible_treatments || []),
      diopter_grids: sortDiopterGrids(offer.diopter_grids || []),
    },
    null,
    0
  )
}

function buildExistingOfferSemantic(existingOffer) {
  return {
    canonical_label: existingOffer.canonical_label || null,
    raw_label: existingOffer.raw_label || null,
    material: existingOffer.material || null,
    indice_refracao: existingOffer.indice_refracao ?? null,
    is_atomic_offer: existingOffer.is_atomic_offer === true,
    allows_composition: existingOffer.allows_composition !== false,
    already_includes_treatment: existingOffer.already_includes_treatment === true,
    features: existingOffer.features || {},
    base_price: existingOffer.base_price ?? null,
    compatible_treatments: existingOffer.compatible_treatments || [],
    diopter_grids: existingOffer.diopter_grids || [],
  }
}

async function mergeOfferReferences(targetId, duplicateId) {
  const { data: duplicateTenantRows, error: duplicateTenantRowsError } = await supabase
    .from('tenant_commercial_offers')
    .select('id,activation_id,display_name,price_cost,price_sell,is_active')
    .eq('global_offer_id', duplicateId)

  if (duplicateTenantRowsError) throw duplicateTenantRowsError

  const activationIds = [...new Set((duplicateTenantRows || []).map((row) => row.activation_id))]

  let targetRowsByActivation = new Map()
  if (activationIds.length > 0) {
    const { data: targetTenantRows, error: targetTenantRowsError } = await supabase
      .from('tenant_commercial_offers')
      .select('id,activation_id,display_name,price_cost,price_sell,is_active')
      .eq('global_offer_id', targetId)
      .in('activation_id', activationIds)

    if (targetTenantRowsError) throw targetTenantRowsError
    targetRowsByActivation = new Map((targetTenantRows || []).map((row) => [row.activation_id, row]))
  }

  for (const duplicateRow of duplicateTenantRows || []) {
    const existingTargetRow = targetRowsByActivation.get(duplicateRow.activation_id)

    if (existingTargetRow) {
      const patch = {}
      if (existingTargetRow.display_name == null && duplicateRow.display_name != null) patch.display_name = duplicateRow.display_name
      if (existingTargetRow.price_cost == null && duplicateRow.price_cost != null) patch.price_cost = duplicateRow.price_cost
      if (existingTargetRow.price_sell == null && duplicateRow.price_sell != null) patch.price_sell = duplicateRow.price_sell
      if (existingTargetRow.is_active !== true && duplicateRow.is_active === true) patch.is_active = true

      if (Object.keys(patch).length > 0) {
        const { error: updateTargetRowError } = await supabase
          .from('tenant_commercial_offers')
          .update(patch)
          .eq('id', existingTargetRow.id)

        if (updateTargetRowError) throw updateTargetRowError
      }

      const { error: deleteDuplicateTenantRowError } = await supabase
        .from('tenant_commercial_offers')
        .delete()
        .eq('id', duplicateRow.id)

      if (deleteDuplicateTenantRowError) throw deleteDuplicateTenantRowError
      continue
    }

    const { error: migrateDuplicateTenantRowError } = await supabase
      .from('tenant_commercial_offers')
      .update({ global_offer_id: targetId })
      .eq('id', duplicateRow.id)

    if (migrateDuplicateTenantRowError) throw migrateDuplicateTenantRowError
  }

  const { error: usageProfilesError } = await supabase
    .from('global_usage_profiles')
    .update({ offer_id: targetId })
    .eq('offer_id', duplicateId)

  if (usageProfilesError) throw usageProfilesError

  const { error: sourceEvidenceError } = await supabase
    .from('global_source_evidence')
    .update({ offer_id: targetId })
    .eq('offer_id', duplicateId)

  if (sourceEvidenceError) throw sourceEvidenceError

  const { error: deleteDuplicateOfferError } = await supabase
    .from('global_lens_offers')
    .delete()
    .eq('id', duplicateId)

  if (deleteDuplicateOfferError) throw deleteDuplicateOfferError
}

async function deleteOfferAndReferences(offerId) {
  const { error: deleteTenantRowsError } = await supabase
    .from('tenant_commercial_offers')
    .delete()
    .eq('global_offer_id', offerId)

  if (deleteTenantRowsError) throw deleteTenantRowsError

  const { error: usageProfilesError } = await supabase
    .from('global_usage_profiles')
    .delete()
    .eq('offer_id', offerId)

  if (usageProfilesError) throw usageProfilesError

  const { error: sourceEvidenceError } = await supabase
    .from('global_source_evidence')
    .delete()
    .eq('offer_id', offerId)

  if (sourceEvidenceError) throw sourceEvidenceError

  const { error: deleteOfferError } = await supabase
    .from('global_lens_offers')
    .delete()
    .eq('id', offerId)

  if (deleteOfferError) throw deleteOfferError
}

async function loadExistingFamilyOffers(savedFamilyId, treatmentNameById) {
  const { data: offers, error: offersError } = await withRetry(
    () =>
      supabase
        .from('global_lens_offers')
        .select('id,family_id,import_key,raw_label,canonical_label,material,indice_refracao,is_atomic_offer,allows_composition,already_includes_treatment,features,base_price,source_page_reference,confidence_level')
        .eq('family_id', savedFamilyId),
    `select:global_lens_offers:family:${savedFamilyId}`
  )

  if (offersError) throw offersError

  const offerIds = (offers || []).map((offer) => offer.id)
  if (offerIds.length === 0) return []

  const { data: compatRows, error: compatError } = await withRetry(
    () =>
      supabase
        .from('global_offer_treatments_compatibility')
        .select('offer_id,treatment_id,special_price,price_mode')
        .in('offer_id', offerIds),
    `select:global_offer_treatments_compatibility:${offerIds.length}`
  )
  const { data: gridRows, error: gridError } = await withRetry(
    () =>
      supabase
        .from('global_offer_diopter_grids')
        .select('offer_id,sph_min,sph_max,cyl_min,cyl_max,add_min,add_max,metadata')
        .in('offer_id', offerIds),
    `select:global_offer_diopter_grids:${offerIds.length}`
  )
  const { data: tenantRefs, error: tenantRefsError } = await withRetry(
    () =>
      supabase
        .from('tenant_commercial_offers')
        .select('global_offer_id')
        .in('global_offer_id', offerIds),
    `select:tenant_commercial_offers:${offerIds.length}`
  )

  if (compatError) throw compatError
  if (gridError) throw gridError
  if (tenantRefsError) throw tenantRefsError

  const compatByOfferId = new Map()
  for (const row of compatRows || []) {
    const items = compatByOfferId.get(row.offer_id) || []
    items.push({
      treatment_name: treatmentNameById.get(row.treatment_id) || row.treatment_id,
      special_price: row.special_price ?? null,
      price_mode: row.price_mode || 'final',
    })
    compatByOfferId.set(row.offer_id, items)
  }

  const gridsByOfferId = new Map()
  for (const row of gridRows || []) {
    const items = gridsByOfferId.get(row.offer_id) || []
    items.push({
      sph_min: row.sph_min,
      sph_max: row.sph_max,
      cyl_min: row.cyl_min,
      cyl_max: row.cyl_max,
      add_min: row.add_min,
      add_max: row.add_max,
      metadata: row.metadata || {},
    })
    gridsByOfferId.set(row.offer_id, items)
  }

  const tenantRefCountByOfferId = new Map()
  for (const row of tenantRefs || []) {
    tenantRefCountByOfferId.set(row.global_offer_id, (tenantRefCountByOfferId.get(row.global_offer_id) || 0) + 1)
  }

  return (offers || []).map((offer) => ({
    ...offer,
    compatible_treatments: compatByOfferId.get(offer.id) || [],
    diopter_grids: gridsByOfferId.get(offer.id) || [],
    tenant_ref_count: tenantRefCountByOfferId.get(offer.id) || 0,
  }))
}

function chooseBestExistingOffer(existingOffers, desiredFullSignature, desiredImportKey) {
  const importKeyMatch = existingOffers.find((offer) => offer.import_key === desiredImportKey)
  if (importKeyMatch) return importKeyMatch

  const exactMatch = existingOffers.find((offer) => buildFullOfferSignature(buildExistingOfferSemantic(offer)) === desiredFullSignature)
  if (exactMatch) return exactMatch

  return [...existingOffers].sort((a, b) => {
    const refDelta = (b.tenant_ref_count || 0) - (a.tenant_ref_count || 0)
    if (refDelta !== 0) return refDelta
    return String(a.id).localeCompare(String(b.id))
  })[0]
}

function prepareIncomingOfferPlan(existingOffers, incomingOffers) {
  const existingByWeakSignature = new Map()
  for (const offer of existingOffers) {
    const weakSignature = buildWeakOfferSignature(buildExistingOfferSemantic(offer))
    const bucket = existingByWeakSignature.get(weakSignature) || []
    bucket.push(offer)
    existingByWeakSignature.set(weakSignature, bucket)
  }

  return incomingOffers.map((offer) => {
    const semanticOffer = buildIncomingOfferSemantic(offer)
    const weakSignature = buildWeakOfferSignature(semanticOffer)
    const desiredImportKey = buildOfferImportKey(offer)
    const desiredFullSignature = buildFullOfferSignature(semanticOffer)
    const existingGroup = existingByWeakSignature.get(weakSignature) || []
    const targetOffer = existingGroup.length > 0 ? chooseBestExistingOffer(existingGroup, desiredFullSignature, desiredImportKey) : null
    const duplicateOfferIds = existingGroup
      .filter((existingOffer) => targetOffer && existingOffer.id !== targetOffer.id)
      .map((existingOffer) => existingOffer.id)

    return {
      offer,
      targetOffer,
      duplicateOfferIds,
    }
  })
}

async function cleanupStaleFamilyOffers(savedFamilyId, incomingOffers, treatmentNameById) {
  const incomingFullSignatures = new Set(
    incomingOffers.map((offer) => buildFullOfferSignature(buildIncomingOfferSemantic(offer)))
  )

  const currentFamilyOffers = await loadExistingFamilyOffers(savedFamilyId, treatmentNameById)

  for (const existingOffer of currentFamilyOffers) {
    const fullSignature = buildFullOfferSignature(buildExistingOfferSemantic(existingOffer))
    if (!incomingFullSignatures.has(fullSignature)) {
      await deleteOfferAndReferences(existingOffer.id)
    }
  }
}

async function deleteFamilyAndReferences(familyId, treatmentNameById) {
  const existingOffers = await loadExistingFamilyOffers(familyId, treatmentNameById)
  for (const offer of existingOffers) {
    await deleteOfferAndReferences(offer.id)
  }

  const { error: deleteFamilyError } = await supabase
    .from('global_lens_families')
    .delete()
    .eq('id', familyId)

  if (deleteFamilyError) throw deleteFamilyError
}

async function cleanupStaleVersionFamilies(versionId, incomingFamilies, treatmentNameById) {
  const incomingNames = new Set((incomingFamilies || []).map((family) => family.name))
  const { data: existingFamilies, error } = await supabase
    .from('global_lens_families')
    .select('id,nome')
    .eq('version_id', versionId)

  if (error) throw error

  for (const family of existingFamilies || []) {
    if (!incomingNames.has(family.nome)) {
      await deleteFamilyAndReferences(family.id, treatmentNameById)
    }
  }
}

async function importPayload(payload) {
  console.log('[import] iniciando upsert da versao')
  const version = await upsertSingle(
    'global_catalog_versions',
    {
      laboratorio: payload.catalog_version.laboratorio,
      versao: payload.catalog_version.versao,
      source_kind: payload.catalog_version.source_kind || 'pdf',
      status: payload.catalog_version.status || 'draft',
      notes: payload.catalog_version.notes || null,
    },
    'laboratorio,versao'
  )

  console.log('[import] versao ok, iniciando upsert do documento')
  const document = await upsertSingle(
    'catalog_source_documents',
    {
      version_id: version.id,
      laboratorio: payload.catalog_version.laboratorio,
      document_name: payload.source_document.document_name,
      source_type: 'pdf',
      source_path: payload.source_document.source_path || null,
      document_hash: payload.source_document.document_hash,
      extraction_engine: payload.source_document.extraction_engine || null,
      extracted_text: payload.source_document.extracted_text || null,
      metadata: {
        imported_via: 'scripts/import_global_catalog.js',
      },
    },
    'version_id,document_hash'
  )

  console.log('[import] documento ok, importando paginas (se houver)')
  for (const page of payload.source_document.pages || []) {
    const savedPage = await upsertSingle(
      'catalog_source_pages',
      {
        document_id: document.id,
        page_number: page.page_number,
        extracted_text: page.text || null,
        metadata: {},
      },
      'document_id,page_number'
    )

    for (const chunk of page.chunks || []) {
      await upsertSingle(
        'catalog_source_chunks',
        {
          page_id: savedPage.id,
          page_number: page.page_number,
          chunk_index: chunk.chunk_index,
          chunk_text: chunk.text,
          metadata: {},
        },
        'page_id,chunk_index'
      )
    }
  }

  console.log('[import] paginas ok, importando tratamentos (se houver)')
  const treatmentIdByName = new Map()
  for (const treatment of payload.treatments || []) {
    const savedTreatment = await upsertSingle(
      'global_treatments',
      {
        version_id: version.id,
        laboratorio: payload.catalog_version.laboratorio,
        nome: treatment.name,
        tipo: treatment.type || 'Tratamento',
        tags: treatment.tags || [],
        features: treatment.features || {},
      },
      'version_id,nome'
    )
    treatmentIdByName.set(treatment.name, savedTreatment.id)
  }
  const treatmentNameById = new Map([...treatmentIdByName.entries()].map(([name, id]) => [id, name]))

  const families = payload.families || []
  const totalFamilies = families.length
  let familyIndex = 0
  for (const family of families) {
    familyIndex += 1
    if (IMPORT_FAMILY_START && familyIndex < IMPORT_FAMILY_START) {
      continue
    }
    if (IMPORT_FAMILY_END && familyIndex > IMPORT_FAMILY_END) {
      continue
    }
    if (IMPORT_FAMILY_NAMES.length > 0 && !IMPORT_FAMILY_NAMES.includes(family.name)) {
      continue
    }
    console.log(`[import] familia ${familyIndex}/${totalFamilies}: ${family.name}`)
    const familyClinicalCategory = family.clinical_category || inferFamilyClinicalCategory(family)
    const savedFamily = await upsertSingle(
      'global_lens_families',
      {
        version_id: version.id,
        source_document_id: document.id,
        nome: family.name,
        clinical_category: familyClinicalCategory,
        design: family.design || 'Nao identificado',
        description_marketing: family.description_marketing || null,
        tags_uso: family.usage_tags || [],
        tags_beneficios: family.benefit_tags || [],
        source_page_reference: family.source_page_reference || null,
      },
      'version_id,nome'
    )
    const existingFamilyOffers = IMPORT_SKIP_EXISTING ? [] : await loadExistingFamilyOffers(savedFamily.id, treatmentNameById)
    const incomingOfferPlans = prepareIncomingOfferPlan(existingFamilyOffers, family.offers || [])
    const pendingOfferMerges = []

    for (const plan of incomingOfferPlans) {
      const offer = plan.offer
      if (IMPORT_LOG_OFFERS) {
        console.log(`[import] oferta: ${offer.canonical_label || offer.raw_label}`)
      }
      // IMPORTANT:
      // We compute "incoming semantic" (embedded treatment flags inferred from the label)
      // and must persist it. Otherwise, stale-cleanup will delete offers whose signature
      // only matches after enrichment (e.g. labels containing "Antirreflexo", "Transitions",
      // "Blue UV", etc.).
      const semanticOffer = buildIncomingOfferSemantic(offer)
      const offerClinicalCategory =
        offer.clinical_category || inferOfferClinicalCategory(semanticOffer, family, familyClinicalCategory)
      const offerRow = {
        family_id: savedFamily.id,
        import_key: buildOfferImportKey(offer),
        raw_label: offer.raw_label,
        canonical_label: offer.canonical_label || null,
        clinical_category: offerClinicalCategory,
        material: offer.material || null,
        indice_refracao: semanticOffer.indice_refracao ?? normalizeOfferIndex(offer),
        is_atomic_offer: offer.is_atomic_offer === true,
        allows_composition: offer.allows_composition !== false,
        already_includes_treatment: offer.already_includes_treatment === true,
        features: {
          ...(semanticOffer.features || offer.features || {}),
          ...(normalizeOfferCost(offer) != null ? { cost_price: normalizeOfferCost(offer) } : {}),
        },
        base_price: offer.base_price ?? null,
        source_page_reference: offer.source_page_reference || null,
        confidence_level: offer.confidence_level ?? null,
      }
      const savedOffer = plan.targetOffer
        ? await updateSingleById('global_lens_offers', plan.targetOffer.id, offerRow)
        : await upsertSingle('global_lens_offers', offerRow, 'family_id,import_key')

      const { error: deleteGridsError } = await withRetry(
        () =>
          supabase
            .from('global_offer_diopter_grids')
            .delete()
            .eq('offer_id', savedOffer.id),
        `delete:global_offer_diopter_grids:${savedOffer.id}`
      )

      if (deleteGridsError) throw deleteGridsError

      for (const grid of offer.diopter_grids || []) {
        const { error } = await withRetry(
          () =>
            supabase.from('global_offer_diopter_grids').insert({
              offer_id: savedOffer.id,
              sph_min: grid.sph_min,
              sph_max: grid.sph_max,
              cyl_min: grid.cyl_min ?? 0,
              cyl_max: grid.cyl_max ?? grid.cyl_min ?? 0,
              add_min: grid.add_min ?? null,
              add_max: grid.add_max ?? null,
              metadata: grid.metadata || {},
            }),
          `insert:global_offer_diopter_grids:${savedOffer.id}`
        )

        if (error) throw error
      }

      for (const compat of offer.compatible_treatments || []) {
        const treatmentId = treatmentIdByName.get(compat.treatment_name)
        if (!treatmentId) continue

        const { error } = await withRetry(
          () =>
            supabase
              .from('global_offer_treatments_compatibility')
              .upsert(
                {
                  offer_id: savedOffer.id,
                  treatment_id: treatmentId,
                  special_price: compat.special_price ?? null,
                  price_mode: compat.price_mode || 'final',
                  notes: null,
                },
                { onConflict: 'offer_id,treatment_id' }
              ),
          `upsert:global_offer_treatments_compatibility:${savedOffer.id}`
        )

        if (error) throw error
      }

      if (IMPORT_OFFER_THROTTLE_MS > 0) {
        await sleep(IMPORT_OFFER_THROTTLE_MS)
      }

      for (const duplicateOfferId of plan.duplicateOfferIds) {
        pendingOfferMerges.push({ targetId: savedOffer.id, duplicateId: duplicateOfferId })
      }
    }

    for (const mergeTask of pendingOfferMerges) {
      if (mergeTask.targetId === mergeTask.duplicateId) continue
      await mergeOfferReferences(mergeTask.targetId, mergeTask.duplicateId)
    }

    if (!IMPORT_SKIP_EXISTING) {
      await cleanupStaleFamilyOffers(savedFamily.id, family.offers || [], treatmentNameById)
    }

    if (IMPORT_THROTTLE_MS > 0) {
      await sleep(IMPORT_THROTTLE_MS)
    }
  }

  await cleanupStaleVersionFamilies(version.id, payload.families || [], treatmentNameById)

  return {
    versionId: version.id,
    documentId: document.id,
  }
}

async function main() {
  const payload = readJson(inputArg)
  const summary = buildSummary(payload)

  console.log('Resumo do payload:')
  console.table(summary)

  if (!shouldCommit) {
    console.log('Dry-run finalizado. Use --commit para gravar no Supabase.')
    return
  }

  const result = await importPayload(payload)
  console.log('Importacao concluida com sucesso:')
  console.table(result)
}

main().catch((error) => {
  console.error('Falha ao importar catalogo global:', error.message || error)
  process.exit(1)
})
