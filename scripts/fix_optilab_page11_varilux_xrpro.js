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

const args = process.argv.slice(2)
const versionId = args.find((arg) => arg.startsWith('--version-id='))?.split('=')[1]
const commit = args.includes('--commit')

if (!versionId) {
  console.error('Uso: node scripts/fix_optilab_page11_varilux_xrpro.js --version-id=UUID [--commit]')
  process.exit(1)
}

function withoutAccents(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function ensureObject(value) {
  return value && typeof value === 'object' ? value : {}
}

async function main() {
  const { data: families, error: famErr } = await supabase
    .from('global_lens_families')
    .select('id,nome')
    .eq('version_id', versionId)
  if (famErr) throw famErr
  const familyIds = (families || []).map((f) => f.id)
  if (!familyIds.length) {
    console.log('Nenhuma família encontrada para version_id', versionId)
    return
  }

  const { data: offers, error: offErr } = await supabase
    .from('global_lens_offers')
    .select(
      'id,family_id,import_key,raw_label,canonical_label,clinical_category,material,indice_refracao,is_atomic_offer,already_includes_treatment,allows_composition,features,base_price,source_page_reference',
    )
    .in('family_id', familyIds)
  if (offErr) throw offErr

  const xrProOffers = (offers || []).filter((o) => {
    const label = withoutAccents(`${o.canonical_label || ''} ${o.raw_label || ''}`)
    return label.includes('varilux') && label.includes('xr') && label.includes('xr pro')
  })

  if (!xrProOffers.length) {
    console.log('Nenhuma oferta XR Pro encontrada.')
    return
  }

  // Identify templates and existing rows in SOLARES/COLORAÇÃO
  const airwearColorPadrao = xrProOffers.find((o) =>
    withoutAccents(o.canonical_label || o.raw_label).includes('solares') &&
    withoutAccents(o.canonical_label || o.raw_label).includes('airwear') &&
    !withoutAccents(o.canonical_label || o.raw_label).includes('xperio') &&
    !withoutAccents(o.canonical_label || o.raw_label).includes('coloracao especial'),
  )

  const ormaColorEspecial = xrProOffers.find((o) =>
    withoutAccents(o.canonical_label || o.raw_label).includes('solares') &&
    withoutAccents(o.canonical_label || o.raw_label).includes('orma') &&
    withoutAccents(o.canonical_label || o.raw_label).includes('coloracao especial'),
  )

  const airwearColorEspecialExisting = xrProOffers.find((o) =>
    withoutAccents(o.canonical_label || o.raw_label).includes('solares') &&
    withoutAccents(o.canonical_label || o.raw_label).includes('airwear') &&
    withoutAccents(o.canonical_label || o.raw_label).includes('coloracao especial'),
  )

  const missingInsert = !airwearColorEspecialExisting

  // Find treatment Verniz Hc id (used across this block)
  const { data: treatments, error: treatErr } = await supabase
    .from('global_treatments')
    .select('id,nome')
    .eq('version_id', versionId)
  if (treatErr) throw treatErr
  const verniz = (treatments || []).find((t) => withoutAccents(t.nome) === 'verniz hc' || withoutAccents(t.nome) === 'verniz hc')
  if (!verniz) {
    throw new Error('Tratamento Verniz Hc não encontrado na versão. Não consigo inserir a oferta faltante com segurança.')
  }

  // Preload grids and compatibilities
  const offerIds = xrProOffers.map((o) => o.id)
  const { data: grids, error: gridErr } = await supabase
    .from('global_offer_diopter_grids')
    .select('id,offer_id,sph_min,sph_max,cyl_min,cyl_max,add_min,add_max,metadata')
    .in('offer_id', offerIds)
  if (gridErr) throw gridErr
  const gridsByOfferId = new Map()
  for (const g of grids || []) {
    const list = gridsByOfferId.get(g.offer_id) || []
    list.push(g)
    gridsByOfferId.set(g.offer_id, list)
  }

  const { data: compatRows, error: compatErr } = await supabase
    .from('global_offer_treatments_compatibility')
    .select('offer_id,treatment_id,special_price,price_mode')
    .in('offer_id', offerIds)
  if (compatErr) throw compatErr

  // 1) Apply min_fitting_height=14 on XR Pro offers (page 11 vertical info)
  const heightTarget = 14
  const toUpdateHeight = xrProOffers.filter((o) => {
    const feat = ensureObject(o.features)
    return feat.min_fitting_height == null
  })

  // 2) Insert missing Airwear + Coloração especial (Verniz HC 10.719,00)
  let insertedOfferId = null
  let insertedCompat = null
  let insertedGrids = 0

  if (missingInsert) {
    if (!airwearColorPadrao) {
      throw new Error('Template "XR Pro Airwear (Coloração padrão)" não encontrado. Não consigo inserir coloração especial com segurança.')
    }
    if (!ormaColorEspecial) {
      // not strictly required, but useful as evidence of naming pattern
      console.log('Aviso: template "XR Pro Orma + Coloração especial" não encontrado; vou seguir o padrão do Airwear coloração padrão.')
    }

    const base = airwearColorPadrao
    const newCanonical = 'VARILUX® XR SERIES SOLARES / COLORAÇÃO XR Pro Airwear + Coloração especial'
    const newRaw = base.raw_label && withoutAccents(base.raw_label).includes('airwear') ? `${base.raw_label} + Coloração especial` : 'Airwear + Coloração especial'
    const newImportKey = `${base.import_key || 'varilux_xrpro_airwear'}__coloracao_especial`

    const offerPayload = {
      family_id: base.family_id,
      import_key: newImportKey,
      raw_label: newRaw,
      canonical_label: newCanonical,
      clinical_category: base.clinical_category,
      material: base.material,
      indice_refracao: base.indice_refracao,
      is_atomic_offer: base.is_atomic_offer,
      already_includes_treatment: base.already_includes_treatment,
      allows_composition: base.allows_composition,
      features: {
        ...(ensureObject(base.features)),
        // preserve whatever extraction flags exist; just add a clear signal for auditing
        coloracao_especial: true,
      },
      base_price: 10719,
      source_page_reference: base.source_page_reference || 'p. 11',
    }

    console.log('[insert] nova oferta (dry-run payload):', offerPayload)

    if (commit) {
      const { data: insertedOffer, error: insErr } = await supabase
        .from('global_lens_offers')
        .insert(offerPayload)
        .select('id')
        .single()
      if (insErr) throw insErr
      insertedOfferId = insertedOffer.id

      const compatPayload = {
        offer_id: insertedOfferId,
        treatment_id: verniz.id,
        special_price: 10719,
        price_mode: 'final',
      }

      const { data: insertedCompatRow, error: insCompatErr } = await supabase
        .from('global_offer_treatments_compatibility')
        .insert(compatPayload)
        .select('offer_id,treatment_id,special_price,price_mode')
        .single()
      if (insCompatErr) throw insCompatErr
      insertedCompat = insertedCompatRow

      const templateGrids = gridsByOfferId.get(base.id) || []
      if (!templateGrids.length) {
        throw new Error('Template Airwear coloração padrão não possui grade; abortando inserção de grade.')
      }

      const gridsPayload = templateGrids.map((g) => ({
        offer_id: insertedOfferId,
        sph_min: g.sph_min,
        sph_max: g.sph_max,
        cyl_min: g.cyl_min,
        cyl_max: g.cyl_max,
        add_min: g.add_min,
        add_max: g.add_max,
        metadata: g.metadata,
      }))

      const { error: insGridErr } = await supabase.from('global_offer_diopter_grids').insert(gridsPayload)
      if (insGridErr) throw insGridErr
      insertedGrids = gridsPayload.length
    }
  }

  // Apply height updates
  if (toUpdateHeight.length) {
    console.log('[height] ofertas sem min_fitting_height:', toUpdateHeight.length)
    if (commit) {
      for (const o of toUpdateHeight) {
        const nextFeatures = { ...(ensureObject(o.features)), min_fitting_height: heightTarget }
        const { error: upErr } = await supabase.from('global_lens_offers').update({ features: nextFeatures }).eq('id', o.id)
        if (upErr) throw upErr
      }
    }
  } else {
    console.log('[height] todas as ofertas XR Pro já tinham min_fitting_height.')
  }

  console.log('Resumo:')
  console.log('- XR Pro ofertas total:', xrProOffers.length)
  console.log('- XR Pro ofertas com altura aplicada (dry-run/real):', toUpdateHeight.length, '=>', heightTarget)
  console.log('- Inserção Airwear + Coloração especial necessária?:', missingInsert)
  console.log('- Oferta inserida:', insertedOfferId || null)
  console.log('- Compat inserida:', insertedCompat || null)
  console.log('- Grades inseridas:', insertedGrids)

  if (!commit) {
    console.log('Rodou em modo seco. Use --commit para aplicar.')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
