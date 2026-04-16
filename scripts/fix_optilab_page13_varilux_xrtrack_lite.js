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
  console.error('Uso: node scripts/fix_optilab_page13_varilux_xrtrack_lite.js --version-id=UUID [--commit]')
  process.exit(1)
}

function noAcc(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function ensureObject(value) {
  return value && typeof value === 'object' ? value : {}
}

async function main() {
  // Evidence (page 13 - Optilab PVC Digital v2 - XR Track Lite):
  // - Alt. Mínimo: 14mm
  // - Cilíndrico até -6.00
  // - Adição: 1.00 a 3.50 (Stylis 1.74: 1.00 a 4.00)
  // - Missing row (SOLARES/COLORAÇÃO): XR Track Lite Airwear + Coloração especial (Verniz HC = 6.199,00)
  const heightTarget = 14
  const stylis174AddMax = 4
  const missingAirwearColoracaoEspecialPrice = 6199

  const { data: families, error: famErr } = await supabase
    .from('global_lens_families')
    .select('id')
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

  const liteOffers = (offers || []).filter((o) => {
    const t = noAcc(`${o.canonical_label || ''} ${o.raw_label || ''}`)
    const page = noAcc(o.source_page_reference || '')
    return t.includes('varilux') && t.includes('xr') && t.includes('xr track') && t.includes('lite') && page.includes('13')
  })

  if (!liteOffers.length) {
    console.log('Nenhuma oferta XR Track Lite encontrada (p. 13).')
    return
  }

  const offerIds = liteOffers.map((o) => o.id)

  const { data: treatments, error: treatErr } = await supabase
    .from('global_treatments')
    .select('id,nome')
    .eq('version_id', versionId)
  if (treatErr) throw treatErr
  const verniz = (treatments || []).find((t) => noAcc(t.nome) === 'verniz hc' || noAcc(t.nome) === 'verniz hc')
  if (!verniz) {
    throw new Error('Tratamento Verniz Hc não encontrado na versão. Não consigo inserir a oferta faltante com segurança.')
  }

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

  // 1) Apply min_fitting_height=14 to all XR Track Lite offers missing it
  const heightTargets = liteOffers.filter((o) => ensureObject(o.features).min_fitting_height == null)

  // 2) Fix Stylis 1.74 add_max=4 for XR Track Lite (two rows: with and without Gen S)
  const stylis174Targets = liteOffers.filter((o) => {
    const t = noAcc(o.canonical_label || o.raw_label)
    return t.includes('stylis') && t.includes('1.74') && !t.includes('solares')
  })

  const stylis174NeedsFix = stylis174Targets.filter((o) => {
    const rows = gridsByOfferId.get(o.id) || []
    return rows.some((r) => Number(r.add_max) !== stylis174AddMax)
  })

  // 3) Insert missing Airwear + Coloração especial (SOLARES/COLORAÇÃO)
  const airwearColorPadrao = liteOffers.find((o) => {
    const t = noAcc(o.canonical_label || o.raw_label)
    return (
      t.includes('solares') &&
      t.includes('coloracao') &&
      t.includes('airwear') &&
      !t.includes('xperio') &&
      !t.includes('coloracao especial')
    )
  })

  const airwearColorEspecialExisting = liteOffers.find((o) => {
    const t = noAcc(o.canonical_label || o.raw_label)
    return t.includes('solares') && t.includes('coloracao') && t.includes('airwear') && t.includes('coloracao especial')
  })

  const needsInsert = !airwearColorEspecialExisting
  let insertedOfferId = null

  if (needsInsert) {
    if (!airwearColorPadrao) {
      throw new Error('Template "XR Track Lite Airwear (Coloração padrão)" não encontrado. Não consigo inserir coloração especial com segurança.')
    }

    const base = airwearColorPadrao
    const newCanonical = 'VARILUX® XR SERIES SOLARES / COLORAÇÃO XR Track Lite Airwear + Coloração especial'
    const newRaw = base.raw_label ? `${base.raw_label} + Coloração especial` : 'Airwear + Coloração especial'
    const newImportKey = `${base.import_key || 'varilux_xrtrack_lite_airwear'}__coloracao_especial`

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
      features: { ...(ensureObject(base.features)), coloracao_especial: true },
      base_price: missingAirwearColoracaoEspecialPrice,
      source_page_reference: base.source_page_reference || 'Pagina 13',
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
        special_price: missingAirwearColoracaoEspecialPrice,
        price_mode: 'final',
      }
      const { error: insCompatErr } = await supabase.from('global_offer_treatments_compatibility').insert(compatPayload)
      if (insCompatErr) throw insCompatErr

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
    }
  }

  // If the offer already exists (previous partial run), ensure it has grids cloned from the template.
  if (!needsInsert && airwearColorEspecialExisting && airwearColorPadrao) {
    const existing = airwearColorEspecialExisting
    const hasGrids = (gridsByOfferId.get(existing.id) || []).length > 0
    if (!hasGrids) {
      console.log('[heal] oferta Airwear + Coloração especial existe, mas está sem grade. Vou clonar a grade do template.')
      if (commit) {
        const templateGrids = gridsByOfferId.get(airwearColorPadrao.id) || []
        if (!templateGrids.length) {
          throw new Error('Template Airwear coloração padrão não possui grade; não consigo curar a oferta existente.')
        }
        const gridsPayload = templateGrids.map((g) => ({
          offer_id: existing.id,
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
      }
    }
  }

  // Apply height updates
  if (heightTargets.length) {
    console.log('[height] ofertas XR Track Lite sem min_fitting_height:', heightTargets.length, '=>', heightTarget)
    if (commit) {
      for (const o of heightTargets) {
        const nextFeatures = { ...(ensureObject(o.features)), min_fitting_height: heightTarget }
        const { error: upErr } = await supabase.from('global_lens_offers').update({ features: nextFeatures }).eq('id', o.id)
        if (upErr) throw upErr
      }
      if (insertedOfferId) {
        const nextFeatures = { ...(ensureObject(airwearColorPadrao?.features)), min_fitting_height: heightTarget, coloracao_especial: true }
        await supabase.from('global_lens_offers').update({ features: nextFeatures }).eq('id', insertedOfferId)
      }
    }
  } else {
    console.log('[height] todas as ofertas XR Track Lite já tinham min_fitting_height.')
  }

  // Apply Stylis 1.74 add fix
  if (stylis174NeedsFix.length) {
    console.log('[add] ofertas Stylis 1.74 XR Track Lite com add_max != 4:', stylis174NeedsFix.length)
    for (const o of stylis174NeedsFix) {
      console.log(' -', o.canonical_label || o.raw_label)
      if (!commit) continue
      const { error: upErr } = await supabase
        .from('global_offer_diopter_grids')
        .update({ add_min: 1, add_max: stylis174AddMax })
        .eq('offer_id', o.id)
      if (upErr) throw upErr
    }
  } else {
    console.log('[add] Stylis 1.74 XR Track Lite já estava com add_max=4.')
  }

  console.log('Resumo:')
  console.log('- XR Track Lite ofertas (p. 13) encontradas:', liteOffers.length)
  console.log('- Altura aplicada:', heightTargets.length, '=>', heightTarget)
  console.log('- Stylis 1.74 ofertas alvo:', stylis174Targets.length)
  console.log('- Stylis 1.74 ofertas corrigidas:', stylis174NeedsFix.length)
  console.log('- Inserção Airwear + Coloração especial necessária?:', needsInsert)
  console.log('- Oferta inserida:', insertedOfferId || null)
  console.log(commit ? 'Aplicado.' : 'Modo seco. Use --commit para aplicar.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

