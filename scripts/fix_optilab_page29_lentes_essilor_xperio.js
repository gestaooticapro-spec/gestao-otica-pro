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
  console.error('Uso: node scripts/fix_optilab_page29_lentes_essilor_xperio.js --version-id=UUID [--commit]')
  process.exit(1)
}

function norm(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

async function main() {
  // Evidência (Optilab PVC Digital v2, página 29):
  // Seção "LENTES SOLARES" / "Xperio Surfaçadas" informa na barra lateral:
  // - "Cilíndrico: até -6,00"
  // E na coluna ESFÉRICO:
  // - Orma: -10,00 a +8,00
  // - Airwear: -12,00 a +9,25
  const PAGE_REF = 'Pagina 29'

  const { data: families, error: famErr } = await supabase
    .from('global_lens_families')
    .select('id,nome')
    .eq('version_id', versionId)
  if (famErr) throw famErr

  const family = (families || []).find((f) => norm(f.nome).includes('lentes essilor'))
  if (!family) {
    console.log('Familia "LENTES ESSILOR®" não encontrada na versão:', versionId)
    return
  }

  const { data: offers, error: offErr } = await supabase
    .from('global_lens_offers')
    .select('id,canonical_label,raw_label')
    .eq('family_id', family.id)
    .eq('source_page_reference', PAGE_REF)
  if (offErr) throw offErr

  if (!offers?.length) {
    console.log('Nenhuma oferta encontrada para', family.nome, 'na', PAGE_REF)
    return
  }

  const offerIds = offers.map((o) => o.id)
  const { data: grids, error: gridErr } = await supabase
    .from('global_offer_diopter_grids')
    .select('id,offer_id,sph_min,sph_max,cyl_min,cyl_max,add_min,add_max')
    .in('offer_id', offerIds)
  if (gridErr) throw gridErr

  const gridByOfferId = new Map((grids || []).map((g) => [g.offer_id, g]))

  const desiredByOfferId = new Map()
  for (const o of offers) {
    const label = norm(o.canonical_label || o.raw_label)
    if (label.includes('airwear')) {
      desiredByOfferId.set(o.id, { sph_min: -12, sph_max: 9.25, cyl_min: -6, cyl_max: 0 })
    } else if (label.includes('orma')) {
      desiredByOfferId.set(o.id, { sph_min: -10, sph_max: 8, cyl_min: -6, cyl_max: 0 })
    }
  }

  const patches = []
  for (const o of offers) {
    const desired = desiredByOfferId.get(o.id)
    const grid = gridByOfferId.get(o.id)
    if (!desired || !grid) continue

    const patch = { id: grid.id }
    let changed = false
    for (const k of ['sph_min', 'sph_max', 'cyl_min', 'cyl_max']) {
      if (desired[k] != null && Number(grid[k]) !== desired[k]) {
        patch[k] = desired[k]
        changed = true
      }
    }
    // Solar Xperio: sem adição
    if (grid.add_min != null) {
      patch.add_min = null
      changed = true
    }
    if (grid.add_max != null) {
      patch.add_max = null
      changed = true
    }

    if (changed) patches.push(patch)
  }

  console.log('FIX_OPTILAB_P29_LENTES_ESSILOR_XPERIO')
  console.log(
    JSON.stringify(
      {
        versionId,
        family: family.nome,
        page: PAGE_REF,
        offersTotal: offers.length,
        gridsTotal: grids?.length || 0,
        gridsToPatch: patches.length,
        commit,
      },
      null,
      2,
    ),
  )

  if (!commit) {
    console.log('Dry-run: nenhuma alteração aplicada. Use --commit para gravar.')
    return
  }

  let updated = 0
  for (const p of patches) {
    const { error } = await supabase.from('global_offer_diopter_grids').update(p).eq('id', p.id)
    if (error) throw error
    updated += 1
  }

  console.log('Correção concluída.')
  console.log(JSON.stringify({ gridsUpdated: updated }, null, 2))
}

main().catch((err) => {
  console.error('Erro ao corrigir p.29 (Xperio Surfaçadas):', err)
  process.exit(1)
})

