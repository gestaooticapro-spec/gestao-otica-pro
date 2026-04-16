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
  console.error('Uso: node scripts/fix_optilab_pages_22_25_eyezen.js --version-id=UUID [--commit]')
  process.exit(1)
}

function ensureObject(value) {
  return value && typeof value === 'object' ? value : {}
}

async function main() {
  // Evidência (PDF Optilab PVC Digital v2):
  // Páginas 22–25 (Eyezen Boost/Start) mostram:
  // - "Cilíndrico até -6,00"
  // - "Alt. Mínima 18mm"
  const TARGET_MIN_FITTING_HEIGHT = 18
  const TARGET_CYL_MIN = -6
  const TARGET_CYL_MAX = 0

  const targetFamilyNames = [
    'LENTES EYEZEN BOOST®',
    'LENTES EYEZEN START®',
    'EYEZEN® START STOCK | LENTES PRONTAS CRIZAL®',
  ]

  const { data: families, error: famErr } = await supabase
    .from('global_lens_families')
    .select('id,nome')
    .eq('version_id', versionId)
    .in('nome', targetFamilyNames)
  if (famErr) throw famErr

  const familyIds = (families || []).map((f) => f.id)
  if (!familyIds.length) {
    console.log('Nenhuma família Eyezen encontrada na versão:', versionId)
    return
  }

  const { data: offers, error: offErr } = await supabase
    .from('global_lens_offers')
    .select('id,family_id,raw_label,canonical_label,features')
    .in('family_id', familyIds)
  if (offErr) throw offErr

  const offerIds = (offers || []).map((o) => o.id)

  const { data: grids, error: gridErr } = await supabase
    .from('global_offer_diopter_grids')
    .select('id,offer_id,cyl_min,cyl_max')
    .in('offer_id', offerIds)
  if (gridErr) throw gridErr

  const offersToUpdate = []
  for (const o of offers || []) {
    const feat = ensureObject(o.features)
    const current = feat.min_fitting_height ?? null
    if (current !== TARGET_MIN_FITTING_HEIGHT) {
      offersToUpdate.push({
        id: o.id,
        nextFeatures: { ...feat, min_fitting_height: TARGET_MIN_FITTING_HEIGHT },
        had: current,
      })
    }
  }

  const gridsToUpdate = (grids || []).filter((g) => {
    const cylMin = Number(g.cyl_min)
    const cylMax = Number(g.cyl_max)
    return cylMin !== TARGET_CYL_MIN || cylMax !== TARGET_CYL_MAX
  })

  console.log('FIX_EYEZEN_22_25')
  console.log(
    JSON.stringify(
      {
        versionId,
        families: (families || []).map((f) => f.nome),
        offersTotal: offers?.length || 0,
        offersToUpdateMinFittingHeight: offersToUpdate.length,
        gridsTotal: grids?.length || 0,
        gridsToUpdateCylRange: gridsToUpdate.length,
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

  // Atualiza offers (sem upsert: payload parcial quebra NOT NULL no caminho de insert do PostgREST)
  const BATCH = 25
  let offersUpdated = 0
  for (let i = 0; i < offersToUpdate.length; i += BATCH) {
    const batch = offersToUpdate.slice(i, i + BATCH)
    for (const b of batch) {
      const { error } = await supabase.from('global_lens_offers').update({ features: b.nextFeatures }).eq('id', b.id)
      if (error) throw error
      offersUpdated += 1
    }
  }

  // Atualiza grades (cyl)
  let gridsUpdated = 0
  for (let i = 0; i < gridsToUpdate.length; i += BATCH) {
    const batch = gridsToUpdate.slice(i, i + BATCH)
    const ids = batch.map((g) => g.id)
    const { error } = await supabase
      .from('global_offer_diopter_grids')
      .update({ cyl_min: TARGET_CYL_MIN, cyl_max: TARGET_CYL_MAX })
      .in('id', ids)
    if (error) throw error
    gridsUpdated += batch.length
  }

  console.log('Correção concluída.')
  console.log(JSON.stringify({ offersUpdated, gridsUpdated }, null, 2))
}

main().catch((err) => {
  console.error('Erro ao corrigir Eyezen (pags 22-25):', err)
  process.exit(1)
})
