require('dotenv').config({ path: '.env.local' })
const crypto = require('crypto')
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const commit = process.argv.includes('--commit')

const ESSILOR_VERSION_ID = '99497d03-50bf-46b7-a7ab-8cb19e80db5a'
const OPTILAB_VERSION_ID = 'a4886a73-bc92-4b14-9c47-152ef0c78078'
const GAMALAB_VERSION_ID = 'bcdd6a40-3476-438a-b0cf-b86fc7bb0c03'
const STORE_ID = 1

const TARGETS = {
  interview: {
    canonicalName: 'Interview',
    category: 'ocupacional',
    design: 'Visão Intermediária / Ocupacional',
    aliases: ['Interview', 'Essilor Interview', 'Visão Intermediária Essilor Interview'],
    usage_tags: ['intermediario', 'computador', 'leitura', 'escritorio'],
    benefit_tags: ['campo_intermediario', 'conforto_proximo', 'ergonomia_visual'],
    summary: 'Linha ocupacional/intermediaria Interview, separada do guarda-chuva Lentes Essilor.',
  },
  surfacada: {
    canonicalName: 'VS Essilor Surfaçada',
    category: 'visao_simples',
    design: 'Visão Simples Surfaçada',
    aliases: ['VS Essilor Surfaçada', 'Lentes Visão Simples Surfaçadas'],
    usage_tags: ['visao_simples', 'surfacada', 'grau_personalizado', 'uso_diario'],
    benefit_tags: ['correcao_visual', 'ampla_disponibilidade', 'tratamentos_essilor'],
    summary: 'Visão simples surfacada Essilor, separada do guarda-chuva Lentes Essilor.',
  },
  prontas: {
    canonicalName: 'Lentes Essilor Prontas',
    category: 'visao_simples',
    design: 'Visão Simples Pronta',
    aliases: ['Lentes Essilor Prontas', 'Lentes Essilor Airwear', 'Lentes Essilor Orma'],
    usage_tags: ['visao_simples', 'pronta', 'uso_diario'],
    benefit_tags: ['correcao_visual', 'ampla_disponibilidade', 'tratamentos_essilor'],
    summary: 'Lentes Essilor prontas de visão simples, mantidas separadas de Interview e VS surfaçada.',
  },
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function mergeFeatures(features, patch) {
  return { ...(features && typeof features === 'object' ? features : {}), ...patch }
}

function inferTarget(offer) {
  const label = normalize(`${offer.canonical_label || ''} ${offer.raw_label || ''}`)
  if (label.includes('interview')) return 'interview'
  if (label.includes('visao simples surfacadas') || label.includes('vs essilor surfacada')) return 'surfacada'
  if (
    label.includes('pronta') ||
    label.includes('lentes essilor') ||
    label.includes('airwear') ||
    label.includes('orma') ||
    label.includes('stylis')
  ) {
    return 'prontas'
  }
  return null
}

function stripLeadingPipe(value) {
  return value.replace(/^\s*\|\s*/, '').trim()
}

function normalizeOfferLabel(value, targetKey) {
  if (!value || typeof value !== 'string') return value

  if (targetKey === 'interview') {
    return stripLeadingPipe(
      value
        .replace(/^LENTES ESSILOR® VISÃO INTERMEDIÁRIA Essilor Interview\s*/i, 'Interview ')
        .replace(/^Essilor Interview Visão Intermediária\s*/i, 'Interview ')
        .replace(/^Essilor Interview\s*/i, 'Interview '),
    )
  }

  if (targetKey === 'surfacada') {
    return stripLeadingPipe(
      value
        .replace(/^LENTES ESSILOR® LENTES VISÃO SIMPLES SURFAÇADAS\s*/i, 'VS Essilor Surfaçada ')
        .replace(/^VS Essilor Surfaçada Surfaçada\s*/i, 'VS Essilor Surfaçada ')
        .replace(/^VS Essilor Surfaçada\s+Surfaçada\s*/i, 'VS Essilor Surfaçada '),
    )
  }

  if (targetKey === 'prontas') {
    const normalized = value
      .replace(/^LENTES ESSILOR®\s*/i, '')
      .replace(/^Pronta\s*/i, '')
      .trim()
    return normalized.startsWith('Lentes Essilor Prontas')
      ? normalized
      : `Lentes Essilor Prontas ${normalized}`
  }

  return value
}

async function getActiveActivation(versionId) {
  const { data, error } = await supabase
    .from('tenant_catalog_activations')
    .select('id')
    .eq('store_id', STORE_ID)
    .eq('global_version_id', versionId)
    .eq('status', 'active')
    .maybeSingle()
  if (error) throw error
  return data?.id || null
}

async function findFamily(versionId, names) {
  for (const name of names) {
    const { data, error } = await supabase
      .from('global_lens_families')
      .select('*')
      .eq('version_id', versionId)
      .eq('nome', name)
      .maybeSingle()
    if (error) throw error
    if (data) return data
  }
  return null
}

async function fetchOffers(familyId) {
  const { data, error } = await supabase
    .from('global_lens_offers')
    .select('id,family_id,canonical_label,raw_label,clinical_category,features')
    .eq('family_id', familyId)
  if (error) throw error
  return data || []
}

async function ensureFamily(versionId, sourceFamily, target) {
  const existing = await findFamily(versionId, [target.canonicalName])
  if (existing) return existing

  const row = {
    id: crypto.randomUUID(),
    version_id: versionId,
    source_document_id: sourceFamily.source_document_id,
    nome: target.canonicalName,
    design: target.design,
    description_marketing: target.summary,
    tags_uso: target.usage_tags,
    tags_beneficios: target.benefit_tags,
    source_page_reference: sourceFamily.source_page_reference,
    clinical_category: target.category,
    geometry_id: null,
  }

  console.log(`[family:insert] ${target.canonicalName} (${versionId})`)
  if (commit) {
    const { data, error } = await supabase.from('global_lens_families').insert(row).select('*').single()
    if (error) throw error
    return data
  }
  return row
}

async function renameResidualFamily(family, target) {
  if (family.nome === target.canonicalName) return
  console.log(`[family:rename] ${family.nome} -> ${target.canonicalName}`)
  if (commit) {
    const { error } = await supabase
      .from('global_lens_families')
      .update({
        nome: target.canonicalName,
        design: target.design,
        clinical_category: target.category,
        tags_uso: target.usage_tags,
        tags_beneficios: target.benefit_tags,
        description_marketing: target.summary,
      })
      .eq('id', family.id)
    if (error) throw error
  }
}

async function upsertFamilyProfile(familyId, target) {
  const row = {
    family_id: familyId,
    offer_id: null,
    profile_scope: 'family',
    usage_tags: target.usage_tags,
    benefit_tags: target.benefit_tags,
    commercial_summary: target.summary,
    recommendation_notes:
      target.canonicalName === 'Interview'
        ? 'Tratar Interview e Essilor Interview como a mesma lente ocupacional/intermediaria.'
        : target.canonicalName === 'VS Essilor Surfaçada'
          ? 'Tratar as variações VS Essilor Surfaçada e Lentes Visão Simples Surfaçadas como a mesma família de visão simples surfacada.'
          : 'Não conciliar com Interview nem VS surfaçada; este grupo residual contém lentes prontas de visão simples.',
    source_page_reference: 'Conciliado Essilor p.12 x Optilab p.28-29',
  }

  const { data: existing, error: existingError } = await supabase
    .from('global_usage_profiles')
    .select('id')
    .eq('family_id', familyId)
    .eq('profile_scope', 'family')
    .maybeSingle()
  if (existingError) throw existingError

  if (existing) {
    console.log(`[profile:update] ${target.canonicalName}`)
    if (commit) {
      const { error } = await supabase.from('global_usage_profiles').update(row).eq('id', existing.id)
      if (error) throw error
    }
    return
  }

  console.log(`[profile:insert] ${target.canonicalName}`)
  if (commit) {
    const { error } = await supabase.from('global_usage_profiles').insert(row)
    if (error) throw error
  }
}

async function updateTenantDisplayName(activationId, offerId, oldCanonical, oldRaw, nextCanonical) {
  if (!activationId) return false
  const { data: tenantRow, error } = await supabase
    .from('tenant_commercial_offers')
    .select('id,display_name')
    .eq('activation_id', activationId)
    .eq('global_offer_id', offerId)
    .maybeSingle()
  if (error) throw error
  if (!tenantRow || tenantRow.display_name === nextCanonical) return false

  const current = tenantRow.display_name
  const isDefault = current == null || current === oldCanonical || current === oldRaw
  if (!isDefault) return false

  if (commit) {
    const { error: updateError } = await supabase
      .from('tenant_commercial_offers')
      .update({ display_name: nextCanonical || null })
      .eq('id', tenantRow.id)
    if (updateError) throw updateError
  }
  return true
}

async function normalizeExistingFamily(versionId, targetKey) {
  const target = TARGETS[targetKey]
  const family = await findFamily(versionId, [target.canonicalName])
  if (!family) return
  await upsertFamilyProfile(family.id, target)

  const activationId = await getActiveActivation(versionId)
  const offers = await fetchOffers(family.id)
  let offerUpdates = 0
  let tenantUpdates = 0
  for (const offer of offers) {
    const nextCanonical = normalizeOfferLabel(offer.canonical_label, targetKey)
    const nextRaw = normalizeOfferLabel(offer.raw_label, targetKey)
    const nextFeatures = mergeFeatures(offer.features, {
      canonical_family_name: target.canonicalName,
      source_family_aliases: target.aliases,
    })
    const changed =
      offer.canonical_label !== nextCanonical ||
      offer.raw_label !== nextRaw ||
      offer.clinical_category !== target.category ||
      JSON.stringify(offer.features || {}) !== JSON.stringify(nextFeatures)
    if (changed) offerUpdates += 1
    if (commit) {
      const { error } = await supabase
        .from('global_lens_offers')
        .update({
          canonical_label: nextCanonical,
          raw_label: nextRaw,
          clinical_category: target.category,
          features: nextFeatures,
        })
        .eq('id', offer.id)
      if (error) throw error
    }
    const tenantChanged = await updateTenantDisplayName(
      activationId,
      offer.id,
      offer.canonical_label,
      offer.raw_label,
      nextCanonical,
    )
    if (tenantChanged) tenantUpdates += 1
  }
  console.log(`[existing:${target.canonicalName}] ofertas=${offerUpdates}; tenant display_name=${tenantUpdates}`)
}

async function reconcileVersion(versionId, label) {
  const activationId = await getActiveActivation(versionId)
  const sourceFamily = await findFamily(versionId, ['Lentes Essilor', TARGETS.prontas.canonicalName])
  if (!sourceFamily) {
    console.log(`[skip] ${label}: Lentes Essilor nao encontrada`)
    return
  }

  const interviewFamily = await ensureFamily(versionId, sourceFamily, TARGETS.interview)
  const surfacadaFamily = await ensureFamily(versionId, sourceFamily, TARGETS.surfacada)
  await renameResidualFamily(sourceFamily, TARGETS.prontas)

  await upsertFamilyProfile(interviewFamily.id, TARGETS.interview)
  await upsertFamilyProfile(surfacadaFamily.id, TARGETS.surfacada)
  await upsertFamilyProfile(sourceFamily.id, TARGETS.prontas)

  const targetFamilies = {
    interview: interviewFamily.id,
    surfacada: surfacadaFamily.id,
    prontas: sourceFamily.id,
  }

  const sourceOffers = await fetchOffers(sourceFamily.id)
  let offerUpdates = 0
  let tenantUpdates = 0
  for (const offer of sourceOffers) {
    const targetKey = inferTarget(offer)
    if (!targetKey) throw new Error(`Oferta Lentes Essilor sem destino: ${offer.canonical_label || offer.raw_label}`)
    const target = TARGETS[targetKey]
    const nextFamilyId = targetFamilies[targetKey]
    const nextCanonical = normalizeOfferLabel(offer.canonical_label, targetKey)
    const nextRaw = normalizeOfferLabel(offer.raw_label, targetKey)
    const nextFeatures = mergeFeatures(offer.features, {
      split_from_family_name: 'Lentes Essilor',
      canonical_family_name: target.canonicalName,
      source_family_aliases: target.aliases,
      equivalence_note:
        targetKey === 'interview'
          ? 'Interview separado de Lentes Essilor e conciliado como familia ocupacional propria.'
          : targetKey === 'surfacada'
            ? 'VS Essilor Surfaçada separado de Lentes Essilor como familia de visão simples surfacada.'
            : 'Lentes Essilor Prontas mantidas como residual de visão simples pronta.',
    })
    const changed =
      offer.family_id !== nextFamilyId ||
      offer.canonical_label !== nextCanonical ||
      offer.raw_label !== nextRaw ||
      offer.clinical_category !== target.category ||
      JSON.stringify(offer.features || {}) !== JSON.stringify(nextFeatures)
    if (changed) offerUpdates += 1
    if (commit) {
      const { error } = await supabase
        .from('global_lens_offers')
        .update({
          family_id: nextFamilyId,
          canonical_label: nextCanonical,
          raw_label: nextRaw,
          clinical_category: target.category,
          features: nextFeatures,
        })
        .eq('id', offer.id)
      if (error) throw error
    }
    const tenantChanged = await updateTenantDisplayName(
      activationId,
      offer.id,
      offer.canonical_label,
      offer.raw_label,
      nextCanonical,
    )
    if (tenantChanged) tenantUpdates += 1
  }

  console.log(`[${label}] ofertas normalizadas/movidas=${offerUpdates}; tenant display_name=${tenantUpdates}`)
}

async function main() {
  console.log(`[mode] ${commit ? 'COMMIT' : 'DRY RUN'}`)
  await reconcileVersion(ESSILOR_VERSION_ID, 'Essilor')
  await reconcileVersion(OPTILAB_VERSION_ID, 'Optilab')
  await normalizeExistingFamily(GAMALAB_VERSION_ID, 'interview')
  await normalizeExistingFamily(ESSILOR_VERSION_ID, 'surfacada')
  console.log('[done]')
}

main().catch((error) => {
  console.error(error?.message || error)
  process.exit(1)
})
