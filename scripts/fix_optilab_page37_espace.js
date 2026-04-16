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
  console.error('Uso: node scripts/fix_optilab_page37_espace.js --version-id=UUID [--commit]')
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

function rulesForOffer(offer) {
  // Evidência (Optilab PVC Digital v2, página 37):
  // - ESPACE Plus DIGITAL: Cil até -6,00 | Adição 1,00 a 3,50 | Alt. mínima 18mm
  // - ESPACE Plus TRADICIONAL: Cil até -6,00 | Adição Orma 1,00 a 3,50 | Adição Poly 1,00 a 3,00 | Alt. mínima 18mm
  // - ESPACE (tradicional): Cil até -6,00 | Adição Orma 1,00 a 3,50 | Adição Poly 1,00 a 3,00 | Alt. mínima 20mm
  const label = norm(offer.canonical_label || offer.raw_label)

  const isDigital = label.includes(' digital ')
  const isPlusTradicional = label.includes('espace plus tradicional')
  const isTradicional = label.includes('espace tradicional')
  const isPoly = label.includes(' poly') || label.includes('policarbonato')

  // Everyone on this page: cylinder up to -6.00
  const out = {
    min_fitting_height: null,
    cyl_min: -6,
    cyl_max: 0,
    add_min: 1.0,
    add_max: 3.5,
  }

  if (isDigital) {
    out.min_fitting_height = 18
    out.add_max = 3.5
    return out
  }

  if (isPlusTradicional) {
    out.min_fitting_height = 18
    out.add_max = isPoly ? 3.0 : 3.5
    return out
  }

  if (isTradicional) {
    out.min_fitting_height = 20
    out.add_max = isPoly ? 3.0 : 3.5
    return out
  }

  // Fallback: don't guess beyond fixing inverted cyl
  return null
}

async function main() {
  const PAGE_REF = 'Pagina 37'

  const { data: families, error: famErr } = await supabase
    .from('global_lens_families')
    .select('id,nome')
    .eq('version_id', versionId)
  if (famErr) throw famErr

  const family = (families || []).find((f) => norm(f.nome).includes('espace'))
  if (!family) {
    console.log('Família ESPACE não encontrada na versão:', versionId)
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
    .select('id,offer_id,cyl_min,cyl_max,add_min,add_max')
    .in('offer_id', offerIds)
  if (gridErr) throw gridErr

  const gridsByOfferId = new Map()
  for (const g of grids || []) {
    const list = gridsByOfferId.get(g.offer_id) || []
    list.push(g)
    gridsByOfferId.set(g.offer_id, list)
  }

  const offerPatches = []
  const gridPatches = []

  for (const o of offers) {
    const rules = rulesForOffer(o)
    const feat = ensureObject(o.features)
    const currentHeight = feat.min_fitting_height ?? null

    if (rules?.min_fitting_height != null && currentHeight !== rules.min_fitting_height) {
      offerPatches.push({ id: o.id, features: { ...feat, min_fitting_height: rules.min_fitting_height } })
    }

    const gs = gridsByOfferId.get(o.id) || []
    for (const g of gs) {
      const patch = { id: g.id }
      let changed = false

      if (rules) {
        // Compare against DB values directly (do not pre-normalize), so inverted ranges get patched.
        if (Number(g.cyl_min) !== rules.cyl_min) {
          patch.cyl_min = rules.cyl_min
          changed = true
        }
        if (Number(g.cyl_max) !== rules.cyl_max) {
          patch.cyl_max = rules.cyl_max
          changed = true
        }

        if (Number(g.add_min) !== rules.add_min) {
          patch.add_min = rules.add_min
          changed = true
        }
        if (Number(g.add_max) !== rules.add_max) {
          patch.add_max = rules.add_max
          changed = true
        }
      } else {
        // Only inverted-cyl correction
        const a = Number(g.cyl_min)
        const b = Number(g.cyl_max)
        const wantMin = Math.min(a, b)
        const wantMax = Math.max(a, b)
        if (Number(g.cyl_min) !== wantMin) {
          patch.cyl_min = wantMin
          changed = true
        }
        if (Number(g.cyl_max) !== wantMax) {
          patch.cyl_max = wantMax
          changed = true
        }
      }

      if (changed) gridPatches.push(patch)
    }
  }

  console.log('FIX_OPTILAB_P37_ESPACE')
  console.log(
    JSON.stringify(
      {
        versionId,
        family: family.nome,
        page: PAGE_REF,
        offersTotal: offers.length,
        offerFeaturePatches: offerPatches.length,
        gridsTotal: grids?.length || 0,
        gridPatches: gridPatches.length,
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

  let offersUpdated = 0
  for (const p of offerPatches) {
    const { error } = await supabase.from('global_lens_offers').update({ features: p.features }).eq('id', p.id)
    if (error) throw error
    offersUpdated += 1
  }

  let gridsUpdated = 0
  for (const p of gridPatches) {
    const { error } = await supabase.from('global_offer_diopter_grids').update(p).eq('id', p.id)
    if (error) throw error
    gridsUpdated += 1
  }

  console.log('Correção concluída.')
  console.log(JSON.stringify({ offersUpdated, gridsUpdated }, null, 2))
}

main().catch((err) => {
  console.error('Erro ao corrigir ESPACE (p.37):', err)
  process.exit(1)
})
