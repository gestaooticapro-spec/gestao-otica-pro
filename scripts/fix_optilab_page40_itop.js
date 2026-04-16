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
  console.error('Uso: node scripts/fix_optilab_page40_itop.js --version-id=UUID [--commit]')
  process.exit(1)
}

const PAGE_REF = 'Pagina 40'

// Progressivas: cyl=[0,0] → [-6,0]; mfh: "short"=14mm, demais=18mm
// A tabela usa badge "short" para lentes com altura 14mm
// Por label: 1.50, 1.50+Sun, 1.50+Trans, 1.59, 1.59+Trans = short disponível (14mm); 1.56, 1.67, 1.67+Trans, 1.67+UV, 1.74, 1.74+Trans, 1.74+UV = 18mm
// Conservador: barra diz "14 e 18mm" — setar mfh=14 para todas (mínimo suportado)
const PROGRESSIVAS_FIXES = [
  { label: 'iTop PROGRESSIVA 1.50',                      cyl_min: -6, cyl_max: 0, mfh: 14 },
  { label: 'iTop PROGRESSIVA 1.50 + Sun Light Photo',     cyl_min: -6, cyl_max: 0, mfh: 14 },
  { label: 'iTop PROGRESSIVA 1.50 + Transitions Gen S',   cyl_min: -6, cyl_max: 0, mfh: 14 },
  { label: 'iTop PROGRESSIVA 1.56 UV Led Protection',     cyl_min: -6, cyl_max: 0, mfh: 18 },
  { label: 'iTop PROGRESSIVA 1.59',                       cyl_min: -6, cyl_max: 0, mfh: 14 },
  { label: 'iTop PROGRESSIVA 1.59 + Transitions Gen S',   cyl_min: -6, cyl_max: 0, mfh: 14 },
  { label: 'iTop PROGRESSIVA 1.67',                       cyl_min: -6, cyl_max: 0, mfh: 18 },
  { label: 'iTop PROGRESSIVA 1.67 + Transitions Gen S',   cyl_min: -6, cyl_max: 0, mfh: 18 },
  { label: 'iTop PROGRESSIVA 1.67 UV Led Protection',     cyl_min: -6, cyl_max: 0, mfh: 18 },
  { label: 'iTop PROGRESSIVA 1.74',                       cyl_min: -6, cyl_max: 0, mfh: 18 },
  { label: 'iTop PROGRESSIVA 1.74 + Transitions Gen S',   cyl_min: -6, cyl_max: 0, mfh: 18 },
  { label: 'iTop PROGRESSIVA 1.74 UV Led Protection',     cyl_min: -6, cyl_max: 0, sph_min: -15, sph_max: 9, mfh: 18 },
]

// UV Led Protection (visão simples) e iTop Tradicional: cyl=[0,0]→[-8,0]
const VISAO_SIMPLES_FIXES = [
  { label: 'iTop VISÃO SIMPLES Blocos 1.50 iTop Sun Light Protection Photo', cyl_min: -8, cyl_max: 0 },
  { label: 'iTop VISÃO SIMPLES Blocos 1.67 iTop Single Clear Esférico',      cyl_min: -8, cyl_max: 0 },
]

async function main() {
  const { data: families } = await supabase.from('global_lens_families').select('id').eq('version_id', versionId)
  const familyIds = (families || []).map((f) => f.id)

  const { data: offers } = await supabase
    .from('global_lens_offers')
    .select('id,canonical_label,features,source_page_reference')
    .in('family_id', familyIds)
    .eq('source_page_reference', PAGE_REF)

  const offerIds = (offers || []).map((o) => o.id)
  const { data: grids } = await supabase
    .from('global_offer_diopter_grids')
    .select('id,offer_id,sph_min,sph_max,cyl_min,cyl_max')
    .in('offer_id', offerIds)

  const gridByOffer = new Map((grids || []).map((g) => [g.offer_id, g]))
  const offerByLabel = new Map((offers || []).map((o) => [o.canonical_label, o]))

  console.log(`\nDRY-RUN: ${!commit ? 'SIM' : 'NÃO — APLICANDO MUDANÇAS'}`)
  console.log(`Ofertas na ${PAGE_REF}: ${offers.length}`)

  let patched = 0

  // Patch 1: Progressivas — cyl, mfh e sph onde necessário
  console.log('\n[Patch 1] Progressivas — cyl / mfh / sph:')
  for (const fix of PROGRESSIVAS_FIXES) {
    const offer = offerByLabel.get(fix.label)
    if (!offer) { console.log(`  AVISO: oferta não encontrada: "${fix.label}"`); continue }
    const g = gridByOffer.get(offer.id)
    if (!g) { console.log(`  AVISO: grade não encontrada para "${fix.label}"`); continue }

    const gridPatch = {}
    if (Number(g.cyl_min) !== fix.cyl_min || Number(g.cyl_max) !== fix.cyl_max) {
      gridPatch.cyl_min = fix.cyl_min
      gridPatch.cyl_max = fix.cyl_max
    }
    if (fix.sph_min !== undefined && Number(g.sph_min) !== fix.sph_min) gridPatch.sph_min = fix.sph_min
    if (fix.sph_max !== undefined && Number(g.sph_max) !== fix.sph_max) gridPatch.sph_max = fix.sph_max

    const currentMfh = offer.features?.min_fitting_height ?? null
    const needsMfh = currentMfh !== fix.mfh

    if (Object.keys(gridPatch).length === 0 && !needsMfh) {
      console.log(`  OK (sem mudança): "${fix.label}"`)
      continue
    }

    console.log(`  "${fix.label}"`)
    if (Object.keys(gridPatch).length) console.log(`    grade: ${JSON.stringify(gridPatch)}`)
    if (needsMfh) console.log(`    mfh: ${currentMfh} → ${fix.mfh}`)

    if (commit) {
      if (Object.keys(gridPatch).length) {
        const { error } = await supabase.from('global_offer_diopter_grids').update(gridPatch).eq('id', g.id)
        if (error) throw error
      }
      if (needsMfh) {
        const newFeatures = { ...(offer.features || {}), min_fitting_height: fix.mfh }
        const { error } = await supabase.from('global_lens_offers').update({ features: newFeatures }).eq('id', offer.id)
        if (error) throw error
      }
    }
    patched++
  }

  // Patch 2: Visão Simples / Tradicional — cyl
  console.log('\n[Patch 2] Visão Simples / Tradicional — cyl:')
  for (const fix of VISAO_SIMPLES_FIXES) {
    const offer = offerByLabel.get(fix.label)
    if (!offer) { console.log(`  AVISO: oferta não encontrada: "${fix.label}"`); continue }
    const g = gridByOffer.get(offer.id)
    if (!g) { console.log(`  AVISO: grade não encontrada para "${fix.label}"`); continue }

    console.log(`  "${fix.label}"`)
    console.log(`    cyl: [${g.cyl_min}, ${g.cyl_max}] → [${fix.cyl_min}, ${fix.cyl_max}]`)
    if (commit) {
      const { error } = await supabase.from('global_offer_diopter_grids')
        .update({ cyl_min: fix.cyl_min, cyl_max: fix.cyl_max })
        .eq('id', g.id)
      if (error) throw error
    }
    patched++
  }

  console.log(`\nTotal de patches: ${patched}`)
  console.log(commit ? '[COMMIT] Aplicado.' : '[DRY-RUN] Sem alterações. Rode com --commit para efetivar.')
}

main().catch((e) => { console.error(e); process.exit(1) })
