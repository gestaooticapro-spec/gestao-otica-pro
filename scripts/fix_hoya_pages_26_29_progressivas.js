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
const verbose = args.includes('--verbose')

if (!versionId) {
  console.error('Uso: node scripts/fix_hoya_pages_26_29_progressivas.js --version-id=UUID [--commit]')
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
    case 'PNX':
      return 1.53
    case 'Organic':
      return 1.5
    case 'POLI':
      return 1.59
    default:
      return null
  }
}

function canonicalLabelFor(row) {
  return `${row.family} ${row.material} ${row.section} ${row.treatment}`
}

function buildImportKey(page, canonicalLabel, price, material) {
  return `${page} | ${canonicalLabel} | ${price} | ${material}`
}

function buildFeatures(pageCfg, row) {
  const base = {
    cor: row.section,
    row_notes: null,
    tratamento: row.treatment,
    min_fitting_height: pageCfg.fittingHeights[0],
    fitting_heights_available: pageCfg.fittingHeights,
    marcacao: pageCfg.marcacao,
  }
  if (row.flags?.solar) {
    base.solar = true
    base.generic_treatments = ['Solar']
  }
  if (row.flags?.polarizada) {
    base.solar = true
    base.polarizada = true
    base.generic_treatments = ['Solar', 'Polarizada']
  }
  return base
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

function chunkArray(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function pushExpected(list, pageCfg, section, treatment, material, price, sphRange, flags) {
  list.push({
    page: pageCfg.page,
    family: pageCfg.family,
    material,
    section,
    treatment,
    price,
    sph: sphRange,
    cyl: [pageCfg.cylMin, 0],
    add: pageCfg.add,
    diametro: pageCfg.diametro,
    fittingHeights: pageCfg.fittingHeights,
    marcacao: pageCfg.marcacao,
    flags: flags || null,
  })
}

function generateExpected() {
  const expected = []

  const cfgs = [
    {
      page: 'Pagina 26',
      family: 'Hoyalux Balansis',
      add: [0.75, 3.5],
      cylMin: -6,
      diametro: 'até 75mm',
      fittingHeights: [14, 18],
      marcacao: 'BS41 / BS81',
      sphByMaterial: {
        EYNOA: [-12, 8],
        'EYAS 2.0': [-10, 8],
        PNX: [-8, 6],
        Organic: [-8, 6],
      },
      sphPolarByMaterial: {
        EYNOA: [-12, 8],
        'EYAS 2.0': [-10, 8],
        Organic: [-8, 3],
      },
    },
    {
      page: 'Pagina 27',
      family: 'Hoyalux Daynamic',
      add: [0.75, 3.5],
      cylMin: -6,
      diametro: '65 até 80mm',
      fittingHeights: [14, 16, 18, 20],
      marcacao: 'DP1 + Altura (4/6/8/2)',
      sphByMaterial: {
        EYNOA: [-13, 7.5],
        'EYAS 2.0': [-13, 6.5],
        POLI: [-10, 6],
        PNX: [-8, 6],
        Organic: [-8, 6],
      },
      sphPolarByMaterial: {
        'EYAS 2.0': [-11.5, 6.5],
        Organic: [-8, 3],
      },
    },
    {
      page: 'Pagina 28',
      family: 'ARGOS',
      add: [1.0, 3.5],
      cylMin: -4,
      diametro: 'até 80mm',
      fittingHeights: [14, 18],
      marcacao: 'FSA1 ou FA1 OU DA + (1/5) + (1/X)',
      sphByMaterial: {
        EYNOA: [-13, 7.5],
        'EYAS 2.0': [-10, 6],
        POLI: [-10, 6],
        PNX: [-8, 6],
        Organic: [-8, 6],
      },
    },
    {
      page: 'Pagina 29',
      family: 'Amplitude',
      add: [1.0, 3.5],
      cylMin: -4,
      diametro: 'até 80mm',
      fittingHeights: [14, 18],
      marcacao: 'AMS ou AM + Material',
      sphByMaterial: {
        POLI: [-10, 6],
        PNX: [-8, 6],
        Organic: [-8, 6],
      },
    },
  ]

  const cfgByPage = new Map(cfgs.map((c) => [c.page, c]))

  // -------------------- Page 26: Balansis --------------------
  {
    const p = cfgByPage.get('Pagina 26')
    const incolor = {
      'Hi-Vision Meiryo': { EYNOA: 7159, 'EYAS 2.0': 5359, PNX: 4899, Organic: 4549 },
      'Hi-Vision LongLife BlueControl': { EYNOA: 6959, 'EYAS 2.0': 5159, PNX: 4699, Organic: 4349 },
      'No-Risk BlueControl': { EYNOA: 6709, 'EYAS 2.0': 4909, PNX: 4449, Organic: 4099 },
    }
    for (const [treat, byMat] of Object.entries(incolor)) {
      for (const [mat, price] of Object.entries(byMat)) {
        pushExpected(expected, p, 'INCOLOR', treat, mat, price, p.sphByMaterial[mat])
      }
    }
    const sensity2 = {
      'Hi-Vision Meiryo': { EYNOA: 8559, PNX: 6299, Organic: 5949 },
      'Hi-Vision LongLife BlueControl': { EYNOA: 8359, PNX: 6099, Organic: 5749 },
      'No-Risk BlueControl': { EYNOA: 8109, PNX: 5849, Organic: 5499 },
    }
    for (const [treat, byMat] of Object.entries(sensity2)) {
      for (const [mat, price] of Object.entries(byMat)) {
        pushExpected(expected, p, 'SENSITY 2', treat, mat, price, p.sphByMaterial[mat])
      }
    }
    const polar = { 'Hi-Vision SunPro': { EYNOA: 7859, 'EYAS 2.0': 6059, Organic: 5249 } }
    for (const [treat, byMat] of Object.entries(polar)) {
      for (const [mat, price] of Object.entries(byMat)) {
        pushExpected(expected, p, 'POLARIZADO', treat, mat, price, p.sphPolarByMaterial[mat], { polarizada: true })
      }
    }
    const color = { 'Hi-Vision Sun Pro': { EYNOA: 6999, 'EYAS 2.0': 5199, PNX: 4739, Organic: 4389 } }
    for (const [treat, byMat] of Object.entries(color)) {
      for (const [mat, price] of Object.entries(byMat)) {
        pushExpected(expected, p, 'COLORIDAS', treat, mat, price, p.sphByMaterial[mat], { solar: true })
      }
    }
  }

  // -------------------- Page 27: Daynamic --------------------
  {
    const p = cfgByPage.get('Pagina 27')
    const incolor = {
      'Hi-Vision Meiryo': { EYNOA: 5999, 'EYAS 2.0': 4199, PNX: 3739, Organic: 3389 },
      'Hi-Vision LongLife BlueControl': { EYNOA: 5799, 'EYAS 2.0': 3999, PNX: 3539, Organic: 3189 },
      'No-Risk BlueControl': { EYNOA: 5549, 'EYAS 2.0': 3749, POLI: 3289, PNX: 3289, Organic: 2939 },
      'Hi-Vision Hard': { EYNOA: 4799, 'EYAS 2.0': 2999, POLI: 2539, PNX: 2539, Organic: 2189 },
    }
    for (const [treat, byMat] of Object.entries(incolor)) {
      for (const [mat, price] of Object.entries(byMat)) {
        pushExpected(expected, p, 'INCOLOR', treat, mat, price, p.sphByMaterial[mat])
      }
    }
    const sensity2 = {
      'Hi-Vision Meiryo': { EYNOA: 7399, PNX: 5139, Organic: 4789 },
      'Hi-Vision LongLife BlueControl': { EYNOA: 7199, PNX: 4939, Organic: 4589 },
      'No-Risk BlueControl': { EYNOA: 6949, PNX: 4689, Organic: 4339 },
      'Hi-Vision Hard': { EYNOA: 6199, PNX: 3939, Organic: 3589 },
    }
    for (const [treat, byMat] of Object.entries(sensity2)) {
      for (const [mat, price] of Object.entries(byMat)) {
        pushExpected(expected, p, 'SENSITY 2', treat, mat, price, p.sphByMaterial[mat])
      }
    }
    const polar = { 'Hi-Vision SunPro': { 'EYAS 2.0': 4899, Organic: 4089 } }
    for (const [treat, byMat] of Object.entries(polar)) {
      for (const [mat, price] of Object.entries(byMat)) {
        pushExpected(expected, p, 'POLARIZADO', treat, mat, price, p.sphPolarByMaterial[mat], { polarizada: true })
      }
    }
    const color = { 'Hi-Vision Sun Pro': { EYNOA: 5839, 'EYAS 2.0': 4039, PNX: 3579, Organic: 3229 } }
    for (const [treat, byMat] of Object.entries(color)) {
      for (const [mat, price] of Object.entries(byMat)) {
        pushExpected(expected, p, 'COLORIDAS', treat, mat, price, p.sphByMaterial[mat], { solar: true })
      }
    }
  }

  // -------------------- Page 28: ARGOS --------------------
  {
    const p = cfgByPage.get('Pagina 28')
    const incolor = {
      'Hi-Vision Meiryo': { EYNOA: 4959, 'EYAS 2.0': 3159, POLI: 2699, PNX: 2699, Organic: 2349 },
      'Hi-Vision LongLife BlueControl': { EYNOA: 4759, 'EYAS 2.0': 2959, PNX: 2499, Organic: 2149 },
      'No-Risk BlueControl': { EYNOA: 4509, 'EYAS 2.0': 2709, POLI: 2249, PNX: 2249, Organic: 1899 },
      'Hi-Vision Hard': { EYNOA: 3909, 'EYAS 2.0': 2109, POLI: 1649, PNX: 1649, Organic: 1299 },
    }
    for (const [treat, byMat] of Object.entries(incolor)) {
      for (const [mat, price] of Object.entries(byMat)) {
        pushExpected(expected, p, 'INCOLOR', treat, mat, price, p.sphByMaterial[mat])
      }
    }
    const sensity2 = {
      'Hi-Vision Meiryo': { PNX: 4099, Organic: 3749 },
      'Hi-Vision LongLife BlueControl': { PNX: 3899, Organic: 3549 },
      'No-Risk BlueControl': { PNX: 3649, Organic: 3299 },
      'Hi-Vision Hard': { PNX: 3049, Organic: 2699 },
    }
    for (const [treat, byMat] of Object.entries(sensity2)) {
      for (const [mat, price] of Object.entries(byMat)) {
        pushExpected(expected, p, 'SENSITY 2', treat, mat, price, p.sphByMaterial[mat])
      }
    }
    const sensityOriginal = {
      'Hi-Vision LongLife BlueControl': { PNX: 3499, Organic: 3149 },
      'No-Risk BlueControl': { PNX: 3249, Organic: 2899 },
      'Hi-Vision Hard': { PNX: 2649, Organic: 2299 },
    }
    for (const [treat, byMat] of Object.entries(sensityOriginal)) {
      for (const [mat, price] of Object.entries(byMat)) {
        pushExpected(expected, p, 'SENSITY ORIGINAL', treat, mat, price, p.sphByMaterial[mat])
      }
    }
    const color = { 'Hi-Vision Sun Pro': { EYNOA: 4799, 'EYAS 2.0': 2999, PNX: 2539, Organic: 2189 } }
    for (const [treat, byMat] of Object.entries(color)) {
      for (const [mat, price] of Object.entries(byMat)) {
        pushExpected(expected, p, 'COLORIDAS', treat, mat, price, p.sphByMaterial[mat], { solar: true })
      }
    }
  }

  // -------------------- Page 29: Amplitude --------------------
  {
    const p = cfgByPage.get('Pagina 29')
    const incolor = {
      'No-Risk BlueControl': { POLI: 1249, PNX: 1149, Organic: 799 },
      'Hi-Vision Hard': { POLI: 1049, PNX: 949, Organic: 599 },
    }
    for (const [treat, byMat] of Object.entries(incolor)) {
      for (const [mat, price] of Object.entries(byMat)) {
        pushExpected(expected, p, 'INCOLOR', treat, mat, price, p.sphByMaterial[mat])
      }
    }
    const sensity2 = { 'No-Risk BlueControl': { PNX: 1749, Organic: 1399 } }
    for (const [treat, byMat] of Object.entries(sensity2)) {
      for (const [mat, price] of Object.entries(byMat)) {
        pushExpected(expected, p, 'SENSITY 2', treat, mat, price, p.sphByMaterial[mat])
      }
    }
    const color = { 'Hi-Vision Sun Pro': { PNX: 1439, Organic: 1089 } }
    for (const [treat, byMat] of Object.entries(color)) {
      for (const [mat, price] of Object.entries(byMat)) {
        pushExpected(expected, p, 'COLORIDAS', treat, mat, price, p.sphByMaterial[mat], { solar: true })
      }
    }
  }

  return { expected, cfgs }
}

async function main() {
  const pages = ['Pagina 26', 'Pagina 27', 'Pagina 28', 'Pagina 29']
  const familiesWanted = ['Hoyalux Balansis', 'Hoyalux Daynamic', 'ARGOS', 'Amplitude']

  const { expected, cfgs } = generateExpected()

  const { data: families, error: famErr } = await supabase
    .from('global_lens_families')
    .select('id,nome')
    .eq('version_id', versionId)
    .in('nome', familiesWanted)
  if (famErr) throw famErr

  const familyIdByName = new Map((families || []).map((f) => [f.nome, f.id]))
  for (const want of familiesWanted) {
    if (!familyIdByName.has(want)) throw new Error(`Familia nao encontrada no BD para essa versao: ${want}`)
  }

  const existingOffers = await fetchAll(
    supabase
      .from('global_lens_offers')
      .select(
        'id,family_id,canonical_label,raw_label,material,indice_refracao,base_price,features,source_page_reference,clinical_category,is_atomic_offer,already_includes_treatment,allows_composition'
      )
      .in('family_id', [...familyIdByName.values()])
      .in('source_page_reference', pages),
    1000
  )

  const existingByKey = new Map()
  for (const o of existingOffers) {
    const key = `${o.source_page_reference}||${o.family_id}||${o.material || ''}||${o.features?.cor || ''}||${o.features?.tratamento || ''}||${o.base_price}`
    existingByKey.set(key, o)
  }

  const existingGrids = existingOffers.length
    ? await fetchAll(
        supabase
          .from('global_offer_diopter_grids')
          .select('id,offer_id,sph_min,sph_max,cyl_min,cyl_max,add_min,add_max,metadata')
          .in(
            'offer_id',
            existingOffers.map((o) => o.id)
          ),
        2000
      )
    : []

  const gridsByOffer = new Map()
  for (const g of existingGrids) {
    const list = gridsByOffer.get(g.offer_id) || []
    list.push(g)
    gridsByOffer.set(g.offer_id, list)
  }

  const inserts = []
  const gridInserts = []
  const offerUpdates = []
  const gridUpdates = []

  const cfgByPage = new Map(cfgs.map((c) => [c.page, c]))

  for (const row of expected) {
    const familyId = familyIdByName.get(row.family)
    const canonical = canonicalLabelFor(row)
    const rawLabel = `${row.section} | ${row.treatment}`
    const idx = materialToIndex(row.material)
    const key = `${row.page}||${familyId}||${row.material}||${row.section}||${row.treatment}||${row.price}`
    const found = existingByKey.get(key) || null

    const pageCfg = cfgByPage.get(row.page)
    const wantFeatures = buildFeatures(pageCfg, row)

    const gridMetadata = {
      raw_grade: `${row.sph[0]} a ${row.sph[1]}`,
      diametro: row.diametro,
      fitting_heights_mm: row.fittingHeights,
      marcacao: row.marcacao,
    }

    if (!found) {
      const id = crypto.randomUUID()
      inserts.push({
        id,
        family_id: familyId,
        raw_label: rawLabel,
        canonical_label: canonical,
        material: row.material,
        indice_refracao: idx,
        is_atomic_offer: true,
        allows_composition: false,
        already_includes_treatment: true,
        features: wantFeatures,
        base_price: row.price,
        source_page_reference: row.page,
        confidence_level: 0.9,
        import_key: buildImportKey(row.page, canonical, row.price, row.material),
        clinical_category: 'multifocal',
      })

      gridInserts.push({
        offer_id: id,
        sph_min: row.sph[0],
        sph_max: row.sph[1],
        cyl_min: row.cyl[0],
        cyl_max: row.cyl[1],
        add_min: row.add[0],
        add_max: row.add[1],
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
    if (Number(found.indice_refracao) !== Number(idx)) patches.indice_refracao = idx

    if (found.is_atomic_offer !== true) patches.is_atomic_offer = true
    if (found.allows_composition !== false) patches.allows_composition = false
    if (found.already_includes_treatment !== true) patches.already_includes_treatment = true
    if (found.clinical_category !== 'multifocal') patches.clinical_category = 'multifocal'

    const mergedFeatures = { ...(found.features || {}), ...wantFeatures }
    if (JSON.stringify(mergedFeatures) !== JSON.stringify(found.features || {})) patches.features = mergedFeatures
    if (Object.keys(patches).length) offerUpdates.push({ id: found.id, patches })

    const gs = gridsByOffer.get(found.id) || []
    if (!gs.length) {
      gridInserts.push({
        offer_id: found.id,
        sph_min: row.sph[0],
        sph_max: row.sph[1],
        cyl_min: row.cyl[0],
        cyl_max: row.cyl[1],
        add_min: row.add[0],
        add_max: row.add[1],
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
      if (Number(g.add_min) !== Number(row.add[0])) gp.add_min = row.add[0]
      if (Number(g.add_max) !== Number(row.add[1])) gp.add_max = row.add[1]

      const mergedMeta = { ...(g.metadata || {}), ...gridMetadata }
      if (JSON.stringify(mergedMeta) !== JSON.stringify(g.metadata || {})) gp.metadata = mergedMeta

      if (Object.keys(gp).length) gridUpdates.push({ id: g.id, patches: gp })
    }
  }

  console.log('\nFIX_HOYA_P26_P29')
  console.log(`DRY-RUN: ${commit ? 'NAO (COMMIT)' : 'SIM'}`)
  console.log(`Expected offers: ${expected.length}`)
  console.log(`Existing offers on pages: ${existingOffers.length}`)
  console.log(`To insert offers: ${inserts.length}`)
  console.log(`To update offers: ${offerUpdates.length}`)
  console.log(`To insert grids: ${gridInserts.length}`)
  console.log(`To update grids: ${gridUpdates.length}`)

  if (verbose) {
    console.log('\n[DEBUG] Offer updates')
    console.log(JSON.stringify(offerUpdates, null, 2))
    console.log('\n[DEBUG] Grid updates')
    console.log(JSON.stringify(gridUpdates, null, 2))
  }

  if (!commit) {
    console.log('\n[DRY-RUN] Rode com --commit para aplicar as mudancas.')
    return
  }

  for (const chunk of chunkArray(inserts, 100)) {
    const { error } = await supabase.from('global_lens_offers').insert(chunk)
    if (error) throw error
  }
  for (const chunk of chunkArray(gridInserts, 200)) {
    const { error } = await supabase.from('global_offer_diopter_grids').insert(chunk)
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
  console.error('Erro fix hoya p26-p29:', err)
  process.exit(1)
})
