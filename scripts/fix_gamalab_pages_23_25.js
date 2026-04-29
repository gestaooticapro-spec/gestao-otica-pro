import path from 'path'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const VERSION_ID = 'bcdd6a40-3476-438a-b0cf-b86fc7bb0c03'
const TARGET_PAGES = ['Pagina 23', 'Pagina 24', 'Pagina 25']
const args = process.argv.slice(2)
const commit = args.includes('--commit')

function inferOfferCategory(offer, family) {
  const page = offer.source_page_reference || ''
  const text = `${family?.nome || ''} ${offer.canonical_label || ''}`.toLowerCase()

  if (page === 'Pagina 25') return 'plana_solar'
  if (/bifocal|ultex|kriptok|panop|executivo/.test(text)) return 'bifocal'
  return 'visao_simples'
}

function inferFamilyCategory(family, pageSet) {
  const nome = (family.nome || '').toLowerCase()
  const design = (family.design || '').toLowerCase()

  if (design.includes('solar') || [...pageSet].includes('Pagina 25') || nome.includes('solar')) {
    return 'plana_solar'
  }
  if (nome.includes('bifocal') || design.includes('bifocal')) {
    return 'bifocal'
  }
  if (design.includes('acabada') || [...pageSet].some((p) => p === 'Pagina 23' || p === 'Pagina 24')) {
    return 'visao_simples'
  }
  return family.clinical_category || 'indefinida'
}

function normalizeFeatures(offer, family, current = {}) {
  const label = (offer.canonical_label || '').toLowerCase()
  const page = offer.source_page_reference || ''

  const has = (token) => label.includes(token)
  const isSolar =
    page === 'Pagina 25' ||
    has('solar') || has('solares') || has('curva') || has('g-15') || has('night drive') || has('polarizado') || has('espelhado')

  const hasSemAntirreflexo = has('sem antirre') || has('sem antirreflex')
  const antirreflexo = (has('antirre') || has('antirreflex')) && !hasSemAntirreflexo
  const antirreflexoExterno = antirreflexo && has('externo')
  const foto = has('fotossens') || has('transitions') || has('sensity') || has('photofusion') || has('acclimates')

  return {
    ...current,
    foto,
    solar: isSolar,
    blue_uv: has('blue uv') || has('bluecontrol') || has('blue control') || has('prevencia') || has('blue'),
    sensity: has('sensity'),
    espelhada: has('espelhada') || has('espelhado'),
    espelhado: has('espelhado') || has('espelhada'),
    acclimates: has('acclimates'),
    extractive: has('extractive'),
    polarizado: has('polarizado'),
    photofusion: has('photofusion'),
    transitions: has('transitions'),
    antirreflexo,
    antirreflexo_externo: antirreflexoExterno,
  }
}

async function main() {
  console.log(`DRY-RUN: ${commit ? 'NAO (aplicando)' : 'SIM'}\n`)

  const { data: families, error: fErr } = await supabase
    .from('global_lens_families')
    .select('id,nome,design,clinical_category')
    .eq('version_id', VERSION_ID)

  if (fErr) throw fErr
  const familyById = new Map((families || []).map((f) => [f.id, f]))
  const familyIds = (families || []).map((f) => f.id)

  const { data: offers, error: oErr } = await supabase
    .from('global_lens_offers')
    .select('id,family_id,canonical_label,raw_label,clinical_category,features,source_page_reference')
    .in('family_id', familyIds)
    .in('source_page_reference', TARGET_PAGES)
    .order('source_page_reference')
    .order('family_id')
    .order('canonical_label')

  if (oErr) throw oErr

  const familyPageMap = new Map()
  for (const o of offers || []) {
    const key = o.family_id
    if (!familyPageMap.has(key)) familyPageMap.set(key, new Set())
    familyPageMap.get(key).add(o.source_page_reference)
  }

  let familyPatched = 0
  for (const [familyId, pageSet] of familyPageMap.entries()) {
    const fam = familyById.get(familyId)
    if (!fam) continue
    const next = inferFamilyCategory(fam, pageSet)
    if (fam.clinical_category === next) continue

    console.log(`[family] ${fam.nome}: ${fam.clinical_category} -> ${next}`)
    if (commit) {
      const { error } = await supabase.from('global_lens_families').update({ clinical_category: next }).eq('id', fam.id)
      if (error) throw error
    }
    familyPatched++
  }

  let offerPatched = 0
  for (const o of offers || []) {
    const fam = familyById.get(o.family_id)
    const nextCategory = inferOfferCategory(o, fam)
    const nextFeatures = normalizeFeatures(o, fam, o.features || {})
    const changed =
      o.clinical_category !== nextCategory ||
      JSON.stringify(o.features || {}) !== JSON.stringify(nextFeatures)

    if (!changed) continue

    console.log(`[offer] ${fam?.nome || o.family_id} | ${o.canonical_label}`)
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
    offerPatched++
  }

  console.log('\nResumo:')
  console.log(`familias ajustadas: ${familyPatched}`)
  console.log(`ofertas ajustadas: ${offerPatched}`)
  console.log(`ofertas analisadas: ${(offers || []).length}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
