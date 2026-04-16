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
const versionId = args.find((arg) => arg.startsWith('--version-id='))?.split('=')[1]

if (!versionId) {
  console.error('Uso: node scripts/audit_optilab_pages_22_25_eyezen.js --version-id=UUID')
  process.exit(1)
}

function ensureObject(value) {
  return value && typeof value === 'object' ? value : {}
}

async function main() {
  const targetFamilyNames = [
    'LENTES EYEZEN BOOST®',
    'LENTES EYEZEN START®',
    'EYEZEN® START STOCK | LENTES PRONTAS CRIZAL®',
  ]

  const { data: families, error: famErr } = await supabase
    .from('global_lens_families')
    .select('id,nome')
    .eq('version_id', versionId)
    .in('nome', targetFamilyNames)

  if (famErr) throw famErr

  const familyById = new Map((families || []).map((f) => [f.id, f]))
  const familyIds = (families || []).map((f) => f.id)

  if (!familyIds.length) {
    console.log('Nenhuma família Eyezen encontrada na versão:', versionId)
    return
  }

  const { data: offers, error: offErr } = await supabase
    .from('global_lens_offers')
    .select('id,family_id,raw_label,canonical_label,material,indice_refracao,base_price,features,source_page_reference')
    .in('family_id', familyIds)
  if (offErr) throw offErr

  const offerIds = (offers || []).map((o) => o.id)

  const { data: grids, error: gridErr } = await supabase
    .from('global_offer_diopter_grids')
    .select('offer_id,sph_min,sph_max,cyl_min,cyl_max,add_min,add_max,metadata')
    .in('offer_id', offerIds)
  if (gridErr) throw gridErr

  const gridsByOfferId = new Map()
  for (const g of grids || []) {
    const list = gridsByOfferId.get(g.offer_id) || []
    list.push(g)
    gridsByOfferId.set(g.offer_id, list)
  }

  const summary = {
    versionId,
    familiesFound: (families || []).map((f) => f.nome),
    offersTotal: offers?.length || 0,
    offersMissingMinFittingHeight: 0,
    distinctMinFittingHeights: new Map(),
    distinctCylRanges: new Map(),
  }

  const rows = (offers || []).map((o) => {
    const feat = ensureObject(o.features)
    const minH = feat.min_fitting_height ?? null
    if (minH == null) summary.offersMissingMinFittingHeight += 1
    summary.distinctMinFittingHeights.set(String(minH), (summary.distinctMinFittingHeights.get(String(minH)) || 0) + 1)

    const offerGrids = gridsByOfferId.get(o.id) || []
    // Compact signature: min/max over all grids
    const cylMin = offerGrids.length ? Math.min(...offerGrids.map((g) => Number(g.cyl_min))) : null
    const cylMax = offerGrids.length ? Math.max(...offerGrids.map((g) => Number(g.cyl_max))) : null
    const cylSig = `${cylMin ?? 'null'}..${cylMax ?? 'null'}`
    summary.distinctCylRanges.set(cylSig, (summary.distinctCylRanges.get(cylSig) || 0) + 1)

    return {
      family: familyById.get(o.family_id)?.nome || o.family_id,
      canonical_label: o.canonical_label || null,
      raw_label: o.raw_label || null,
      material: o.material || null,
      indice: o.indice_refracao ?? null,
      base_price: o.base_price ?? null,
      source_page_reference: o.source_page_reference ?? null,
      min_fitting_height: minH,
      cyl_range: cylSig,
      grid_count: offerGrids.length,
    }
  })

  console.log('AUDIT_EYEZEN_22_25')
  console.log(JSON.stringify({
    ...summary,
    distinctMinFittingHeights: Object.fromEntries([...summary.distinctMinFittingHeights.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
    distinctCylRanges: Object.fromEntries([...summary.distinctCylRanges.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
  }, null, 2))
  console.log('SAMPLE_ROWS (first 25)')
  console.log(JSON.stringify(rows.slice(0, 25), null, 2))
}

main().catch((err) => {
  console.error('Erro na auditoria Eyezen:', err)
  process.exit(1)
})
