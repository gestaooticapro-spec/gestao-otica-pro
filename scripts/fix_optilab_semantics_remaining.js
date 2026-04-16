import path from 'path'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const args = process.argv.slice(2)
const commit = args.includes('--commit')

const VERSION_ID = 'a4886a73-bc92-4b14-9c47-152ef0c78078'

async function main() {
  console.log(`\nDRY-RUN: ${!commit ? 'SIM' : 'NÃO — APLICANDO MUDANÇAS'}\n`)

  const { data: families } = await supabase
    .from('global_lens_families')
    .select('id,nome,tags_uso,tags_beneficios,clinical_category')
    .eq('version_id', VERSION_ID)
  const fByName = new Map(families.map(f => [f.nome, f]))

  let patched = 0

  // -------------------------------------------------------------------------
  // Patch 1: Solar Planas "Total" — adicionar solar: true
  // -------------------------------------------------------------------------
  console.log('[Patch 1] Solar Planas "Total" — solar: true:')
  const solarFamily = fByName.get('LENTES VS SOLARES PLANAS ACABADAS')
  const { data: solarOffers } = await supabase
    .from('global_lens_offers')
    .select('id,canonical_label,features')
    .eq('family_id', solarFamily.id)
    .ilike('canonical_label', '%Total%')

  for (const o of solarOffers) {
    if (o.features?.solar === true) { console.log(`  OK (sem mudança): "${o.canonical_label}"`); continue }
    const f = { ...(o.features || {}), solar: true }
    console.log(`  "${o.canonical_label}"`)
    console.log(`    antes: ${JSON.stringify(o.features)}`)
    console.log(`    depois: ${JSON.stringify(f)}`)
    if (commit) {
      const { error } = await supabase.from('global_lens_offers').update({ features: f }).eq('id', o.id)
      if (error) throw error
    }
    patched++
  }

  // -------------------------------------------------------------------------
  // Patch 2: Essilor — Airwear e Orma isolados: indefinida → visao_simples
  // -------------------------------------------------------------------------
  console.log('\n[Patch 2] Essilor Airwear/Orma — indefinida → visao_simples:')
  const essilorFamily = fByName.get('LENTES ESSILOR®')
  const ESSILOR_FIX_LABELS = ['LENTES ESSILOR® Airwear', 'LENTES ESSILOR® Orma']
  const { data: essilorOffers } = await supabase
    .from('global_lens_offers')
    .select('id,canonical_label,clinical_category')
    .eq('family_id', essilorFamily.id)
    .in('canonical_label', ESSILOR_FIX_LABELS)

  for (const o of essilorOffers) {
    if (o.clinical_category === 'visao_simples') { console.log(`  OK (sem mudança): "${o.canonical_label}"`); continue }
    console.log(`  "${o.canonical_label}": ${o.clinical_category} → visao_simples`)
    if (commit) {
      const { error } = await supabase.from('global_lens_offers').update({ clinical_category: 'visao_simples' }).eq('id', o.id)
      if (error) throw error
    }
    patched++
  }

  // -------------------------------------------------------------------------
  // Patch 3: Essilor família — remover 'intermediario' de tags_uso
  // -------------------------------------------------------------------------
  console.log('\n[Patch 3] Essilor família — corrigir tags_uso:')
  const oldTagsUso = essilorFamily.tags_uso || []
  const newTagsUso = [...new Set(oldTagsUso.map(t => t === 'intermediario' ? 'uso_geral' : t))]
  if (JSON.stringify(oldTagsUso) === JSON.stringify(newTagsUso)) {
    console.log('  OK (sem mudança)')
  } else {
    console.log(`  antes:  ${JSON.stringify(oldTagsUso)}`)
    console.log(`  depois: ${JSON.stringify(newTagsUso)}`)
    if (commit) {
      const { error } = await supabase.from('global_lens_families').update({ tags_uso: newTagsUso }).eq('id', essilorFamily.id)
      if (error) throw error
    }
    patched++
  }

  // -------------------------------------------------------------------------
  // Patch 4: Linha Kids família — indefinida → mista
  // -------------------------------------------------------------------------
  console.log('\n[Patch 4] Linha Kids família — indefinida → mista:')
  const kidsFamily = fByName.get('LINHA KIDS')
  if (kidsFamily.clinical_category === 'mista') {
    console.log('  OK (sem mudança)')
  } else {
    console.log(`  clinical_category: ${kidsFamily.clinical_category} → mista`)
    if (commit) {
      const { error } = await supabase.from('global_lens_families').update({ clinical_category: 'mista' }).eq('id', kidsFamily.id)
      if (error) throw error
    }
    patched++
  }

  // -------------------------------------------------------------------------
  // Patch 5: Linha Kids — Airwear e Airwear+Transitions: indefinida → visao_simples
  // -------------------------------------------------------------------------
  console.log('\n[Patch 5] Linha Kids Airwear — indefinida → visao_simples:')
  const KIDS_FIX_LABELS = ['LINHA KIDS Airwear', 'LINHA KIDS Airwear + Transitions Gen S']
  const { data: kidsOffers } = await supabase
    .from('global_lens_offers')
    .select('id,canonical_label,clinical_category')
    .eq('family_id', kidsFamily.id)
    .in('canonical_label', KIDS_FIX_LABELS)

  for (const o of kidsOffers) {
    if (o.clinical_category === 'visao_simples') { console.log(`  OK (sem mudança): "${o.canonical_label}"`); continue }
    console.log(`  "${o.canonical_label}": ${o.clinical_category} → visao_simples`)
    if (commit) {
      const { error } = await supabase.from('global_lens_offers').update({ clinical_category: 'visao_simples' }).eq('id', o.id)
      if (error) throw error
    }
    patched++
  }

  // -------------------------------------------------------------------------
  // Patch 6: iTop 1.74 Digital e 1.74 Transitions Gen 8 Digital: indefinida → visao_simples
  // -------------------------------------------------------------------------
  console.log('\n[Patch 6] iTop 1.74 surfaçadas — indefinida → visao_simples:')
  const ITOP_FIX_LABELS = [
    'iTop LENTES SURFAÇADAS DIGITAIS 1.74 Digital',
    'iTop LENTES SURFAÇADAS DIGITAIS 1.74 Transitions Gen 8 Digital',
  ]
  const itopFamily = fByName.get('iTop')
  const { data: itopOffers } = await supabase
    .from('global_lens_offers')
    .select('id,canonical_label,clinical_category')
    .eq('family_id', itopFamily.id)
    .in('canonical_label', ITOP_FIX_LABELS)

  for (const o of itopOffers) {
    if (o.clinical_category === 'visao_simples') { console.log(`  OK (sem mudança): "${o.canonical_label}"`); continue }
    console.log(`  "${o.canonical_label}": ${o.clinical_category} → visao_simples`)
    if (commit) {
      const { error } = await supabase.from('global_lens_offers').update({ clinical_category: 'visao_simples' }).eq('id', o.id)
      if (error) throw error
    }
    patched++
  }

  // -------------------------------------------------------------------------
  // Patch 7: iTop Ultra Light UV Led (×4) — adicionar blue_uv: true
  // -------------------------------------------------------------------------
  console.log('\n[Patch 7] iTop Ultra Light UV Led — blue_uv: true:')
  const ULTRA_LIGHT_UV_LABELS = [
    'iTop ULTRA LIGHT 1.56 UV Led Progressiva',
    'iTop ULTRA LIGHT 1.56 UV Led Single',
    'iTop ULTRA LIGHT 1.67 UV Led Progressiva',
    'iTop ULTRA LIGHT 1.67 UV Led Single',
  ]
  const { data: ultraOffers } = await supabase
    .from('global_lens_offers')
    .select('id,canonical_label,features')
    .eq('family_id', itopFamily.id)
    .in('canonical_label', ULTRA_LIGHT_UV_LABELS)

  for (const o of ultraOffers) {
    if (o.features?.blue_uv === true) { console.log(`  OK (sem mudança): "${o.canonical_label}"`); continue }
    const f = { ...(o.features || {}), blue_uv: true }
    console.log(`  "${o.canonical_label}"`)
    console.log(`    antes: ${JSON.stringify(o.features)}`)
    console.log(`    depois: ${JSON.stringify(f)}`)
    if (commit) {
      const { error } = await supabase.from('global_lens_offers').update({ features: f }).eq('id', o.id)
      if (error) throw error
    }
    patched++
  }

  console.log(`\nTotal de patches: ${patched}`)
  console.log(commit ? '[COMMIT] Aplicado.' : '[DRY-RUN] Sem alterações. Rode com --commit para efetivar.')
}

main().catch((e) => { console.error(e); process.exit(1) })
