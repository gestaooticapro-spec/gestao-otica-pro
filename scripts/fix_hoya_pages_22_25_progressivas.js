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
  console.error('Uso: node scripts/fix_hoya_pages_22_25_progressivas.js --version-id=UUID [--commit]')
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
    default:
      return null
  }
}

function indexToken(idx) {
  if (idx == null) return null
  return Number(idx).toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

function canonicalLabelFor(row) {
  const idx = materialToIndex(row.material)
  const token = row.material === 'Organic' ? 'Organic' : row.material === 'EYAS 2.0' ? 'EYAS 2.0' : indexToken(idx)
  return `${row.family} ${token} ${row.section} ${row.treatment}`
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
  if (pageCfg.desenhos) base.desenhos = pageCfg.desenhos
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
    cyl: [-6, 0],
    add: pageCfg.add,
    diametro: pageCfg.diametro,
    fittingHeights: pageCfg.fittingHeights,
    marcacao: pageCfg.marcacao,
    desenhos: pageCfg.desenhos || null,
    flags: flags || null,
  })
}

function generateExpected() {
  const expected = []

  const cfgs = [
    {
      page: 'Pagina 22',
      family: 'Hoyalux iD MySelf',
      add: [0.75, 3.5],
      diametro: 'até 75mm',
      fittingHeights: [14, 15, 17, 18, 19, 20],
      marcacao: 'MSF+Corredor + Iniciais do usuário',
      sphByMaterial: {
        EYVIA: [-15, 10],
        EYNOA: [-13, 8],
        'EYAS 2.0': [-11, 8],
        PNX: [-8, 6],
        Organic: [-8, 6],
      },
    },
    {
      page: 'Pagina 23',
      family: 'Hoyalux iD MyStyle V+',
      add: [1.0, 3.5],
      diametro: 'até 75mm',
      fittingHeights: [14, 15, 17, 18, 19, 20],
      marcacao: 'MSV+Corredor + Iniciais do usuário',
      sphByMaterial: {
        EYVIA: [-15, 10],
        EYNOA: [-13, 8],
        'EYAS 2.0': [-11, 8],
        PNX: [-8, 6],
        Organic: [-8, 6],
      },
    },
    {
      page: 'Pagina 24',
      family: 'Hoyalux iD LifeStyle 4i',
      add: [0.75, 3.5],
      diametro: 'até 80mm',
      fittingHeights: [14, 15, 17, 18],
      marcacao: 'L 4i41 / L 4i51 / L 4i71 / L 4i81 / + O / U / I + Iniciais do usuário',
      desenhos: ['OUTDOOR', 'URBAN', 'INDOOR'],
      sphByMaterial: {
        EYVIA: [-13, 8],
        EYNOA: [-12, 8],
        'EYAS 2.0': [-10, 8],
        PNX: [-8, 6],
        Organic: [-8, 6],
      },
      sphPolarByMaterial: {
        EYNOA: [-12, 8],
        'EYAS 2.0': [-10, 8],
        PNX: [-8, 5.5],
        Organic: [-8, 5.0],
      },
    },
    {
      page: 'Pagina 25',
      family: 'Hoyalux iD LifeStyle 4',
      add: [0.75, 3.5],
      diametro: 'até 80mm',
      fittingHeights: [14, 15, 17, 18],
      marcacao: 'L 441/L451/L471/L481/ + O/U/I + Iniciais do usuário',
      desenhos: ['OUTDOOR', 'URBAN', 'INDOOR'],
      sphByMaterial: {
        EYVIA: [-13, 8],
        EYNOA: [-12, 8],
        'EYAS 2.0': [-10, 8],
        PNX: [-8, 6],
        Organic: [-8, 6],
      },
      sphPolarByMaterial: {
        EYNOA: [-12, 8],
        'EYAS 2.0': [-10, 8],
        PNX: [-8, 5.5],
        Organic: [-8, 5.0],
      },
    },
  ]

  // Page 22 prices
  const p22 = cfgs[0]
  const p22_incolor = {
    'Hi-Vision Meiryo': { EYVIA: 14509, EYNOA: 13009, 'EYAS 2.0': 11209, PNX: 10749, Organic: 10399 },
    'Hi-Vision LongLife BlueControl': { EYVIA: 14309, EYNOA: 12809, 'EYAS 2.0': 11009, PNX: 10549, Organic: 10199 },
  }
  for (const [treat, byMat] of Object.entries(p22_incolor)) {
    for (const [mat, price] of Object.entries(byMat)) {
      pushExpected(expected, p22, 'INCOLOR', treat, mat, price, p22.sphByMaterial[mat])
    }
  }
  const p22_sensity = {
    'Hi-Vision Meiryo': { EYNOA: 14409, 'EYAS 2.0': 12609, PNX: 12149, Organic: 11799 },
    'Hi-Vision LongLife BlueControl': { EYNOA: 14209, 'EYAS 2.0': 12409, PNX: 11949, Organic: 11599 },
  }
  for (const [treat, byMat] of Object.entries(p22_sensity)) {
    for (const [mat, price] of Object.entries(byMat)) {
      pushExpected(expected, p22, 'SENSITY 2', treat, mat, price, p22.sphByMaterial[mat])
    }
  }
  const p22_color = { 'Hi-Vision Sun Pro': { EYVIA: 14599, EYNOA: 13099, 'EYAS 2.0': 11299, PNX: 10839, Organic: 10489 } }
  for (const [treat, byMat] of Object.entries(p22_color)) {
    for (const [mat, price] of Object.entries(byMat)) {
      pushExpected(expected, p22, 'COLORIDAS', treat, mat, price, p22.sphByMaterial[mat], { solar: true })
    }
  }

  // Page 23 prices
  const p23 = cfgs[1]
  const p23_incolor = {
    'Hi-Vision Meiryo': { EYVIA: 14099, EYNOA: 12599, 'EYAS 2.0': 10799, PNX: 10339, Organic: 9989 },
    'Hi-Vision LongLife BlueControl': { EYVIA: 13899, EYNOA: 12399, 'EYAS 2.0': 10599, PNX: 10139, Organic: 9789 },
  }
  for (const [treat, byMat] of Object.entries(p23_incolor)) {
    for (const [mat, price] of Object.entries(byMat)) {
      pushExpected(expected, p23, 'INCOLOR', treat, mat, price, p23.sphByMaterial[mat])
    }
  }
  const p23_sensity = {
    'Hi-Vision Meiryo': { EYNOA: 13999, 'EYAS 2.0': 12199, PNX: 11739, Organic: 11389 },
    'Hi-Vision LongLife BlueControl': { EYNOA: 13799, 'EYAS 2.0': 11999, PNX: 11539, Organic: 11189 },
  }
  for (const [treat, byMat] of Object.entries(p23_sensity)) {
    for (const [mat, price] of Object.entries(byMat)) {
      pushExpected(expected, p23, 'SENSITY 2', treat, mat, price, p23.sphByMaterial[mat])
    }
  }
  const p23_color = { 'Hi-Vision Sun Pro': { EYVIA: 14189, EYNOA: 12689, 'EYAS 2.0': 10889, PNX: 10429, Organic: 10079 } }
  for (const [treat, byMat] of Object.entries(p23_color)) {
    for (const [mat, price] of Object.entries(byMat)) {
      pushExpected(expected, p23, 'COLORIDAS', treat, mat, price, p23.sphByMaterial[mat], { solar: true })
    }
  }

  // Page 24 prices
  const p24 = cfgs[2]
  const p24_incolor = {
    'Hi-Vision Meiryo': { EYVIA: 9659, EYNOA: 8159, 'EYAS 2.0': 6359, PNX: 5899, Organic: 5549 },
    'Hi-Vision LongLife BlueControl': { EYVIA: 9459, EYNOA: 7959, 'EYAS 2.0': 6159, PNX: 5699, Organic: 5349 },
    'No-Risk BlueControl': { EYNOA: 7709, 'EYAS 2.0': 5909, PNX: 5449, Organic: 5099 },
  }
  for (const [treat, byMat] of Object.entries(p24_incolor)) {
    for (const [mat, price] of Object.entries(byMat)) {
      pushExpected(expected, p24, 'INCOLOR', treat, mat, price, p24.sphByMaterial[mat])
    }
  }
  const p24_sensity = {
    'Hi-Vision Meiryo': { EYNOA: 9559, 'EYAS 2.0': 7759, PNX: 7299, Organic: 6949 },
    'Hi-Vision LongLife BlueControl': { EYNOA: 9359, 'EYAS 2.0': 7559, PNX: 7099, Organic: 6749 },
    'No-Risk BlueControl': { EYNOA: 9109, 'EYAS 2.0': 7309, PNX: 6849, Organic: 6499 },
  }
  for (const [treat, byMat] of Object.entries(p24_sensity)) {
    for (const [mat, price] of Object.entries(byMat)) {
      pushExpected(expected, p24, 'SENSITY 2', treat, mat, price, p24.sphByMaterial[mat])
    }
  }
  const p24_polar = { 'Hi-Vision SunPro': { EYNOA: 8859, 'EYAS 2.0': 7059, PNX: 6599, Organic: 6249 } }
  for (const [treat, byMat] of Object.entries(p24_polar)) {
    for (const [mat, price] of Object.entries(byMat)) {
      pushExpected(expected, p24, 'POLARIZADO', treat, mat, price, p24.sphPolarByMaterial[mat], { polarizada: true })
    }
  }
  const p24_color = { 'Hi-Vision Sun Pro': { EYVIA: 9749, EYNOA: 7999, 'EYAS 2.0': 6199, PNX: 5739, Organic: 5389 } }
  for (const [treat, byMat] of Object.entries(p24_color)) {
    for (const [mat, price] of Object.entries(byMat)) {
      pushExpected(expected, p24, 'COLORIDAS', treat, mat, price, p24.sphByMaterial[mat], { solar: true })
    }
  }

  // Page 25 prices
  const p25 = cfgs[3]
  const p25_incolor = {
    'Hi-Vision Meiryo': { EYVIA: 9509, EYNOA: 8009, 'EYAS 2.0': 6209, PNX: 5749, Organic: 5399 },
    'Hi-Vision LongLife BlueControl': { EYVIA: 9309, EYNOA: 7809, 'EYAS 2.0': 6009, PNX: 5549, Organic: 5199 },
    'No-Risk BlueControl': { EYNOA: 7559, 'EYAS 2.0': 5759, PNX: 5299, Organic: 4949 },
  }
  for (const [treat, byMat] of Object.entries(p25_incolor)) {
    for (const [mat, price] of Object.entries(byMat)) {
      pushExpected(expected, p25, 'INCOLOR', treat, mat, price, p25.sphByMaterial[mat])
    }
  }
  const p25_sensity = {
    'Hi-Vision Meiryo': { EYNOA: 9409, 'EYAS 2.0': 7609, PNX: 7149, Organic: 6799 },
    'Hi-Vision LongLife BlueControl': { EYNOA: 9209, 'EYAS 2.0': 7409, PNX: 6949, Organic: 6599 },
    'No-Risk BlueControl': { EYNOA: 8959, 'EYAS 2.0': 7159, PNX: 6699, Organic: 6349 },
  }
  for (const [treat, byMat] of Object.entries(p25_sensity)) {
    for (const [mat, price] of Object.entries(byMat)) {
      pushExpected(expected, p25, 'SENSITY 2', treat, mat, price, p25.sphByMaterial[mat])
    }
  }
  const p25_polar = { 'Hi-Vision SunPro': { EYNOA: 8709, 'EYAS 2.0': 6909, PNX: 6449, Organic: 6099 } }
  for (const [treat, byMat] of Object.entries(p25_polar)) {
    for (const [mat, price] of Object.entries(byMat)) {
      pushExpected(expected, p25, 'POLARIZADO', treat, mat, price, p25.sphPolarByMaterial[mat], { polarizada: true })
    }
  }
  const p25_color = { 'Hi-Vision Sun Pro': { EYVIA: 9599, EYNOA: 7849, 'EYAS 2.0': 6049, PNX: 5589, Organic: 5239 } }
  for (const [treat, byMat] of Object.entries(p25_color)) {
    for (const [mat, price] of Object.entries(byMat)) {
      pushExpected(expected, p25, 'COLORIDAS', treat, mat, price, p25.sphByMaterial[mat], { solar: true })
    }
  }

  return { expected, cfgs }
}

async function main() {
  const pages = ['Pagina 22', 'Pagina 23', 'Pagina 24', 'Pagina 25']
  const familiesWanted = ['Hoyalux iD MySelf', 'Hoyalux iD MyStyle V+', 'Hoyalux iD LifeStyle 4i', 'Hoyalux iD LifeStyle 4']

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
    const key = `${o.source_page_reference}||${o.family_id}||${o.features?.cor || ''}||${o.features?.tratamento || ''}||${o.base_price}`
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
        1000
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
    const key = `${row.page}||${familyId}||${row.section}||${row.treatment}||${row.price}`
    const found = existingByKey.get(key) || null

    const pageCfg = cfgByPage.get(row.page)
    const wantFeatures = buildFeatures(pageCfg, row)

    const gridMetadata = {
      raw_grade: `${row.sph[0]} a ${row.sph[1]}`,
      diametro: row.diametro,
      fitting_heights_mm: row.fittingHeights,
      marcacao: row.marcacao,
      ...(row.desenhos ? { desenhos: row.desenhos } : {}),
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

    // Ensure offer flags are coherent for this usage.
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

  console.log('\nFIX_HOYA_P22_P25_PROGRESSIVAS')
  console.log(`DRY-RUN: ${commit ? 'NAO (COMMIT)' : 'SIM'}`)
  console.log(`Expected offers: ${expected.length}`)
  console.log(`Existing offers on pages: ${existingOffers.length}`)
  console.log(`To insert offers: ${inserts.length}`)
  console.log(`To update offers: ${offerUpdates.length}`)
  console.log(`To insert grids: ${gridInserts.length}`)
  console.log(`To update grids: ${gridUpdates.length}`)

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
  console.error('Erro fix hoya p22-p25:', err)
  process.exit(1)
})

