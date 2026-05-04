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

const VERSIONS = {
  optilab: 'a4886a73-bc92-4b14-9c47-152ef0c78078',
  gamalab: 'bcdd6a40-3476-438a-b0cf-b86fc7bb0c03',
}

const TARGET_PAGES = {
  [VERSIONS.optilab]: ['Pagina 22', 'Pagina 23', 'Pagina 24', 'Pagina 25'],
  [VERSIONS.gamalab]: ['Pagina 16', 'Pagina 17', 'Pagina 18', 'Pagina 19'],
}

const args = process.argv.slice(2)
const commit = args.includes('--commit')

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function hasAny(text, tokens) {
  return tokens.some((token) => text.includes(token))
}

function inferArFlags({ offer }) {
  const label = `${offer.raw_label || ''} ${offer.canonical_label || ''} ${offer.material || ''}`
  const featureTreatmentText = `${offer.features?.tratamento || ''} ${offer.features?.treatment_group || ''}`
  const text = normalizeText(`${label} ${featureTreatmentText}`)

  const hasSemAr = hasAny(text, [
    'sem antirreflexo',
    'sem anti reflexo',
    's/ antirreflexo',
    's/ ar',
    'sem ar',
  ])

  const hasArMarker = hasAny(text, [
    'antirreflexo',
    'anti reflexo',
    'crizal',
    'sigma',
    'hi-vision',
    'hivision',
    'meiryo',
    'sapphire',
    'rock',
    'prevencia',
    'easy pro',
    'trio',
    'vert clair',
    'longlife',
  ])

  const antirreflexo = hasArMarker && !hasSemAr
  const antirreflexoExterno =
    antirreflexo &&
    hasAny(text, ['externo', 'externa']) &&
    hasAny(text, ['antirreflexo', 'anti reflexo', 'ar'])

  return { antirreflexo, antirreflexoExterno }
}

function shallowEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

async function loadCatalogSlice(versionId) {
  const pages = TARGET_PAGES[versionId]

  const { data: families, error: familyErr } = await supabase
    .from('global_lens_families')
    .select('id,nome,version_id')
    .eq('version_id', versionId)
  if (familyErr) throw familyErr

  const familyIds = (families || []).map((f) => f.id)
  if (!familyIds.length) return { families: [], offers: [], treatmentsById: new Map() }

  const { data: offers, error: offerErr } = await supabase
    .from('global_lens_offers')
    .select('id,family_id,raw_label,canonical_label,material,features,source_page_reference')
    .in('family_id', familyIds)
    .in('source_page_reference', pages)
  if (offerErr) throw offerErr

  return {
    families,
    offers: offers || [],
  }
}

async function main() {
  console.log(`DRY-RUN: ${commit ? 'NAO (aplicando)' : 'SIM'}\n`)

  const updates = []
  const summaries = []

  for (const versionId of Object.keys(TARGET_PAGES)) {
    const { families, offers } = await loadCatalogSlice(versionId)
    const familyById = new Map((families || []).map((f) => [f.id, f]))

    let analyzed = 0
    let changed = 0

    for (const offer of offers) {
      analyzed += 1
      const current = offer.features && typeof offer.features === 'object' ? { ...offer.features } : {}
      const { antirreflexo, antirreflexoExterno } = inferArFlags({ offer })
      const next = {
        ...current,
        antirreflexo,
        antirreflexo_externo: antirreflexoExterno,
      }

      if (shallowEqual(current, next)) continue

      changed += 1
      updates.push({
        id: offer.id,
        features: next,
        versionId,
        page: offer.source_page_reference,
        family: familyById.get(offer.family_id)?.nome || 'N/A',
        label: offer.raw_label || offer.canonical_label || 'N/A',
        ar: antirreflexo,
        arExterno: antirreflexoExterno,
      })
    }

    summaries.push({
      versionId,
      pages: TARGET_PAGES[versionId],
      offersAnalyzed: analyzed,
      offersChanged: changed,
    })
  }

  console.log(JSON.stringify({ summaries, updatesPreview: updates.slice(0, 20), totalUpdates: updates.length }, null, 2))

  if (!commit || updates.length === 0) {
    if (!commit) console.log('\nDry-run finalizado. Use --commit para aplicar.')
    return
  }

  let applied = 0
  for (const u of updates) {
    const { error } = await supabase.from('global_lens_offers').update({ features: u.features }).eq('id', u.id)
    if (error) throw error
    applied += 1
  }

  console.log(`\nAplicado com sucesso: ${applied} ofertas atualizadas.`)
}

main().catch((error) => {
  console.error('Erro na correção de semântica AR:', error)
  process.exit(1)
})
