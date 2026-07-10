require('dotenv').config({ path: '.env.local' })
const crypto = require('crypto')
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const commit = process.argv.includes('--commit')

const HOYA_VERSION_ID = '08f91e88-40f5-4521-b476-d09c7f1955cf'
const GAMALAB_VERSION_ID = 'bcdd6a40-3476-438a-b0cf-b86fc7bb0c03'
const OPTILAB_VERSION_ID = 'a4886a73-bc92-4b14-9c47-152ef0c78078'
const STORE_ID = 1

const ARGOS_CANONICAL_PROFILE = {
  usage_tags: ['uso_geral', 'leitura', 'dirigir', 'custo_beneficio'],
  benefit_tags: ['custo_beneficio', 'adaptacao_tradicional', 'versatilidade', 'progressiva_standard'],
  commercial_summary: 'Progressiva Argos standard, voltada a uso geral e custo-beneficio.',
  recommendation_notes:
    'Argos, ARGOS e Hoyalux Argos representam a mesma linha base. Laboratorios diferentes podem trazer recortes, materiais e precos distintos.',
  source_page_reference: 'Conciliado HOYA p.28 x Gamalab p.20',
}

const ESPACE_SPLIT_PROFILES = {
  'Espace Plus Digital': {
    usage_tags: ['uso_geral', 'computador', 'leitura', 'dirigir'],
    benefit_tags: ['versatilidade', 'conforto_visual', 'fotossensivel', 'opcoes_materiais', 'digital'],
    commercial_summary: 'Sublinha Espace Plus Digital da Optilab/Essilor, separada do antigo guarda-chuva LENTES ESPACE.',
    recommendation_notes:
      'Tratar como sublinha propria. Nao conciliar automaticamente com Espace, Espace Plus ou Espace Short de outros catalogos nesta etapa.',
  },
  'Espace Plus Tradicional': {
    usage_tags: ['uso_geral', 'leitura', 'dirigir'],
    benefit_tags: ['versatilidade', 'conforto_visual', 'fotossensivel', 'opcoes_materiais'],
    commercial_summary: 'Sublinha Espace Plus Tradicional da Optilab/Essilor, separada do antigo guarda-chuva LENTES ESPACE.',
    recommendation_notes:
      'Tratar como sublinha propria. Mantem distancia de Espace Tradicional e de familias Espace importadas de outros catalogos.',
  },
  'Espace Tradicional': {
    usage_tags: ['uso_geral', 'leitura', 'dirigir'],
    benefit_tags: ['versatilidade', 'conforto_visual', 'adaptacao_suave'],
    commercial_summary: 'Sublinha Espace Tradicional da Optilab/Essilor, separada do antigo guarda-chuva LENTES ESPACE.',
    recommendation_notes:
      'Tratar como sublinha propria. Nao misturar com Espace Plus; o catalogo fonte mostra blocos separados.',
  },
}

const ESPACE_CANONICAL_PROFILES = {
  'Espace Plus': {
    usage_tags: ['uso_geral', 'computador', 'leitura', 'dirigir'],
    benefit_tags: ['versatilidade', 'conforto_visual', 'fotossensivel', 'opcoes_materiais'],
    commercial_summary:
      'Progressiva Espace Plus. Nomes de origem incluem Espace Plus Digital e Espace Plus Tradicional no catalogo Optilab.',
    recommendation_notes:
      'Tratar Espace Plus, Espace Plus Digital e Espace Plus Tradicional como a mesma lente comercial; materiais, tratamentos e precos podem variar por laboratorio/catalogo.',
    source_page_reference: 'Conciliado Optilab p.37 x Gamalab p.20',
  },
  Espace: {
    usage_tags: ['uso_geral', 'leitura', 'dirigir'],
    benefit_tags: ['versatilidade', 'conforto_visual', 'adaptacao_suave'],
    commercial_summary:
      'Progressiva Espace. Nomes de origem incluem Espace Tradicional no catalogo Optilab.',
    recommendation_notes:
      'Tratar Espace e Espace Tradicional como a mesma lente comercial. Nao conciliar com Espace Plus nem com Espace Short.',
    source_page_reference: 'Conciliado Optilab p.37 x Gamalab p.20',
  },
}

function mergeFeatures(features, patch) {
  return { ...(features && typeof features === 'object' ? features : {}), ...patch }
}

function replaceStart(value, from, to) {
  if (!value || typeof value !== 'string') return value
  return value.startsWith(from) ? `${to}${value.slice(from.length)}` : value
}

function inferEspaceTarget(offer) {
  const label = `${offer.canonical_label || ''} ${offer.raw_label || ''}`
  if (label.includes('Espace Plus Digital')) return 'Espace Plus Digital'
  if (label.includes('Espace Plus Tradicional')) return 'Espace Plus Tradicional'
  if (label.includes('Espace Tradicional')) return 'Espace Tradicional'
  if (label.includes('LENTES ESPACE') && label.includes('DIGITAL')) return 'Espace Plus Digital'
  return null
}

function renameEspaceLabel(value, targetName) {
  if (!value || typeof value !== 'string') return value
  if (targetName === 'Espace Plus Digital') {
    return replaceStart(value, 'LENTES ESPACE® DIGITAL ', 'Espace Plus Digital ')
  }
  if (targetName === 'Espace Plus Tradicional') {
    return replaceStart(value, 'LENTES ESPACE® TRADICIONAL Espace Plus Tradicional ', 'Espace Plus Tradicional ')
  }
  if (targetName === 'Espace Tradicional') {
    return replaceStart(value, 'LENTES ESPACE® TRADICIONAL Espace Tradicional ', 'Espace Tradicional ')
  }
  return value
}

function renameEspaceCanonicalLabel(value, canonicalName) {
  if (!value || typeof value !== 'string') return value
  if (canonicalName === 'Espace Plus') {
    let next = replaceStart(value, 'Espace Plus Digital ', 'Espace Plus ')
    next = replaceStart(next, 'Espace Plus Tradicional ', 'Espace Plus ')
    return next
  }
  if (canonicalName === 'Espace') {
    return replaceStart(value, 'Espace Tradicional ', 'Espace ')
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

async function findFamily(versionId, name) {
  const { data, error } = await supabase
    .from('global_lens_families')
    .select('*')
    .eq('version_id', versionId)
    .eq('nome', name)
    .maybeSingle()
  if (error) throw error
  return data || null
}

async function findFamilyLike(versionId, pattern) {
  const { data, error } = await supabase
    .from('global_lens_families')
    .select('*')
    .eq('version_id', versionId)
    .ilike('nome', pattern)
    .maybeSingle()
  if (error) throw error
  return data || null
}

async function findFirstFamily(versionId, names) {
  for (const name of names) {
    const family = await findFamily(versionId, name)
    if (family) return family
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

async function upsertFamilyProfile(familyId, profile) {
  const row = {
    family_id: familyId,
    offer_id: null,
    profile_scope: 'family',
    usage_tags: profile.usage_tags,
    benefit_tags: profile.benefit_tags,
    commercial_summary: profile.commercial_summary,
    recommendation_notes: profile.recommendation_notes,
    source_page_reference: profile.source_page_reference || 'Conciliacao catalogo global',
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
  if (!tenantRow) return false

  const current = tenantRow.display_name
  if (current === nextCanonical) return false
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

async function reconcileArgos() {
  const targets = [
    { versionId: HOYA_VERSION_ID, labels: ['Argos', 'ARGOS', 'Hoyalux Argos'], design: 'Progressiva Standard (ARGOS Freeform)' },
    { versionId: GAMALAB_VERSION_ID, labels: ['Argos', 'Hoyalux Argos', 'ARGOS'], design: 'Progressiva Standard' },
  ]

  for (const target of targets) {
    const activationId = await getActiveActivation(target.versionId)
    let family = null
    for (const label of target.labels) {
      family = await findFamily(target.versionId, label)
      if (family) break
    }

    if (!family) {
      console.log(`[argos:skip] familia Argos nao encontrada na versao ${target.versionId}`)
      continue
    }

    console.log(`[argos] familia ${family.nome} -> Argos (${target.versionId})`)
    if (commit) {
      const { error } = await supabase
        .from('global_lens_families')
        .update({
          nome: 'Argos',
          design: target.design,
          description_marketing:
            'Argos. Progressiva standard de custo-beneficio; nomes de origem incluem ARGOS e Hoyalux Argos.',
          tags_uso: ARGOS_CANONICAL_PROFILE.usage_tags,
          tags_beneficios: ARGOS_CANONICAL_PROFILE.benefit_tags,
        })
        .eq('id', family.id)
      if (error) throw error
    }

    await upsertFamilyProfile(family.id, ARGOS_CANONICAL_PROFILE)

    const offers = await fetchOffers(family.id)
    let offerUpdates = 0
    let tenantUpdates = 0
    for (const offer of offers) {
      let nextCanonical = offer.canonical_label || offer.raw_label || ''
      nextCanonical = replaceStart(nextCanonical, 'Hoyalux Argos ', 'Argos ')
      nextCanonical = replaceStart(nextCanonical, 'ARGOS ', 'Argos ')
      const nextFeatures = mergeFeatures(offer.features, {
        canonical_family_name: 'Argos',
        source_family_aliases: ['ARGOS', 'Hoyalux Argos', 'Argos'],
        equivalence_note: 'Argos conciliada entre HOYA p.28 e Gamalab p.20.',
      })
      const changed = nextCanonical !== offer.canonical_label
      if (changed) offerUpdates += 1
      if (commit) {
        const { error } = await supabase
          .from('global_lens_offers')
          .update({ canonical_label: nextCanonical, features: nextFeatures })
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
    console.log(`[argos] ofertas renomeadas: ${offerUpdates}; tenant display_name: ${tenantUpdates}`)
  }

  const { data: geometries, error: geometryError } = await supabase
    .from('global_lens_geometry')
    .select('id,family_name')
    .in('family_name', ['ARGOS', 'Hoyalux Argos', 'Argos'])
  if (geometryError) throw geometryError

  for (const geometry of geometries || []) {
    if (geometry.family_name === 'Argos') continue
    console.log(`[argos:geometry] ${geometry.family_name} -> Argos`)
    if (commit) {
      const { error } = await supabase
        .from('global_lens_geometry')
        .update({ family_name: 'Argos' })
        .eq('id', geometry.id)
      if (error) throw error
    }
  }
}

async function ensureSplitFamily(sourceFamily, name) {
  const existing = await findFamily(OPTILAB_VERSION_ID, name)
  if (existing) return existing

  const row = {
    id: crypto.randomUUID(),
    version_id: sourceFamily.version_id,
    source_document_id: sourceFamily.source_document_id,
    nome: name,
    design: name.includes('Digital') ? 'Progressiva Digital' : 'Progressiva Tradicional',
    description_marketing: `${name} - sublinha extraida de LENTES ESPACE Optilab p.37.`,
    tags_uso: ESPACE_SPLIT_PROFILES[name].usage_tags,
    tags_beneficios: ESPACE_SPLIT_PROFILES[name].benefit_tags,
    source_page_reference: sourceFamily.source_page_reference,
    clinical_category: 'multifocal',
    geometry_id: sourceFamily.geometry_id,
  }

  console.log(`[espace:family:insert] ${name}`)
  if (commit) {
    const { data, error } = await supabase.from('global_lens_families').insert(row).select('*').single()
    if (error) throw error
    return data
  }
  return row
}

async function splitEspace() {
  const activationId = await getActiveActivation(OPTILAB_VERSION_ID)
  const umbrella =
    (await findFamilyLike(OPTILAB_VERSION_ID, 'LENTES ESPACE%')) ||
    (await findFamily(OPTILAB_VERSION_ID, 'Espace Plus Digital'))

  if (!umbrella) {
    console.log('[espace:skip] familia LENTES ESPACE/Espace Plus Digital nao encontrada')
    return
  }

  const offers = await fetchOffers(umbrella.id)
  const grouped = new Map()
  for (const offer of offers) {
    const target = inferEspaceTarget(offer)
    if (!target) throw new Error(`Oferta LENTES ESPACE sem alvo de split: ${offer.canonical_label || offer.raw_label}`)
    const list = grouped.get(target) || []
    list.push(offer)
    grouped.set(target, list)
  }

  console.log(
    `[espace] plano: ${[...grouped.entries()].map(([name, list]) => `${name}=${list.length}`).join(', ')}`,
  )

  const families = {
    'Espace Plus Digital': umbrella,
    'Espace Plus Tradicional': await ensureSplitFamily(umbrella, 'Espace Plus Tradicional'),
    'Espace Tradicional': await ensureSplitFamily(umbrella, 'Espace Tradicional'),
  }

  if (umbrella.nome !== 'Espace Plus Digital') {
    console.log(`[espace:family:rename] ${umbrella.nome} -> Espace Plus Digital`)
    if (commit) {
      const { error } = await supabase
        .from('global_lens_families')
        .update({
          nome: 'Espace Plus Digital',
          design: 'Progressiva Digital',
          description_marketing: 'Espace Plus Digital - sublinha extraida de LENTES ESPACE Optilab p.37.',
          tags_uso: ESPACE_SPLIT_PROFILES['Espace Plus Digital'].usage_tags,
          tags_beneficios: ESPACE_SPLIT_PROFILES['Espace Plus Digital'].benefit_tags,
          clinical_category: 'multifocal',
        })
        .eq('id', umbrella.id)
      if (error) throw error
    }
  }

  let offerUpdates = 0
  let tenantUpdates = 0
  for (const [targetName, targetOffers] of grouped.entries()) {
    const targetFamily = families[targetName]
    await upsertFamilyProfile(targetFamily.id, {
      ...ESPACE_SPLIT_PROFILES[targetName],
      source_page_reference: 'Optilab p.37 - split LENTES ESPACE',
    })

    for (const offer of targetOffers) {
      const nextCanonical = renameEspaceLabel(offer.canonical_label, targetName)
      const nextRaw = renameEspaceLabel(offer.raw_label, targetName)
      const nextFeatures = mergeFeatures(offer.features, {
        split_from_family_name: 'LENTES ESPACE',
        espace_variant: targetName,
        canonical_family_name: targetName,
      })
      const nextFamilyId = targetFamily.id
      const changed =
        offer.family_id !== nextFamilyId || offer.canonical_label !== nextCanonical || offer.raw_label !== nextRaw
      if (changed) offerUpdates += 1
      if (commit) {
        const { error } = await supabase
          .from('global_lens_offers')
          .update({
            family_id: nextFamilyId,
            canonical_label: nextCanonical,
            raw_label: nextRaw,
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
  }

  console.log(`[espace] ofertas movidas/renomeadas: ${offerUpdates}; tenant display_name: ${tenantUpdates}`)
}

async function canonicalizeEspaceOffers({ activationId, family, canonicalName, aliases, moveToFamilyId = null }) {
  const offers = await fetchOffers(family.id)
  let offerUpdates = 0
  let tenantUpdates = 0

  for (const offer of offers) {
    const nextCanonical = renameEspaceCanonicalLabel(offer.canonical_label, canonicalName)
    const nextRaw = renameEspaceCanonicalLabel(offer.raw_label, canonicalName)
    const nextFamilyId = moveToFamilyId || family.id
    const nextFeatures = mergeFeatures(offer.features, {
      canonical_family_name: canonicalName,
      source_family_aliases: aliases,
      equivalence_note:
        canonicalName === 'Espace Plus'
          ? 'Espace Plus conciliada entre Optilab p.37 e Gamalab p.20; variantes Digital/Tradicional sao nomes de origem.'
          : 'Espace conciliada entre Optilab p.37 e Gamalab p.20; Espace Tradicional e nome de origem.',
    })

    const changed =
      offer.family_id !== nextFamilyId ||
      offer.canonical_label !== nextCanonical ||
      offer.raw_label !== nextRaw ||
      JSON.stringify(offer.features || {}) !== JSON.stringify(nextFeatures)
    if (changed) offerUpdates += 1

    if (commit) {
      const { error } = await supabase
        .from('global_lens_offers')
        .update({
          family_id: nextFamilyId,
          canonical_label: nextCanonical,
          raw_label: nextRaw,
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

  return { offerUpdates, tenantUpdates, offerCount: offers.length }
}

async function deleteEmptyFamily(family, reason) {
  const offers = await fetchOffers(family.id)
  if (offers.length > 0) {
    console.log(`[family:keep] ${family.nome}: ${offers.length} ofertas ainda vinculadas`)
    return false
  }

  console.log(`[family:delete-empty] ${family.nome} (${reason})`)
  if (commit) {
    const { error: profileError } = await supabase.from('global_usage_profiles').delete().eq('family_id', family.id)
    if (profileError) throw profileError
    const { error } = await supabase.from('global_lens_families').delete().eq('id', family.id)
    if (error) throw error
  }
  return true
}

async function reconcileEspaceCanonical() {
  const optilabActivationId = await getActiveActivation(OPTILAB_VERSION_ID)
  const gamalabActivationId = await getActiveActivation(GAMALAB_VERSION_ID)

  const optilabPlusPrimary = await findFirstFamily(OPTILAB_VERSION_ID, ['Espace Plus', 'Espace Plus Digital'])
  const optilabPlusTrad = await findFamily(OPTILAB_VERSION_ID, 'Espace Plus Tradicional')
  const optilabEspace = await findFirstFamily(OPTILAB_VERSION_ID, ['Espace', 'Espace Tradicional'])
  const gamalabPlus = await findFamily(GAMALAB_VERSION_ID, 'Espace Plus')
  const gamalabEspace = await findFamily(GAMALAB_VERSION_ID, 'Espace')

  if (optilabPlusPrimary) {
    if (optilabPlusPrimary.nome !== 'Espace Plus') {
      console.log(`[espace:family:canonical] ${optilabPlusPrimary.nome} -> Espace Plus`)
      if (commit) {
        const { error } = await supabase
          .from('global_lens_families')
          .update({
            nome: 'Espace Plus',
            design: 'Progressiva',
            description_marketing:
              'Espace Plus. Identidade canonica para nomes de origem Espace Plus Digital e Espace Plus Tradicional.',
            tags_uso: ESPACE_CANONICAL_PROFILES['Espace Plus'].usage_tags,
            tags_beneficios: ESPACE_CANONICAL_PROFILES['Espace Plus'].benefit_tags,
            clinical_category: 'multifocal',
          })
          .eq('id', optilabPlusPrimary.id)
        if (error) throw error
      }
      optilabPlusPrimary.nome = 'Espace Plus'
    }

    const primaryResult = await canonicalizeEspaceOffers({
      activationId: optilabActivationId,
      family: optilabPlusPrimary,
      canonicalName: 'Espace Plus',
      aliases: ['Espace Plus', 'Espace Plus Digital', 'Espace Plus Tradicional'],
    })
    console.log(
      `[espace-plus:optilab] ofertas normalizadas: ${primaryResult.offerUpdates}; tenant display_name: ${primaryResult.tenantUpdates}`,
    )
    await upsertFamilyProfile(optilabPlusPrimary.id, ESPACE_CANONICAL_PROFILES['Espace Plus'])
  }

  if (optilabPlusPrimary && optilabPlusTrad) {
    const movedResult = await canonicalizeEspaceOffers({
      activationId: optilabActivationId,
      family: optilabPlusTrad,
      canonicalName: 'Espace Plus',
      aliases: ['Espace Plus', 'Espace Plus Digital', 'Espace Plus Tradicional'],
      moveToFamilyId: optilabPlusPrimary.id,
    })
    console.log(
      `[espace-plus:merge] Espace Plus Tradicional -> Espace Plus: ${movedResult.offerCount} ofertas; atualizadas: ${movedResult.offerUpdates}; tenant display_name: ${movedResult.tenantUpdates}`,
    )
    await deleteEmptyFamily(optilabPlusTrad, 'familia conciliada em Espace Plus')
  }

  if (optilabEspace) {
    if (optilabEspace.nome !== 'Espace') {
      console.log(`[espace:family:canonical] ${optilabEspace.nome} -> Espace`)
      if (commit) {
        const { error } = await supabase
          .from('global_lens_families')
          .update({
            nome: 'Espace',
            design: 'Progressiva',
            description_marketing: 'Espace. Identidade canonica para nome de origem Espace Tradicional.',
            tags_uso: ESPACE_CANONICAL_PROFILES.Espace.usage_tags,
            tags_beneficios: ESPACE_CANONICAL_PROFILES.Espace.benefit_tags,
            clinical_category: 'multifocal',
          })
          .eq('id', optilabEspace.id)
        if (error) throw error
      }
      optilabEspace.nome = 'Espace'
    }

    const espaceResult = await canonicalizeEspaceOffers({
      activationId: optilabActivationId,
      family: optilabEspace,
      canonicalName: 'Espace',
      aliases: ['Espace', 'Espace Tradicional'],
    })
    console.log(
      `[espace:optilab] ofertas normalizadas: ${espaceResult.offerUpdates}; tenant display_name: ${espaceResult.tenantUpdates}`,
    )
    await upsertFamilyProfile(optilabEspace.id, ESPACE_CANONICAL_PROFILES.Espace)
  }

  for (const family of [
    { row: gamalabPlus, canonicalName: 'Espace Plus', activationId: gamalabActivationId },
    { row: gamalabEspace, canonicalName: 'Espace', activationId: gamalabActivationId },
  ]) {
    if (!family.row) continue
    const result = await canonicalizeEspaceOffers({
      activationId: family.activationId,
      family: family.row,
      canonicalName: family.canonicalName,
      aliases:
        family.canonicalName === 'Espace Plus'
          ? ['Espace Plus', 'Espace Plus Digital', 'Espace Plus Tradicional']
          : ['Espace', 'Espace Tradicional'],
    })
    console.log(
      `[${family.canonicalName.toLowerCase().replace(' ', '-')}:gamalab] ofertas normalizadas: ${result.offerUpdates}; tenant display_name: ${result.tenantUpdates}`,
    )
    await upsertFamilyProfile(family.row.id, ESPACE_CANONICAL_PROFILES[family.canonicalName])
  }
}

async function main() {
  console.log(`[mode] ${commit ? 'COMMIT' : 'DRY RUN'}`)
  await reconcileArgos()
  await splitEspace()
  await reconcileEspaceCanonical()
  console.log('[done]')
}

main().catch((error) => {
  console.error(error?.message || error)
  process.exit(1)
})
