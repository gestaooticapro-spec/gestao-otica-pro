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
  console.error('Uso: node scripts/fix_optilab_page27_eyezen_start_stock.js --version-id=UUID [--commit]')
  process.exit(1)
}

function norm(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function ensureObject(value) {
  return value && typeof value === 'object' ? value : {}
}

async function main() {
  // Evidência (Optilab PVC Digital v2, página 27):
  // Tabela "EYEZEN START STOCK | LENTES PRONTAS CRIZAL" mostra cilindro FIXO:
  // - Quase todas as linhas: Cilíndrico -2,00
  // - "Orma Crizal Prevencia": Cilíndrico -1,00
  // A página não traz altura mínima (min_fitting_height) explicitamente.
  const PAGE_REF = 'Pagina 27'

  const { data: families, error: famErr } = await supabase
    .from('global_lens_families')
    .select('id,nome')
    .eq('version_id', versionId)
  if (famErr) throw famErr

  const family = (families || []).find((f) => {
    const n = norm(f.nome)
    return n.includes('eyezen') && n.includes('start stock')
  })
  if (!family) {
    console.log('Familia Eyezen Start Stock não encontrada na versão:', versionId)
    return
  }

  const { data: offers, error: offErr } = await supabase
    .from('global_lens_offers')
    .select('id,canonical_label,raw_label,features')
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
    .select('id,offer_id,cyl_min,cyl_max')
    .in('offer_id', offerIds)
  if (gridErr) throw gridErr

  const cylTargetByOfferId = new Map()
  for (const o of offers) {
    const label = norm(o.canonical_label || o.raw_label)
    // default: -2.00
    let cyl = -2
    if (label.includes('orma') && label.includes('prevencia')) {
      cyl = -1
    }
    cylTargetByOfferId.set(o.id, cyl)
  }

  const gridsToUpdate = (grids || []).filter((g) => {
    const want = cylTargetByOfferId.get(g.offer_id)
    return Number(g.cyl_min) !== want || Number(g.cyl_max) !== want
  })

  const offersToClearHeight = (offers || []).filter((o) => {
    const feat = ensureObject(o.features)
    return feat.min_fitting_height != null
  })

  console.log('FIX_EYEZEN_START_STOCK_P27')
  console.log(
    JSON.stringify(
      {
        versionId,
        family: family.nome,
        page: PAGE_REF,
        offersTotal: offers.length,
        gridsTotal: grids?.length || 0,
        gridsToUpdate: gridsToUpdate.length,
        offersToClearMinFittingHeight: offersToClearHeight.length,
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

  // Update offers: remove min_fitting_height (preserva outras flags/features)
  let offersUpdated = 0
  for (const o of offersToClearHeight) {
    const feat = ensureObject(o.features)
    const next = { ...feat }
    delete next.min_fitting_height
    const { error } = await supabase.from('global_lens_offers').update({ features: next }).eq('id', o.id)
    if (error) throw error
    offersUpdated += 1
  }

  // Update grids (cyl constant) in batches
  const BATCH = 50
  let gridsUpdated = 0
  for (let i = 0; i < gridsToUpdate.length; i += BATCH) {
    const batch = gridsToUpdate.slice(i, i + BATCH)
    // Can't update per-row with different cyl in one statement, so do it row-by-row here.
    for (const g of batch) {
      const want = cylTargetByOfferId.get(g.offer_id)
      const { error } = await supabase.from('global_offer_diopter_grids').update({ cyl_min: want, cyl_max: want }).eq('id', g.id)
      if (error) throw error
      gridsUpdated += 1
    }
  }

  console.log('Correção concluída.')
  console.log(JSON.stringify({ offersUpdated, gridsUpdated }, null, 2))
}

main().catch((err) => {
  console.error('Erro ao corrigir Eyezen Start Stock (p.27):', err)
  process.exit(1)
})

