import path from 'path'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const VERSION_ID = 'bcdd6a40-3476-438a-b0cf-b86fc7bb0c03'
const FAMILY_MATCH = '%Surfa%Digital%'
const PAGE = 'Pagina 19'

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
    .select('id,nome,clinical_category')
    .eq('version_id', VERSION_ID)
    .ilike('nome', FAMILY_MATCH)

  if (fErr) throw fErr
  if (!families?.length) throw new Error('Familia da pagina 19 nao encontrada')

  const family = families[0]

  const { data: offers, error: oErr } = await supabase
    .from('global_lens_offers')
    .select('id,canonical_label,clinical_category,features,source_page_reference')
    .eq('family_id', family.id)
    .eq('source_page_reference', PAGE)
    .order('canonical_label')

  if (oErr) throw oErr

  let familyPatched = 0
  if (family.clinical_category !== 'visao_simples') {
    console.log(`[family] ${family.nome}: ${family.clinical_category} -> visao_simples`)
    if (commit) {
      const { error } = await supabase
        .from('global_lens_families')
        .update({ clinical_category: 'visao_simples' })
        .eq('id', family.id)
      if (error) throw error
    }
    familyPatched++
  }

  let patched = 0
  for (const o of offers || []) {
    const nextFeatures = normalizeFeatures(o.canonical_label, o.features || {})
    const nextCategory = 'visao_simples'
    const changed =
      JSON.stringify(o.features || {}) !== JSON.stringify(nextFeatures) ||
      o.clinical_category !== nextCategory

    if (!changed) continue

    console.log(`[offer] ${o.canonical_label}`)
    if (commit) {
      const { error } = await supabase
        .from('global_lens_offers')
        .update({ clinical_category: nextCategory, features: nextFeatures })
        .eq('id', o.id)
      if (error) throw error
    }
    patched++
  }

  console.log('\nResumo:')
  console.log(`familia ajustada: ${familyPatched}`)
  console.log(`ofertas ajustadas: ${patched}`)
  console.log(`ofertas analisadas: ${(offers || []).length}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
