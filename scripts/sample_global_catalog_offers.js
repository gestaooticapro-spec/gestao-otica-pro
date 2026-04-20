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
const perFamily = Number(args.find((arg) => arg.startsWith('--per-family='))?.split('=')[1] || 5)
const maxFamilies = Number(args.find((arg) => arg.startsWith('--max-families='))?.split('=')[1] || 20)

if (!versionId) {
  console.error('Uso: node scripts/sample_global_catalog_offers.js --version-id=UUID [--per-family=5] [--max-families=20]')
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

function sample(arr, n) {
  if (arr.length <= n) return arr.slice()
  const out = []
  const used = new Set()
  while (out.length < n) {
    const idx = Math.floor(Math.random() * arr.length)
    if (used.has(idx)) continue
    used.add(idx)
    out.push(arr[idx])
  }
  return out
}

async function main() {
  const families = await fetchAll(
    supabase
      .from('global_lens_families')
      .select('id,nome,clinical_category,source_page_reference')
      .eq('version_id', versionId),
    1000
  )

  const summary = {
    versionId,
    families: families.length,
    familiesWithoutPage: families.filter((f) => !f.source_page_reference).length,
  }

  // Focus on families that have page references first.
  const familiesSorted = [...families].sort(
    (a, b) =>
      String(a.source_page_reference || '').localeCompare(String(b.source_page_reference || '')) ||
      String(a.nome || '').localeCompare(String(b.nome || ''))
  )
  const familiesPicked = familiesSorted.slice(0, maxFamilies)

  // Load a small slice of offers per family (avoid huge payloads).
  const offers = []
  for (const f of familiesPicked) {
    const { data, error } = await supabase
      .from('global_lens_offers')
      .select(
        'id,family_id,canonical_label,raw_label,base_price,material,indice_refracao,features,source_page_reference,clinical_category,created_at'
      )
      .eq('family_id', f.id)
      .order('created_at', { ascending: false })
      .range(0, Math.max(50, perFamily * 15) - 1)
    if (error) throw error
    for (const row of data || []) offers.push(row)
  }

  const familyById = new Map(familiesPicked.map((f) => [f.id, f]))
  const byFamily = new Map()
  for (const o of offers) {
    const list = byFamily.get(o.family_id) || []
    list.push(o)
    byFamily.set(o.family_id, list)
  }

  const pickedOffers = []
  for (const f of familiesPicked) {
    const list = byFamily.get(f.id) || []
    for (const o of sample(list, perFamily)) pickedOffers.push(o)
  }

  const offerIds = pickedOffers.map((o) => o.id)
  const grids = offerIds.length
    ? await fetchAll(
        supabase
          .from('global_offer_diopter_grids')
          .select('id,offer_id,sph_min,sph_max,cyl_min,cyl_max,add_min,add_max,metadata')
          .in('offer_id', offerIds),
        2000
      )
    : []

  const gridsByOffer = new Map()
  for (const g of grids) {
    const list = gridsByOffer.get(g.offer_id) || []
    list.push(g)
    gridsByOffer.set(g.offer_id, list)
  }

  const samples = []
  for (const f of familiesPicked) {
    const list = pickedOffers.filter((o) => o.family_id === f.id)
    for (const o of list) {
      const gs = gridsByOffer.get(o.id) || []
      const meta = gs.find((g) => g.metadata && Object.keys(g.metadata).length)?.metadata || null
      samples.push({
        page: o.source_page_reference,
        family: f.nome,
        family_category: f.clinical_category,
        offer_category: o.clinical_category,
        label: o.canonical_label || o.raw_label,
        base_price: o.base_price,
        material: o.material,
        indice: o.indice_refracao,
        min_fitting_height: o.features?.min_fitting_height ?? null,
        sph: rangeFromGrids(gs, 'sph_min', 'sph_max'),
        cyl: rangeFromGrids(gs, 'cyl_min', 'cyl_max'),
        add: rangeFromGrids(gs, 'add_min', 'add_max'),
        diametro: meta?.diametro ?? meta?.diameter ?? null,
        raw_grade: meta?.raw_grade ?? null,
      })
    }
  }

  console.log('SAMPLE_GLOBAL_CATALOG_OFFERS')
  console.table(summary)
  console.table(
    samples.sort(
      (a, b) =>
        String(a.page || '').localeCompare(String(b.page || '')) ||
        String(a.family || '').localeCompare(String(b.family || '')) ||
        String(a.label || '').localeCompare(String(b.label || ''))
    )
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
