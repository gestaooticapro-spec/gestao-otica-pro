const { createClient } = require('@supabase/supabase-js')
const { randomUUID } = require('crypto')
require('dotenv').config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const HOYA_VERSION_ID = '08f91e88-40f5-4521-b476-d09c7f1955cf'
const MIYOSMART_FAMILY_ID = 'd52c3398-d9f0-49d9-abd7-a11620e4c7f7'
const STORE_ID = 1
const SOURCE_PAGE = 'Pagina 9'
const BASE_PRICE = 2099

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error('Missing Supabase environment variables.')
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const offerSpecs = [
  {
    rawLabel: 'INCOLOR | Antirreflexo MiYOSMART | Prontas',
    canonicalLabel: 'MiYOSMART INCOLOR Prontas Antirreflexo MiYOSMART',
    material: 'Prontas',
    fulfillmentMode: 'pronta',
    sphMin: -6,
    sphMax: 0,
    cylMin: -2,
    cylMax: 0,
    features: {
      cor: 'INCOLOR',
      pronta: true,
      sob_demanda: false,
      pronta_entrega: true,
      fulfillment_mode: 'pronta',
      tratamento: 'Antirreflexo MiYOSMART',
      included_treatments: ['Antirreflexo MiYOSMART'],
      controle_miopia: true,
      uso_infantil: true,
      longer_lead_time: false,
      potential_thinner_lighter: false,
    },
  },
  {
    rawLabel: 'INCOLOR | Antirreflexo MiYOSMART | Surfacadas',
    canonicalLabel: 'MiYOSMART INCOLOR Surfacadas Antirreflexo MiYOSMART',
    material: 'Surfacadas',
    fulfillmentMode: 'sob_demanda',
    sphMin: -13,
    sphMax: 0,
    cylMin: -4,
    cylMax: 0,
    features: {
      cor: 'INCOLOR',
      pronta: false,
      sob_demanda: true,
      pronta_entrega: false,
      fulfillment_mode: 'sob_demanda',
      tratamento: 'Antirreflexo MiYOSMART',
      included_treatments: ['Antirreflexo MiYOSMART'],
      controle_miopia: true,
      uso_infantil: true,
      longer_lead_time: true,
      potential_thinner_lighter: true,
    },
  },
  {
    rawLabel: 'CHAMELEON | Antirreflexo MiYOSMART | Surfacadas',
    canonicalLabel: 'MiYOSMART CHAMELEON Surfacadas Antirreflexo MiYOSMART',
    material: 'Surfacadas',
    fulfillmentMode: 'sob_demanda',
    sphMin: -10,
    sphMax: 0,
    cylMin: -4,
    cylMax: 0,
    features: {
      cor: 'CHAMELEON',
      foto: true,
      chameleon: true,
      transitions: true,
      pronta: false,
      sob_demanda: true,
      pronta_entrega: false,
      fulfillment_mode: 'sob_demanda',
      tratamento: 'Antirreflexo MiYOSMART',
      included_treatments: ['Antirreflexo MiYOSMART'],
      controle_miopia: true,
      uso_infantil: true,
      row_notes: 'CHAMELEON apenas surfaçada',
      longer_lead_time: true,
      potential_thinner_lighter: true,
    },
  },
  {
    rawLabel: 'SUNBIRD | Antirreflexo MiYOSMART | Surfacadas',
    canonicalLabel: 'MiYOSMART SUNBIRD Surfacadas Antirreflexo MiYOSMART',
    material: 'Surfacadas',
    fulfillmentMode: 'sob_demanda',
    sphMin: -10,
    sphMax: 0,
    cylMin: -4,
    cylMax: 0,
    features: {
      cor: 'SUNBIRD',
      solar: true,
      sunbird: true,
      pronta: false,
      sob_demanda: true,
      pronta_entrega: false,
      fulfillment_mode: 'sob_demanda',
      tratamento: 'Antirreflexo MiYOSMART',
      generic_treatments: ['Solar'],
      included_treatments: ['Antirreflexo MiYOSMART'],
      controle_miopia: true,
      uso_infantil: true,
      row_notes: 'SUNBIRD apenas surfaçada',
      longer_lead_time: true,
      potential_thinner_lighter: true,
    },
  },
]

function importKey(spec) {
  return `${SOURCE_PAGE} | ${spec.canonicalLabel} | ${BASE_PRICE} | miyosmart-${spec.fulfillmentMode}`
}

async function ensureFamilyMetadata() {
  const { data: family, error } = await supabase
    .from('global_lens_families')
    .select('id,tags_uso,tags_beneficios,description_marketing')
    .eq('id', MIYOSMART_FAMILY_ID)
    .single()

  if (error) throw error

  const tagsUso = Array.from(new Set([...(family.tags_uso || []), 'criancas', 'controle_miopia', 'uso_infantil']))
  const tagsBeneficios = Array.from(
    new Set([...(family.tags_beneficios || []), 'controle_miopia', 'desaceleracao_progressao_miopica', 'resistencia_impacto']),
  )

  const { error: updateError } = await supabase
    .from('global_lens_families')
    .update({
      tags_uso: tagsUso,
      tags_beneficios: tagsBeneficios,
      description_marketing:
        family.description_marketing ||
        'Lente HOYA de controle de miopia infantil, com tecnologia DIMS e variações incolor, Chameleon e Sunbird.',
    })
    .eq('id', MIYOSMART_FAMILY_ID)

  if (updateError) throw updateError
}

async function main() {
  await ensureFamilyMetadata()

  const { data: activation, error: activationError } = await supabase
    .from('tenant_catalog_activations')
    .select('id,tenant_id,store_id')
    .eq('store_id', STORE_ID)
    .eq('global_version_id', HOYA_VERSION_ID)
    .eq('status', 'active')
    .single()

  if (activationError) throw activationError

  const inserted = []
  const skipped = []

  for (const spec of offerSpecs) {
    const key = importKey(spec)
    const { data: existing, error: existingError } = await supabase
      .from('global_lens_offers')
      .select('id')
      .eq('import_key', key)
      .maybeSingle()

    if (existingError) throw existingError

    let offerId = existing?.id
    if (offerId) {
      skipped.push(spec.canonicalLabel)
    } else {
      offerId = randomUUID()
      const { error: insertOfferError } = await supabase.from('global_lens_offers').insert({
        id: offerId,
        family_id: MIYOSMART_FAMILY_ID,
        raw_label: spec.rawLabel,
        canonical_label: spec.canonicalLabel,
        material: spec.material,
        indice_refracao: null,
        is_atomic_offer: true,
        allows_composition: false,
        already_includes_treatment: true,
        features: {
          ...spec.features,
          source: 'hoya_catalog_extraction_2025.json',
          source_notes:
            'MiYOSMART p.9: preço único R$ 2.099; col1 Prontas e col2 Surfaçadas; cilindro -2 prontas / -4 surfaçadas.',
        },
        base_price: BASE_PRICE,
        source_page_reference: SOURCE_PAGE,
        confidence_level: 0.9,
        import_key: key,
        clinical_category: 'controle_miopia',
      })

      if (insertOfferError) throw insertOfferError

      const { error: insertGridError } = await supabase.from('global_offer_diopter_grids').insert({
        offer_id: offerId,
        sph_min: spec.sphMin,
        sph_max: spec.sphMax,
        cyl_min: spec.cylMin,
        cyl_max: spec.cylMax,
        add_min: null,
        add_max: null,
        metadata: {
          source: 'hoya_catalog_extraction_2025.json',
          source_page_reference: SOURCE_PAGE,
          fabrication_mode: spec.fulfillmentMode,
          treatment: 'Antirreflexo MiYOSMART',
          prism_max: 3,
          diameter_surfacadas_mm: '60-75',
          reviewed_reason: 'correcao pontual: familia MiYOSMART existia sem ofertas/precos/grades no catalogo global',
        },
      })

      if (insertGridError) throw insertGridError
      inserted.push(spec.canonicalLabel)
    }

    const { data: existingTenantOffer, error: tenantLookupError } = await supabase
      .from('tenant_commercial_offers')
      .select('id')
      .eq('activation_id', activation.id)
      .eq('global_offer_id', offerId)
      .maybeSingle()

    if (tenantLookupError) throw tenantLookupError

    if (!existingTenantOffer) {
      const { error: tenantInsertError } = await supabase.from('tenant_commercial_offers').insert({
        activation_id: activation.id,
        tenant_id: activation.tenant_id,
        store_id: activation.store_id,
        global_offer_id: offerId,
        display_name: spec.canonicalLabel,
        price_cost: null,
        price_sell: null,
        is_active: true,
      })

      if (tenantInsertError) throw tenantInsertError
    }
  }

  console.log(JSON.stringify({ inserted, skipped }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
