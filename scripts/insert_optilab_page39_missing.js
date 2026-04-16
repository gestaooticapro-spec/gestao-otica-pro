import path from 'path'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const args = process.argv.slice(2)
const versionId = args.find((a) => a.startsWith('--version-id='))?.split('=')[1]
const commit = args.includes('--commit')

if (!versionId) {
  console.error('Uso: node scripts/insert_optilab_page39_missing.js --version-id=UUID [--commit]')
  process.exit(1)
}

const PAGE_REF = 'Pagina 39'
// Família iTop (única família da Pagina 39)
const ITOP_FAMILY_ID = '67ca3a37-8c55-4a54-8365-be8264ba21ad'

const DEFAULT_FEATURES = {
  short: false, solar: false, xperio: false, blue_uv: false,
  digital: false, coloracao: false, transitions: false,
  face_interna: false, transitions_gens: false, transitions_extractive: false,
}

// -------------------------------------------------------------------
// Lentes a inserir
// -------------------------------------------------------------------

// 1. Surfaçada Digital 1.56 — mesmo padrão das outras surfaçadas da p39
//    Preços PDF: Vert Clair 1.688 | Trio Easy Clean 1.383 | Verniz HC 1.118
//    base_price = Trio Easy Clean (padrão adotado nas demais)
const SURFACADA_156 = {
  offer: {
    family_id: ITOP_FAMILY_ID,
    raw_label: '1.56 UV Led Protection Single Digital',
    canonical_label: 'iTop LENTES SURFAÇADAS DIGITAIS 1.56 UV Led Protection Single Digital',
    material: 'Resina',
    indice_refracao: 1.56,
    is_atomic_offer: false,
    allows_composition: true,
    already_includes_treatment: false,
    features: DEFAULT_FEATURES,
    base_price: 1383,
    source_page_reference: PAGE_REF,
    confidence_level: 0.9,
    import_key: 'Pagina 39 | iTop LENTES SURFAÇADAS DIGITAIS 1.56 UV Led Protection Single Digital | 1383',
    clinical_category: 'visao_simples',
  },
  grid: { sph_min: -8, sph_max: 8, cyl_min: -8, cyl_max: 0 },
}

// 2–4. Ultra Light Progressivas — "Apenas na miopia": sph_max=0
//      Preço: 720,00 (acrescentar — valor único da seção Ultra Light)
//      add: [0.5, 3.5]; cyl: [-6, 0]
const ULTRA_LIGHT_PROGRESSIVAS = [
  {
    offer: {
      family_id: ITOP_FAMILY_ID,
      raw_label: '1.56 iTop UV Led Progressivas Ultra Light',
      canonical_label: 'iTop ULTRA LIGHT 1.56 UV Led Progressiva',
      material: 'Resina',
      indice_refracao: 1.56,
      is_atomic_offer: false,
      allows_composition: true,
      already_includes_treatment: false,
      features: DEFAULT_FEATURES,
      base_price: 720,
      source_page_reference: PAGE_REF,
      confidence_level: 0.9,
      import_key: 'Pagina 39 | iTop ULTRA LIGHT 1.56 UV Led Progressiva | 720',
      clinical_category: 'multifocal',
    },
    grid: { sph_min: -8, sph_max: 0, cyl_min: -6, cyl_max: 0, add_min: 0.5, add_max: 3.5 },
  },
  {
    offer: {
      family_id: ITOP_FAMILY_ID,
      raw_label: '1.67 iTop UV Led Progressivas Ultra Light',
      canonical_label: 'iTop ULTRA LIGHT 1.67 UV Led Progressiva',
      material: 'Resina',
      indice_refracao: 1.67,
      is_atomic_offer: false,
      allows_composition: true,
      already_includes_treatment: false,
      features: DEFAULT_FEATURES,
      base_price: 720,
      source_page_reference: PAGE_REF,
      confidence_level: 0.9,
      import_key: 'Pagina 39 | iTop ULTRA LIGHT 1.67 UV Led Progressiva | 720',
      clinical_category: 'multifocal',
    },
    grid: { sph_min: -10, sph_max: 0, cyl_min: -6, cyl_max: 0, add_min: 0.5, add_max: 3.5 },
  },
  {
    offer: {
      family_id: ITOP_FAMILY_ID,
      raw_label: '1.74 iTop Progressivas Ultra Light',
      canonical_label: 'iTop ULTRA LIGHT 1.74 Progressiva',
      material: 'Resina',
      indice_refracao: 1.74,
      is_atomic_offer: false,
      allows_composition: true,
      already_includes_treatment: false,
      features: DEFAULT_FEATURES,
      base_price: 720,
      source_page_reference: PAGE_REF,
      confidence_level: 0.9,
      import_key: 'Pagina 39 | iTop ULTRA LIGHT 1.74 Progressiva | 720',
      clinical_category: 'multifocal',
    },
    grid: { sph_min: -14.75, sph_max: 0, cyl_min: -6, cyl_max: 0, add_min: 0.5, add_max: 3.5 },
  },
]

// 5–7. Ultra Light Singles — "Ambas" (miopia e hipermetropia)
//      Colunas PDF: esf_mín | esf_máx | cil_máx (-6 para todas)
const ULTRA_LIGHT_SINGLES = [
  {
    offer: {
      family_id: ITOP_FAMILY_ID,
      raw_label: '1.56 iTop UV Led Single Ultra Light',
      canonical_label: 'iTop ULTRA LIGHT 1.56 UV Led Single',
      material: 'Resina',
      indice_refracao: 1.56,
      is_atomic_offer: false,
      allows_composition: true,
      already_includes_treatment: false,
      features: DEFAULT_FEATURES,
      base_price: 720,
      source_page_reference: PAGE_REF,
      confidence_level: 0.9,
      import_key: 'Pagina 39 | iTop ULTRA LIGHT 1.56 UV Led Single | 720',
      clinical_category: 'visao_simples',
    },
    grid: { sph_min: -8, sph_max: 6, cyl_min: -6, cyl_max: 0 },
  },
  {
    offer: {
      family_id: ITOP_FAMILY_ID,
      raw_label: '1.67 iTop UV Led Single Ultra Light',
      canonical_label: 'iTop ULTRA LIGHT 1.67 UV Led Single',
      material: 'Resina',
      indice_refracao: 1.67,
      is_atomic_offer: false,
      allows_composition: true,
      already_includes_treatment: false,
      features: DEFAULT_FEATURES,
      base_price: 720,
      source_page_reference: PAGE_REF,
      confidence_level: 0.9,
      import_key: 'Pagina 39 | iTop ULTRA LIGHT 1.67 UV Led Single | 720',
      clinical_category: 'visao_simples',
    },
    grid: { sph_min: -10, sph_max: 12, cyl_min: -6, cyl_max: 0 },
  },
  {
    offer: {
      family_id: ITOP_FAMILY_ID,
      raw_label: '1.74 iTop Single Ultra Light',
      canonical_label: 'iTop ULTRA LIGHT 1.74 Single',
      material: 'Resina',
      indice_refracao: 1.74,
      is_atomic_offer: false,
      allows_composition: true,
      already_includes_treatment: false,
      features: DEFAULT_FEATURES,
      base_price: 720,
      source_page_reference: PAGE_REF,
      confidence_level: 0.9,
      import_key: 'Pagina 39 | iTop ULTRA LIGHT 1.74 Single | 720',
      clinical_category: 'visao_simples',
    },
    grid: { sph_min: -30, sph_max: 25, cyl_min: -6, cyl_max: 0 },
  },
]

const ALL_ENTRIES = [SURFACADA_156, ...ULTRA_LIGHT_PROGRESSIVAS, ...ULTRA_LIGHT_SINGLES]

async function main() {
  console.log(`\nDRY-RUN: ${!commit ? 'SIM' : 'NÃO — APLICANDO MUDANÇAS'}`)
  console.log(`Lentes a inserir: ${ALL_ENTRIES.length}\n`)

  // Verificar quais já existem pelo import_key
  const importKeys = ALL_ENTRIES.map((e) => e.offer.import_key)
  const { data: existing } = await supabase
    .from('global_lens_offers')
    .select('import_key,canonical_label')
    .in('import_key', importKeys)

  const existingKeys = new Set((existing || []).map((e) => e.import_key))

  let inserted = 0
  for (const entry of ALL_ENTRIES) {
    if (existingKeys.has(entry.offer.import_key)) {
      console.log(`  JÁ EXISTE: "${entry.offer.canonical_label}"`)
      continue
    }

    console.log(`  INSERIR: "${entry.offer.canonical_label}"`)
    console.log(`    grid: sph[${entry.grid.sph_min},${entry.grid.sph_max}] cyl[${entry.grid.cyl_min},${entry.grid.cyl_max}]${entry.grid.add_min != null ? ` add[${entry.grid.add_min},${entry.grid.add_max}]` : ''}`)

    if (commit) {
      const { data: newOffer, error: offerErr } = await supabase
        .from('global_lens_offers')
        .insert(entry.offer)
        .select('id')
        .single()
      if (offerErr) throw offerErr

      const { error: gridErr } = await supabase
        .from('global_offer_diopter_grids')
        .insert({ offer_id: newOffer.id, ...entry.grid })
      if (gridErr) throw gridErr
    }
    inserted++
  }

  console.log(`\nTotal a inserir: ${inserted}`)
  console.log(commit ? '[COMMIT] Aplicado.' : '[DRY-RUN] Sem alterações. Rode com --commit para efetivar.')
}

main().catch((e) => { console.error(e); process.exit(1) })
