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
  path.join(process.cwd(), '.tabelas', 'auditoria_optilab_page13.json')

if (!versionId) {
  console.error('Uso: node scripts/audit_optilab_page13_varilux_xrtrack_lite.js --version-id=UUID [--out=PATH]')
  process.exit(1)
}

function noAcc(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function aggGrid(rows) {
  if (!rows.length) return null
  const nums = (arr) => arr.filter((v) => typeof v === 'number' && Number.isFinite(v))
  const min = (arr) => Math.min(...nums(arr))
  const max = (arr) => Math.max(...nums(arr))
  return {
    count: rows.length,
    sph: [min(rows.map((r) => r.sph_min)), max(rows.map((r) => r.sph_max))],
    cyl: [min(rows.map((r) => r.cyl_min)), max(rows.map((r) => r.cyl_max))],
    add: [min(rows.map((r) => r.add_min)), max(rows.map((r) => r.add_max))],
    meta_sample: rows.map((r) => r.metadata).find(Boolean) || null,
  }
}

async function main() {
  const { data: families, error: famErr } = await supabase
    .from('global_lens_families')
    .select('id')
    .eq('version_id', versionId)
  if (famErr) throw famErr
  const familyIds = (families || []).map((f) => f.id)
  if (!familyIds.length) throw new Error('Nenhuma família para a versão informada.')

  const { data: offers, error: offErr } = await supabase
    .from('global_lens_offers')
    .select('id,family_id,raw_label,canonical_label,material,indice_refracao,features,base_price,source_page_reference')
    .in('family_id', familyIds)
  if (offErr) throw offErr

  const liteOffers = (offers || []).filter((o) => {
    const t = noAcc(`${o.canonical_label || ''} ${o.raw_label || ''}`)
    const page = noAcc(o.source_page_reference || '')
    return t.includes('varilux') && t.includes('xr') && t.includes('xr track') && t.includes('lite') && page.includes('13')
  })

  const offerIds = liteOffers.map((o) => o.id)

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

  const { data: compatRows, error: compatErr } = await supabase
    .from('global_offer_treatments_compatibility')
    .select('offer_id,treatment_id,special_price,price_mode')
    .in('offer_id', offerIds)
  if (compatErr) throw compatErr

  const treatmentIds = Array.from(new Set((compatRows || []).map((r) => r.treatment_id)))
  const { data: treatments, error: treatErr } = await supabase
    .from('global_treatments')
    .select('id,nome,tipo')
    .in('id', treatmentIds)
  if (treatErr) throw treatErr
  const treatmentById = new Map((treatments || []).map((t) => [t.id, t]))

  const compatByOfferId = new Map()
  for (const c of compatRows || []) {
    const list = compatByOfferId.get(c.offer_id) || []
    const t = treatmentById.get(c.treatment_id)
    list.push({
      treatment: t ? t.nome : c.treatment_id,
      tipo: t ? t.tipo : null,
      special_price: c.special_price,
      price_mode: c.price_mode,
    })
    compatByOfferId.set(c.offer_id, list)
  }

  const report = liteOffers
    .map((o) => ({
      id: o.id,
      label: o.canonical_label || o.raw_label,
      base_price: Number(o.base_price || 0),
      min_fitting_height: o.features?.min_fitting_height ?? null,
      grid: aggGrid(gridsByOfferId.get(o.id) || []),
      compatibilities: (compatByOfferId.get(o.id) || []).sort((a, b) => String(a.treatment).localeCompare(String(b.treatment))),
    }))
    .sort((a, b) => String(a.label).localeCompare(String(b.label)))

  const checks = {
    stylis_174_add_not_4: report.filter((r) => {
      const t = noAcc(r.label)
      return t.includes('stylis 1.74') && !t.includes('solares') && r.grid?.add?.[1] !== 4
    }),
    missing_min_fitting_height: report.filter((r) => r.min_fitting_height == null),
    missing_airwear_coloracao_especial: report.some((r) => {
      const t = noAcc(r.label)
      return t.includes('solares') && t.includes('xr track') && t.includes('lite') && t.includes('airwear') && t.includes('coloracao especial')
    })
      ? []
      : ['XR Track Lite Airwear + Coloração especial (ver página 13)'],
  }

  const out = {
    versionId,
    source: 'Optilab PVC Digital v2 - page 13 images',
    xr_track_lite_offer_count: report.length,
    offers: report,
    checks: {
      stylis_174_add_not_4: checks.stylis_174_add_not_4.map((r) => ({ label: r.label, add: r.grid?.add || null })),
      missing_min_fitting_height_count: checks.missing_min_fitting_height.length,
      missing_airwear_coloracao_especial: checks.missing_airwear_coloracao_especial,
    },
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8')
  console.log('WROTE', outPath)
  console.log('XR_TRACK_LITE_OFFERS', report.length)
  console.log('CHECK_add_174_not_4', out.checks.stylis_174_add_not_4.length)
  console.log('CHECK_missing_height', out.checks.missing_min_fitting_height_count)
  console.log('CHECK_missing_airwear_color_especial', out.checks.missing_airwear_coloracao_especial.length)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

