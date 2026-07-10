require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const commit = process.argv.includes('--commit')

const ESSILOR_VERSION_ID = '99497d03-50bf-46b7-a7ab-8cb19e80db5a'
const OPTILAB_VERSION_ID = 'a4886a73-bc92-4b14-9c47-152ef0c78078'
const STORE_ID = 1
const CANONICAL_NAME = 'Varilux Physio Extensee'

const PROFILE = {
  usage_tags: ['dirigir_noite', 'computador', 'leitura', 'uso_geral'],
  benefit_tags: ['nitidez', 'contraste', 'conforto_baixa_luz', 'qualidade_optica'],
  commercial_summary:
    'Progressiva Varilux Physio Extensee. A tabela Essilor importou a familia como Varilux Physio, mas as ofertas de origem indicam Physio.extensee.',
  recommendation_notes:
    'Tratar Varilux Physio, Physio.extensee e Varilux Physio Extensee como a mesma lente comercial. Diferencas entre catalogos refletem materiais, tratamentos e recortes comerciais.',
  source_page_reference: 'Conciliado Essilor PVC/PVO p.6 x Optilab p.15-16',
}

function mergeFeatures(features, patch) {
  return { ...(features && typeof features === 'object' ? features : {}), ...patch }
}

function normalizePhysioLabel(value) {
  if (!value || typeof value !== 'string') return value
  return value
    .replace(/^Varilux Physio\.extensee\.\s*/i, `${CANONICAL_NAME} `)
    .replace(/^Varilux Physio Extensee\.\s*/i, `${CANONICAL_NAME} `)
    .replace(/^VARILUX® Physio® Extensee\s*/i, `${CANONICAL_NAME} `)
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
    .select('id,family_id,canonical_label,raw_label,features')
    .eq('family_id', familyId)
  if (error) throw error
  return data || []
}

async function upsertFamilyProfile(familyId) {
  const row = {
    family_id: familyId,
    offer_id: null,
    profile_scope: 'family',
    usage_tags: PROFILE.usage_tags,
    benefit_tags: PROFILE.benefit_tags,
    commercial_summary: PROFILE.commercial_summary,
    recommendation_notes: PROFILE.recommendation_notes,
    source_page_reference: PROFILE.source_page_reference,
  }

  const { data: existing, error: existingError } = await supabase
    .from('global_usage_profiles')
    .select('id')
    .eq('family_id', familyId)
    .eq('profile_scope', 'family')
    .maybeSingle()
  if (existingError) throw existingError

  if (existing) {
    console.log(`[profile:update] ${familyId}`)
    if (commit) {
      const { error } = await supabase.from('global_usage_profiles').update(row).eq('id', existing.id)
      if (error) throw error
    }
    return
  }

  console.log(`[profile:insert] ${familyId}`)
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

async function reconcileFamily(versionId, candidateNames, label) {
  const activationId = await getActiveActivation(versionId)
  const family = await findFamily(versionId, candidateNames)
  if (!family) {
    console.log(`[skip] ${label}: familia nao encontrada`)
    return
  }

  if (family.nome !== CANONICAL_NAME) {
    console.log(`[family:update] ${label}: ${family.nome} -> ${CANONICAL_NAME}`)
    if (commit) {
      const { error } = await supabase
        .from('global_lens_families')
        .update({
          nome: CANONICAL_NAME,
          design: 'Progressiva Digital (Physio Extensee)',
          clinical_category: 'multifocal',
          tags_uso: PROFILE.usage_tags,
          tags_beneficios: PROFILE.benefit_tags,
          description_marketing:
            'Varilux Physio Extensee. Identidade canonica para nomes de origem Varilux Physio e Physio.extensee.',
        })
        .eq('id', family.id)
      if (error) throw error
    }
  }

  await upsertFamilyProfile(family.id)

  const offers = await fetchOffers(family.id)
  let offerUpdates = 0
  let tenantUpdates = 0

  for (const offer of offers) {
    const nextCanonical = normalizePhysioLabel(offer.canonical_label)
    const nextRaw = normalizePhysioLabel(offer.raw_label)
    const nextFeatures = mergeFeatures(offer.features, {
      canonical_family_name: CANONICAL_NAME,
      source_family_aliases: ['Varilux Physio', 'Varilux Physio.extensee.', 'Varilux Physio Extensee'],
      equivalence_note: 'Varilux Physio conciliada como Varilux Physio Extensee entre Essilor p.6 e Optilab p.15-16.',
    })

    const changed =
      nextCanonical !== offer.canonical_label ||
      nextRaw !== offer.raw_label ||
      JSON.stringify(nextFeatures) !== JSON.stringify(offer.features || {})
    if (changed) offerUpdates += 1

    if (commit) {
      const { error } = await supabase
        .from('global_lens_offers')
        .update({ canonical_label: nextCanonical, raw_label: nextRaw, features: nextFeatures })
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

  console.log(`[offers] ${label}: normalizadas=${offerUpdates}; tenant display_name=${tenantUpdates}`)
}

async function main() {
  console.log(`[mode] ${commit ? 'COMMIT' : 'DRY RUN'}`)
  await reconcileFamily(ESSILOR_VERSION_ID, ['Varilux Physio', CANONICAL_NAME], 'Essilor')
  await reconcileFamily(OPTILAB_VERSION_ID, ['VARILUX® Physio® Extensee', CANONICAL_NAME], 'Optilab')
  console.log('[done]')
}

main().catch((error) => {
  console.error(error?.message || error)
  process.exit(1)
})
