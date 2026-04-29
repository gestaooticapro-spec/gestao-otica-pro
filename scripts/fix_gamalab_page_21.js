import path from 'path'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const VERSION_ID = 'bcdd6a40-3476-438a-b0cf-b86fc7bb0c03'
const PAGE = 'Pagina 21'
const args = process.argv.slice(2)
const commit = args.includes('--commit')

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

async function main() {
  console.log(`DRY-RUN: ${commit ? 'NAO (aplicando)' : 'SIM'}\n`)

  const { data: families, error: fErr } = await supabase
    .from('global_lens_families')
    .select('id,nome')
    .eq('version_id', VERSION_ID)

  if (fErr) throw fErr
  const familyIds = (families || []).map((f) => f.id)

  const { data: offers, error: oErr } = await supabase
    .from('global_lens_offers')
    .select('id,family_id,canonical_label,features,clinical_category,source_page_reference')
    .in('family_id', familyIds)
    .eq('source_page_reference', PAGE)
    .order('family_id')
    .order('canonical_label')

  if (oErr) throw oErr

  let patched = 0
  for (const o of offers || []) {
    const nextFeatures = normalizeFeatures(o.canonical_label, o.features || {})
    const changed = JSON.stringify(o.features || {}) !== JSON.stringify(nextFeatures)
    if (!changed) continue

    console.log(`[offer] ${o.canonical_label}`)
    if (commit) {
      const { error } = await supabase
        .from('global_lens_offers')
        .update({ features: nextFeatures })
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
