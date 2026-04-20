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
  console.error('Uso: node scripts/fix_hoya_pages_38_39_sportive.js --version-id=UUID [--commit]')
  process.exit(1)
}

function materialToIndex(material) {
  switch (material) {
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

function buildImportKey(page, canonicalLabel, price, material) {
  return `${page} | ${canonicalLabel} | ${price} | ${material || 'sem-material'}`
}

function canonicalLabelFor(row) {
  return `${row.family} ${row.material} ${row.section} ${row.treatment}`
}

function curveFromTreatment(t) {
  const m = String(t || '').match(/\(Curva\s*(\d+)\)/i)
  if (!m) return null
  return Number(m[1])
}

function buildFeatures(row) {
  const base = {
    cor: row.section,
    row_notes: null,
    tratamento: row.treatment,
    ...(row.marcacao ? { marcacao: row.marcacao } : {}),
    ...(row.design ? { design: row.design } : {}),
    ...(row.min_fitting_height != null ? { min_fitting_height: row.min_fitting_height } : {}),
    ...(row.fitting_heights_available ? { fitting_heights_available: row.fitting_heights_available } : {}),
  }

  const curva = curveFromTreatment(row.treatment)
  if (curva) base.curva = curva

  if (row.flags?.solar) {
    base.solar = true
    base.generic_treatments = row.flags?.polarizada ? ['Solar', 'Polarizada'] : ['Solar']
  }
  if (row.flags?.polarizada) base.polarizada = true

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

function pushExpected(list, row) {
  list.push(row)
}

function expectedForPages() {
  const expected = []

  // p38: Hoyalux Sportive Progressiva
  {
    const page = 'Pagina 38'
    const family = 'Hoyalux Sportive Progressiva'
    const cyl = [-4, 0]
    const add = [1.0, 2.5]
    const min_fitting_height = 18
    const fitting_heights_available = [18]
    const diametro = '80mm'
    const marcacao = 'FA41+AR'

    const mats = ['EYNOA', 'EYAS 2.0', 'PNX', 'Organic']
    const matsS2 = ['PNX', 'Organic']
    const matsPol = ['EYAS 2.0', 'Organic']

    const curves = [
      { n: 6, raw: 'Curva6:-6/+4', sph: [-6, 4] },
      { n: 8, raw: 'Curva8:-5/+4', sph: [-5, 4] },
    ]

    const incolorTreatments = ['Hi-Vision LongLife BlueControl', 'No-Risk BlueControl', 'Hi-Vision Hard']
    const sensityTreatments = ['Hi-Vision LongLife BlueControl', 'No-Risk BlueControl', 'Hi-Vision Hard']

    const prices = {
      // section -> treatment -> curve -> material -> price
      INCOLOR: {
        'Hi-Vision LongLife BlueControl': {
          6: { EYNOA: 6869, 'EYAS 2.0': 5069, PNX: 4609, Organic: 4259 },
          8: { EYNOA: 6869, 'EYAS 2.0': 5069, PNX: 4609, Organic: 4259 },
        },
        'No-Risk BlueControl': {
          6: { EYNOA: 6619, 'EYAS 2.0': 4819, PNX: 4359, Organic: 4009 },
          8: { EYNOA: 6619, 'EYAS 2.0': 4819, PNX: 4359, Organic: 4009 },
        },
        'Hi-Vision Hard': {
          6: { EYNOA: 6209, 'EYAS 2.0': 4409, PNX: 3949, Organic: 3599 },
          8: { EYNOA: 6209, 'EYAS 2.0': 4409, PNX: 3949, Organic: 3599 },
        },
      },
      'SENSITY 2': {
        'Hi-Vision LongLife BlueControl': {
          6: { PNX: 6009, Organic: 5659 },
          8: { PNX: 6009, Organic: 5659 },
        },
        'No-Risk BlueControl': {
          6: { PNX: 5759, Organic: 5409 },
          8: { PNX: 5759, Organic: 5409 },
        },
        'Hi-Vision Hard': {
          6: { PNX: 5349, Organic: 4999 },
          8: { PNX: 5349, Organic: 4999 },
        },
      },
      POLARIZADO: {
        'Hi-Vision Sun Pro': {
          6: { 'EYAS 2.0': 5969, Organic: 5159 },
          8: { 'EYAS 2.0': 5969, Organic: 5159 },
        },
      },
      COLORIDAS: {
        'Hi-Vision Sun Pro': {
          6: { EYNOA: 6909, 'EYAS 2.0': 5109, PNX: 4649, Organic: 4299 },
          8: { EYNOA: 6909, 'EYAS 2.0': 5109, PNX: 4649, Organic: 4299 },
        },
      },
    }

    for (const curve of curves) {
      for (const baseTreat of incolorTreatments) {
        const treatment = `${baseTreat} (Curva ${curve.n})`
        for (const m of mats) {
          const price = prices.INCOLOR[baseTreat][curve.n][m]
          pushExpected(expected, {
            page,
            family,
            material: m,
            section: 'INCOLOR',
            treatment,
            price,
            sph: curve.sph,
            cyl,
            add,
            clinical_category: 'multifocal',
            marcacao,
            min_fitting_height,
            fitting_heights_available,
            grid_metadata: { raw_grade: curve.raw, diametro },
            flags: null,
          })
        }
      }

      for (const baseTreat of sensityTreatments) {
        const treatment = `${baseTreat} (Curva ${curve.n})`
        for (const m of matsS2) {
          const price = prices['SENSITY 2'][baseTreat][curve.n][m]
          pushExpected(expected, {
            page,
            family,
            material: m,
            section: 'SENSITY 2',
            treatment,
            price,
            sph: curve.sph,
            cyl,
            add,
            clinical_category: 'multifocal',
            marcacao,
            min_fitting_height,
            fitting_heights_available,
            grid_metadata: { raw_grade: curve.raw, diametro },
            flags: null,
          })
        }
      }

      {
        const baseTreat = 'Hi-Vision Sun Pro'
        const treatment = `${baseTreat} (Curva ${curve.n})`
        for (const m of matsPol) {
          const price = prices.POLARIZADO[baseTreat][curve.n][m]
          pushExpected(expected, {
            page,
            family,
            material: m,
            section: 'POLARIZADO',
            treatment,
            price,
            sph: curve.sph,
            cyl,
            add,
            clinical_category: 'multifocal',
            marcacao,
            min_fitting_height,
            fitting_heights_available,
            grid_metadata: { raw_grade: curve.raw, diametro },
            flags: { solar: true, polarizada: true },
          })
        }
      }

      {
        const baseTreat = 'Hi-Vision Sun Pro'
        const treatment = `${baseTreat} (Curva ${curve.n})`
        for (const m of mats) {
          const price = prices.COLORIDAS[baseTreat][curve.n][m]
          pushExpected(expected, {
            page,
            family,
            material: m,
            section: 'COLORIDAS',
            treatment,
            price,
            sph: curve.sph,
            cyl,
            add,
            clinical_category: 'multifocal',
            marcacao,
            min_fitting_height,
            fitting_heights_available,
            grid_metadata: { raw_grade: curve.raw, diametro },
            flags: { solar: true },
          })
        }
      }
    }
  }

  // p39: Sportive Visao Simples
  {
    const page = 'Pagina 39'
    const family = 'Sportive Visao Simples'
    const cyl = [-4, 0]
    const diametroDefault = 'até 75mm'
    const marcacao = 'SA1+AR'
    const design = 'Asferico'

    const mats = ['EYNOA', 'EYAS 2.0', 'PNX', 'Organic']
    const matsS2 = ['PNX', 'Organic']
    const matsPol = ['EYAS 2.0', 'Organic']

    const curves = [
      { n: 6, raw: 'Curva6:-6/+4', sph: [-6, 4] },
      { n: 8, raw: 'Curva8:-5/+4', sph: [-5, 4] },
    ]

    const incolorTreatments = ['Hi-Vision LongLife BlueControl', 'No-Risk BlueControl', 'Hi-Vision Hard']
    const sensityTreatments = ['Hi-Vision LongLife BlueControl', 'No-Risk BlueControl', 'Hi-Vision Hard']

    const prices = {
      INCOLOR: {
        'Hi-Vision LongLife BlueControl': {
          6: { EYNOA: 3689, 'EYAS 2.0': 2899, PNX: 2439, Organic: 2089 },
          8: { EYNOA: 3689, 'EYAS 2.0': 2899, PNX: 2439, Organic: 2089 },
        },
        'No-Risk BlueControl': {
          6: { EYNOA: 3439, 'EYAS 2.0': 2649, PNX: 2189, Organic: 1839 },
          8: { EYNOA: 3439, 'EYAS 2.0': 2649, PNX: 2189, Organic: 1839 },
        },
        'Hi-Vision Hard': {
          6: { EYNOA: 2899, 'EYAS 2.0': 2109, PNX: 1649, Organic: 1299 },
          8: { EYNOA: 2899, 'EYAS 2.0': 2109, PNX: 1649, Organic: 1299 },
        },
      },
      'SENSITY 2': {
        'Hi-Vision LongLife BlueControl': {
          6: { PNX: 3439, Organic: 3089 },
          8: { PNX: 3439, Organic: 3089 },
        },
        'No-Risk BlueControl': {
          6: { PNX: 3189, Organic: 2839 },
          8: { PNX: 3189, Organic: 2839 },
        },
        'Hi-Vision Hard': {
          6: { PNX: 2649, Organic: 2299 },
          8: { PNX: 2649, Organic: 2299 },
        },
      },
      POLARIZADO: {
        'Hi-Vision Sun Pro': {
          6: { 'EYAS 2.0': 3799, Organic: 2989 },
          8: { 'EYAS 2.0': 3799, Organic: 2989 },
        },
      },
      COLORIDAS: {
        'Hi-Vision Sun Pro': {
          6: { EYNOA: 3729, 'EYAS 2.0': 2939, PNX: 2479, Organic: 2129 },
          8: { EYNOA: 3729, 'EYAS 2.0': 2939, PNX: 2479, Organic: 2129 },
        },
      },
    }

    // Polarizado has different raw_grade per curve+material (per gen_hoya_catalog_json.py)
    const polSph = {
      6: { 'EYAS 2.0': { raw: 'Curva6:-4/+4', sph: [-4, 4] }, Organic: { raw: 'Curva6:-3.5/+4', sph: [-3.5, 4] } },
      8: { 'EYAS 2.0': { raw: 'Curva8:-4/+4', sph: [-4, 4] }, Organic: { raw: 'Curva8:-3/+4', sph: [-3, 4] } },
    }

    for (const curve of curves) {
      for (const baseTreat of incolorTreatments) {
        const treatment = `${baseTreat} (Curva ${curve.n})`
        for (const m of mats) {
          const price = prices.INCOLOR[baseTreat][curve.n][m]
          pushExpected(expected, {
            page,
            family,
            material: m,
            section: 'INCOLOR',
            treatment,
            price,
            sph: curve.sph,
            cyl,
            add: null,
            clinical_category: 'visao_simples',
            marcacao,
            design,
            grid_metadata: { raw_grade: curve.raw, diametro: diametroDefault },
            flags: null,
          })
        }
      }

      for (const baseTreat of sensityTreatments) {
        const treatment = `${baseTreat} (Curva ${curve.n})`
        for (const m of matsS2) {
          const price = prices['SENSITY 2'][baseTreat][curve.n][m]
          pushExpected(expected, {
            page,
            family,
            material: m,
            section: 'SENSITY 2',
            treatment,
            price,
            sph: curve.sph,
            cyl,
            add: null,
            clinical_category: 'visao_simples',
            marcacao,
            design,
            grid_metadata: { raw_grade: curve.raw, diametro: diametroDefault },
            flags: null,
          })
        }
      }

      {
        const baseTreat = 'Hi-Vision Sun Pro'
        const treatment = `${baseTreat} (Curva ${curve.n})`
        for (const m of matsPol) {
          const price = prices.POLARIZADO[baseTreat][curve.n][m]
          const pol = polSph[curve.n][m]
          const diametro = m === 'Organic' ? 'até 79mm' : diametroDefault
          pushExpected(expected, {
            page,
            family,
            material: m,
            section: 'POLARIZADO',
            treatment,
            price,
            sph: pol.sph,
            cyl,
            add: null,
            clinical_category: 'visao_simples',
            marcacao,
            design,
            grid_metadata: { raw_grade: pol.raw, diametro },
            flags: { solar: true, polarizada: true },
          })
        }
      }

      {
        const baseTreat = 'Hi-Vision Sun Pro'
        const treatment = `${baseTreat} (Curva ${curve.n})`
        for (const m of mats) {
          const price = prices.COLORIDAS[baseTreat][curve.n][m]
          pushExpected(expected, {
            page,
            family,
            material: m,
            section: 'COLORIDAS',
            treatment,
            price,
            sph: curve.sph,
            cyl,
            add: null,
            clinical_category: 'visao_simples',
            marcacao,
            design,
            grid_metadata: { raw_grade: curve.raw, diametro: diametroDefault },
            flags: { solar: true },
          })
        }
      }
    }
  }

  return expected
}

async function main() {
  const pages = ['Pagina 38', 'Pagina 39']
  const familiesWanted = ['Hoyalux Sportive Progressiva', 'Sportive Visao Simples']
  const EXPECTED = expectedForPages()

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
    4000
  )

  const existingOfferIds = existingOffers.map((o) => o.id)
  const grids = existingOfferIds.length
    ? await fetchAll(
        supabase
          .from('global_offer_diopter_grids')
          .select('id,offer_id,sph_min,sph_max,cyl_min,cyl_max,add_min,add_max,metadata')
          .in('offer_id', existingOfferIds),
        4000
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
    const key = `${o.source_page_reference}||${o.family_id}||${o.material}||${Number(o.base_price)}||${o.features?.cor}||${o.features?.tratamento}`
    if (!existingByKey.has(key)) existingByKey.set(key, o)
  }

  const inserts = []
  const gridInserts = []
  const offerUpdates = []
  const gridUpdates = []

  for (const row of EXPECTED) {
    const familyId = familyByName.get(row.family)
    if (!familyId) continue

    const canonical = canonicalLabelFor(row)
    const rawLabel = canonical
    const wantIdx = materialToIndex(row.material)
    const key = `${row.page}||${familyId}||${row.material}||${Number(row.price)}||${row.section}||${row.treatment}`
    const found = existingByKey.get(key) || null

    const wantFeatures = buildFeatures(row)
    const gridMetadata = { ...(row.grid_metadata || {}) }

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
        clinical_category: row.clinical_category,
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

    if (found.clinical_category !== row.clinical_category) patches.clinical_category = row.clinical_category

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

  console.log('\nFIX_HOYA_P38_P39_SPORTIVE')
  console.log(`DRY-RUN: ${commit ? 'NAO (COMMIT)' : 'SIM'}`)
  console.log(`Expected offers: ${EXPECTED.length}`)
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
  console.error('Erro fix hoya p38/p39 sportive:', err)
  process.exit(1)
})

