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
  console.error('Uso: node scripts/fix_optilab_pages_32_36_kodak.js --version-id=UUID [--commit]')
  process.exit(1)
}

const TARGET_PAGES = ['Pagina 32', 'Pagina 33', 'Pagina 34', 'Pagina 35', 'Pagina 36']

function norm(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function ensureObject(value) {
  return value && typeof value === 'object' ? value : {}
}

function deriveRules(offer) {
  const label = norm(offer.canonical_label || offer.raw_label)
  const page = offer.source_page_reference

  const isProntas = label.includes('lentes prontas')
  const isSolar = label.includes('solares')

  const isSoftwearSolo = /(softwear|solo)/.test(label)
  const isPrecise = label.includes('precise') && !label.includes('network') // rough split: Precise lines
  const isEasySun = label.includes('easy sun')
  const isSingleSun = label.includes('single sun')

  // Defaults: only fix inverted cyl; do not force anything else
  const rules = {
    // features
    min_fitting_height: null,
    // grid overrides
    cyl_min: null,
    cyl_max: null,
    add_min: null,
    add_max: null,
    clear_add: false,
  }

  if (page === 'Pagina 32') {
    // PDF bar (p32):
    // - Multifocal Digital (Unique Infinite): Cil até -6, Add 0.75..3.50, Alt mín 14mm
    // - Ocupacional Digital (Kodak Solo Softwear): Cil até -6, Add 1.00..3.50, Alt mín 17mm
    rules.cyl_min = -6
    rules.cyl_max = 0
    if (isSoftwearSolo) {
      rules.min_fitting_height = 17
      rules.add_min = 1.0
      rules.add_max = 3.5
    } else {
      rules.min_fitting_height = 14
      rules.add_min = 0.75
      rules.add_max = 3.5
    }
  } else if (page === 'Pagina 33') {
    // PDF bar (p33):
    // - Multifocal Digital: Cil até -6, Add 1.00..3.50, Alt mín 14mm
    // - Multifocal Tradicional: Cil até -6, Add 1.00..3.50, Alt mín 17mm
    rules.cyl_min = -6
    rules.cyl_max = 0
    rules.add_min = 1.0
    rules.add_max = 3.5
    rules.min_fitting_height = isPrecise ? 17 : 14
  } else if (page === 'Pagina 34') {
    // PDF bar (p34): Cil até -6, Add 1.00..3.50, Alt mín 14mm (para ambos os blocos)
    rules.cyl_min = -6
    rules.cyl_max = 0
    rules.add_min = 1.0
    rules.add_max = 3.5
    rules.min_fitting_height = 14
  } else if (page === 'Pagina 35') {
    // PDF bar (p35): Cilíndrico até -6,00 (no bloco VS digital)
    // Bloco "LENTES PRONTAS" mostra cilíndrico -2,00 (e em alguns casos 0,00), sem altura mínima.
    if (isProntas) {
      rules.cyl_min = -2
      rules.cyl_max = 0
      rules.min_fitting_height = null
      rules.clear_add = true
    } else {
      rules.cyl_min = -6
      rules.cyl_max = 0
      rules.min_fitting_height = null
      rules.clear_add = true
    }
  } else if (page === 'Pagina 36') {
    // PDF bar (p36):
    // - Multifocal Digital (Easy Sun): Cil até -6, Add 1.00..3.50, Alt mín 14mm
    // - Visão simples digital (Single Sun): barra só com Cil até -6, sem add/altura
    rules.cyl_min = -6
    rules.cyl_max = 0
    if (isEasySun) {
      rules.min_fitting_height = 14
      rules.add_min = 1.0
      rules.add_max = 3.5
    } else if (isSingleSun) {
      rules.min_fitting_height = null
      rules.clear_add = true
    } else if (isSolar) {
      // Conservative: solar but not explicitly labeled => don't assume add/height
      rules.min_fitting_height = null
      rules.clear_add = true
    }
  }

  return rules
}

async function main() {
  const { data: families, error: famErr } = await supabase
    .from('global_lens_families')
    .select('id,nome')
    .eq('version_id', versionId)
  if (famErr) throw famErr

  const famKodak = (families || []).find((f) => norm(f.nome).includes('kodak'))
  if (!famKodak) {
    console.log('Familia Kodak não encontrada na versão:', versionId)
    return
  }

  const { data: offers, error: offErr } = await supabase
    .from('global_lens_offers')
    .select('id,canonical_label,raw_label,features,source_page_reference')
    .eq('family_id', famKodak.id)
    .in('source_page_reference', TARGET_PAGES)
  if (offErr) throw offErr

  if (!offers?.length) {
    console.log('Nenhuma oferta Kodak encontrada nas páginas 32–36.')
    return
  }

  const offerIds = offers.map((o) => o.id)
  const { data: grids, error: gridErr } = await supabase
    .from('global_offer_diopter_grids')
    .select('id,offer_id,cyl_min,cyl_max,add_min,add_max')
    .in('offer_id', offerIds)
  if (gridErr) throw gridErr

  const gridByOfferId = new Map((grids || []).map((g) => [g.offer_id, g]))

  const offerPatches = []
  const gridPatches = []

  for (const o of offers) {
    const rules = deriveRules(o)
    const feat = ensureObject(o.features)
    const currentHeight = feat.min_fitting_height ?? null

    // features patch (only when rule sets a value explicitly)
    if (rules.min_fitting_height != null && currentHeight !== rules.min_fitting_height) {
      const next = { ...feat, min_fitting_height: rules.min_fitting_height }
      offerPatches.push({ id: o.id, features: next })
    }

    // For pages where we know there is no height (or should not be set), remove it if present.
    if (rules.min_fitting_height == null && currentHeight != null) {
      const next = { ...feat }
      delete next.min_fitting_height
      offerPatches.push({ id: o.id, features: next })
    }

    const g = gridByOfferId.get(o.id)
    if (!g) continue

    // Always fix inverted cyl if any, then enforce target when present.
    let cylMin = Number(g.cyl_min)
    let cylMax = Number(g.cyl_max)
    if (cylMin > cylMax) {
      const tmp = cylMin
      cylMin = cylMax
      cylMax = tmp
    }

    const patch = { id: g.id }
    let changed = false

    if (rules.cyl_min != null && cylMin !== rules.cyl_min) {
      patch.cyl_min = rules.cyl_min
      changed = true
    } else if (Number(g.cyl_min) !== cylMin) {
      patch.cyl_min = cylMin
      changed = true
    }

    if (rules.cyl_max != null && cylMax !== rules.cyl_max) {
      patch.cyl_max = rules.cyl_max
      changed = true
    } else if (Number(g.cyl_max) !== cylMax) {
      patch.cyl_max = cylMax
      changed = true
    }

    if (rules.add_min != null && Number(g.add_min) !== rules.add_min) {
      patch.add_min = rules.add_min
      changed = true
    }
    if (rules.add_max != null && Number(g.add_max) !== rules.add_max) {
      patch.add_max = rules.add_max
      changed = true
    }
    if (rules.clear_add) {
      if (g.add_min != null) {
        patch.add_min = null
        changed = true
      }
      if (g.add_max != null) {
        patch.add_max = null
        changed = true
      }
    }

    if (changed) gridPatches.push(patch)
  }

  console.log('FIX_OPTILAB_KODAK_P32_36')
  console.log(
    JSON.stringify(
      {
        versionId,
        family: famKodak.nome,
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

  // Apply offer feature patches row-by-row (payload parcial com upsert pode quebrar NOT NULL)
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
  console.error('Erro ao corrigir Kodak p32–36:', err)
  process.exit(1)
})

