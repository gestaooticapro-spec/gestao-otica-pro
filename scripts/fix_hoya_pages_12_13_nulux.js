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
  console.error('Uso: node scripts/fix_hoya_pages_12_13_nulux.js --version-id=UUID [--commit]')
  process.exit(1)
}

function fmtMoney(n) {
  return Number(n).toFixed(0)
}

function buildImportKey(page, canonicalLabel, price) {
  return `${page} | ${canonicalLabel} | ${fmtMoney(price)} | sem-codigo`
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

// Expected cells from PDF images:
// - p12: NULUX iDENTITY V+ (INCOLOR, SENSITY 2, SENSITY SHINE, COLORIDAS)
// - p13: NULUX TrueForm (INCOLOR, SENSITY 2, COLORIDAS)
//
// We keep the payload minimal and only encode what is explicit:
// base_price + sph range + cyl rule from "Informações" boxes.
const EXPECTED = [
  // -------------------- Page 12: NULUX iDENTITY V+ --------------------
  // INCOLOR
  { page: 'Pagina 12', family: 'NULUX iDENTITY V+', material: 'EYVIA', section: 'INCOLOR', treatment: 'Hi-Vision Meiryo', price: 4549, sph: [-20, 12], cyl: [-6, 0] },
  { page: 'Pagina 12', family: 'NULUX iDENTITY V+', material: 'EYNOA', section: 'INCOLOR', treatment: 'Hi-Vision Meiryo', price: 4049, sph: [-15, 10], cyl: [-6, 0] },
  { page: 'Pagina 12', family: 'NULUX iDENTITY V+', material: 'EYAS 2.0', section: 'INCOLOR', treatment: 'Hi-Vision Meiryo', price: 3159, sph: [-13, 8], cyl: [-6, 0] },
  { page: 'Pagina 12', family: 'NULUX iDENTITY V+', material: 'PNX', section: 'INCOLOR', treatment: 'Hi-Vision Meiryo', price: 2699, sph: [-13, 9], cyl: [-6, 0] },

  { page: 'Pagina 12', family: 'NULUX iDENTITY V+', material: 'EYVIA', section: 'INCOLOR', treatment: 'Hi-Vision LongLife BlueControl', price: 4349, sph: [-20, 12], cyl: [-6, 0] },
  { page: 'Pagina 12', family: 'NULUX iDENTITY V+', material: 'EYNOA', section: 'INCOLOR', treatment: 'Hi-Vision LongLife BlueControl', price: 3849, sph: [-15, 10], cyl: [-6, 0] },
  { page: 'Pagina 12', family: 'NULUX iDENTITY V+', material: 'EYAS 2.0', section: 'INCOLOR', treatment: 'Hi-Vision LongLife BlueControl', price: 2959, sph: [-13, 8], cyl: [-6, 0] },
  { page: 'Pagina 12', family: 'NULUX iDENTITY V+', material: 'PNX', section: 'INCOLOR', treatment: 'Hi-Vision LongLife BlueControl', price: 2499, sph: [-13, 9], cyl: [-6, 0] },
  { page: 'Pagina 12', family: 'NULUX iDENTITY V+', material: 'Organic', section: 'INCOLOR', treatment: 'Hi-Vision LongLife BlueControl', price: 2149, sph: [-10, 10], cyl: [-6, 0] },

  { page: 'Pagina 12', family: 'NULUX iDENTITY V+', material: 'EYNOA', section: 'INCOLOR', treatment: 'No-Risk BlueControl', price: 3599, sph: [-15, 10], cyl: [-6, 0] },
  { page: 'Pagina 12', family: 'NULUX iDENTITY V+', material: 'EYAS 2.0', section: 'INCOLOR', treatment: 'No-Risk BlueControl', price: 2709, sph: [-13, 8], cyl: [-6, 0] },
  { page: 'Pagina 12', family: 'NULUX iDENTITY V+', material: 'PNX', section: 'INCOLOR', treatment: 'No-Risk BlueControl', price: 2249, sph: [-13, 9], cyl: [-6, 0] },
  { page: 'Pagina 12', family: 'NULUX iDENTITY V+', material: 'Organic', section: 'INCOLOR', treatment: 'No-Risk BlueControl', price: 1899, sph: [-10, 10], cyl: [-6, 0] },

  // SENSITY 2 (only EYNOA, PNX, Organic on this page)
  { page: 'Pagina 12', family: 'NULUX iDENTITY V+', material: 'EYNOA', section: 'SENSITY 2', treatment: 'Hi-Vision Meiryo', price: 5249, sph: [-15, 10], cyl: [-6, 0] },
  { page: 'Pagina 12', family: 'NULUX iDENTITY V+', material: 'PNX', section: 'SENSITY 2', treatment: 'Hi-Vision Meiryo', price: 3899, sph: [-13, 9], cyl: [-6, 0] },
  { page: 'Pagina 12', family: 'NULUX iDENTITY V+', material: 'Organic', section: 'SENSITY 2', treatment: 'Hi-Vision Meiryo', price: 3349, sph: [-10, 10], cyl: [-6, 0] },

  { page: 'Pagina 12', family: 'NULUX iDENTITY V+', material: 'EYNOA', section: 'SENSITY 2', treatment: 'Hi-Vision LongLife BlueControl', price: 5049, sph: [-15, 10], cyl: [-6, 0] },
  { page: 'Pagina 12', family: 'NULUX iDENTITY V+', material: 'PNX', section: 'SENSITY 2', treatment: 'Hi-Vision LongLife BlueControl', price: 3699, sph: [-13, 9], cyl: [-6, 0] },
  { page: 'Pagina 12', family: 'NULUX iDENTITY V+', material: 'Organic', section: 'SENSITY 2', treatment: 'Hi-Vision LongLife BlueControl', price: 3099, sph: [-10, 10], cyl: [-6, 0] },

  { page: 'Pagina 12', family: 'NULUX iDENTITY V+', material: 'EYNOA', section: 'SENSITY 2', treatment: 'No-Risk BlueControl', price: 4799, sph: [-15, 10], cyl: [-6, 0] },
  { page: 'Pagina 12', family: 'NULUX iDENTITY V+', material: 'PNX', section: 'SENSITY 2', treatment: 'No-Risk BlueControl', price: 3449, sph: [-13, 9], cyl: [-6, 0] },
  { page: 'Pagina 12', family: 'NULUX iDENTITY V+', material: 'Organic', section: 'SENSITY 2', treatment: 'No-Risk BlueControl', price: 3099, sph: [-10, 10], cyl: [-6, 0] },

  // SENSITY SHINE
  { page: 'Pagina 12', family: 'NULUX iDENTITY V+', material: 'EYNOA', section: 'SENSITY SHINE', treatment: 'Light Mirror', price: 5449, sph: [-15, 10], cyl: [-6, 0] },
  { page: 'Pagina 12', family: 'NULUX iDENTITY V+', material: 'PNX', section: 'SENSITY SHINE', treatment: 'Light Mirror', price: 4099, sph: [-13, 9], cyl: [-6, 0] },
  { page: 'Pagina 12', family: 'NULUX iDENTITY V+', material: 'Organic', section: 'SENSITY SHINE', treatment: 'Light Mirror', price: 3749, sph: [-10, 10], cyl: [-6, 0] },

  // COLORIDAS (already in BD but we keep as expected to patch cyl + index errors)
  { page: 'Pagina 12', family: 'NULUX iDENTITY V+', material: 'EYVIA', section: 'COLORIDAS', treatment: 'Hi-Vision Sun Pro', price: 4639, sph: [-20, 12], cyl: [-6, 0], solar: true },
  { page: 'Pagina 12', family: 'NULUX iDENTITY V+', material: 'EYNOA', section: 'COLORIDAS', treatment: 'Hi-Vision Sun Pro', price: 3889, sph: [-15, 10], cyl: [-6, 0], solar: true },
  { page: 'Pagina 12', family: 'NULUX iDENTITY V+', material: 'EYAS 2.0', section: 'COLORIDAS', treatment: 'Hi-Vision Sun Pro', price: 2999, sph: [-13, 8], cyl: [-6, 0], solar: true },
  { page: 'Pagina 12', family: 'NULUX iDENTITY V+', material: 'PNX', section: 'COLORIDAS', treatment: 'Hi-Vision Sun Pro', price: 2539, sph: [-13, 9], cyl: [-6, 0], solar: true },
  { page: 'Pagina 12', family: 'NULUX iDENTITY V+', material: 'Organic', section: 'COLORIDAS', treatment: 'Hi-Vision Sun Pro', price: 2189, sph: [-10, 10], cyl: [-6, 0], solar: true },

  // -------------------- Page 13: NULUX TrueForm --------------------
  // INCOLOR
  { page: 'Pagina 13', family: 'NULUX TrueForm', material: 'EYNOA', section: 'INCOLOR', treatment: 'Hi-Vision Meiryo', price: 3509, sph: [-10, 8], cyl: [-4, 0] },
  { page: 'Pagina 13', family: 'NULUX TrueForm', material: 'EYAS 2.0', section: 'INCOLOR', treatment: 'Hi-Vision Meiryo', price: 2709, sph: [-10, 8], cyl: [-4, 0] },
  { page: 'Pagina 13', family: 'NULUX TrueForm', material: 'PNX', section: 'INCOLOR', treatment: 'Hi-Vision Meiryo', price: 2249, sph: [-10, 8], cyl: [-4, 0] },
  { page: 'Pagina 13', family: 'NULUX TrueForm', material: 'Organic', section: 'INCOLOR', treatment: 'Hi-Vision Meiryo', price: 1899, sph: [-10, 8], cyl: [-4, 0] },

  { page: 'Pagina 13', family: 'NULUX TrueForm', material: 'EYNOA', section: 'INCOLOR', treatment: 'Hi-Vision LongLife BlueControl', price: 3309, sph: [-10, 8], cyl: [-4, 0] },
  { page: 'Pagina 13', family: 'NULUX TrueForm', material: 'EYAS 2.0', section: 'INCOLOR', treatment: 'Hi-Vision LongLife BlueControl', price: 2509, sph: [-10, 8], cyl: [-4, 0] },
  { page: 'Pagina 13', family: 'NULUX TrueForm', material: 'PNX', section: 'INCOLOR', treatment: 'Hi-Vision LongLife BlueControl', price: 2049, sph: [-10, 8], cyl: [-4, 0] },
  { page: 'Pagina 13', family: 'NULUX TrueForm', material: 'Organic', section: 'INCOLOR', treatment: 'Hi-Vision LongLife BlueControl', price: 1699, sph: [-10, 8], cyl: [-4, 0] },

  { page: 'Pagina 13', family: 'NULUX TrueForm', material: 'EYNOA', section: 'INCOLOR', treatment: 'No-Risk BlueControl', price: 3059, sph: [-10, 8], cyl: [-4, 0] },
  { page: 'Pagina 13', family: 'NULUX TrueForm', material: 'EYAS 2.0', section: 'INCOLOR', treatment: 'No-Risk BlueControl', price: 2259, sph: [-10, 8], cyl: [-4, 0] },
  { page: 'Pagina 13', family: 'NULUX TrueForm', material: 'POLI', section: 'INCOLOR', treatment: 'No-Risk BlueControl', price: 1799, sph: [-10, 6], cyl: [-4, 0] },
  { page: 'Pagina 13', family: 'NULUX TrueForm', material: 'PNX', section: 'INCOLOR', treatment: 'No-Risk BlueControl', price: 1799, sph: [-10, 8], cyl: [-4, 0] },
  { page: 'Pagina 13', family: 'NULUX TrueForm', material: 'Organic', section: 'INCOLOR', treatment: 'No-Risk BlueControl', price: 1449, sph: [-10, 8], cyl: [-4, 0] },

  { page: 'Pagina 13', family: 'NULUX TrueForm', material: 'EYNOA', section: 'INCOLOR', treatment: 'Hi-Vision Hard', price: 2439, sph: [-10, 8], cyl: [-4, 0] },
  { page: 'Pagina 13', family: 'NULUX TrueForm', material: 'EYAS 2.0', section: 'INCOLOR', treatment: 'Hi-Vision Hard', price: 1639, sph: [-10, 8], cyl: [-4, 0] },
  { page: 'Pagina 13', family: 'NULUX TrueForm', material: 'POLI', section: 'INCOLOR', treatment: 'Hi-Vision Hard', price: 1179, sph: [-10, 6], cyl: [-4, 0] },
  { page: 'Pagina 13', family: 'NULUX TrueForm', material: 'PNX', section: 'INCOLOR', treatment: 'Hi-Vision Hard', price: 1179, sph: [-10, 8], cyl: [-4, 0] },
  { page: 'Pagina 13', family: 'NULUX TrueForm', material: 'Organic', section: 'INCOLOR', treatment: 'Hi-Vision Hard', price: 829, sph: [-10, 8], cyl: [-4, 0] },

  // SENSITY 2 (only EYNOA, PNX, Organic; special cyl for EYNOA)
  { page: 'Pagina 13', family: 'NULUX TrueForm', material: 'EYNOA', section: 'SENSITY 2', treatment: 'Hi-Vision Meiryo', price: 4709, sph: [-10, 8], cyl: [-6, 0] }, // note: 1.67 Sensity 2 has cyl -6
  { page: 'Pagina 13', family: 'NULUX TrueForm', material: 'PNX', section: 'SENSITY 2', treatment: 'Hi-Vision Meiryo', price: 3449, sph: [-10, 8], cyl: [-4, 0] },
  { page: 'Pagina 13', family: 'NULUX TrueForm', material: 'Organic', section: 'SENSITY 2', treatment: 'Hi-Vision Meiryo', price: 3099, sph: [-10, 8], cyl: [-4, 0] },

  { page: 'Pagina 13', family: 'NULUX TrueForm', material: 'EYNOA', section: 'SENSITY 2', treatment: 'Hi-Vision LongLife BlueControl', price: 4509, sph: [-10, 8], cyl: [-6, 0] },
  { page: 'Pagina 13', family: 'NULUX TrueForm', material: 'PNX', section: 'SENSITY 2', treatment: 'Hi-Vision LongLife BlueControl', price: 3249, sph: [-10, 8], cyl: [-4, 0] },
  { page: 'Pagina 13', family: 'NULUX TrueForm', material: 'Organic', section: 'SENSITY 2', treatment: 'Hi-Vision LongLife BlueControl', price: 2899, sph: [-10, 8], cyl: [-4, 0] },

  { page: 'Pagina 13', family: 'NULUX TrueForm', material: 'EYNOA', section: 'SENSITY 2', treatment: 'No-Risk BlueControl', price: 4259, sph: [-10, 8], cyl: [-6, 0] },
  { page: 'Pagina 13', family: 'NULUX TrueForm', material: 'PNX', section: 'SENSITY 2', treatment: 'No-Risk BlueControl', price: 2999, sph: [-10, 8], cyl: [-4, 0] },
  { page: 'Pagina 13', family: 'NULUX TrueForm', material: 'Organic', section: 'SENSITY 2', treatment: 'No-Risk BlueControl', price: 2649, sph: [-10, 8], cyl: [-4, 0] },

  { page: 'Pagina 13', family: 'NULUX TrueForm', material: 'EYNOA', section: 'SENSITY 2', treatment: 'Hi-Vision Hard', price: 3639, sph: [-10, 8], cyl: [-6, 0] },
  { page: 'Pagina 13', family: 'NULUX TrueForm', material: 'PNX', section: 'SENSITY 2', treatment: 'Hi-Vision Hard', price: 2379, sph: [-10, 8], cyl: [-4, 0] },
  { page: 'Pagina 13', family: 'NULUX TrueForm', material: 'Organic', section: 'SENSITY 2', treatment: 'Hi-Vision Hard', price: 2029, sph: [-10, 8], cyl: [-4, 0] },

  // COLORIDAS (already in BD; fix cyl inversion + ensure correct cyl range)
  { page: 'Pagina 13', family: 'NULUX TrueForm', material: 'EYNOA', section: 'COLORIDAS', treatment: 'Hi-Vision Sun Pro', price: 3349, sph: [-10, 8], cyl: [-4, 0], solar: true },
  { page: 'Pagina 13', family: 'NULUX TrueForm', material: 'EYAS 2.0', section: 'COLORIDAS', treatment: 'Hi-Vision Sun Pro', price: 2549, sph: [-10, 8], cyl: [-4, 0], solar: true },
  { page: 'Pagina 13', family: 'NULUX TrueForm', material: 'PNX', section: 'COLORIDAS', treatment: 'Hi-Vision Sun Pro', price: 2089, sph: [-10, 8], cyl: [-4, 0], solar: true },
  { page: 'Pagina 13', family: 'NULUX TrueForm', material: 'Organic', section: 'COLORIDAS', treatment: 'Hi-Vision Sun Pro', price: 1739, sph: [-10, 8], cyl: [-4, 0], solar: true },
]

function canonicalLabelFor(row) {
  // Keep labels consistent with what exists today per family.
  // - NULUX iDENTITY V+: existing labels use numeric indices for 1.74/1.67; keep that.
  // - NULUX TrueForm: existing labels use material names; keep that.
  if (row.family === 'NULUX iDENTITY V+') {
    const idx = materialToIndex(row.material)
    const token = row.material === 'Organic' ? 'Organic' : row.material === 'EYAS 2.0' ? 'EYAS 2.0' : idx?.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
    return `${row.family} ${token} ${row.section} ${row.treatment}`
  }
  // TrueForm
  return `${row.family} ${row.material} ${row.section} ${row.treatment}`
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

async function main() {
  const { data: families, error: famErr } = await supabase
    .from('global_lens_families')
    .select('id,nome')
    .eq('version_id', versionId)
    .in('nome', ['NULUX iDENTITY V+', 'NULUX TrueForm'])
  if (famErr) throw famErr

  const familyIdByName = new Map((families || []).map((f) => [f.nome, f.id]))
  for (const want of ['NULUX iDENTITY V+', 'NULUX TrueForm']) {
    if (!familyIdByName.has(want)) {
      throw new Error(`Familia nao encontrada no BD para essa versao: ${want}`)
    }
  }

  const existingOffers = await fetchAll(
    supabase
      .from('global_lens_offers')
      .select('id,family_id,canonical_label,raw_label,material,indice_refracao,base_price,features,source_page_reference')
      .in('family_id', [...familyIdByName.values()])
      .in('source_page_reference', ['Pagina 12', 'Pagina 13']),
    1000
  )

  const existingByKey = new Map()
  for (const o of existingOffers) {
    const key = `${o.source_page_reference}||${o.family_id}||${o.material || ''}||${o.base_price}||${o.features?.cor || ''}||${o.features?.tratamento || ''}`
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

  for (const row of EXPECTED) {
    const familyId = familyIdByName.get(row.family)
    const canonical = canonicalLabelFor(row)
    const rawLabel = `${row.section} | ${row.treatment}`
    const idx = materialToIndex(row.material)
    const key = `${row.page}||${familyId}||${row.material}||${row.price}||${row.section}||${row.treatment}`
    const found = existingByKey.get(key) || null

    if (!found) {
      const id = crypto.randomUUID()
      inserts.push({
        id,
        family_id: familyId,
        raw_label: rawLabel,
        canonical_label: canonical,
        material: row.material === 'EYVIA' || row.material === 'EYNOA' || row.material === 'PNX' || row.material === 'Organic' || row.material === 'EYAS 2.0' || row.material === 'POLI' ? row.material : row.material,
        indice_refracao: idx,
        is_atomic_offer: true,
        allows_composition: false,
        already_includes_treatment: true,
        features: buildFeatures({ section: row.section, treatment: row.treatment, solar: !!row.solar }),
        base_price: row.price,
        source_page_reference: row.page,
        confidence_level: 0.9,
        import_key: buildImportKey(row.page, canonical, row.price),
        clinical_category: 'indefinida',
      })

      gridInserts.push({
        offer_id: id,
        sph_min: row.sph[0],
        sph_max: row.sph[1],
        cyl_min: row.cyl[0],
        cyl_max: row.cyl[1],
        add_min: null,
        add_max: null,
        metadata: { raw_grade: `${row.sph[0]} a ${row.sph[1]}` },
      })
      continue
    }

    // Update existing offer fields when clearly wrong (e.g., PNX index imported as 1.59).
    const wantFeatures = buildFeatures({ section: row.section, treatment: row.treatment, solar: !!row.solar })
    const patches = {}

    if (found.canonical_label !== canonical) patches.canonical_label = canonical
    if (found.raw_label !== rawLabel) patches.raw_label = rawLabel
    if (found.base_price !== row.price) patches.base_price = row.price
    if (found.source_page_reference !== row.page) patches.source_page_reference = row.page

    // material/index fixes
    if (found.material !== row.material) patches.material = row.material
    if (Number(found.indice_refracao) !== Number(idx)) patches.indice_refracao = idx

    // features: keep conservative; only overwrite the keys we manage.
    const mergedFeatures = { ...(found.features || {}), ...wantFeatures }
    if (JSON.stringify(mergedFeatures) !== JSON.stringify(found.features || {})) patches.features = mergedFeatures

    if (Object.keys(patches).length) offerUpdates.push({ id: found.id, patches })

    // Grid patches: set to expected sph/cyl and ensure add stays null.
    const gs = gridsByOffer.get(found.id) || []
    for (const g of gs) {
      const gp = {}
      if (Number(g.sph_min) !== Number(row.sph[0])) gp.sph_min = row.sph[0]
      if (Number(g.sph_max) !== Number(row.sph[1])) gp.sph_max = row.sph[1]
      if (Number(g.cyl_min) !== Number(row.cyl[0])) gp.cyl_min = row.cyl[0]
      if (Number(g.cyl_max) !== Number(row.cyl[1])) gp.cyl_max = row.cyl[1]
      if (g.add_min != null) gp.add_min = null
      if (g.add_max != null) gp.add_max = null
      if (Object.keys(gp).length) gridUpdates.push({ id: g.id, patches: gp })
    }
  }

  // Summary
  console.log(`\nFIX_HOYA_P12_P13_NULUX`)
  console.log(`DRY-RUN: ${commit ? 'NAO (COMMIT)' : 'SIM'}`)
  console.log(`Expected cells: ${EXPECTED.length}`)
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

  // Apply inserts first
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
  console.error('Erro fix hoya p12/p13:', err)
  process.exit(1)
})
