import path from 'path'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const VERSION_ID = 'bcdd6a40-3476-438a-b0cf-b86fc7bb0c03'
const TARGET_FAMILIES = ['Life', 'Gama HD']
const TARGET_PAGES = ['Pagina 13', 'Pagina 14']

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

  const { data: families, error: familyErr } = await supabase
    .from('global_lens_families')
    .select('id,nome,clinical_category')
    .eq('version_id', VERSION_ID)
    .in('nome', TARGET_FAMILIES)

  if (familyErr) throw familyErr
  const familyById = new Map((families || []).map((f) => [f.id, f]))
  const familyIds = [...familyById.keys()]

  const { data: offers, error: offerErr } = await supabase
    .from('global_lens_offers')
    .select('id,family_id,canonical_label,clinical_category,features,source_page_reference')
    .in('family_id', familyIds)
    .in('source_page_reference', TARGET_PAGES)
    .order('source_page_reference')
    .order('canonical_label')

  if (offerErr) throw offerErr

  let familyPatched = 0
  for (const fam of families || []) {
    if (fam.clinical_category === 'multifocal') continue
    console.log(`[family] ${fam.nome}: ${fam.clinical_category} -> multifocal`)
    if (commit) {
      const { error } = await supabase.from('global_lens_families').update({ clinical_category: 'multifocal' }).eq('id', fam.id)
      if (error) throw error
    }
    familyPatched++
  }

  let offersPatched = 0
  for (const o of offers || []) {
    const nextFeatures = normalizeFeatures(o.canonical_label, o.features || {})
    const nextCategory = 'multifocal'
    const changed = JSON.stringify(o.features || {}) !== JSON.stringify(nextFeatures) || o.clinical_category !== nextCategory
    if (!changed) continue

    console.log(`[offer] ${o.source_page_reference} | ${o.canonical_label}`)
    if (o.clinical_category !== nextCategory) {
      console.log(`  category: ${o.clinical_category} -> ${nextCategory}`)
    }

    if (commit) {
      const { error } = await supabase
        .from('global_lens_offers')
        .update({ clinical_category: nextCategory, features: nextFeatures })
        .eq('id', o.id)
      if (error) throw error
    }
    offersPatched++
  }

  console.log(`\nResumo:`)
  console.log(`familias ajustadas: ${familyPatched}`)
  console.log(`ofertas ajustadas: ${offersPatched}`)
  console.log(`ofertas analisadas: ${(offers || []).length}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
