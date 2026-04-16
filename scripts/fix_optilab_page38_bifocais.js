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
const versionId = args.find((a) => a.startsWith('--version-id='))?.split('=')[1]
const commit = args.includes('--commit')

if (!versionId) {
  console.error('Uso: node scripts/fix_optilab_page38_bifocais.js --version-id=UUID [--commit]')
  process.exit(1)
}

const PAGE_REF = 'Pagina 38'

// IDs conhecidos da auditoria (confirmados acima)
// Patch 1: zerar cyl em todas as 7 ofertas
const ALL_OFFER_IDS = [
  'dee602f8-766d-4a92-b070-b0e72ffd17ce', // Flap Top CR-39
  'ccf007e9-9824-4df4-90ac-6ee33c459ba4', // Flap Top CR-39 + Transitions Gen S
  '1c297d23-17e8-4c01-a577-c9c58a6ea7a0', // Ultex CR-39
  'c11d9820-2d7b-4862-b4d3-65b196c22211', // Ultex CR-39 + Transitions Gen S
  'c2f5dc5b-409b-40e1-9bbc-023e6f1271cf', // iTop Hyper Bifocal Poly
  'd45e5bc3-288a-4aa3-9ac1-c2669cc9474c', // iTop Hyper Bifocal 1.60
  '79c47026-cb66-447b-8df8-ea00d41efb7c', // iTop Hyper Bifocal 1.67
]

// Patch 2: corrigir sph_max do Poly (9 → 4)
const POLY_OFFER_ID = 'c2f5dc5b-409b-40e1-9bbc-023e6f1271cf'

async function main() {
  // Buscar grades filtrando pelas ofertas da Pagina 38
  const { data: grids, error: gridErr } = await supabase
    .from('global_offer_diopter_grids')
    .select('id,offer_id,sph_min,sph_max,cyl_min,cyl_max,add_min,add_max')
    .in('offer_id', ALL_OFFER_IDS)
  if (gridErr) throw gridErr

  // Confirmar que as ofertas pertencem à versão + página correta
  const { data: offers, error: offErr } = await supabase
    .from('global_lens_offers')
    .select('id,canonical_label,features,source_page_reference')
    .in('id', ALL_OFFER_IDS)
    .eq('source_page_reference', PAGE_REF)
  if (offErr) throw offErr

  const validOfferIds = new Set((offers || []).map((o) => o.id))
  const validGrids = (grids || []).filter((g) => validOfferIds.has(g.offer_id))

  console.log(`\nDRY-RUN: ${!commit ? 'SIM' : 'NÃO — APLICANDO MUDANÇAS'}`)
  console.log(`Ofertas confirmadas na ${PAGE_REF}: ${validOfferIds.size}/7`)
  console.log(`Grades encontradas: ${validGrids.length}`)

  // Patch 1: corrigir cyl_min=-6, cyl_max=0 em todas as grades
  const cylPatches = validGrids.filter((g) => Number(g.cyl_min) !== -6 || Number(g.cyl_max) !== 0)
  console.log(`\n[Patch 1] Corrigir cyl_min=-6 / cyl_max=0: ${cylPatches.length} grade(s)`)
  for (const g of cylPatches) {
    const offer = offers.find((o) => o.id === g.offer_id)
    console.log(`  grade_id=${g.id} | oferta="${offer?.canonical_label}" | cyl atual=[${g.cyl_min}, ${g.cyl_max}] → [-6, 0]`)
    if (commit) {
      const { error } = await supabase
        .from('global_offer_diopter_grids')
        .update({ cyl_min: -6, cyl_max: 0 })
        .eq('id', g.id)
      if (error) throw error
    }
  }

  // Patch 2: reverter sph_max do iTop Hyper Bifocal Poly para 9
  const polyGrids = validGrids.filter((g) => g.offer_id === POLY_OFFER_ID && Number(g.sph_max) !== 9)
  console.log(`\n[Patch 2] Reverter sph_max do iTop Hyper Bifocal Poly → 9: ${polyGrids.length} grade(s)`)
  for (const g of polyGrids) {
    console.log(`  grade_id=${g.id} | sph_max atual=${g.sph_max} → 9`)
    if (commit) {
      const { error } = await supabase
        .from('global_offer_diopter_grids')
        .update({ sph_max: 9 })
        .eq('id', g.id)
      if (error) throw error
    }
  }

  // Patch 3: min_fitting_height=18 em todas as ofertas
  const heightPatches = (offers || []).filter((o) => (o.features?.min_fitting_height ?? null) !== 18)
  console.log(`\n[Patch 3] Setar min_fitting_height=18: ${heightPatches.length} oferta(s)`)
  for (const o of heightPatches) {
    console.log(`  offer_id=${o.id} | oferta="${o.canonical_label}" | min_fitting_height atual=${o.features?.min_fitting_height ?? null} → 18`)
    if (commit) {
      const newFeatures = { ...(o.features || {}), min_fitting_height: 18 }
      const { error } = await supabase
        .from('global_lens_offers')
        .update({ features: newFeatures })
        .eq('id', o.id)
      if (error) throw error
    }
  }

  if (!commit) {
    console.log('\n[DRY-RUN] Nenhuma alteração aplicada. Rode com --commit para efetivar.')
  } else {
    console.log('\n[COMMIT] Alterações aplicadas. Rode o audit para validar.')
  }
}

main().catch((err) => {
  console.error('Erro fix p.38 (Bifocais):', err)
  process.exit(1)
})
