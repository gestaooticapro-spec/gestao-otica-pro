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
  console.error('Uso: node scripts/fix_optilab_page28_lentes_essilor.js --version-id=UUID [--commit]')
  process.exit(1)
}

function norm(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

async function main() {
  // Evidência (Optilab PVC Digital v2, página 28):
  // 1) Bloco "Essilor Interview" (Visão intermediária):
  //    - Esférico: -2,00 a +4,00
  //    - Cilíndrico: até -4,00 (ou seja, 0..-4)
  //    - Adição:
  //      - Orma 0,80: 1,00 a 1,75
  //      - Orma 1,30: 2,00 a 3,50
  // 2) Bloco "Lentes Visão Simples Surfaçadas":
  //    - Cilíndrico:
  //      - Orma até -6,00
  //      - Airwear, Stylis 1.67 e Stylis 1.74 até -8,00
  //
  // Observação: aqui corrigimos somente GRADES (global_offer_diopter_grids) dessas ofertas na p.28.
  // Não alteramos preços nem semântica.
  const PAGE_REF = 'Pagina 28'

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

  function desiredForOffer(label) {
    const h = norm(label)
    if (h.includes('visao intermediaria') && h.includes('interview')) {
      const is080 = h.includes('0,80') || h.includes('0.80')
      const is130 = h.includes('1,30') || h.includes('1.30')
      return {
        cyl_min: -4,
        cyl_max: 0,
        add_min: is080 ? 1.0 : is130 ? 2.0 : null,
        add_max: is080 ? 1.75 : is130 ? 3.5 : null,
      }
    }

    if (h.includes('lentes visao simples surfacadas')) {
      const isOrma = h.includes('orma')
      const isAirwear = h.includes('airwear')
      const isStylis = h.includes('stylis')
      // cylinder max is always 0; min depends on material
      const cylMin = isOrma ? -6 : (isAirwear || isStylis) ? -8 : null
      return {
        cyl_min: cylMin,
        cyl_max: cylMin != null ? 0 : null,
        add_min: null,
        add_max: null,
      }
    }

    return null
  }

  const patches = []
  for (const o of offers) {
    const label = o.canonical_label || o.raw_label || ''
    const desired = desiredForOffer(label)
    const grid = gridByOfferId.get(o.id)
    if (!desired || !grid) continue

    const patch = { id: grid.id }
    let changed = false

    if (desired.cyl_min != null && Number(grid.cyl_min) !== desired.cyl_min) {
      patch.cyl_min = desired.cyl_min
      changed = true
    }
    if (desired.cyl_max != null && Number(grid.cyl_max) !== desired.cyl_max) {
      patch.cyl_max = desired.cyl_max
      changed = true
    }

    // Only apply add for Interview offers; for single vision, keep add NULL.
    if (desired.add_min != null && Number(grid.add_min) !== desired.add_min) {
      patch.add_min = desired.add_min
      changed = true
    }
    if (desired.add_max != null && Number(grid.add_max) !== desired.add_max) {
      patch.add_max = desired.add_max
      changed = true
    }
    if (desired.add_min == null && grid.add_min != null) {
      patch.add_min = null
      changed = true
    }
    if (desired.add_max == null && grid.add_max != null) {
      patch.add_max = null
      changed = true
    }

    if (changed) patches.push(patch)
  }

  console.log('FIX_OPTILAB_P28_LENTES_ESSILOR')
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
  console.error('Erro ao corrigir p.28 (Lentes Essilor):', err)
  process.exit(1)
})

