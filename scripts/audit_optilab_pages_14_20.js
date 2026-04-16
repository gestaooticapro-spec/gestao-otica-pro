import fs from 'fs'
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
const outPath =
  args.find((arg) => arg.startsWith('--out='))?.split('=').slice(1).join('=') ||
  path.join(process.cwd(), '.tabelas', 'auditoria_optilab_pages14_20.json')

if (!versionId) {
  console.error('Uso: node scripts/audit_optilab_pages_14_20.js --version-id=UUID [--out=PATH]')
  process.exit(1)
}

function noAcc(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function pageNumberFromRef(ref) {
  const m = String(ref || '').match(/(\d{1,3})/)
  return m ? Number(m[1]) : null
}

function desiredForOffer(offer) {
  const label = noAcc(`${offer.canonical_label || ''} ${offer.raw_label || ''}`)
  const pageN = pageNumberFromRef(offer.source_page_reference)
  if (pageN == null || pageN < 14 || pageN > 20) return null

  if (pageN === 14 && label.includes('xr design')) {
    return { min_fitting_height: 14, add_min: 1, add_max: label.includes('stylis') && label.includes('1.74') ? 4 : 3.5 }
  }
  if ((pageN === 15 || pageN === 16) && label.includes('physio') && label.includes('extensee')) {
    return { min_fitting_height: 14, add_min: 1, add_max: label.includes('stylis') && label.includes('1.74') ? 4 : 3.5 }
  }
  if (pageN === 17 && label.includes('comfort') && label.includes('digital')) {
    return { min_fitting_height: 17, add_min: 0.75, add_max: 3.5 }
  }
  if (pageN === 18 && label.includes('comfort')) {
    if (label.includes('digital') && label.includes('short')) return { min_fitting_height: 14, add_min: null, add_max: 3.0 }
    if (label.includes('solares') && label.includes('coloracao')) return { min_fitting_height: 17, add_min: 0.75, add_max: 3.5 }
    if (label.includes('tradicional') || label.includes('coloracao')) return { min_fitting_height: 17, add_min: 1, add_max: 3.5 }
  }
  if (pageN === 19 && label.includes('liberty')) {
    if (label.includes('tradicional')) return { min_fitting_height: 18, add_min: 1, add_max: 3.5 }
    if (label.includes('digital') && label.includes('short')) return { min_fitting_height: 14, add_min: 1, add_max: 3.0 }
    return { min_fitting_height: 17, add_min: 1, add_max: 3.5 }
  }
  if (pageN === 20) {
    if (label.includes('liberty') && label.includes('coloracao')) return { min_fitting_height: 18, add_min: 1, add_max: 3.5 }
    if (label.includes('roadpilot')) return { min_fitting_height: 14, add_min: 1, add_max: 3.5 }
    if (label.includes('digitime') || label.includes('sportive') || label.includes('activities')) return { min_fitting_height: 18, add_min: 1, add_max: 3.5 }
  }
  return null
}

async function main() {
  const { data: families, error: famErr } = await supabase
    .from('global_lens_families')
    .select('id')
    .eq('version_id', versionId)
  if (famErr) throw famErr
  const familyIds = (families || []).map((f) => f.id)
  if (!familyIds.length) throw new Error('Nenhuma família encontrada para version_id informado.')

  const { data: offers, error: offErr } = await supabase
    .from('global_lens_offers')
    .select('id,raw_label,canonical_label,features,source_page_reference')
    .in('family_id', familyIds)
  if (offErr) throw offErr

  const offers14to20 = (offers || []).filter((o) => {
    const n = pageNumberFromRef(o.source_page_reference)
    return n != null && n >= 14 && n <= 20
  })

  const offerIds = offers14to20.map((o) => o.id)
  const { data: grids, error: gridErr } = await supabase
    .from('global_offer_diopter_grids')
    .select('offer_id,add_min,add_max')
    .in('offer_id', offerIds)
  if (gridErr) throw gridErr

  const gridsByOfferId = new Map()
  for (const g of grids || []) {
    const list = gridsByOfferId.get(g.offer_id) || []
    list.push(g)
    gridsByOfferId.set(g.offer_id, list)
  }

  const mismatches = []
  for (const o of offers14to20) {
    const desired = desiredForOffer(o)
    if (!desired) continue
    const feat = o.features || {}
    if (desired.min_fitting_height != null && feat.min_fitting_height !== desired.min_fitting_height) {
      mismatches.push({
        type: 'min_fitting_height',
        page: o.source_page_reference,
        label: o.canonical_label || o.raw_label,
        have: feat.min_fitting_height ?? null,
        want: desired.min_fitting_height,
      })
    }
    const rows = gridsByOfferId.get(o.id) || []
    if (!rows.length) continue
    if (desired.add_min != null && rows.some((r) => Number(r.add_min) !== Number(desired.add_min))) {
      mismatches.push({
        type: 'add_min',
        page: o.source_page_reference,
        label: o.canonical_label || o.raw_label,
        have: rows[0]?.add_min ?? null,
        want: desired.add_min,
      })
    }
    if (desired.add_max != null && rows.some((r) => Number(r.add_max) !== Number(desired.add_max))) {
      mismatches.push({
        type: 'add_max',
        page: o.source_page_reference,
        label: o.canonical_label || o.raw_label,
        have: rows[0]?.add_max ?? null,
        want: desired.add_max,
      })
    }
  }

  const out = {
    versionId,
    scope_pages: [14, 15, 16, 17, 18, 19, 20],
    offers_scoped: offers14to20.length,
    mismatch_count: mismatches.length,
    mismatches,
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8')
  console.log('WROTE', outPath)
  console.log('OFFERS', out.offers_scoped)
  console.log('MISMATCHES', out.mismatch_count)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

