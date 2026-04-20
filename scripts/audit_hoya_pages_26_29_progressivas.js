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
  console.error('Uso: node scripts/audit_hoya_pages_26_29_progressivas.js --version-id=UUID')
  process.exit(1)
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

function rangeFromGrids(grids, kMin, kMax) {
  const mins = grids.map((g) => g[kMin]).filter((v) => v != null).map(Number)
  const maxs = grids.map((g) => g[kMax]).filter((v) => v != null).map(Number)
  if (!mins.length && !maxs.length) return null
  return [Math.min(...mins), Math.max(...maxs)]
}

async function main() {
  const pages = ['Pagina 26', 'Pagina 27', 'Pagina 28', 'Pagina 29']
  const familiesWanted = ['Hoyalux Balansis', 'Hoyalux Daynamic', 'ARGOS', 'Amplitude']

  const { data: families, error: famErr } = await supabase
    .from('global_lens_families')
    .select('id,nome')
    .eq('version_id', versionId)
    .in('nome', familiesWanted)
  if (famErr) throw famErr

  const familyById = new Map((families || []).map((f) => [f.id, f.nome]))
  const familyIds = (families || []).map((f) => f.id)

  const offers = await fetchAll(
    supabase
      .from('global_lens_offers')
      .select(
        'id,family_id,canonical_label,raw_label,base_price,material,indice_refracao,features,source_page_reference,clinical_category'
      )
      .in('family_id', familyIds)
      .in('source_page_reference', pages),
    1000
  )

  const offerIds = offers.map((o) => o.id)
  const grids = offerIds.length
    ? await fetchAll(
        supabase
          .from('global_offer_diopter_grids')
          .select('id,offer_id,sph_min,sph_max,cyl_min,cyl_max,add_min,add_max,metadata')
          .in('offer_id', offerIds),
        1000
      )
    : []

  const gridsByOffer = new Map()
  for (const g of grids) {
    const list = gridsByOffer.get(g.offer_id) || []
    list.push(g)
    gridsByOffer.set(g.offer_id, list)
  }

  const rows = offers
    .map((o) => {
      const gs = gridsByOffer.get(o.id) || []
      const meta = gs.find((g) => g.metadata && Object.keys(g.metadata).length)?.metadata || null
      return {
        page: o.source_page_reference,
        family: familyById.get(o.family_id) || o.family_id,
        id: o.id,
        label: o.canonical_label || o.raw_label,
        base_price: o.base_price,
        material: o.material,
        indice: o.indice_refracao,
        section: o.features?.cor ?? null,
        treatment: o.features?.tratamento ?? null,
        min_fitting_height: o.features?.min_fitting_height ?? null,
        sph: rangeFromGrids(gs, 'sph_min', 'sph_max'),
        cyl: rangeFromGrids(gs, 'cyl_min', 'cyl_max'),
        add: rangeFromGrids(gs, 'add_min', 'add_max'),
        diametro: meta?.diametro ?? meta?.diameter ?? meta?.diametro_mm ?? null,
        cyl_inverted: gs.some(
          (g) => g.cyl_min != null && g.cyl_max != null && Number(g.cyl_min) > Number(g.cyl_max)
        ),
      }
    })
    .sort(
      (a, b) =>
        (a.page || '').localeCompare(b.page || '') ||
        (a.family || '').localeCompare(b.family || '') ||
        (a.label || '').localeCompare(b.label || '')
    )

  const summary = {
    versionId,
    offers: rows.length,
    pages: Object.fromEntries(
      pages.map((p) => [
        p,
        {
          offers: rows.filter((r) => r.page === p).length,
          cylInverted: rows.filter((r) => r.page === p && r.cyl_inverted).length,
          missingAdd: rows.filter((r) => r.page === p && (!r.add || r.add[0] == null || r.add[1] == null)).length,
        },
      ])
    ),
    families: [...new Set(rows.map((r) => r.family))].sort(),
  }

  console.log('AUDIT_HOYA_P26_P29')
  console.log(JSON.stringify({ summary, rows }, null, 2))
}

main().catch((err) => {
  console.error('Erro audit hoya p26-p29:', err)
  process.exit(1)
})

