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
  console.error('Uso: node scripts/fix_hoya_pages_32_33_occupacionais.js --version-id=UUID [--commit]')
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

function buildImportKey(page, canonicalLabel, price, material) {
  return `${page} | ${canonicalLabel} | ${price} | ${material || 'sem-material'}`
}

function canonicalLabelFor(row) {
  return `${row.family} ${row.material} ${row.section} ${row.treatment}`
}

function expectedDiameter(row) {
  // p32 info: "até 75mm // 1.67 e 1.74 até 80mm"
  if (row.page === 'Pagina 32') {
    return row.material === 'EYVIA' || row.material === 'EYNOA' ? 'até 80mm' : 'até 75mm'
  }
  // p33 info: "até 75mm"
  return 'até 75mm'
}

function buildFeatures(pageCfg, row) {
  const base = {
    cor: row.section,
    row_notes: null,
    tratamento: row.treatment,
    min_fitting_height: pageCfg.fittingHeights[0],
    fitting_heights_available: pageCfg.fittingHeights,
    marcacao: pageCfg.marcacao,
    desenhos: pageCfg.desenhos,
  }
  if (row.flags?.solar) {
    base.solar = true
    base.generic_treatments = ['Solar']
  }
  return base
}

function normalizeExistingMaterial(offer) {
  if (offer.material) return offer.material

  const idx = offer.indice_refracao != null ? Number(offer.indice_refracao) : null

  // Special case: WorkStyle 3 page 32 came in with "1.59" but it's actually PNX in the PDF (price 3.779).
  if (
    offer.source_page_reference === 'Pagina 32' &&
    offer.family_name === 'WorkStyle 3' &&
    offer.features?.cor === 'COLORIDAS' &&
    offer.features?.tratamento === 'Hi-Vision Sun Pro'
  ) {
    if (Number(offer.base_price) === 3779) return 'PNX'
    if (Number(offer.base_price) === 6039) return 'EYNOA'
    if (Number(offer.base_price) === 7789) return 'EYVIA'
  }

  if (idx === 1.53) return 'PNX'
  if (idx === 1.59) return 'POLI'
  if (idx === 1.5) return 'Organic'
  if (idx === 1.6) return 'EYAS 2.0'
  if (idx === 1.67) return 'EYNOA'
  if (idx === 1.74) return 'EYVIA'
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

// Expected cells transcribed from:
// - .tabelas/hoya_pvc_imgs/hoya-bm-20251113011825405_page-0032.jpg (WorkStyle 3)
// - .tabelas/hoya_pvc_imgs/hoya-bm-20251113011825405_page-0033.jpg (WorkSmart Room)
function generateExpected() {
  const expected = []

  const cfgs = [
    {
      page: 'Pagina 32',
      family: 'WorkStyle 3',
      add: [0.75, 3.5],
      cyl: [-6, 0],
      fittingHeights: [15, 16, 17, 18],
      marcacao: 'WS31+(P/S/C)+Corredor+ADD+F',
      desenhos: 'CLOSE / SCREEN / SPACE',
      sphByMaterial: {
        EYVIA: [-15, 9],
        EYNOA: [-13, 7],
        'EYAS 2.0': [-11, 7],
        PNX: [-8, 5],
        Organic: [-8, 5],
      },
      prices: {
        INCOLOR: {
          'Hi-Vision LongLife BlueControl': { EYVIA: 7499, EYNOA: 5999, 'EYAS 2.0': 4199, PNX: 3739, Organic: 3389 },
          'No-Risk BlueControl': { EYNOA: 5749, 'EYAS 2.0': 3949, PNX: 3489, Organic: 3139 },
        },
        COLORIDAS: {
          'Hi-Vision Sun Pro': { EYVIA: 7789, EYNOA: 6039, 'EYAS 2.0': 4239, PNX: 3779, Organic: 3429 },
        },
      },
    },
    {
      page: 'Pagina 33',
      family: 'WorkSmart Room',
      add: [0.75, 3.5],
      cyl: [-6, 0],
      fittingHeights: [18],
      marcacao: 'VERSAO 400 = DT1 (material 150=1) | VERSAO 200 = DT21 (material 150=1)',
      desenhos: null,
      sphByMaterial: {
        'EYAS 2.0': [-11, 7],
        PNX: [-8, 6],
        Organic: [-8, 6],
      },
      prices: {
        INCOLOR: {
          'Hi-Vision LongLife BlueControl': { 'EYAS 2.0': 2779, PNX: 2319, Organic: 1969 },
          'No-Risk BlueControl': { 'EYAS 2.0': 2529, PNX: 2069, Organic: 1719 },
        },
        COLORIDAS: {
          'Hi-Vision Sun Pro': { 'EYAS 2.0': 2819, PNX: 2359, Organic: 2009 },
        },
      },
    },
  ]

  for (const pageCfg of cfgs) {
    for (const [section, byTreat] of Object.entries(pageCfg.prices)) {
      for (const [treatment, byMat] of Object.entries(byTreat)) {
        for (const [material, price] of Object.entries(byMat)) {
          expected.push({
            page: pageCfg.page,
            family: pageCfg.family,
            material,
            section,
            treatment,
            price,
            sph: pageCfg.sphByMaterial[material],
            cyl: pageCfg.cyl,
            add: pageCfg.add,
            fittingHeights: pageCfg.fittingHeights,
            marcacao: pageCfg.marcacao,
            desenhos: pageCfg.desenhos,
            flags: section === 'COLORIDAS' ? { solar: true } : null,
          })
        }
      }
    }
  }

  return expected
}

async function main() {
  const pages = ['Pagina 32', 'Pagina 33']
  const familiesWanted = ['WorkStyle 3', 'WorkSmart Room']
  const EXPECTED = generateExpected()

  const { data: families, error: famErr } = await supabase
    .from('global_lens_families')
    .select('id,nome')
    .eq('version_id', versionId)
    .in('nome', familiesWanted)
  if (famErr) throw famErr

  const familyByName = new Map((families || []).map((f) => [f.nome, f.id]))
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

  // Attach family name for better inference.
  const familyNameById = new Map((families || []).map((f) => [f.id, f.nome]))
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
      console.warn(`Familia nao encontrada no BD: ${row.family} (page=${row.page})`)
      continue
    }

    const canonical = canonicalLabelFor(row)
    const rawLabel = canonical
    const wantIdx = materialToIndex(row.material)
    const key = `${row.page}||${familyId}||${row.material}||${Number(row.price)}||${row.section}||${row.treatment}`
    const found = existingByKey.get(key) || null

    const pageCfg = {
      fittingHeights: row.fittingHeights,
      marcacao: row.marcacao,
      desenhos: row.desenhos,
    }

    const diameter = expectedDiameter(row)
    const gridMetadata = {
      raw_grade: `${row.sph[0]} a ${row.sph[1]}`,
      ...(diameter ? { diametro: diameter } : {}),
    }

    const wantFeatures = buildFeatures(pageCfg, row)
    const clinicalCategory = 'ocupacional'

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

    // Always fix material/index when missing/mismatched.
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

  console.log('\nFIX_HOYA_P32_P33_OCCUPACIONAIS')
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
  console.error('Erro fix hoya p32/p33:', err)
  process.exit(1)
})

