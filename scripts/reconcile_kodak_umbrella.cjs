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
  softwear: {
    canonicalName: 'Kodak Softwear',
    category: 'ocupacional',
    design: 'Ocupacional Digital',
    usage_tags: ['computador', 'leitura', 'escritorio', 'intermediario'],
    benefit_tags: ['campo_intermediario', 'conforto_proximo', 'ergonomia_visual'],
    summary: 'Ocupacional digital Kodak Softwear, separada do antigo guarda-chuva Kodak.',
  },
  precise: {
    canonicalName: 'Kodak Precise',
    category: 'multifocal',
    design: 'Progressiva',
    usage_tags: ['uso_geral', 'leitura', 'dirigir'],
    benefit_tags: ['adaptacao_rapida', 'transicao_suave', 'custo_beneficio'],
    summary: 'Progressiva Kodak Precise, separada do antigo guarda-chuva Kodak.',
  },
  preciseUhd: {
    canonicalName: 'Kodak Precise UHD',
    category: 'multifocal',
    design: 'Progressiva Digital',
    usage_tags: ['uso_geral', 'leitura', 'dirigir', 'uso_digital'],
    benefit_tags: ['adaptacao_rapida', 'transicao_suave', 'nitidez'],
    summary: 'Progressiva digital Kodak Precise UHD, separada do antigo guarda-chuva Kodak.',
  },
  networkUhd: {
    canonicalName: 'Kodak Network UHD',
    category: 'multifocal',
    design: 'Progressiva Digital',
    usage_tags: ['uso_geral', 'computador', 'leitura', 'uso_digital'],
    benefit_tags: ['campo_intermediario', 'uso_digital', 'adaptacao_rapida'],
    summary: 'Progressiva digital Kodak Network UHD, separada do antigo guarda-chuva Kodak.',
  },
  uniqueUhd: {
    canonicalName: 'Kodak Unique UHD',
    category: 'multifocal',
    design: 'Progressiva Digital',
    usage_tags: ['uso_geral', 'computador', 'leitura', 'dirigir'],
    benefit_tags: ['personalizacao', 'campo_visual_amplo', 'qualidade_optica'],
    summary: 'Progressiva digital Kodak Unique UHD, separada do antigo guarda-chuva Kodak.',
  },
  uniqueInfinite: {
    canonicalName: 'Kodak Unique Infinite',
    category: 'multifocal',
    design: 'Progressiva Digital Premium',
    usage_tags: ['uso_geral', 'computador', 'leitura', 'dirigir', 'uso_dinamico'],
    benefit_tags: ['personalizacao', 'campo_visual_amplo', 'qualidade_optica', 'conforto_visual'],
    summary: 'Progressiva premium Kodak Unique Infinite, separada do antigo guarda-chuva Kodak.',
  },
  single: {
    canonicalName: 'Kodak Single',
    category: 'visao_simples',
    design: 'Visao Simples',
    usage_tags: ['visao_simples', 'uso_diario', 'longe'],
    benefit_tags: ['correcao_visual', 'nitidez', 'tratamentos_kodak'],
    summary: 'Visao simples Kodak Single, separada do antigo guarda-chuva Kodak.',
  },
  easySun: {
    canonicalName: 'Kodak Easy Sun',
    category: 'multifocal',
    design: 'Multifocal Solar',
    usage_tags: ['uso_externo', 'solar', 'dirigir', 'leitura'],
    benefit_tags: ['protecao_solar', 'coloracao', 'conforto_externo'],
    summary: 'Multifocal solar Kodak Easy Sun, separada do antigo guarda-chuva Kodak.',
  },
  singleSun: {
    canonicalName: 'Kodak Single Sun',
    category: 'plana_solar',
    design: 'Solar Visao Simples',
    usage_tags: ['uso_externo', 'solar', 'visao_simples'],
    benefit_tags: ['protecao_solar', 'coloracao', 'conforto_externo'],
    summary: 'Visao simples solar Kodak Single Sun, separada do antigo guarda-chuva Kodak.',
  },
  acabadas: {
    canonicalName: 'Kodak Acabadas',
    category: 'visao_simples',
    design: 'Pronta',
    usage_tags: ['visao_simples', 'pronta_entrega', 'uso_diario'],
    benefit_tags: ['correcao_visual', 'pronta_entrega', 'tratamentos_kodak'],
    summary: 'Lentes prontas Kodak, separadas do antigo guarda-chuva Kodak.',
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

function inferTargetKey(offer) {
  const label = normalize(`${offer.canonical_label || ''} ${offer.raw_label || ''}`)
  if (label.includes('softwear')) return 'softwear'
  if (label.includes('single sun')) return 'singleSun'
  if (label.includes('easy sun')) return 'easySun'
  if (label.includes('unique infinite')) return 'uniqueInfinite'
  if (label.includes('unique uhd')) return 'uniqueUhd'
  if (label.includes('network uhd')) return 'networkUhd'
  if (label.includes('precise uhd')) return 'preciseUhd'
  if (label.includes('precise')) return 'precise'
  if (label.includes('lentes prontas') || label.includes('lente pronta')) return 'acabadas'
  if (label.includes('single')) return 'single'
  return null
}

function cleanKodakLabel(value, target) {
  if (!value || typeof value !== 'string') return value
  let next = value
    .replace(/^LENTES KODAK(?:®|Â®)?\s*/i, '')
    .replace(/^MULTIFOCAL DIGITAL\s*/i, '')
    .replace(/^SOLARES\s*/i, '')
    .replace(/^LENTES PRONTAS\s*/i, 'Lentes Prontas ')
    .replace(/^LENTES KODAK\s*/i, 'Kodak ')
    .replace(/^SOFTWEAR OCUPACIONAL DIGITAL\s*/i, 'Kodak Softwear ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!/^kodak\b/i.test(next) && !/^lentes prontas kodak\b/i.test(next)) {
    next = `${target.canonicalName} ${next}`.trim()
  }
  return next.replace(/\s+/g, ' ').trim()
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

async function fetchKodakUmbrellas() {
  const { data, error } = await supabase
    .from('global_lens_families')
    .select('*')
    .in('version_id', [ESSILOR_VERSION_ID, OPTILAB_VERSION_ID])
    .eq('nome', 'Kodak')
  if (error) throw error
  return data || []
}

async function fetchOffers(familyId) {
  const { data, error } = await supabase
    .from('global_lens_offers')
    .select('id,family_id,canonical_label,raw_label,clinical_category,features')
    .eq('family_id', familyId)
    .order('canonical_label')
  if (error) throw error
  return data || []
}

async function ensureFamily(sourceFamily, target) {
  const existing = await findFamily(sourceFamily.version_id, target.canonicalName)
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

  console.log(`[family:insert] ${target.canonicalName} (${sourceFamily.version_id})`)
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
    recommendation_notes: `Tratar ofertas ${target.canonicalName} como esta familia, sem voltar ao guarda-chuva Kodak.`,
    source_page_reference: 'Split Kodak Essilor/Optilab',
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

async function splitFamily(sourceFamily) {
  const activationId = await getActiveActivation(sourceFamily.version_id)
  const offers = await fetchOffers(sourceFamily.id)
  if (offers.length === 0) {
    console.log(`[kodak:skip] ${sourceFamily.version_id} ja esta sem ofertas no guarda-chuva`)
    return
  }

  const grouped = new Map()
  for (const offer of offers) {
    const targetKey = inferTargetKey(offer)
    if (!targetKey) throw new Error(`Oferta Kodak sem destino: ${offer.canonical_label || offer.raw_label}`)
    const list = grouped.get(targetKey) || []
    list.push(offer)
    grouped.set(targetKey, list)
  }

  console.log(
    `[kodak] ${sourceFamily.version_id}: ${[...grouped.entries()]
      .map(([key, list]) => `${TARGETS[key].canonicalName}=${list.length}`)
      .join(', ')}`,
  )

  const families = {}
  for (const key of grouped.keys()) {
    families[key] = await ensureFamily(sourceFamily, TARGETS[key])
    await upsertFamilyProfile(families[key].id, TARGETS[key])
  }

  let offerUpdates = 0
  let tenantUpdates = 0
  for (const [targetKey, targetOffers] of grouped.entries()) {
    const target = TARGETS[targetKey]
    const targetFamily = families[targetKey]
    for (const offer of targetOffers) {
      const nextCanonical = cleanKodakLabel(offer.canonical_label, target)
      const nextRaw = cleanKodakLabel(offer.raw_label, target)
      const nextFeatures = mergeFeatures(offer.features, {
        split_from_family_name: 'Kodak',
        canonical_family_name: target.canonicalName,
        source_family_aliases: ['Kodak', 'LENTES KODAK'],
        equivalence_note: `${target.canonicalName} separada do guarda-chuva Kodak.`,
      })
      const changed =
        offer.family_id !== targetFamily.id ||
        offer.canonical_label !== nextCanonical ||
        offer.raw_label !== nextRaw ||
        offer.clinical_category !== target.category ||
        JSON.stringify(offer.features || {}) !== JSON.stringify(nextFeatures)
      if (changed) offerUpdates += 1

      if (commit) {
        const { error } = await supabase
          .from('global_lens_offers')
          .update({
            family_id: targetFamily.id,
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
  }

  console.log(`[kodak] ofertas movidas/renomeadas=${offerUpdates}; tenant display_name=${tenantUpdates}`)
}

async function main() {
  console.log(`[mode] ${commit ? 'COMMIT' : 'DRY RUN'}`)
  const umbrellas = await fetchKodakUmbrellas()
  for (const family of umbrellas) {
    await splitFamily(family)
  }
  console.log('[done]')
}

main().catch((error) => {
  console.error(error?.message || error)
  process.exit(1)
})
