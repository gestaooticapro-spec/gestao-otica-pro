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
  console.error('Uso: node scripts/fix_hoya_pages_14_16_17.js --version-id=UUID [--commit]')
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

function indexToken(idx) {
  if (idx == null) return null
  // 1.53, 1.59, 1.50 formatting as in existing labels
  return Number(idx).toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

function buildImportKey(page, canonicalLabel, price, material) {
  return `${page} | ${canonicalLabel} | ${price} | ${material || 'sem-material'}`
}

function buildFeatures({ section, treatment, solar }) {
  const f = {
    cor: section,
    row_notes: null,
    tratamento: treatment,
  }
  if (solar) {
    f.solar = true
    f.generic_treatments = ['Solar']
  }
  return f
}

function canonicalLabelFor(row) {
  if (row.family === 'HILUX Esfericas Surfacadas') {
    const idx = materialToIndex(row.material)
    const token = row.material === 'Organic' ? 'Organic' : indexToken(idx)
    return `${row.family} ${token} ${row.section} ${row.treatment}`
  }
  if (row.family === 'HILUX Prontas Esfericas') {
    return `${row.family} ${row.material} ${row.section} ${row.treatment}`
  }
  // NULUX Prontas Asfericas...
  return `${row.family} ${row.material} ${row.section} ${row.treatment}`
}

function expectedDiameter(row) {
  if (row.page === 'Pagina 14') {
    // PDF: 1.50/1.53 = 75mm | 1.59 = 77mm
    return row.material === 'POLI' ? '77mm' : '75mm'
  }
  if (row.page === 'Pagina 16') {
    // PDF: 1.53/1.60/1.67 Sensity = 65/70mm ; 1.67/1.74 = 65/70/75mm
    return row.material === 'EYVIA' || row.material === 'EYNOA' ? '65/70/75mm' : '65/70mm'
  }
  if (row.page === 'Pagina 17') {
    return '65mm/70mm'
  }
  return null
}

function normalizeExistingMaterial(offer) {
  if (offer.material) return offer.material
  // Best-effort inference to avoid duplicating existing rows.
  const idx = offer.indice_refracao != null ? Number(offer.indice_refracao) : null
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

// Expected cells transcribed from .tabelas/hoya_pvc_imgs/hoya-bm-20251113011825405_page-0014.jpg, 0016.jpg, 0017.jpg
const EXPECTED = [
  // -------------------- Page 14: HILUX Esfericas Surfacadas --------------------
  // INCOLOR
  { page: 'Pagina 14', family: 'HILUX Esfericas Surfacadas', material: 'POLI', section: 'INCOLOR', treatment: 'Hi-Vision Meiryo', price: 1949, sph: [-10, 6], cyl: [-4, 0] },
  { page: 'Pagina 14', family: 'HILUX Esfericas Surfacadas', material: 'PNX', section: 'INCOLOR', treatment: 'Hi-Vision Meiryo', price: 1949, sph: [-10, 8], cyl: [-4, 0] },
  { page: 'Pagina 14', family: 'HILUX Esfericas Surfacadas', material: 'Organic', section: 'INCOLOR', treatment: 'Hi-Vision Meiryo', price: 1599, sph: [-10, 8], cyl: [-4, 0] },

  { page: 'Pagina 14', family: 'HILUX Esfericas Surfacadas', material: 'PNX', section: 'INCOLOR', treatment: 'Hi-Vision LongLife BlueControl', price: 1749, sph: [-10, 8], cyl: [-4, 0] },
  { page: 'Pagina 14', family: 'HILUX Esfericas Surfacadas', material: 'Organic', section: 'INCOLOR', treatment: 'Hi-Vision LongLife BlueControl', price: 1399, sph: [-10, 8], cyl: [-4, 0] },

  { page: 'Pagina 14', family: 'HILUX Esfericas Surfacadas', material: 'POLI', section: 'INCOLOR', treatment: 'No-Risk BlueControl', price: 1499, sph: [-10, 6], cyl: [-4, 0] },
  { page: 'Pagina 14', family: 'HILUX Esfericas Surfacadas', material: 'PNX', section: 'INCOLOR', treatment: 'No-Risk BlueControl', price: 1499, sph: [-10, 8], cyl: [-4, 0] },
  { page: 'Pagina 14', family: 'HILUX Esfericas Surfacadas', material: 'Organic', section: 'INCOLOR', treatment: 'No-Risk BlueControl', price: 1149, sph: [-10, 8], cyl: [-4, 0] },

  { page: 'Pagina 14', family: 'HILUX Esfericas Surfacadas', material: 'POLI', section: 'INCOLOR', treatment: 'Hi-Vision Hard', price: 849, sph: [-10, 6], cyl: [-4, 0] },
  { page: 'Pagina 14', family: 'HILUX Esfericas Surfacadas', material: 'PNX', section: 'INCOLOR', treatment: 'Hi-Vision Hard', price: 849, sph: [-10, 8], cyl: [-4, 0] },
  { page: 'Pagina 14', family: 'HILUX Esfericas Surfacadas', material: 'Organic', section: 'INCOLOR', treatment: 'Hi-Vision Hard', price: 499, sph: [-10, 8], cyl: [-4, 0] },

  // SENSITY 2
  { page: 'Pagina 14', family: 'HILUX Esfericas Surfacadas', material: 'PNX', section: 'SENSITY 2', treatment: 'Hi-Vision Meiryo', price: 2949, sph: [-10, 8], cyl: [-4, 0] },
  { page: 'Pagina 14', family: 'HILUX Esfericas Surfacadas', material: 'Organic', section: 'SENSITY 2', treatment: 'Hi-Vision Meiryo', price: 2599, sph: [-10, 8], cyl: [-4, 0] },
  { page: 'Pagina 14', family: 'HILUX Esfericas Surfacadas', material: 'PNX', section: 'SENSITY 2', treatment: 'Hi-Vision LongLife BlueControl', price: 2749, sph: [-10, 8], cyl: [-4, 0] },
  { page: 'Pagina 14', family: 'HILUX Esfericas Surfacadas', material: 'Organic', section: 'SENSITY 2', treatment: 'Hi-Vision LongLife BlueControl', price: 2399, sph: [-10, 8], cyl: [-4, 0] },
  { page: 'Pagina 14', family: 'HILUX Esfericas Surfacadas', material: 'PNX', section: 'SENSITY 2', treatment: 'No-Risk BlueControl', price: 2499, sph: [-10, 8], cyl: [-4, 0] },
  { page: 'Pagina 14', family: 'HILUX Esfericas Surfacadas', material: 'Organic', section: 'SENSITY 2', treatment: 'No-Risk BlueControl', price: 2149, sph: [-10, 8], cyl: [-4, 0] },
  { page: 'Pagina 14', family: 'HILUX Esfericas Surfacadas', material: 'PNX', section: 'SENSITY 2', treatment: 'Hi-Vision Hard', price: 1849, sph: [-10, 8], cyl: [-4, 0] },
  { page: 'Pagina 14', family: 'HILUX Esfericas Surfacadas', material: 'Organic', section: 'SENSITY 2', treatment: 'Hi-Vision Hard', price: 1499, sph: [-10, 8], cyl: [-4, 0] },

  // SENSITY ORIGINAL*
  { page: 'Pagina 14', family: 'HILUX Esfericas Surfacadas', material: 'PNX', section: 'SENSITY ORIGINAL', treatment: 'Hi-Vision LongLife BlueControl', price: 2549, sph: [-10, 8], cyl: [-4, 0] },
  { page: 'Pagina 14', family: 'HILUX Esfericas Surfacadas', material: 'Organic', section: 'SENSITY ORIGINAL', treatment: 'Hi-Vision LongLife BlueControl', price: 2199, sph: [-10, 8], cyl: [-4, 0] },
  { page: 'Pagina 14', family: 'HILUX Esfericas Surfacadas', material: 'PNX', section: 'SENSITY ORIGINAL', treatment: 'No-Risk BlueControl', price: 2299, sph: [-10, 8], cyl: [-4, 0] },
  { page: 'Pagina 14', family: 'HILUX Esfericas Surfacadas', material: 'Organic', section: 'SENSITY ORIGINAL', treatment: 'No-Risk BlueControl', price: 1949, sph: [-10, 8], cyl: [-4, 0] },
  { page: 'Pagina 14', family: 'HILUX Esfericas Surfacadas', material: 'PNX', section: 'SENSITY ORIGINAL', treatment: 'Hi-Vision Hard', price: 1649, sph: [-10, 8], cyl: [-4, 0] },
  { page: 'Pagina 14', family: 'HILUX Esfericas Surfacadas', material: 'Organic', section: 'SENSITY ORIGINAL', treatment: 'Hi-Vision Hard', price: 1299, sph: [-10, 8], cyl: [-4, 0] },

  // COLORIDAS
  { page: 'Pagina 14', family: 'HILUX Esfericas Surfacadas', material: 'PNX', section: 'COLORIDAS', treatment: 'Hi-Vision Sun Pro', price: 1789, sph: [-10, 8], cyl: [-4, 0], solar: true },
  { page: 'Pagina 14', family: 'HILUX Esfericas Surfacadas', material: 'Organic', section: 'COLORIDAS', treatment: 'Hi-Vision Sun Pro', price: 1439, sph: [-10, 8], cyl: [-4, 0], solar: true },

  // -------------------- Page 16: NULUX Prontas Asfericas EYAS 2.0 --------------------
  // INCOLOR
  { page: 'Pagina 16', family: 'NULUX Prontas Asfericas EYAS 2.0', material: 'EYVIA', section: 'INCOLOR', treatment: 'Hi-Vision Meiryo', price: 2199, sph: [-12, -2], cyl: [-2, 0] },
  { page: 'Pagina 16', family: 'NULUX Prontas Asfericas EYAS 2.0', material: 'EYNOA', section: 'INCOLOR', treatment: 'Hi-Vision Meiryo', price: 1599, sph: [-10, 6], cyl: [-3, 0] }, // PDF: 1.67 INCOLOR Cil. -3.00
  { page: 'Pagina 16', family: 'NULUX Prontas Asfericas EYAS 2.0', material: 'EYAS 2.0', section: 'INCOLOR', treatment: 'Hi-Vision Meiryo', price: 1379, sph: [-6, 6], cyl: [-2, 0] },

  { page: 'Pagina 16', family: 'NULUX Prontas Asfericas EYAS 2.0', material: 'EYNOA', section: 'INCOLOR', treatment: 'Hi-Vision LongLife BlueControl', price: 1499, sph: [-10, 6], cyl: [-3, 0] },

  { page: 'Pagina 16', family: 'NULUX Prontas Asfericas EYAS 2.0', material: 'EYNOA', section: 'INCOLOR', treatment: 'Hi-Vision LongLife UVControl', price: 1499, sph: [-10, 6], cyl: [-3, 0] },
  { page: 'Pagina 16', family: 'NULUX Prontas Asfericas EYAS 2.0', material: 'EYAS 2.0', section: 'INCOLOR', treatment: 'Hi-Vision LongLife UVControl', price: 1199, sph: [-6, 6], cyl: [-2, 0] },

  { page: 'Pagina 16', family: 'NULUX Prontas Asfericas EYAS 2.0', material: 'EYVIA', section: 'INCOLOR', treatment: 'Hi-Vision LongLife', price: 1979, sph: [-12, -2], cyl: [-2, 0] },

  { page: 'Pagina 16', family: 'NULUX Prontas Asfericas EYAS 2.0', material: 'PNX', section: 'INCOLOR', treatment: 'CleanExtra', price: 679, sph: [-6, 6], cyl: [-2, 0] },

  // SENSITY 2
  { page: 'Pagina 16', family: 'NULUX Prontas Asfericas EYAS 2.0', material: 'EYNOA', section: 'SENSITY 2', treatment: 'Hi-Vision LongLife UVControl', price: 2079, sph: [-8, 6], cyl: [-2, 0] },

  // -------------------- Page 17: HILUX Prontas Esfericas --------------------
  // INCOLOR
  { page: 'Pagina 17', family: 'HILUX Prontas Esfericas', material: 'PNX', section: 'INCOLOR', treatment: 'Hi-Vision Meiryo', price: 1099, sph: [-4, 2], cyl: [-2, 0] },
  { page: 'Pagina 17', family: 'HILUX Prontas Esfericas', material: 'Organic', section: 'INCOLOR', treatment: 'Hi-Vision Meiryo', price: 899, sph: [-4, 4], cyl: [-2, 0] },
  { page: 'Pagina 17', family: 'HILUX Prontas Esfericas', material: 'PNX', section: 'INCOLOR', treatment: 'Hi-Vision LongLife BlueControl', price: 999, sph: [-4, 2], cyl: [-2, 0] },
  { page: 'Pagina 17', family: 'HILUX Prontas Esfericas', material: 'Organic', section: 'INCOLOR', treatment: 'Hi-Vision LongLife BlueControl', price: 799, sph: [-4, 4], cyl: [-2, 0] },
  { page: 'Pagina 17', family: 'HILUX Prontas Esfericas', material: 'PNX', section: 'INCOLOR', treatment: 'Hi-Vision LongLife UVControl', price: 999, sph: [-4, 2], cyl: [-2, 0] },
  { page: 'Pagina 17', family: 'HILUX Prontas Esfericas', material: 'Organic', section: 'INCOLOR', treatment: 'Hi-Vision LongLife UVControl', price: 799, sph: [-4, 4], cyl: [-2, 0] },
  { page: 'Pagina 17', family: 'HILUX Prontas Esfericas', material: 'Organic', section: 'INCOLOR', treatment: 'Hi-Vision LongLife', price: 799, sph: [-4, 4], cyl: [-2, 0] },
  { page: 'Pagina 17', family: 'HILUX Prontas Esfericas', material: 'Organic', section: 'INCOLOR', treatment: 'CleanExtra', price: 439, sph: [-4, 4], cyl: [-2, 0] },

  // Aqua (already existed, but keep expected to patch grade/metadata)
  { page: 'Pagina 17', family: 'HILUX Prontas Esfericas', material: 'POLI', section: 'INCOLOR', treatment: 'Hi-Vision Aqua', price: 349, sph: [-4, 4], cyl: [-2, 0] },
  { page: 'Pagina 17', family: 'HILUX Prontas Esfericas', material: 'PNX', section: 'INCOLOR', treatment: 'Hi-Vision Aqua', price: 349, sph: [-4, 2], cyl: [-2, 0] },
  { page: 'Pagina 17', family: 'HILUX Prontas Esfericas', material: 'Organic', section: 'INCOLOR', treatment: 'Hi-Vision Aqua', price: 219, sph: [-4, 4], cyl: [-2, 0] },

  // SENSITY 2
  { page: 'Pagina 17', family: 'HILUX Prontas Esfericas', material: 'PNX', section: 'SENSITY 2', treatment: 'Hi-Vision LongLife UVControl', price: 1699, sph: [-3, 2], cyl: [-2, 0] },
  { page: 'Pagina 17', family: 'HILUX Prontas Esfericas', material: 'Organic', section: 'SENSITY 2', treatment: 'Hi-Vision LongLife UVControl', price: 1099, sph: [-4, 4], cyl: [-2, 0] },

  // SENSITY ORIGINAL*
  { page: 'Pagina 17', family: 'HILUX Prontas Esfericas', material: 'Organic', section: 'SENSITY ORIGINAL', treatment: 'CleanExtra', price: 599, sph: [-4, 4], cyl: [-2, 0] },
]

async function main() {
  const pages = ['Pagina 14', 'Pagina 16', 'Pagina 17']
  const familiesWanted = ['HILUX Esfericas Surfacadas', 'NULUX Prontas Asfericas EYAS 2.0', 'HILUX Prontas Esfericas']

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
        'id,family_id,canonical_label,raw_label,material,indice_refracao,base_price,features,source_page_reference,clinical_category'
      )
      .in('family_id', [...familyIdByName.values()])
      .in('source_page_reference', pages),
    1000
  )

  const existingByKey = new Map()
  for (const o of existingOffers) {
    const mat = normalizeExistingMaterial(o)
    const key = `${o.source_page_reference}||${o.family_id}||${mat || ''}||${o.base_price}||${o.features?.cor || ''}||${
      o.features?.tratamento || ''
    }`
    existingByKey.set(key, { ...o, _norm_material: mat })
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

  for (const row of EXPECTED) {
    const familyId = familyIdByName.get(row.family)
    const canonical = canonicalLabelFor(row)
    const rawLabel = `${row.section} | ${row.treatment}`
    const idx = materialToIndex(row.material)
    const key = `${row.page}||${familyId}||${row.material}||${row.price}||${row.section}||${row.treatment}`
    const found = existingByKey.get(key) || null

    const diameter = expectedDiameter(row)
    const gridMetadata = {
      raw_grade: `${row.sph[0]} a ${row.sph[1]}`,
      ...(diameter ? { diametro: diameter } : {}),
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
        features: buildFeatures({ section: row.section, treatment: row.treatment, solar: !!row.solar }),
        base_price: row.price,
        source_page_reference: row.page,
        confidence_level: 0.9,
        import_key: buildImportKey(row.page, canonical, row.price, row.material),
        clinical_category: 'visao_simples',
      })
      gridInserts.push({
        offer_id: id,
        sph_min: row.sph[0],
        sph_max: row.sph[1],
        cyl_min: row.cyl[0],
        cyl_max: row.cyl[1],
        add_min: null,
        add_max: null,
        metadata: gridMetadata,
      })
      continue
    }

    const wantFeatures = buildFeatures({ section: row.section, treatment: row.treatment, solar: !!row.solar })
    const patches = {}

    if (found.canonical_label !== canonical) patches.canonical_label = canonical
    if (found.raw_label !== rawLabel) patches.raw_label = rawLabel
    if (Number(found.base_price) !== Number(row.price)) patches.base_price = row.price
    if (found.source_page_reference !== row.page) patches.source_page_reference = row.page

    const wantMaterial = row.material
    // Always fix the persisted material column when it's missing or mismatched.
    if (found.material !== wantMaterial) patches.material = wantMaterial
    if (Number(found.indice_refracao) !== Number(idx)) patches.indice_refracao = idx

    // Only overwrite the keys we manage.
    const mergedFeatures = { ...(found.features || {}), ...wantFeatures }
    if (JSON.stringify(mergedFeatures) !== JSON.stringify(found.features || {})) patches.features = mergedFeatures

    if (found.clinical_category !== 'visao_simples') patches.clinical_category = 'visao_simples'

    if (Object.keys(patches).length) offerUpdates.push({ id: found.id, patches })

    const gs = gridsByOffer.get(found.id) || []
    if (!gs.length) {
      gridInserts.push({
        offer_id: found.id,
        sph_min: row.sph[0],
        sph_max: row.sph[1],
        cyl_min: row.cyl[0],
        cyl_max: row.cyl[1],
        add_min: null,
        add_max: null,
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
      if (g.add_min != null) gp.add_min = null
      if (g.add_max != null) gp.add_max = null

      const mergedMeta = { ...(g.metadata || {}), ...gridMetadata }
      if (JSON.stringify(mergedMeta) !== JSON.stringify(g.metadata || {})) gp.metadata = mergedMeta

      if (Object.keys(gp).length) gridUpdates.push({ id: g.id, patches: gp })
    }
  }

  console.log('\nFIX_HOYA_P14_P16_P17')
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
  console.error('Erro fix hoya p14/p16/p17:', err)
  process.exit(1)
})
