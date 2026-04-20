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
const commit = args.includes('--commit')

if (!versionId) {
  console.error('Uso: node scripts/fix_hoya_cyl_inverted.js --version-id=UUID [--commit]')
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

function chunkArray(arr, size) {
  const chunks = []
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size))
  return chunks
}

async function main() {
  const families = await fetchAll(
    supabase.from('global_lens_families').select('id,nome').eq('version_id', versionId),
    1000
  )
  const familyById = new Map(families.map((f) => [f.id, f.nome]))
  const familyIds = families.map((f) => f.id)

  // Load offers for this version (by family_id).
  const offers = await fetchAll(
    supabase
      .from('global_lens_offers')
      .select('id,family_id,canonical_label,raw_label,source_page_reference')
      .in('family_id', familyIds),
    1000
  )

  const offerIds = offers.map((o) => o.id)
  const offerById = new Map(offers.map((o) => [o.id, o]))

  // Load grids in chunks to avoid large IN payloads.
  const grids = []
  for (const chunk of chunkArray(offerIds, 200)) {
    const part = await fetchAll(
      supabase
        .from('global_offer_diopter_grids')
        .select('id,offer_id,cyl_min,cyl_max')
        .in('offer_id', chunk),
      1000
    )
    grids.push(...part)
  }

  const inverted = grids.filter(
    (g) => g.cyl_min != null && g.cyl_max != null && Number(g.cyl_min) > Number(g.cyl_max)
  )

  console.log('\nFIX_HOYA_CYL_INVERTED')
  console.log(`DRY-RUN: ${commit ? 'NAO (COMMIT)' : 'SIM'}`)
  console.log(`Families: ${familyIds.length}`)
  console.log(`Offers: ${offerIds.length}`)
  console.log(`Grids: ${grids.length}`)
  console.log(`Inverted cyl grids: ${inverted.length}`)

  // Show a small sample to be auditable.
  for (const g of inverted.slice(0, 15)) {
    const o = offerById.get(g.offer_id)
    const label = o?.canonical_label || o?.raw_label || g.offer_id
    const fam = o ? familyById.get(o.family_id) : null
    const page = o?.source_page_reference || null
    console.log(
      `  grid_id=${g.id} | cyl=[${g.cyl_min},${g.cyl_max}] -> [${g.cyl_max},${g.cyl_min}] | page=${page} | family=${fam} | label=${label}`
    )
  }

  if (!commit) {
    console.log('\n[DRY-RUN] Rode com --commit para aplicar as mudancas.')
    return
  }

  let updated = 0
  for (const g of inverted) {
    const { error } = await supabase
      .from('global_offer_diopter_grids')
      .update({ cyl_min: g.cyl_max, cyl_max: g.cyl_min })
      .eq('id', g.id)
    if (error) throw error
    updated += 1
    if (updated % 50 === 0) console.log(`  atualizadas: ${updated}/${inverted.length}`)
  }

  console.log(`\n[COMMIT] Atualizadas ${updated} grades com cilindro invertido.`)
}

main().catch((err) => {
  console.error('Erro fix hoya cyl inverted:', err)
  process.exit(1)
})

