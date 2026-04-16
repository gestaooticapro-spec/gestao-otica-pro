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
  console.error('Uso: node scripts/fix_optilab_page39_itop.js --version-id=UUID [--commit]')
  process.exit(1)
}

const PAGE_REF = 'Pagina 39'

// Correções por offer_id (confirmados via auditoria)
// Lentes Acabadas: sph e cyl estão invertidos
const ACABADAS_FIXES = [
  { id: 'iTop LENTES ACABADAS 1.56',                    sph_min: -4, sph_max: 4,  cyl_min: -2, cyl_max: 0 },
  { id: 'iTop LENTES ACABADAS 1.56 Cilíndrico Estendido', sph_min: -4, sph_max: 4,  cyl_min: -4, cyl_max: 0 },
  { id: 'iTop LENTES ACABADAS 1.59',                    sph_min: -4, sph_max: 4,  cyl_min: -2, cyl_max: 0 },
  { id: 'iTop LENTES ACABADAS 1.59 Cilíndrico Estendido', sph_min: -4, sph_max: 4,  cyl_min: -4, cyl_max: 0 },
  { id: 'iTop LENTES ACABADAS 1.67',                    sph_min: -10, sph_max: 6, cyl_min: -4, cyl_max: 0 },
]

// Surfaçadas: 1.67 UV Led tem sph errado
const SURFACADAS_FIXES = [
  { label: 'iTop LENTES SURFAÇADAS DIGITAIS 1.67 UV Led Protection Single Digital', sph_min: -10, sph_max: 10 },
]

async function main() {
  const { data: families } = await supabase.from('global_lens_families').select('id').eq('version_id', versionId)
  const familyIds = (families || []).map((f) => f.id)

  const { data: offers } = await supabase
    .from('global_lens_offers')
    .select('id,canonical_label,source_page_reference')
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

  // Patch 1: Lentes Acabadas — sph e cyl invertidos
  console.log('\n[Patch 1] Lentes Acabadas — corrigir sph e cyl:')
  for (const fix of ACABADAS_FIXES) {
    const offer = offerByLabel.get(fix.id)
    if (!offer) { console.log(`  AVISO: oferta não encontrada: "${fix.id}"`); continue }
    const g = gridByOffer.get(offer.id)
    if (!g) { console.log(`  AVISO: grade não encontrada para "${fix.id}"`); continue }
    console.log(`  "${fix.id}"`)
    console.log(`    sph: [${g.sph_min}, ${g.sph_max}] → [${fix.sph_min}, ${fix.sph_max}]`)
    console.log(`    cyl: [${g.cyl_min}, ${g.cyl_max}] → [${fix.cyl_min}, ${fix.cyl_max}]`)
    if (commit) {
      const { error } = await supabase.from('global_offer_diopter_grids')
        .update({ sph_min: fix.sph_min, sph_max: fix.sph_max, cyl_min: fix.cyl_min, cyl_max: fix.cyl_max })
        .eq('id', g.id)
      if (error) throw error
    }
    patched++
  }

  // Patch 2: Surfaçadas — sph errado
  console.log('\n[Patch 2] Lentes Surfaçadas — corrigir sph:')
  for (const fix of SURFACADAS_FIXES) {
    const offer = offerByLabel.get(fix.label)
    if (!offer) { console.log(`  AVISO: oferta não encontrada: "${fix.label}"`); continue }
    const g = gridByOffer.get(offer.id)
    if (!g) { console.log(`  AVISO: grade não encontrada para "${fix.label}"`); continue }
    console.log(`  "${fix.label}"`)
    console.log(`    sph: [${g.sph_min}, ${g.sph_max}] → [${fix.sph_min}, ${fix.sph_max}]`)
    if (commit) {
      const { error } = await supabase.from('global_offer_diopter_grids')
        .update({ sph_min: fix.sph_min, sph_max: fix.sph_max })
        .eq('id', g.id)
      if (error) throw error
    }
    patched++
  }

  console.log(`\nTotal de patches: ${patched}`)
  console.log(commit ? '[COMMIT] Aplicado.' : '[DRY-RUN] Sem alterações. Rode com --commit para efetivar.')
}

main().catch((e) => { console.error(e); process.exit(1) })
