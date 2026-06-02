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
  console.error('Uso: node scripts/fix_hoya_p22_p25_sensity_features.js --version-id=UUID [--commit]')
  process.exit(1)
}

const PAGE_CONFIG = {
  'Pagina 22': {
    family: 'Hoyalux iD MySelf',
    min_fitting_height: 14,
    fitting_heights_available: [14, 15, 17, 18, 19, 20],
    marcacao: 'MSF+Corredor + Iniciais do usuario',
  },
  'Pagina 23': {
    family: 'Hoyalux iD MyStyle V+',
    min_fitting_height: 14,
    fitting_heights_available: [14, 15, 17, 18, 19, 20],
    marcacao: 'MSV+Corredor + Iniciais do usuario',
  },
  'Pagina 24': {
    family: 'Hoyalux iD LifeStyle 4i',
    min_fitting_height: 14,
    fitting_heights_available: [14, 15, 17, 18],
    marcacao: 'L 4i41 / L 4i51 / L 4i71 / L 4i81 / + O / U / I + Iniciais do usuario',
    desenhos: ['OUTDOOR', 'URBAN', 'INDOOR'],
  },
  'Pagina 25': {
    family: 'Hoyalux iD LifeStyle 4',
    min_fitting_height: 14,
    fitting_heights_available: [14, 15, 17, 18],
    marcacao: 'L 441/L451/L471/L481/ + O/U/I + Iniciais do usuario',
    desenhos: ['OUTDOOR', 'URBAN', 'INDOOR'],
  },
}

async function fetchAll(query, pageSize = 1000) {
  let from = 0
  let all = []
  for (;;) {
    const { data, error } = await query.range(from, from + pageSize - 1)
    if (error) throw error
    const rows = data || []
    all = all.concat(rows)
    if (rows.length < pageSize) break
    from += pageSize
  }
  return all
}

function extractSensityTreatment(label) {
  const marker = 'SENSITY 2 '
  const idx = label.indexOf(marker)
  if (idx === -1) return null
  return label.slice(idx + marker.length).trim()
}

async function main() {
  const pages = Object.keys(PAGE_CONFIG)
  const familiesWanted = Object.values(PAGE_CONFIG).map((cfg) => cfg.family)

  const { data: families, error: famErr } = await supabase
    .from('global_lens_families')
    .select('id,nome')
    .eq('version_id', versionId)
    .in('nome', familiesWanted)
  if (famErr) throw famErr

  const familyById = new Map((families || []).map((f) => [f.id, f.nome]))
  const familyIds = (families || []).map((f) => f.id)

  const offers = await fetchAll(
    supabase
      .from('global_lens_offers')
      .select('id,family_id,canonical_label,features,source_page_reference')
      .in('family_id', familyIds)
      .in('source_page_reference', pages),
    1000
  )

  const patches = []
  const skipped = []

  for (const offer of offers) {
    const label = offer.canonical_label || ''
    if (!label.includes('SENSITY 2')) continue

    const pageCfg = PAGE_CONFIG[offer.source_page_reference]
    const treatment = extractSensityTreatment(label)

    if (!pageCfg || !treatment) {
      skipped.push({ id: offer.id, label, reason: 'nao consegui extrair pagina/tratamento' })
      continue
    }

    const features = offer.features || {}
    const nextFeatures = {
      ...features,
      cor: 'SENSITY 2',
      tratamento: treatment,
      min_fitting_height: pageCfg.min_fitting_height,
      fitting_heights_available: pageCfg.fitting_heights_available,
      marcacao: pageCfg.marcacao,
      foto: true,
      sensity: true,
      transitions: true,
    }

    if (pageCfg.desenhos) nextFeatures.desenhos = pageCfg.desenhos

    if (JSON.stringify(nextFeatures) !== JSON.stringify(features)) {
      patches.push({
        id: offer.id,
        family: familyById.get(offer.family_id) || offer.family_id,
        page: offer.source_page_reference,
        label,
        before: features,
        after: nextFeatures,
      })
    }
  }

  console.log('FIX_HOYA_P22_P25_SENSITY_FEATURES')
  console.log(`DRY-RUN: ${commit ? 'NAO (COMMIT)' : 'SIM'}`)
  console.log(`Ofertas SENSITY 2 a atualizar: ${patches.length}`)
  console.log(`Ignoradas: ${skipped.length}`)

  for (const patch of patches.slice(0, 12)) {
    console.log(`- ${patch.page} | ${patch.family} | ${patch.label}`)
    console.log(`  before=${JSON.stringify(patch.before)}`)
    console.log(`  after=${JSON.stringify(patch.after)}`)
  }

  if (skipped.length) console.log(JSON.stringify({ skipped }, null, 2))

  if (!commit) {
    console.log('\n[DRY-RUN] Rode com --commit para aplicar as mudancas.')
    return
  }

  for (const patch of patches) {
    const { error } = await supabase.from('global_lens_offers').update({ features: patch.after }).eq('id', patch.id)
    if (error) throw error
  }

  console.log(`\n[COMMIT] Atualizadas ${patches.length} ofertas SENSITY 2.`)
}

main().catch((err) => {
  console.error('Erro fix hoya p22-p25 sensity features:', err)
  process.exit(1)
})

