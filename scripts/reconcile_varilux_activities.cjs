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

const TARGETS = {
  digitimeMid: {
    canonicalName: 'Varilux Digitime.mid',
    aliases: ['Varilux Digitime.mid', 'Varilux Digitime mid'],
    category: 'ocupacional',
    design: 'Ocupacional Digital (Digitime.mid)',
    usage_tags: ['computador', 'leitura', 'escritorio', 'intermediario'],
    benefit_tags: ['campo_intermediario', 'ergonomia_visual', 'conforto_proximo'],
    summary: 'Ocupacional digital Varilux Digitime.mid, separada do guarda-chuva Varilux Activities da Optilab.',
  },
  digitimeNear: {
    canonicalName: 'Varilux Digitime.near',
    aliases: ['Varilux Digitime.near', 'Varilux Digitime near'],
    category: 'ocupacional',
    design: 'Ocupacional Digital (Digitime.near)',
    usage_tags: ['leitura', 'computador', 'escritorio', 'perto'],
    benefit_tags: ['campo_perto', 'ergonomia_visual', 'conforto_proximo'],
    summary: 'Ocupacional digital Varilux Digitime.near, separada do guarda-chuva Varilux Activities da Optilab.',
  },
  roadpilot: {
    canonicalName: 'Varilux Roadpilot',
    aliases: ['Varilux Roadpilot'],
    category: 'ocupacional',
    design: 'Ocupacional Digital (Roadpilot)',
    usage_tags: ['dirigir', 'dirigir_noite', 'uso_externo', 'longe'],
    benefit_tags: ['conforto_ao_dirigir', 'campo_visual_ao_dirigir', 'seguranca_visual'],
    summary: 'Ocupacional Varilux Roadpilot para direcao, separada do guarda-chuva Varilux Activities da Optilab.',
  },
  sport: {
    canonicalName: 'Varilux Sport',
    aliases: ['Varilux Sport', 'Varilux Sportwrap', 'Varilux Sport / Sportwrap'],
    category: 'multifocal',
    design: 'Esportivo Digital',
    usage_tags: ['esporte', 'uso_externo', 'uso_dinamico', 'dirigir'],
    benefit_tags: ['campo_visual_esportivo', 'estabilidade_visual', 'conforto_visual'],
    summary: 'Multifocal esportiva Varilux Sport/Sportwrap, separada do guarda-chuva Varilux Activities da Optilab.',
  },
}

const COLORACAO = {
  canonicalName: 'Varilux Activities Coloração',
  category: 'multifocal',
  design: 'Coloração Varilux Activities',
  usage_tags: ['uso_externo', 'coloracao', 'solar'],
  benefit_tags: ['coloracao', 'personalizacao', 'uso_externo'],
  summary:
    'Bloco de coloracao Varilux Activities. Mantido separado porque a oferta Optilab nao identifica se pertence a Digitime, Roadpilot ou Sport.',
}

function mergeFeatures(features, patch) {
  return { ...(features && typeof features === 'object' ? features : {}), ...patch }
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function inferTarget(offer) {
  const label = normalize(`${offer.canonical_label || ''} ${offer.raw_label || ''}`)
  if (label.includes('digitime mid')) return 'digitimeMid'
  if (label.includes('digitime near')) return 'digitimeNear'
  if (label.includes('roadpilot')) return 'roadpilot'
  if (label.includes('sport')) return 'sport'
  if (label.includes('coloracao')) return 'coloracao'
  return null
}

function normalizeOfferLabel(value, targetKey) {
  if (!value || typeof value !== 'string') return value
  if (targetKey === 'digitimeMid') {
    return value.replace(/^VARILUX® ACTIVITIES DIGITAL Varilux Digitime mid\s*/i, 'Varilux Digitime.mid ')
  }
  if (targetKey === 'digitimeNear') {
    return value.replace(/^VARILUX® ACTIVITIES DIGITAL Varilux Digitime near\s*/i, 'Varilux Digitime.near ')
  }
  if (targetKey === 'roadpilot') {
    return value.replace(/^VARILUX® ACTIVITIES DIGITAL Varilux Roadpilot\s*/i, 'Varilux Roadpilot ')
  }
  if (targetKey === 'sport') {
    return value.replace(/^VARILUX® ACTIVITIES DIGITAL Varilux Sport \/ Sportwrap\s*/i, 'Varilux Sport ')
  }
  if (targetKey === 'coloracao') {
    return value.replace(/^VARILUX® ACTIVITIES COLORAÇÃO Varilux Activities\s*/i, 'Varilux Activities Coloração ')
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
      target.canonicalName === COLORACAO.canonicalName
        ? 'Nao conciliar automaticamente com Digitime, Roadpilot ou Sport; o catalogo fonte nao explicita a sublente real.'
        : `Tratar ofertas ${target.aliases.join(', ')} como ${target.canonicalName}.`,
    source_page_reference: 'Conciliado Essilor p.9 x Optilab p.20',
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

async function normalizeExistingEssilorFamilies() {
  for (const target of Object.values(TARGETS)) {
    const family = await findFamily(ESSILOR_VERSION_ID, [target.canonicalName])
    if (!family) continue
    await upsertFamilyProfile(family.id, target)
  }
}

async function main() {
  console.log(`[mode] ${commit ? 'COMMIT' : 'DRY RUN'}`)
  const activationId = await getActiveActivation(OPTILAB_VERSION_ID)
  const sourceFamily = await findFamily(OPTILAB_VERSION_ID, ['Varilux Activities', COLORACAO.canonicalName])
  if (!sourceFamily) throw new Error('Familia Varilux Activities/Coloracao nao encontrada na Optilab')

  const sourceOffers = await fetchOffers(sourceFamily.id)
  const sourceHasOnlyColoracao = sourceOffers.length > 0 && sourceOffers.every((offer) => inferTarget(offer) === 'coloracao')

  if (sourceFamily.nome !== COLORACAO.canonicalName) {
    console.log(`[family:rename] ${sourceFamily.nome} -> ${COLORACAO.canonicalName}`)
    if (commit) {
      const { error } = await supabase
        .from('global_lens_families')
        .update({
          nome: COLORACAO.canonicalName,
          design: COLORACAO.design,
          clinical_category: COLORACAO.category,
          tags_uso: COLORACAO.usage_tags,
          tags_beneficios: COLORACAO.benefit_tags,
          description_marketing: COLORACAO.summary,
        })
        .eq('id', sourceFamily.id)
      if (error) throw error
    }
  }
  await upsertFamilyProfile(sourceFamily.id, COLORACAO)

  const targetFamilies = {}
  for (const [key, target] of Object.entries(TARGETS)) {
    targetFamilies[key] = await ensureFamily(sourceFamily, target)
    await upsertFamilyProfile(targetFamilies[key].id, target)
  }

  let offerUpdates = 0
  let tenantUpdates = 0
  for (const offer of sourceOffers) {
    const targetKey = inferTarget(offer)
    if (!targetKey) throw new Error(`Oferta Varilux Activities sem destino: ${offer.canonical_label || offer.raw_label}`)

    const target = targetKey === 'coloracao' ? COLORACAO : TARGETS[targetKey]
    const targetFamilyId = targetKey === 'coloracao' ? sourceFamily.id : targetFamilies[targetKey].id
    const nextCanonical = normalizeOfferLabel(offer.canonical_label, targetKey)
    const nextRaw = normalizeOfferLabel(offer.raw_label, targetKey)
    const nextFeatures = mergeFeatures(offer.features, {
      split_from_family_name: 'Varilux Activities',
      canonical_family_name: target.canonicalName,
      source_family_aliases: targetKey === 'coloracao' ? ['Varilux Activities Coloração'] : target.aliases,
      equivalence_note:
        targetKey === 'coloracao'
          ? 'Bloco de coloracao mantido separado por falta de sublente explicita no catalogo Optilab p.20.'
          : `${target.canonicalName} separada de Varilux Activities Optilab p.20 e conciliada com Essilor p.9.`,
      ...(targetKey === 'sport' ? { sportwrap_source_label: true } : {}),
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

  await normalizeExistingEssilorFamilies()
  console.log(`[offers] normalizadas/movidas=${offerUpdates}; tenant display_name=${tenantUpdates}`)
  if (sourceHasOnlyColoracao) console.log('[info] familia fonte ja estava reduzida ao bloco de coloracao')
  console.log('[done]')
}

main().catch((error) => {
  console.error(error?.message || error)
  process.exit(1)
})
