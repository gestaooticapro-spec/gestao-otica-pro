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
  console.error('Uso: node scripts/fix_optilab_pages_14_20.js --version-id=UUID [--commit]')
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

function pageNumberFromRef(ref) {
  const m = String(ref || '').match(/(\d{1,3})/)
  return m ? Number(m[1]) : null
}

function desiredForOffer(offer) {
  const label = noAcc(`${offer.canonical_label || ''} ${offer.raw_label || ''}`)
  const pageN = pageNumberFromRef(offer.source_page_reference)

  if (pageN == null || pageN < 14 || pageN > 20) return null

  // Page 14: XR Design
  if (pageN === 14 && label.includes('xr design')) {
    return {
      min_fitting_height: 14,
      add_min: 1,
      add_max: label.includes('stylis') && label.includes('1.74') ? 4 : 3.5,
    }
  }

  // Pages 15-16: Physio Extensee (+track on page 15)
  if ((pageN === 15 || pageN === 16) && label.includes('physio') && label.includes('extensee')) {
    return {
      min_fitting_height: 14,
      add_min: 1,
      add_max: label.includes('stylis') && label.includes('1.74') ? 4 : 3.5,
    }
  }

  // Page 17: Comfort Digital (Comfort Max)
  if (pageN === 17 && label.includes('comfort') && label.includes('digital')) {
    return {
      min_fitting_height: 17,
      add_min: 0.75,
      add_max: 3.5,
    }
  }

  // Page 18: Comfort (solares/coloração) and Comfort Tradicional + Comfort Digital short
  if (pageN === 18 && label.includes('comfort')) {
    if (label.includes('digital') && label.includes('short')) {
      // From page 18 footnote: "Versão Short possui adição máxima de 3.00" and "Versão short não disponível nas lentes solares"
      return {
        min_fitting_height: 14,
        add_min: null,
        add_max: 3.0,
      }
    }
    if (label.includes('solares') && label.includes('coloracao')) {
      return {
        min_fitting_height: 17,
        add_min: 0.75,
        add_max: 3.5,
      }
    }
    if (label.includes('tradicional') || label.includes('coloracao')) {
      return {
        min_fitting_height: 17,
        add_min: 1,
        add_max: 3.5,
      }
    }
  }

  // Page 19: Liberty (Liberty 3.0 + Liberty Tradicional + Liberty Digital short)
  if (pageN === 19 && label.includes('liberty')) {
    if (label.includes('tradicional')) {
      return { min_fitting_height: 18, add_min: 1, add_max: 3.5 }
    }
    if (label.includes('digital') && label.includes('short')) {
      // From page 19 footnote: "Versão Short possui adição máxima de 3.00" + "não disponível nas lentes solares"
      return { min_fitting_height: 14, add_min: 1, add_max: 3.0 }
    }
    return { min_fitting_height: 17, add_min: 1, add_max: 3.5 }
  }

  // Page 20: Liberty (Coloração) + Activities blocks
  if (pageN === 20) {
    if (label.includes('liberty') && label.includes('coloracao')) {
      return { min_fitting_height: 18, add_min: 1, add_max: 3.5 }
    }
    if (label.includes('roadpilot')) {
      return { min_fitting_height: 14, add_min: 1, add_max: 3.5 }
    }
    if (label.includes('digitime') || label.includes('sportive') || label.includes('activities')) {
      return { min_fitting_height: 18, add_min: 1, add_max: 3.5 }
    }
  }

  return null
}

async function insertIfMissing({
  versionId,
  vernizId,
  offers,
  gridsByOfferId,
  familyPredicate,
  templatePredicate,
  missingPredicate,
  newCanonicalLabel,
  newBasePrice,
  pageReference,
}) {
  const existing = offers.find(missingPredicate)
  if (existing) return { inserted: false, healed: false, offerId: existing.id }

  const template = offers.find(templatePredicate)
  if (!template) throw new Error('Template não encontrado para inserir oferta faltante com segurança.')

  const templateGrids = gridsByOfferId.get(template.id) || []
  if (!templateGrids.length) throw new Error('Template não possui grade; não consigo inserir oferta faltante com segurança.')

  const raw = template.raw_label ? `${template.raw_label} + Coloração especial` : 'Airwear + Coloração especial'
  const importKey = `${template.import_key || 'template'}__coloracao_especial`

  const payload = {
    family_id: template.family_id,
    import_key: importKey,
    raw_label: raw,
    canonical_label: newCanonicalLabel,
    clinical_category: template.clinical_category,
    material: template.material,
    indice_refracao: template.indice_refracao,
    is_atomic_offer: template.is_atomic_offer,
    already_includes_treatment: template.already_includes_treatment,
    allows_composition: template.allows_composition,
    features: { ...(ensureObject(template.features)), coloracao_especial: true },
    base_price: newBasePrice,
    source_page_reference: pageReference || template.source_page_reference,
  }

  console.log('[insert] faltante =>', newCanonicalLabel, 'price=', newBasePrice, 'page=', payload.source_page_reference)

  if (!commit) return { inserted: false, healed: false, offerId: null, dryRun: true, payload }

  const { data: insertedOffer, error: insErr } = await supabase
    .from('global_lens_offers')
    .insert(payload)
    .select('id')
    .single()
  if (insErr) throw insErr

  const { error: compatErr } = await supabase.from('global_offer_treatments_compatibility').insert({
    offer_id: insertedOffer.id,
    treatment_id: vernizId,
    special_price: newBasePrice,
    price_mode: 'final',
  })
  if (compatErr) throw compatErr

  const gridsPayload = templateGrids.map((g) => ({
    offer_id: insertedOffer.id,
    sph_min: g.sph_min,
    sph_max: g.sph_max,
    cyl_min: g.cyl_min,
    cyl_max: g.cyl_max,
    add_min: g.add_min,
    add_max: g.add_max,
    metadata: g.metadata,
  }))

  const { error: gridErr } = await supabase.from('global_offer_diopter_grids').insert(gridsPayload)
  if (gridErr) throw gridErr

  return { inserted: true, healed: false, offerId: insertedOffer.id }
}

async function main() {
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

  const { data: treatments, error: treatErr } = await supabase
    .from('global_treatments')
    .select('id,nome')
    .eq('version_id', versionId)
  if (treatErr) throw treatErr
  const verniz = (treatments || []).find((t) => noAcc(t.nome) === 'verniz hc')
  if (!verniz) throw new Error('Tratamento Verniz Hc não encontrado na versão.')

  const { data: offers, error: offErr } = await supabase
    .from('global_lens_offers')
    .select(
      'id,family_id,import_key,raw_label,canonical_label,clinical_category,material,indice_refracao,is_atomic_offer,already_includes_treatment,allows_composition,features,base_price,source_page_reference',
    )
    .in('family_id', familyIds)
  if (offErr) throw offErr

  const offers14to20 = (offers || []).filter((o) => {
    const n = pageNumberFromRef(o.source_page_reference)
    return n != null && n >= 14 && n <= 20
  })

  const offerIds = offers14to20.map((o) => o.id)
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

  // Insert known missing "Airwear + Coloração especial" rows (14, 15, 16)
  await insertIfMissing({
    versionId,
    vernizId: verniz.id,
    offers: offers14to20,
    gridsByOfferId,
    templatePredicate: (o) => {
      const t = noAcc(o.canonical_label || o.raw_label)
      return (
        pageNumberFromRef(o.source_page_reference) === 14 &&
        t.includes('solares') &&
        t.includes('xr design') &&
        t.includes('airwear') &&
        !t.includes('xperio') &&
        !t.includes('coloracao especial')
      )
    },
    missingPredicate: (o) => {
      const t = noAcc(o.canonical_label || o.raw_label)
      return pageNumberFromRef(o.source_page_reference) === 14 && t.includes('solares') && t.includes('xr design') && t.includes('airwear') && t.includes('coloracao especial')
    },
    newCanonicalLabel: 'VARILUX® XR SERIES SOLARES / COLORAÇÃO XR Design Airwear + Coloração especial',
    newBasePrice: 5559,
    pageReference: 'Pagina 14',
  })

  await insertIfMissing({
    versionId,
    vernizId: verniz.id,
    offers: offers14to20,
    gridsByOfferId,
    templatePredicate: (o) => {
      const t = noAcc(o.canonical_label || o.raw_label)
      return (
        pageNumberFromRef(o.source_page_reference) === 15 &&
        t.includes('coloracao') &&
        t.includes('extensee') &&
        t.includes('cvp') &&
        t.includes('airwear') &&
        !t.includes('coloracao especial')
      )
    },
    missingPredicate: (o) => {
      const t = noAcc(o.canonical_label || o.raw_label)
      return (
        pageNumberFromRef(o.source_page_reference) === 15 &&
        t.includes('coloracao') &&
        t.includes('extensee') &&
        t.includes('cvp') &&
        t.includes('airwear') &&
        t.includes('coloracao especial')
      )
    },
    newCanonicalLabel: 'VARILUX® Physio® Extensee COLORAÇÃO Essilor Fit Eyecode | CVP Airwear + Coloração especial',
    newBasePrice: 3389,
    pageReference: 'Pagina 15',
  })

  await insertIfMissing({
    versionId,
    vernizId: verniz.id,
    offers: offers14to20,
    gridsByOfferId,
    templatePredicate: (o) => {
      const t = noAcc(o.canonical_label || o.raw_label)
      return (
        pageNumberFromRef(o.source_page_reference) === 16 &&
        t.includes('coloracao') &&
        t.includes('extensee') &&
        !t.includes('track') &&
        t.includes('airwear') &&
        !t.includes('coloracao especial')
      )
    },
    missingPredicate: (o) => {
      const t = noAcc(o.canonical_label || o.raw_label)
      return pageNumberFromRef(o.source_page_reference) === 16 && t.includes('coloracao') && t.includes('extensee') && !t.includes('track') && t.includes('airwear') && t.includes('coloracao especial')
    },
    newCanonicalLabel: 'VARILUX® Physio® Extensee COLORAÇÃO Essilor Fit Eyecode Airwear + Coloração especial',
    newBasePrice: 2999,
    pageReference: 'Pagina 16',
  })

  // Reload offers/grids for 14-20 after inserts (so subsequent updates apply to inserted rows too)
  const { data: offersAfter, error: offErr2 } = await supabase
    .from('global_lens_offers')
    .select('id,raw_label,canonical_label,features,source_page_reference')
    .in('family_id', familyIds)
  if (offErr2) throw offErr2
  const offers14to20After = (offersAfter || []).filter((o) => {
    const n = pageNumberFromRef(o.source_page_reference)
    return n != null && n >= 14 && n <= 20
  })
  const offerIds2 = offers14to20After.map((o) => o.id)
  const { data: grids2, error: gridErr2 } = await supabase
    .from('global_offer_diopter_grids')
    .select('id,offer_id,add_min,add_max')
    .in('offer_id', offerIds2)
  if (gridErr2) throw gridErr2
  const grids2ByOfferId = new Map()
  for (const g of grids2 || []) {
    const list = grids2ByOfferId.get(g.offer_id) || []
    list.push(g)
    grids2ByOfferId.set(g.offer_id, list)
  }

  let updatedFeatures = 0
  let updatedGrids = 0

  for (const offer of offers14to20After) {
    const desired = desiredForOffer(offer)
    if (!desired) continue

    // features.min_fitting_height
    if (desired.min_fitting_height != null) {
      const feat = ensureObject(offer.features)
      if (feat.min_fitting_height !== desired.min_fitting_height) {
        updatedFeatures += 1
        console.log('[height]', offer.source_page_reference, offer.canonical_label || offer.raw_label, '=>', desired.min_fitting_height)
        if (commit) {
          const nextFeatures = { ...feat, min_fitting_height: desired.min_fitting_height }
          const { error: upErr } = await supabase.from('global_lens_offers').update({ features: nextFeatures }).eq('id', offer.id)
          if (upErr) throw upErr
        }
      }
    }

    // grids add_min / add_max
    const rows = grids2ByOfferId.get(offer.id) || []
    if (!rows.length) continue

    const wantAddMin = desired.add_min
    const wantAddMax = desired.add_max
    const needsAddMin = wantAddMin != null && rows.some((r) => Number(r.add_min) !== Number(wantAddMin))
    const needsAddMax = wantAddMax != null && rows.some((r) => Number(r.add_max) !== Number(wantAddMax))
    if (needsAddMin || needsAddMax) {
      updatedGrids += 1
      console.log('[add]', offer.source_page_reference, offer.canonical_label || offer.raw_label, '=>', {
        add_min: wantAddMin != null ? wantAddMin : '(keep)',
        add_max: wantAddMax != null ? wantAddMax : '(keep)',
      })
      if (commit) {
        const patch = {}
        if (wantAddMin != null) patch.add_min = wantAddMin
        if (wantAddMax != null) patch.add_max = wantAddMax
        const { error: upErr } = await supabase.from('global_offer_diopter_grids').update(patch).eq('offer_id', offer.id)
        if (upErr) throw upErr
      }
    }
  }

  console.log('Resumo:')
  console.log('- Ofertas (p. 14-20):', offers14to20After.length)
  console.log('- Updates features(min_fitting_height):', updatedFeatures)
  console.log('- Updates grades(add_min/add_max):', updatedGrids)
  console.log(commit ? 'Aplicado.' : 'Modo seco. Use --commit para aplicar.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
