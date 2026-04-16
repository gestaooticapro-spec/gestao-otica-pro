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
  console.error('Uso: node scripts/fix_optilab_varilux_stylis_174_add.js --version-id=UUID [--commit]')
  process.exit(1)
}

function noAcc(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

async function main() {
  const { data: families, error: famErr } = await supabase
    .from('global_lens_families')
    .select('id')
    .eq('version_id', versionId)
  if (famErr) throw famErr
  const familyIds = (families || []).map((f) => f.id)
  if (!familyIds.length) {
    console.log('Nenhuma família encontrada para version_id', versionId)
    return
  }

  const { data: offers, error: offErr } = await supabase
    .from('global_lens_offers')
    .select('id,canonical_label,raw_label')
    .in('family_id', familyIds)
  if (offErr) throw offErr

  const targets = (offers || []).filter((o) => {
    const t = noAcc(`${o.canonical_label || ''} ${o.raw_label || ''}`)
    return t.includes('varilux') && t.includes('xr') && t.includes('xr pro') && t.includes('stylis') && t.includes('1.74')
  })

  if (!targets.length) {
    console.log('Nenhuma oferta alvo encontrada (Stylis 1.74 XR Pro).')
    return
  }

  const offerIds = targets.map((t) => t.id)
  const { data: grids, error: gridErr } = await supabase
    .from('global_offer_diopter_grids')
    .select('id,offer_id,add_min,add_max')
    .in('offer_id', offerIds)
  if (gridErr) throw gridErr

  const byOffer = new Map()
  for (const g of grids || []) {
    const list = byOffer.get(g.offer_id) || []
    list.push(g)
    byOffer.set(g.offer_id, list)
  }

  const desiredMin = 1
  const desiredMax = 4

  let changed = 0
  for (const offer of targets) {
    const rows = byOffer.get(offer.id) || []
    if (!rows.length) continue

    const before = rows.map((r) => ({ id: r.id, add_min: r.add_min, add_max: r.add_max }))
    const needs = rows.some((r) => Number(r.add_max) !== desiredMax || Number(r.add_min) !== desiredMin)

    console.log('---')
    console.log('Oferta:', offer.canonical_label || offer.raw_label)
    console.log('Antes:', JSON.stringify(before))
    console.log('Depois: add_min=', desiredMin, 'add_max=', desiredMax)

    if (!needs) continue
    changed += 1
    if (!commit) continue

    const { error: upErr } = await supabase
      .from('global_offer_diopter_grids')
      .update({ add_min: desiredMin, add_max: desiredMax })
      .eq('offer_id', offer.id)
    if (upErr) throw upErr
  }

  console.log('Resumo:')
  console.log('- Ofertas alvo:', targets.length)
  console.log('- Ofertas com alteração:', changed)
  console.log(commit ? 'Aplicado.' : 'Modo seco. Use --commit para aplicar.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

