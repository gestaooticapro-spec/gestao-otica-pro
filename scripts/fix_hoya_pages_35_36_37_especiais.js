import path from 'path'
import dotenv from 'dotenv'
import crypto from 'crypto'
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
  console.error('Uso: node scripts/fix_hoya_pages_35_36_37_especiais.js --version-id=UUID [--commit]')
  process.exit(1)
}

function materialToIndex(material) {
  switch (material) {
    case 'EYVIA':
      return 1.74
    case 'EYNOA':
      return 1.67
    case 'EYAS 2.0':
      return 1.6
    case 'POLI':
      return 1.59
    case 'PNX':
      return 1.53
    case 'Organic':
      return 1.5
    default:
      return null
  }
}

function buildImportKey(page, canonicalLabel, price, material) {
  return `${page} | ${canonicalLabel} | ${price} | ${material || 'sem-material'}`
}

function canonicalLabelFor(row) {
  return `${row.family} ${row.material} ${row.section} ${row.treatment}`
}

function buildFeatures(row) {
  const base = {
    cor: row.section,
    row_notes: null,
    tratamento: row.treatment,
    ...(row.min_fitting_height != null ? { min_fitting_height: row.min_fitting_height } : {}),
    ...(row.fitting_heights_available ? { fitting_heights_available: row.fitting_heights_available } : {}),
    ...(row.marcacao ? { marcacao: row.marcacao } : {}),
    ...(row.design ? { design: row.design } : {}),
    ...(row.opcoes ? { opcoes: row.opcoes } : {}),
    ...(row.variantes ? { variantes: row.variantes } : {}),
    ...(row.boost_adds ? { boost_adds: row.boost_adds } : {}),
    ...(row.indicacao ? { indicacao: row.indicacao } : {}),
    ...(row.observacao ? { observacao: row.observacao } : {}),
  }
  if (row.flags?.solar) {
    base.solar = true
    base.generic_treatments = row.flags?.polarizada ? ['Solar', 'Polarizada'] : ['Solar']
  }
  if (row.flags?.polarizada) {
    base.polarizada = true
  }
  return base
}

function normalizeExistingMaterial(offer) {
  if (offer.material) return offer.material
  const idx = offer.indice_refracao != null ? Number(offer.indice_refracao) : null
  if (idx === 1.74) return 'EYVIA'
  if (idx === 1.67) return 'EYNOA'
  if (idx === 1.6) return 'EYAS 2.0'
  if (idx === 1.59) return 'POLI'
  if (idx === 1.53) return 'PNX'
  if (idx === 1.5) return 'Organic'
  return null
}

async function fetchAll(query, pageSize = 1000) {
  let from = 0
  let all = []
  for (;;) {
    const { data, error } = await query.range(from, from + pageSize - 1)
    if (error) throw error
    const rows = data || []
    all = all.concat(rows)
    if (rows.length < pageSize) break
    from += pageSize
  }
  return all
}

function expectedForPages() {
  const expected = []

  // -------------------- Page 35: SYNC III --------------------
  {
    const page = 'Pagina 35'
    const family = 'SYNC III'
    const cyl = [-6, 0]
    const min_fitting_height = 18
    const fitting_heights_available = [18]
    const marcacao = 'DS1+ADD'
    const opcoes = [5, 9, 13]
    const variantes = ['SYNC III -5 (+0.57)', 'SYNC III -9 (+0.95)', 'SYNC III -13 (+1.32)']
    const boost_adds = { 5: 0.57, 9: 0.95, 13: 1.32 }
    const indicacao = 'Fadiga ocular / acomodacao (13-45 anos)'

    const sphByMat = {
      EYVIA: [-13, 9],
      EYNOA: [-13, 7.5],
      'EYAS 2.0': [-10, 6],
      POLI: [-10, 6],
      PNX: [-8, 6],
      Organic: [-8, 6],
    }

    function push(section, treatment, material, price, flags, sphOverride, diameterOverride) {
      expected.push({
        page,
        family,
        section,
        treatment,
        material,
        price,
        sph: sphOverride || sphByMat[material],
        cyl,
        // Important: SYNC III is not a progressive. Don't put add_min/max in the grid
        // to avoid classifying it as multifocal by "hasAddGrid" heuristics.
        add: null,
        grid_metadata: {
          raw_grade: `${(sphOverride || sphByMat[material])[0]} a ${(sphOverride || sphByMat[material])[1]}`,
          diametro: diameterOverride || 'até 80mm',
          boost_adds,
          opcoes,
        },
        min_fitting_height,
        fitting_heights_available,
        marcacao,
        opcoes,
        variantes,
        boost_adds,
        indicacao,
        flags: flags || null,
        clinical_category: 'visao_simples',
      })
    }

    // INCOLOR
    push('INCOLOR', 'Hi-Vision LongLife BlueControl', 'EYVIA', 3709)
    push('INCOLOR', 'Hi-Vision LongLife BlueControl', 'EYNOA', 3359)
    push('INCOLOR', 'Hi-Vision LongLife BlueControl', 'EYAS 2.0', 2559)
    push('INCOLOR', 'Hi-Vision LongLife BlueControl', 'PNX', 2099)
    push('INCOLOR', 'Hi-Vision LongLife BlueControl', 'Organic', 1749)

    push('INCOLOR', 'No-Risk BlueControl', 'EYNOA', 3109)
    push('INCOLOR', 'No-Risk BlueControl', 'EYAS 2.0', 2309)
    push('INCOLOR', 'No-Risk BlueControl', 'POLI', 1849)
    push('INCOLOR', 'No-Risk BlueControl', 'PNX', 1849)
    push('INCOLOR', 'No-Risk BlueControl', 'Organic', 1499)

    // SENSITY 2
    push('SENSITY 2', 'Hi-Vision LongLife BlueControl', 'EYNOA', 4359)
    push('SENSITY 2', 'Hi-Vision LongLife BlueControl', 'PNX', 3099)
    push('SENSITY 2', 'Hi-Vision LongLife BlueControl', 'Organic', 2749)

    push('SENSITY 2', 'No-Risk BlueControl', 'EYNOA', 4109)
    push('SENSITY 2', 'No-Risk BlueControl', 'PNX', 2849)
    push('SENSITY 2', 'No-Risk BlueControl', 'Organic', 2499)

    // POLARIZADO (only Organic) with different sph range and diameter up to 76mm
    push(
      'POLARIZADO',
      'Hi-Vision Sun Pro',
      'Organic',
      2649,
      { solar: true, polarizada: true },
      [-8, 3],
      'até 76mm'
    )

    // COLORIDAS
    push('COLORIDAS', 'Hi-Vision Sun Pro', 'EYVIA', 3999, { solar: true })
    push('COLORIDAS', 'Hi-Vision Sun Pro', 'EYNOA', 3399, { solar: true })
    push('COLORIDAS', 'Hi-Vision Sun Pro', 'EYAS 2.0', 2599, { solar: true })
    push('COLORIDAS', 'Hi-Vision Sun Pro', 'PNX', 2139, { solar: true })
    push('COLORIDAS', 'Hi-Vision Sun Pro', 'Organic', 1789, { solar: true })
  }

  // -------------------- Page 36: EnRoute Progressiva --------------------
  {
    const page = 'Pagina 36'
    const family = 'EnRoute Progressiva'
    const cyl = [-6, 0]
    const add = [0.75, 3.5]
    const min_fitting_height = 18
    const fitting_heights_available = [18]
    const marcacao = 'RP43'
    const observacao = 'Lentes produzidas fora do Brasil'

    expected.push({
      page,
      family,
      section: 'INCOLOR',
      treatment: 'Antirreflexo EnRoute',
      material: 'EYNOA',
      price: 6699,
      sph: [-12, 6],
      cyl,
      add,
      grid_metadata: { raw_grade: '-12 a +6', diametro: 'até 75mm' },
      min_fitting_height,
      fitting_heights_available,
      marcacao,
      observacao,
      flags: null,
      clinical_category: 'multifocal',
    })
    expected.push({
      page,
      family,
      section: 'INCOLOR',
      treatment: 'Antirreflexo EnRoute',
      material: 'EYAS 2.0',
      price: 4899,
      sph: [-10, 6],
      cyl,
      add,
      grid_metadata: { raw_grade: '-10 a +6', diametro: 'até 75mm' },
      min_fitting_height,
      fitting_heights_available,
      marcacao,
      observacao,
      flags: null,
      clinical_category: 'multifocal',
    })
  }

  // -------------------- Page 37: EnRoute Visao Simples --------------------
  {
    const page = 'Pagina 37'
    const family = 'EnRoute Visao Simples'
    const cyl = [-4, 0]
    const design = 'Asféricas e atóricas'
    const marcacao = '(-)'
    const observacao = 'Lentes produzidas fora do Brasil'

    expected.push({
      page,
      family,
      section: 'INCOLOR',
      treatment: 'Antirreflexo EnRoute',
      material: 'EYNOA',
      price: 3090,
      sph: [-15, 6],
      cyl,
      add: null,
      grid_metadata: { raw_grade: '-15 a +6', diametro: 'até 75mm' },
      design,
      marcacao,
      observacao,
      flags: null,
      clinical_category: 'visao_simples',
    })
    expected.push({
      page,
      family,
      section: 'INCOLOR',
      treatment: 'Antirreflexo EnRoute',
      material: 'EYAS 2.0',
      price: 2290,
      sph: [-13, 6],
      cyl,
      add: null,
      grid_metadata: { raw_grade: '-13 a +6', diametro: 'até 75mm' },
      design,
      marcacao,
      observacao,
      flags: null,
      clinical_category: 'visao_simples',
    })
  }

  return expected
}

async function main() {
  const pages = ['Pagina 35', 'Pagina 36', 'Pagina 37']
  const familiesWanted = ['SYNC III', 'EnRoute Progressiva', 'EnRoute Visao Simples']
  const EXPECTED = expectedForPages()

  const { data: families, error: famErr } = await supabase
    .from('global_lens_families')
    .select('id,nome')
    .eq('version_id', versionId)
    .in('nome', familiesWanted)
  if (famErr) throw famErr

  const familyByName = new Map((families || []).map((f) => [f.nome, f.id]))
  const familyNameById = new Map((families || []).map((f) => [f.id, f.nome]))
  const familyIds = (families || []).map((f) => f.id)

  const existingOffers = await fetchAll(
    supabase
      .from('global_lens_offers')
      .select(
        'id,family_id,canonical_label,raw_label,base_price,material,indice_refracao,features,source_page_reference,clinical_category'
      )
      .in('family_id', familyIds)
      .in('source_page_reference', pages),
    1000
  )
  for (const o of existingOffers) o.family_name = familyNameById.get(o.family_id) || null

  const existingOfferIds = existingOffers.map((o) => o.id)
  const grids = existingOfferIds.length
    ? await fetchAll(
        supabase
          .from('global_offer_diopter_grids')
          .select('id,offer_id,sph_min,sph_max,cyl_min,cyl_max,add_min,add_max,metadata')
          .in('offer_id', existingOfferIds),
        1000
      )
    : []

  const gridsByOffer = new Map()
  for (const g of grids) {
    const list = gridsByOffer.get(g.offer_id) || []
    list.push(g)
    gridsByOffer.set(g.offer_id, list)
  }

  // Key: page||family_id||material||price||section||treatment
  const existingByKey = new Map()
  for (const o of existingOffers) {
    const normMat = normalizeExistingMaterial(o)
    const key = `${o.source_page_reference}||${o.family_id}||${normMat}||${Number(o.base_price)}||${o.features?.cor}||${o.features?.tratamento}`
    if (!existingByKey.has(key)) existingByKey.set(key, o)
  }

  const inserts = []
  const gridInserts = []
  const offerUpdates = []
  const gridUpdates = []

  for (const row of EXPECTED) {
    const familyId = familyByName.get(row.family)
    if (!familyId) {
      console.warn(`Familia nao encontrada: ${row.family}`)
      continue
    }

    const canonical = canonicalLabelFor(row)
    const rawLabel = canonical
    const wantIdx = materialToIndex(row.material)
    const key = `${row.page}||${familyId}||${row.material}||${Number(row.price)}||${row.section}||${row.treatment}`
    const found = existingByKey.get(key) || null

    const wantFeatures = buildFeatures(row)
    const gridMetadata = { ...(row.grid_metadata || {}) }
    const clinicalCategory = row.clinical_category || 'indefinida'

    if (!found) {
      const id = crypto.randomUUID()
      inserts.push({
        id,
        family_id: familyId,
        raw_label: rawLabel,
        canonical_label: canonical,
        material: row.material,
        indice_refracao: wantIdx,
        is_atomic_offer: true,
        allows_composition: false,
        already_includes_treatment: true,
        features: wantFeatures,
        base_price: row.price,
        source_page_reference: row.page,
        confidence_level: 0.9,
        import_key: buildImportKey(row.page, canonical, row.price, row.material),
        clinical_category: clinicalCategory,
      })
      gridInserts.push({
        offer_id: id,
        sph_min: row.sph[0],
        sph_max: row.sph[1],
        cyl_min: row.cyl[0],
        cyl_max: row.cyl[1],
        add_min: row.add ? row.add[0] : null,
        add_max: row.add ? row.add[1] : null,
        metadata: gridMetadata,
      })
      continue
    }

    const patches = {}
    if (found.canonical_label !== canonical) patches.canonical_label = canonical
    if (found.raw_label !== rawLabel) patches.raw_label = rawLabel
    if (Number(found.base_price) !== Number(row.price)) patches.base_price = row.price
    if (found.source_page_reference !== row.page) patches.source_page_reference = row.page

    if (found.material !== row.material) patches.material = row.material
    if (Number(found.indice_refracao) !== Number(wantIdx)) patches.indice_refracao = wantIdx

    const mergedFeatures = { ...(found.features || {}), ...wantFeatures }
    if (JSON.stringify(mergedFeatures) !== JSON.stringify(found.features || {})) patches.features = mergedFeatures

    if (found.clinical_category !== clinicalCategory) patches.clinical_category = clinicalCategory

    if (Object.keys(patches).length) offerUpdates.push({ id: found.id, patches })

    const gs = gridsByOffer.get(found.id) || []
    if (!gs.length) {
      gridInserts.push({
        offer_id: found.id,
        sph_min: row.sph[0],
        sph_max: row.sph[1],
        cyl_min: row.cyl[0],
        cyl_max: row.cyl[1],
        add_min: row.add ? row.add[0] : null,
        add_max: row.add ? row.add[1] : null,
        metadata: gridMetadata,
      })
      continue
    }

    for (const g of gs) {
      const gp = {}
      if (Number(g.sph_min) !== Number(row.sph[0])) gp.sph_min = row.sph[0]
      if (Number(g.sph_max) !== Number(row.sph[1])) gp.sph_max = row.sph[1]
      if (Number(g.cyl_min) !== Number(row.cyl[0])) gp.cyl_min = row.cyl[0]
      if (Number(g.cyl_max) !== Number(row.cyl[1])) gp.cyl_max = row.cyl[1]

      const wantAddMin = row.add ? row.add[0] : null
      const wantAddMax = row.add ? row.add[1] : null
      if ((g.add_min ?? null) !== wantAddMin) gp.add_min = wantAddMin
      if ((g.add_max ?? null) !== wantAddMax) gp.add_max = wantAddMax

      const mergedMeta = { ...(g.metadata || {}), ...gridMetadata }
      if (JSON.stringify(mergedMeta) !== JSON.stringify(g.metadata || {})) gp.metadata = mergedMeta

      if (Object.keys(gp).length) gridUpdates.push({ id: g.id, patches: gp })
    }
  }

  console.log('\nFIX_HOYA_P35_P37_ESPECIAIS')
  console.log(`DRY-RUN: ${commit ? 'NAO (COMMIT)' : 'SIM'}`)
  console.log(`Expected cells: ${EXPECTED.length}`)
  console.log(`Existing offers on pages: ${existingOffers.length}`)
  console.log(`To insert offers: ${inserts.length}`)
  console.log(`To update offers: ${offerUpdates.length}`)
  console.log(`To insert grids: ${gridInserts.length}`)
  console.log(`To update grids: ${gridUpdates.length}`)

  if (!commit) {
    console.log('\n[DRY-RUN] Rode com --commit para aplicar as mudancas.')
    return
  }

  if (inserts.length) {
    const { error } = await supabase.from('global_lens_offers').insert(inserts)
    if (error) throw error
  }
  if (gridInserts.length) {
    const { error } = await supabase.from('global_offer_diopter_grids').insert(gridInserts)
    if (error) throw error
  }

  for (const u of offerUpdates) {
    const { error } = await supabase.from('global_lens_offers').update(u.patches).eq('id', u.id)
    if (error) throw error
  }

  for (const g of gridUpdates) {
    const { error } = await supabase.from('global_offer_diopter_grids').update(g.patches).eq('id', g.id)
    if (error) throw error
  }

  console.log('\n[COMMIT] Mudancas aplicadas. Rode o audit para validar.')
}

main().catch((err) => {
  console.error('Erro fix hoya p35-37:', err)
  process.exit(1)
})

