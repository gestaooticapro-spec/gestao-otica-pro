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
  console.error('Uso: node scripts/audit_optilab_page38_bifocais.js --version-id=UUID')
  process.exit(1)
}

function norm(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

// Esperado conforme PDF página 38
// Valores confirmados no PDF (barra lateral: cilíndrico até -6,00 / alt. mínima 18mm)
const EXPECTED = [
  { label: 'Flap Top CR-39',                    sph: [-8, +6],  cyl: [-6, 0], add: [1.0, 3.5], mfh: 18 },
  { label: 'Flap Top CR-39 + Transitions Gen S', sph: [-6, +7], cyl: [-6, 0], add: [1.0, 3.0], mfh: 18 },
  { label: 'Ultex CR-39',                        sph: [-4, +8],  cyl: [-6, 0], add: [1.0, 3.5], mfh: 18 },
  { label: 'Ultex CR-39 + Transitions Gen S',    sph: [-4, +8],  cyl: [-6, 0], add: [1.0, 3.0], mfh: 18 },
  { label: 'iTop Hyper Bifocal Poly',            sph: [-6, +9],  cyl: [-6, 0], add: [1.0, 3.0], mfh: 18 },
  { label: 'iTop Hyper Bifocal 1.60',            sph: [-6, +10], cyl: [-6, 0], add: [1.0, 3.0], mfh: 18 },
  { label: 'iTop Hyper Bifocal 1.67',            sph: [-6, +14], cyl: [-6, 0], add: [1.0, 3.0], mfh: 18 },
]

async function main() {
  const PAGE_REF = 'Pagina 38'

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
    const hasAdd = gs.some((x) => x.add_min != null || x.add_max != null)
    const hasCyl = gs.some((x) => x.cyl_min != null || x.cyl_max != null)
    const grid = gs.length
      ? {
          sph: [min('sph_min'), max('sph_max')],
          cyl: hasCyl ? [min('cyl_min'), max('cyl_max')] : null,
          add: hasAdd ? [min('add_min'), max('add_max')] : null,
          grids: gs.length,
        }
      : null
    return {
      id: o.id,
      family: familyById.get(o.family_id) || null,
      label: o.canonical_label || o.raw_label,
      base_price: o.base_price,
      material: o.material,
      indice: o.indice_refracao,
      min_fitting_height: o.features?.min_fitting_height ?? null,
      grid,
    }
  })

  // Comparar com esperado
  const diffs = []
  for (const exp of EXPECTED) {
    const match = rows.find((r) => norm(r.label).includes(norm(exp.label)) || norm(exp.label).includes(norm(r.label)))
    if (!match) {
      diffs.push({ label: exp.label, problema: 'NAO_ENCONTRADO_NO_BD' })
      continue
    }
    const problems = []
    const g = match.grid

    if (!g) {
      problems.push('SEM_GRADE')
    } else {
      if (g.sph?.[0] !== exp.sph[0] || g.sph?.[1] !== exp.sph[1])
        problems.push(`sph: BD=[${g.sph}] PDF=[${exp.sph}]`)
      if (exp.cyl && (g.cyl?.[0] !== exp.cyl[0] || g.cyl?.[1] !== exp.cyl[1]))
        problems.push(`cyl: BD=[${g.cyl}] PDF=[${exp.cyl}]`)
      if (exp.add && (!g.add || g.add[0] !== exp.add[0] || g.add[1] !== exp.add[1]))
        problems.push(`add: BD=[${g.add}] PDF=[${exp.add}]`)
      if (exp.mfh !== undefined && match.min_fitting_height !== exp.mfh)
        problems.push(`min_fitting_height: BD=${match.min_fitting_height} PDF=${exp.mfh}`)
    }
    if (problems.length) diffs.push({ label: match.label, id: match.id, problemas: problems })
  }

  const summary = {
    versionId,
    page: PAGE_REF,
    totalNoBD: rows.length,
    families: [...new Set(rows.map((r) => r.family))].filter(Boolean).sort(),
    cylInvertedCount: rows.filter((r) => r.grid?.cyl && r.grid.cyl[0] > r.grid.cyl[1]).length,
    addNullCount: rows.filter((r) => r.grid && r.grid.add == null).length,
    difsComPDF: diffs.length,
  }

  console.log('AUDIT_OPTILAB_P38_BIFOCAIS')
  console.log(JSON.stringify({ summary, diffs, rows: rows.sort((a, b) => norm(a.label).localeCompare(norm(b.label))) }, null, 2))
}

main().catch((err) => {
  console.error('Erro auditoria p.38 (Bifocais):', err)
  process.exit(1)
})
