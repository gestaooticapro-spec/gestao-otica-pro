import path from 'path'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const commit = process.argv.includes('--commit')
const OPTILAB_VERSION_ID = 'a4886a73-bc92-4b14-9c47-152ef0c78078'

const LIBERTY_COLORACAO_FIXES = [
  {
    oldLabel: 'VARILUX® LIBERTY TRADICIONAL Orma',
    raw: 'Orma + Coloração padrão',
    canonical: 'VARILUX® LIBERTY 3.0 SOLARES / COLORAÇÃO Orma + Coloração padrão',
    material: 'Resina',
    index: 1.5,
    price: 1179,
  },
  {
    oldLabel: 'VARILUX® LIBERTY TRADICIONAL Orma + Coloração especial',
    raw: 'Orma + Coloração especial',
    canonical: 'VARILUX® LIBERTY 3.0 SOLARES / COLORAÇÃO Orma + Coloração especial',
    material: 'Resina',
    index: 1.5,
    price: 1289,
  },
  {
    oldLabel: 'VARILUX® LIBERTY TRADICIONAL Airwear',
    raw: 'Airwear + Coloração padrão',
    canonical: 'VARILUX® LIBERTY 3.0 SOLARES / COLORAÇÃO Airwear + Coloração padrão',
    material: 'Policarbonato',
    index: 1.59,
    price: 1479,
  },
  {
    oldLabel: 'VARILUX® LIBERTY TRADICIONAL Airwear + Coloração especial',
    raw: 'Airwear + Coloração especial',
    canonical: 'VARILUX® LIBERTY 3.0 SOLARES / COLORAÇÃO Airwear + Coloração especial',
    material: 'Policarbonato',
    index: 1.59,
    price: 1589,
  },
]

const LIBERTY_TRADITIONAL_INSERTS = [
  {
    raw: 'Orma',
    canonical: 'VARILUX® LIBERTY TRADICIONAL Orma',
    material: 'Resina',
    index: 1.5,
    basePrice: 999,
    sph_min: -7,
    sph_max: 6,
    compat: {
      'Crizal Prevencia': 2019,
      'Crizal Sapphire HR': 2019,
      'Crizal Rock': 1749,
      'Crizal Easy Pro': 1399,
      Optifog: 1639,
      'Trio Easy Clean': 1199,
    },
  },
  {
    raw: 'Airwear',
    canonical: 'VARILUX® LIBERTY TRADICIONAL Airwear',
    material: 'Policarbonato',
    index: 1.59,
    basePrice: 1299,
    sph_min: -7,
    sph_max: 6,
    compat: {
      'Crizal Prevencia': 2319,
      'Crizal Sapphire HR': 2319,
      'Crizal Rock': 2049,
      'Crizal Easy Pro': 1699,
      Optifog: 1939,
      'Trio Easy Clean': 1499,
    },
  },
]

const ITOP_156_COMPAT = {
  label: 'iTop LENTES SURFAÇADAS DIGITAIS 1.56 UV Led Protection Single Digital',
  compat: {
    'Vert Clair': 1688,
    'Trio Easy Clean': 1383,
    'Verniz Hc': 1118,
  },
}

function samePatch(row, patch) {
  return Object.entries(patch).every(([key, value]) => {
    if (key === 'features') return JSON.stringify(row.features || {}) === JSON.stringify(value || {})
    return row[key] === value
  })
}

function libertyFeatures(base = {}, variant = 'traditional') {
  return {
    ...base,
    short: false,
    solar: variant === 'solar_coloracao',
    xperio: false,
    blue_uv: false,
    digital: variant !== 'traditional',
    coloracao: variant === 'solar_coloracao',
    model_name: variant === 'solar_coloracao' ? 'Varilux Liberty 3.0' : 'Varilux Liberty',
    varilux_line: variant === 'solar_coloracao' ? 'liberty_3_0' : 'liberty',
    model_variant: variant,
    sob_demanda: true,
    pronta_entrega: false,
    fulfillment_mode: 'sob_demanda',
    longer_lead_time: true,
    min_fitting_height: 18,
    embedded_treatment: variant === 'solar_coloracao' ? 'Verniz HC' : undefined,
  }
}

async function addCompatibility(offerId, treatmentByName, compat, label) {
  const { data: existing, error } = await supabase
    .from('global_offer_treatments_compatibility')
    .select('offer_id,treatment_id,special_price,price_mode')
    .eq('offer_id', offerId)
  if (error) throw error

  let inserts = 0
  const existingKeys = new Set((existing || []).map((row) => `${row.treatment_id}:${Number(row.special_price)}`))

  for (const [treatmentName, price] of Object.entries(compat)) {
    const treatment = treatmentByName.get(treatmentName)
    if (!treatment) throw new Error(`Tratamento nao encontrado: ${treatmentName}`)
    const key = `${treatment.id}:${Number(price)}`
    if (existingKeys.has(key)) continue
    inserts += 1
    console.log('[compat:insert]', label, '=>', treatmentName, price)
    if (commit) {
      const { error: insertError } = await supabase.from('global_offer_treatments_compatibility').insert({
        offer_id: offerId,
        treatment_id: treatment.id,
        special_price: price,
        price_mode: 'final',
      })
      if (insertError) throw insertError
    }
  }
  return inserts
}

async function main() {
  const { data: families, error: familyError } = await supabase
    .from('global_lens_families')
    .select('id,nome')
    .eq('version_id', OPTILAB_VERSION_ID)
    .in('nome', ['Varilux Liberty', 'Varilux Liberty 3.0', 'iTop'])
  if (familyError) throw familyError

  const familyByName = new Map((families || []).map((family) => [family.nome, family]))
  const liberty = familyByName.get('Varilux Liberty')
  const liberty30 = familyByName.get('Varilux Liberty 3.0')
  const itop = familyByName.get('iTop')
  if (!liberty || !liberty30 || !itop) throw new Error('Familias esperadas nao encontradas.')

  const { data: treatments, error: treatmentError } = await supabase
    .from('global_treatments')
    .select('id,nome')
    .eq('version_id', OPTILAB_VERSION_ID)
  if (treatmentError) throw treatmentError
  const treatmentByName = new Map((treatments || []).map((treatment) => [treatment.nome, treatment]))

  const labels = [
    ...LIBERTY_COLORACAO_FIXES.map((item) => item.oldLabel),
    ...LIBERTY_COLORACAO_FIXES.map((item) => item.canonical),
    ...LIBERTY_TRADITIONAL_INSERTS.map((item) => item.canonical),
    ITOP_156_COMPAT.label,
    ...['iTop ULTRA LIGHT 1.56 UV Led Progressiva', 'iTop ULTRA LIGHT 1.56 UV Led Single', 'iTop ULTRA LIGHT 1.67 UV Led Progressiva', 'iTop ULTRA LIGHT 1.67 UV Led Single', 'iTop ULTRA LIGHT 1.74 Progressiva', 'iTop ULTRA LIGHT 1.74 Single'],
  ]

  const { data: offers, error: offersError } = await supabase
    .from('global_lens_offers')
    .select('*')
    .in('canonical_label', labels)
  if (offersError) throw offersError

  const offerByLabel = new Map((offers || []).map((offer) => [offer.canonical_label, offer]))

  let offerUpdates = 0
  let offerInserts = 0
  let gridInserts = 0
  let compatInserts = 0
  const movedLibertyOfferIds = new Set()

  for (const item of LIBERTY_COLORACAO_FIXES) {
    const offer = offerByLabel.get(item.canonical) || offerByLabel.get(item.oldLabel)
    if (!offer) {
      console.log('[skip:missing-liberty-coloracao]', item.oldLabel)
      continue
    }
    const patch = {
      family_id: liberty30.id,
      raw_label: item.raw,
      canonical_label: item.canonical,
      material: item.material,
      indice_refracao: item.index,
      is_atomic_offer: false,
      allows_composition: false,
      already_includes_treatment: true,
      base_price: item.price,
      clinical_category: 'multifocal',
      features: libertyFeatures(offer.features || {}, 'solar_coloracao'),
      import_key: `Pagina 19 | ${item.canonical} | ${item.price} | Verniz HC`,
    }
    if (!samePatch(offer, patch)) {
      offerUpdates += 1
      console.log('[offer:update-liberty-coloracao]', offer.canonical_label, '=>', item.canonical)
      if (commit) {
        const { error } = await supabase.from('global_lens_offers').update(patch).eq('id', offer.id)
        if (error) throw error
      }
    }
    movedLibertyOfferIds.add(offer.id)
  }

  for (const item of LIBERTY_TRADITIONAL_INSERTS) {
    let offer = offerByLabel.get(item.canonical)
    if (offer && movedLibertyOfferIds.has(offer.id)) offer = null
    if (!offer && commit) {
      const { data: refreshed, error } = await supabase
        .from('global_lens_offers')
        .select('*')
        .eq('canonical_label', item.canonical)
        .maybeSingle()
      if (error) throw error
      offer = refreshed
      if (offer && movedLibertyOfferIds.has(offer.id)) offer = null
    }
    if (!offer) {
      offerInserts += 1
      console.log('[offer:insert-liberty-traditional]', item.canonical)
      if (commit) {
        const { data: inserted, error } = await supabase
          .from('global_lens_offers')
          .insert({
            family_id: liberty.id,
            raw_label: item.raw,
            canonical_label: item.canonical,
            material: item.material,
            indice_refracao: item.index,
            is_atomic_offer: false,
            allows_composition: true,
            already_includes_treatment: false,
            features: libertyFeatures({}, 'traditional'),
            base_price: item.basePrice,
            source_page_reference: 'Pagina 19',
            confidence_level: 0.95,
            import_key: `Pagina 19 | ${item.canonical} | ${item.basePrice} | Sem AR`,
            clinical_category: 'multifocal',
          })
          .select('*')
          .single()
        if (error) throw error
        offer = inserted
      }
    }

    if (offer) {
      const { data: grids, error: gridError } = await supabase
        .from('global_offer_diopter_grids')
        .select('id')
        .eq('offer_id', offer.id)
      if (gridError) throw gridError
      if (!(grids || []).length) {
        gridInserts += 1
        console.log('[grid:insert-liberty-traditional]', item.canonical)
        if (commit) {
          const { error } = await supabase.from('global_offer_diopter_grids').insert({
            offer_id: offer.id,
            sph_min: item.sph_min,
            sph_max: item.sph_max,
            cyl_min: 0,
            cyl_max: -6,
            add_min: 0.75,
            add_max: 3.5,
            metadata: {
              section_name: 'TRADICIONAL',
              source_page_reference: 'Pagina 19',
              source_note: 'Bloco Varilux Liberty Tradicional, coluna Sem AR como preco base.',
            },
          })
          if (error) throw error
        }
      }
      compatInserts += await addCompatibility(offer.id, treatmentByName, item.compat, item.canonical)
    }
  }

  const itopOffer = offerByLabel.get(ITOP_156_COMPAT.label)
  if (itopOffer) {
    compatInserts += await addCompatibility(itopOffer.id, treatmentByName, ITOP_156_COMPAT.compat, ITOP_156_COMPAT.label)
  }

  const ultraLightOffers = (offers || []).filter((offer) => offer.canonical_label.includes('iTop ULTRA LIGHT'))
  for (const offer of ultraLightOffers) {
    const features = offer.features && typeof offer.features === 'object' ? offer.features : {}
    const patch = {
      allows_composition: false,
      already_includes_treatment: true,
      features: {
        ...features,
        commercial_model: 'surcharge_only',
        not_standalone_lens: true,
        surcharge_amount: 720,
        surcharge_label: 'Surfacagem Digital Ultra Light',
        source_note: 'Pagina 39 informa "Acrescentar 720,00"; modelado como adicional comercial, nao lente final componivel.',
      },
    }
    if (!samePatch(offer, patch)) {
      offerUpdates += 1
      console.log('[offer:update-itop-ultralight-surcharge]', offer.canonical_label)
      if (commit) {
        const { error } = await supabase.from('global_lens_offers').update(patch).eq('id', offer.id)
        if (error) throw error
      }
    }
  }

  console.log('Resumo:')
  console.log('- Ofertas atualizadas:', offerUpdates)
  console.log('- Ofertas inseridas:', offerInserts)
  console.log('- Grades inseridas:', gridInserts)
  console.log('- Compatibilidades inseridas:', compatInserts)
  console.log(commit ? 'Aplicado.' : 'Modo seco. Use --commit para aplicar.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
