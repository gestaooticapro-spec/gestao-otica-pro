import path from 'path'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const VERSION_ID = 'bcdd6a40-3476-438a-b0cf-b86fc7bb0c03'
const PAGE = 'Pagina 20'
const args = process.argv.slice(2)
const commit = args.includes('--commit')

function inferCategory(label, familyName, current) {
  if (current && current !== 'indefinida') return current
  const l = `${familyName || ''} ${label || ''}`.toLowerCase()
  if (/(interview|digitime|roadpilot|activities)/.test(l)) return 'ocupacional'
  return 'multifocal'
}

function normalizeFeatures(label, current = {}) {
  const l = (label || '').toLowerCase()
  const has = (token) => l.includes(token)
  const foto = has('fotossens') || has('transitions') || has('sensity') || has('photofusion') || has('acclimates')
  const antirreflexoExterno = has('antirre') && has('externo')

  return {
    ...current,
    foto,
    blue_uv: has('blue uv'),
    sensity: has('sensity'),
    espelhada: has('espelhada') || has('espelhado'),
    acclimates: has('acclimates'),
    extractive: has('extractive'),
    polarizado: has('polarizado'),
    photofusion: has('photofusion'),
    transitions: has('transitions'),
    antirreflexo: antirreflexoExterno,
    antirreflexo_externo: antirreflexoExterno,
  }
}

function normalizeLabelText(label) {
  return String(label || '')
    .replace('FotossensívelPhotofusion', 'Fotossensível Photofusion')
    .replace('UVDigital', 'UV Digital')
}

async function main() {
  console.log(`DRY-RUN: ${commit ? 'NAO (aplicando)' : 'SIM'}\n`)

  const { data: families, error: fErr } = await supabase
    .from('global_lens_families')
    .select('id,nome,clinical_category')
    .eq('version_id', VERSION_ID)

  if (fErr) throw fErr
  const fmap = new Map((families || []).map((f) => [f.id, f]))
  const familyIds = (families || []).map((f) => f.id)

  const { data: offers, error: oErr } = await supabase
    .from('global_lens_offers')
    .select('id,family_id,canonical_label,raw_label,clinical_category,features,source_page_reference')
    .in('family_id', familyIds)
    .eq('source_page_reference', PAGE)
    .order('family_id')
    .order('canonical_label')

  if (oErr) throw oErr

  let patched = 0
  for (const o of offers || []) {
    const fam = fmap.get(o.family_id)
    const nextCategory = inferCategory(o.canonical_label, fam?.nome, o.clinical_category)
    const nextFeatures = normalizeFeatures(o.canonical_label, o.features || {})
    const nextCanonical = normalizeLabelText(o.canonical_label)
    const nextRaw = normalizeLabelText(o.raw_label)

    const changed =
      o.clinical_category !== nextCategory ||
      JSON.stringify(o.features || {}) !== JSON.stringify(nextFeatures) ||
      o.canonical_label !== nextCanonical ||
      o.raw_label !== nextRaw

    if (!changed) continue

    console.log(`[offer] ${fam?.nome || o.family_id} | ${o.canonical_label}`)
    if (o.clinical_category !== nextCategory) {
      console.log(`  category: ${o.clinical_category} -> ${nextCategory}`)
    }

    if (commit) {
      const { error } = await supabase
        .from('global_lens_offers')
        .update({
          clinical_category: nextCategory,
          features: nextFeatures,
          canonical_label: nextCanonical,
          raw_label: nextRaw,
        })
        .eq('id', o.id)
      if (error) throw error
    }
    patched++
  }

  console.log('\nResumo:')
  console.log(`ofertas ajustadas: ${patched}`)
  console.log(`ofertas analisadas: ${(offers || []).length}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
