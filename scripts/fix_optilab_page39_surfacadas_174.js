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
  console.error('Uso: node scripts/fix_optilab_page39_surfacadas_174.js --version-id=UUID [--commit]')
  process.exit(1)
}

const PAGE_REF = 'Pagina 39'

// PDF página 39 — Lentes Surfaçadas Digitais 1.74
// sph: +25,00 a -30,00 → sph_min=-30, sph_max=25
// cyl: -8,00 → cyl_min=-8, cyl_max=0 (já correto)
const FIXES = [
  { label: 'iTop LENTES SURFAÇADAS DIGITAIS 1.74 Digital',                      sph_min: -30, sph_max: 25 },
  { label: 'iTop LENTES SURFAÇADAS DIGITAIS 1.74 UV Led Protection Single Digital', sph_min: -30, sph_max: 25 },
  { label: 'iTop LENTES SURFAÇADAS DIGITAIS 1.74 Transitions Gen 8 Digital',    sph_min: -30, sph_max: 25 },
]

async function main() {
  const { data: families } = await supabase.from('global_lens_families').select('id').eq('version_id', versionId)
  const familyIds = (families || []).map((f) => f.id)

  const { data: offers } = await supabase
    .from('global_lens_offers')
    .select('id,canonical_label')
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

  for (const fix of FIXES) {
    const offer = offerByLabel.get(fix.label)
    if (!offer) { console.log(`  AVISO: oferta não encontrada: "${fix.label}"`); continue }
    const g = gridByOffer.get(offer.id)
    if (!g) { console.log(`  AVISO: grade não encontrada para "${fix.label}"`); continue }

    const patch = {}
    if (Number(g.sph_min) !== fix.sph_min) patch.sph_min = fix.sph_min
    if (Number(g.sph_max) !== fix.sph_max) patch.sph_max = fix.sph_max

    if (Object.keys(patch).length === 0) { console.log(`  OK (sem mudança): "${fix.label}"`); continue }

    console.log(`  "${fix.label}"`)
    if (patch.sph_min !== undefined) console.log(`    sph_min: ${g.sph_min} → ${patch.sph_min}`)
    if (patch.sph_max !== undefined) console.log(`    sph_max: ${g.sph_max} → ${patch.sph_max}`)

    if (commit) {
      const { error } = await supabase.from('global_offer_diopter_grids').update(patch).eq('id', g.id)
      if (error) throw error
    }
    patched++
  }

  console.log(`\nTotal de patches: ${patched}`)
  console.log(commit ? '[COMMIT] Aplicado.' : '[DRY-RUN] Sem alterações. Rode com --commit para efetivar.')
}

main().catch((e) => { console.error(e); process.exit(1) })
