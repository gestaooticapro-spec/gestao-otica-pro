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
  console.error('Uso: node scripts/fix_optilab_page40_itop_cyl_sph.js --version-id=UUID [--commit]')
  process.exit(1)
}

const PAGE_REF = 'Pagina 40'

// Valores corretos conforme PDF página 40 (confirmados pelo usuário)
const FIXES = [
  { label: 'iTop PROGRESSIVA 1.50',                      sph_min: -9,  sph_max: 6,  cyl_min: -6, cyl_max: 0 },
  { label: 'iTop PROGRESSIVA 1.50 + Sun Light Photo',     sph_min: -9,  sph_max: 6,  cyl_min: -6, cyl_max: 0 },
  { label: 'iTop PROGRESSIVA 1.50 + Transitions Gen S',   sph_min: -9,  sph_max: 6,  cyl_min: -6, cyl_max: 0 },
  { label: 'iTop PROGRESSIVA 1.59',                       sph_min: -10, sph_max: 8,  cyl_min: -8, cyl_max: 0 },
  { label: 'iTop PROGRESSIVA 1.59 + Transitions Gen S',   sph_min: -10, sph_max: 8,  cyl_min: -8, cyl_max: 0 },
  { label: 'iTop PROGRESSIVA 1.67',                       sph_min: -12, sph_max: 9,  cyl_min: -8, cyl_max: 0 },
  { label: 'iTop PROGRESSIVA 1.67 + Transitions Gen S',   sph_min: -12, sph_max: 9,  cyl_min: -8, cyl_max: 0 },
  { label: 'iTop PROGRESSIVA 1.74',                       sph_min: -15, sph_max: 12, cyl_min: -8, cyl_max: 0 },
  { label: 'iTop PROGRESSIVA 1.74 + Transitions Gen S',   sph_min: -15, sph_max: 12, cyl_min: -8, cyl_max: 0 },
  { label: 'iTop PROGRESSIVA 1.56 UV Led Protection',     sph_min: -8,  sph_max: 7,  cyl_min: -8, cyl_max: 0 },
  { label: 'iTop PROGRESSIVA 1.67 UV Led Protection',     sph_min: -12, sph_max: 9,  cyl_min: -8, cyl_max: 0 },
  { label: 'iTop PROGRESSIVA 1.74 UV Led Protection',     sph_min: -12, sph_max: 9,  cyl_min: -8, cyl_max: 0 },
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

  for (const fix of FIXES) {
    const offer = offerByLabel.get(fix.label)
    if (!offer) { console.log(`  AVISO: oferta não encontrada: "${fix.label}"`); continue }
    const g = gridByOffer.get(offer.id)
    if (!g) { console.log(`  AVISO: grade não encontrada para "${fix.label}"`); continue }

    const patch = {}
    if (Number(g.sph_min) !== fix.sph_min) patch.sph_min = fix.sph_min
    if (Number(g.sph_max) !== fix.sph_max) patch.sph_max = fix.sph_max
    if (Number(g.cyl_min) !== fix.cyl_min) patch.cyl_min = fix.cyl_min
    if (Number(g.cyl_max) !== fix.cyl_max) patch.cyl_max = fix.cyl_max

    if (Object.keys(patch).length === 0) { console.log(`  OK (sem mudança): "${fix.label}"`); continue }

    console.log(`  "${fix.label}"`)
    for (const [k, v] of Object.entries(patch)) {
      const old = g[k]
      console.log(`    ${k}: ${old} → ${v}`)
    }

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
