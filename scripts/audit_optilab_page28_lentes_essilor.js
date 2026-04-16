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
  console.error('Uso: node scripts/audit_optilab_page28_lentes_essilor.js --version-id=UUID')
  process.exit(1)
}

function norm(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

async function main() {
  const PAGE_REF = 'Pagina 28'

  const { data: families, error: famErr } = await supabase
    .from('global_lens_families')
    .select('id,nome')
    .eq('version_id', versionId)
  if (famErr) throw famErr
  const familyById = new Map((families || []).map((f) => [f.id, f.nome]))
  const familyIds = (families || []).map((f) => f.id)

  const { data: offers, error: offErr } = await supabase
    .from('global_lens_offers')
    .select('id,family_id,canonical_label,raw_label,base_price,features,material,indice_refracao,source_page_reference')
    .in('family_id', familyIds)
    .eq('source_page_reference', PAGE_REF)
  if (offErr) throw offErr

  const offerIds = (offers || []).map((o) => o.id)
  const { data: grids, error: gridErr } = await supabase
    .from('global_offer_diopter_grids')
    .select('offer_id,sph_min,sph_max,cyl_min,cyl_max,add_min,add_max')
    .in('offer_id', offerIds)
  if (gridErr) throw gridErr

  const byOfferId = new Map()
  for (const g of grids || []) {
    const list = byOfferId.get(g.offer_id) || []
    list.push(g)
    byOfferId.set(g.offer_id, list)
  }

  const rows = (offers || []).map((o) => {
    const gs = byOfferId.get(o.id) || []
    const min = (k) => Math.min(...gs.map((x) => x[k]).filter((v) => v != null).map(Number))
    const max = (k) => Math.max(...gs.map((x) => x[k]).filter((v) => v != null).map(Number))
    const grid = gs.length
      ? {
          sph: [min('sph_min'), max('sph_max')],
          cyl: [min('cyl_min'), max('cyl_max')],
          add: gs.some((x) => x.add_min != null || x.add_max != null) ? [min('add_min'), max('add_max')] : null,
          grids: gs.length,
        }
      : null
    return {
      family: familyById.get(o.family_id) || null,
      label: o.canonical_label || o.raw_label,
      base_price: o.base_price,
      material: o.material,
      indice: o.indice_refracao,
      min_fitting_height: o.features?.min_fitting_height ?? null,
      grid,
    }
  })

  const summary = {
    versionId,
    page: PAGE_REF,
    count: rows.length,
    families: [...new Set(rows.map((r) => r.family))].filter(Boolean).sort(),
    // Spot possible "inverted" cyl range problems
    cylInvertedCount: rows.filter((r) => r.grid && r.grid.cyl && r.grid.cyl[0] > r.grid.cyl[1]).length,
    addNullCount: rows.filter((r) => r.grid && r.grid.add == null).length,
  }

  console.log('AUDIT_OPTILAB_P28_LENTES_ESSILOR')
  console.log(JSON.stringify({ summary, rows: rows.sort((a, b) => norm(a.label).localeCompare(norm(b.label))) }, null, 2))
}

main().catch((err) => {
  console.error('Erro auditoria p.28 (Lentes Essilor):', err)
  process.exit(1)
})

