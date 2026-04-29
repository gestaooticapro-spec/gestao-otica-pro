import path from 'path'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const VERSION_ID = 'bcdd6a40-3476-438a-b0cf-b86fc7bb0c03'
const TARGET_FAMILY = 'Dynamic Single'
const TARGET_PAGE = 'Pagina 17'

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
    solar: Boolean(current.solar ?? false),
    blue_uv: has('blue uv'),
    degrade: Boolean(current.degrade ?? false),
    sensity: has('sensity'),
    espelhada: has('espelhada') || has('espelhado'),
    espelhado: has('espelhado') || has('espelhada'),
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

  const { data: family, error: familyErr } = await supabase
    .from('global_lens_families')
    .select('id,nome,clinical_category')
    .eq('version_id', VERSION_ID)
    .eq('nome', TARGET_FAMILY)
    .single()

  if (familyErr) throw familyErr

  const { data: offers, error: offersErr } = await supabase
    .from('global_lens_offers')
    .select('id,canonical_label,clinical_category,features,source_page_reference')
    .eq('family_id', family.id)
    .eq('source_page_reference', TARGET_PAGE)
    .order('canonical_label')

  if (offersErr) throw offersErr

  if (family.clinical_category !== 'visao_simples') {
    console.log(`[family] ${family.nome}: ${family.clinical_category} -> visao_simples`)
    if (commit) {
      const { error } = await supabase.from('global_lens_families').update({ clinical_category: 'visao_simples' }).eq('id', family.id)
      if (error) throw error
    }
  }

  let patched = 0
  for (const o of offers || []) {
    const nextFeatures = normalizeFeatures(o.canonical_label, o.features || {})
    const changed = JSON.stringify(o.features || {}) !== JSON.stringify(nextFeatures)
    if (!changed) continue

    console.log(`[offer] ${o.canonical_label}`)
    if (commit) {
      const { error } = await supabase.from('global_lens_offers').update({ features: nextFeatures }).eq('id', o.id)
      if (error) throw error
    }
    patched++
  }

  console.log(`\nResumo:`)
  console.log(`offers ajustadas: ${patched}`)
  console.log(`offers analisadas: ${(offers || []).length}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
