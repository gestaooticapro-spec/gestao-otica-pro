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
  console.error('Uso: node scripts/fix_optilab_page41_itop_summer.js --version-id=UUID [--commit]')
  process.exit(1)
}

const PAGE_REF = 'Pagina 41'

// PDF:
// Summer Single 1.50:      sph [-7,+6], cyl [-6,0], sem adição, mfh=null (não evidenciado para single)
// Summer Progressive 1.50: sph [-7,+6], cyl [-6,0], add [0.5,5], mfh=14 (tabela diz "14 e 18mm")
const FIXES = [
  {
    label: 'iTop SOLARES / COLORAÇÃO iTop Summer Single 1.50 Espelhado',
    cyl_min: -6, cyl_max: 0,
    mfh: null, // não evidenciado no PDF para single
  },
  {
    label: 'iTop SOLARES / COLORAÇÃO iTop Summer Progressive 1.50 Espelhado',
    cyl_min: -6, cyl_max: 0,
    mfh: 14, // mínimo suportado (14 e 18mm)
  },
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
    .select('id,offer_id,cyl_min,cyl_max')
    .in('offer_id', offerIds)

  const gridByOffer = new Map((grids || []).map((g) => [g.offer_id, g]))
  const offerByLabel = new Map((offers || []).map((o) => [o.canonical_label, o]))

  console.log(`\nDRY-RUN: ${!commit ? 'SIM' : 'NÃO — APLICANDO MUDANÇAS'}`)
  console.log(`Ofertas na ${PAGE_REF}: ${offers.length}`)

  let patched = 0

  for (const fix of FIXES) {
    const offer = offerByLabel.get(fix.label)
    if (!offer) { console.log(`  AVISO: oferta não encontrada: "${fix.label}"`); continue }
    const g = gridByOffer.get(offer.id)
    if (!g) { console.log(`  AVISO: grade não encontrada para "${fix.label}"`); continue }

    const cylNeedsfix = Number(g.cyl_min) !== fix.cyl_min || Number(g.cyl_max) !== fix.cyl_max
    const currentMfh = offer.features?.min_fitting_height ?? null
    const mfhNeedsFix = currentMfh !== fix.mfh

    if (!cylNeedsfix && !mfhNeedsFix) { console.log(`  OK (sem mudança): "${fix.label}"`); continue }

    console.log(`  "${fix.label}"`)
    if (cylNeedsfix) console.log(`    cyl: [${g.cyl_min}, ${g.cyl_max}] → [${fix.cyl_min}, ${fix.cyl_max}]`)
    if (mfhNeedsFix) console.log(`    mfh: ${currentMfh} → ${fix.mfh}`)

    if (commit) {
      if (cylNeedsfix) {
        const { error } = await supabase.from('global_offer_diopter_grids')
          .update({ cyl_min: fix.cyl_min, cyl_max: fix.cyl_max })
          .eq('id', g.id)
        if (error) throw error
      }
      if (mfhNeedsFix) {
        const newFeatures = { ...(offer.features || {}) }
        if (fix.mfh === null) delete newFeatures.min_fitting_height
        else newFeatures.min_fitting_height = fix.mfh
        const { error } = await supabase.from('global_lens_offers').update({ features: newFeatures }).eq('id', offer.id)
        if (error) throw error
      }
    }
    patched++
  }

  console.log(`\nTotal de patches: ${patched}`)
  console.log(commit ? '[COMMIT] Aplicado.' : '[DRY-RUN] Sem alterações. Rode com --commit para efetivar.')
}

main().catch((e) => { console.error(e); process.exit(1) })
