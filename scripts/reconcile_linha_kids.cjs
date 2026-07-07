require('dotenv').config({ path: '.env.local' })
const crypto = require('crypto')
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const commit = process.argv.includes('--commit')

const ESSILOR_VERSION_ID = '99497d03-50bf-46b7-a7ab-8cb19e80db5a'
const OPTILAB_VERSION_ID = 'a4886a73-bc92-4b14-9c47-152ef0c78078'
const STORE_ID = 1

const STELLEST = {
  canonicalName: 'Stellest',
  category: 'controle_miopia',
  design: 'Controle de Miopia Infantil',
  aliases: ['Stellest', 'Stellest 2.0', 'Stellest Sun'],
  usage_tags: ['criancas', 'controle_miopia', 'estudo'],
  benefit_tags: ['controle_miopia', 'nitidez', 'uso_infantil'],
  summary: 'Linha infantil Stellest para controle de miopia, conciliada entre Essilor e Optilab.',
}

const AIRWEAR_KIDS = {
  canonicalName: 'Airwear Kids',
  category: 'visao_simples',
  design: 'Visao Simples Infantil',
  aliases: ['Airwear Kids', 'Linha Kids Airwear'],
  usage_tags: ['criancas', 'uso_infantil', 'estudo'],
  benefit_tags: ['visao_nitida', 'uso_infantil', 'resistencia', 'leveza'],
  summary:
    'Lentes infantis Airwear da Optilab, mantidas separadas de Stellest porque nao sao controle de miopia.',
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
  if (label.includes('stellest')) return 'stellest'
  if (label.includes('airwear')) return 'airwearKids'
  return null
}

function normalizeOfferLabel(value, targetKey) {
  if (!value || typeof value !== 'string') return value
  if (targetKey === 'stellest') {
    return value.replace(/^LINHA KIDS CONTROLE DA MIOPIA INFANTIL\s*/i, '')
  }
  if (targetKey === 'airwearKids') {
    return value.replace(/^LINHA KIDS Airwear/i, 'Airwear Kids')
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

async function ensureFamily(sourceFamily, target) {
  const existing = await findFamily(OPTILAB_VERSION_ID, [target.canonicalName])
  if (existing) return existing

  const row = {
    id: crypto.randomUUID(),
    version_id: sourceFamily.version_id,
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

  console.log(`[family:insert] ${target.canonicalName}`)
  if (commit) {
    const { data, error } = await supabase.from('global_lens_families').insert(row).select('*').single()
    if (error) throw error
    return data
  }
  return row
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
      target.canonicalName === 'Stellest'
        ? 'Tratar Stellest, Stellest 2.0 e Stellest Sun como a familia de controle de miopia Stellest; variacoes indicam versao/solar.'
        : 'Nao conciliar com Stellest nem Eyezen Kids; o catalogo fonte identifica apenas Airwear infantil.',
    source_page_reference: 'Conciliado Essilor p.11 x Optilab p.26',
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

async function normalizeEssilorStellest() {
  const family = await findFamily(ESSILOR_VERSION_ID, ['Stellest'])
  if (!family) return
  await upsertFamilyProfile(family.id, STELLEST)
}

async function main() {
  console.log(`[mode] ${commit ? 'COMMIT' : 'DRY RUN'}`)
  const activationId = await getActiveActivation(OPTILAB_VERSION_ID)
  const sourceFamily = await findFamily(OPTILAB_VERSION_ID, ['Linha Kids', AIRWEAR_KIDS.canonicalName])
  if (!sourceFamily) throw new Error('Familia Linha Kids/Airwear Kids nao encontrada na Optilab')

  if (sourceFamily.nome !== AIRWEAR_KIDS.canonicalName) {
    console.log(`[family:rename] ${sourceFamily.nome} -> ${AIRWEAR_KIDS.canonicalName}`)
    if (commit) {
      const { error } = await supabase
        .from('global_lens_families')
        .update({
          nome: AIRWEAR_KIDS.canonicalName,
          design: AIRWEAR_KIDS.design,
          clinical_category: AIRWEAR_KIDS.category,
          tags_uso: AIRWEAR_KIDS.usage_tags,
          tags_beneficios: AIRWEAR_KIDS.benefit_tags,
          description_marketing: AIRWEAR_KIDS.summary,
        })
        .eq('id', sourceFamily.id)
      if (error) throw error
    }
  }
  await upsertFamilyProfile(sourceFamily.id, AIRWEAR_KIDS)

  const optilabStellest = await ensureFamily(sourceFamily, STELLEST)
  await upsertFamilyProfile(optilabStellest.id, STELLEST)
  await normalizeEssilorStellest()

  const sourceOffers = await fetchOffers(sourceFamily.id)
  let offerUpdates = 0
  let tenantUpdates = 0
  for (const offer of sourceOffers) {
    const targetKey = inferTarget(offer)
    if (!targetKey) throw new Error(`Oferta Linha Kids sem destino: ${offer.canonical_label || offer.raw_label}`)

    const target = targetKey === 'stellest' ? STELLEST : AIRWEAR_KIDS
    const targetFamilyId = targetKey === 'stellest' ? optilabStellest.id : sourceFamily.id
    const nextCanonical = normalizeOfferLabel(offer.canonical_label, targetKey)
    const nextRaw = normalizeOfferLabel(offer.raw_label, targetKey)
    const nextFeatures = mergeFeatures(offer.features, {
      split_from_family_name: 'Linha Kids',
      canonical_family_name: target.canonicalName,
      source_family_aliases: target.aliases,
      equivalence_note:
        targetKey === 'stellest'
          ? 'Stellest separado de Linha Kids Optilab p.26 e conciliado com Essilor p.11.'
          : 'Airwear Kids mantido separado de Stellest por nao ser controle de miopia.',
    })

    const changed =
      offer.family_id !== targetFamilyId ||
      offer.canonical_label !== nextCanonical ||
      offer.raw_label !== nextRaw ||
      offer.clinical_category !== target.category ||
      JSON.stringify(offer.features || {}) !== JSON.stringify(nextFeatures)
    if (changed) offerUpdates += 1

    if (commit) {
      const { error } = await supabase
        .from('global_lens_offers')
        .update({
          family_id: targetFamilyId,
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

  console.log(`[offers] normalizadas/movidas=${offerUpdates}; tenant display_name=${tenantUpdates}`)
  console.log('[done]')
}

main().catch((error) => {
  console.error(error?.message || error)
  process.exit(1)
})
