import path from 'path'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const args = process.argv.slice(2)
const commit = args.includes('--commit')

const ITOP_FAMILY_ID = '67ca3a37-8c55-4a54-8365-be8264ba21ad'

// ---------------------------------------------------------------------------
// 1. Família iTop — enriquecer tags_uso e tags_beneficios
// ---------------------------------------------------------------------------
const FAMILY_PATCH = {
  tags_uso: ['uso_geral', 'computador', 'leitura', 'dirigir', 'distancia', 'sol', 'uso_externo'],
  tags_beneficios: ['versatilidade', 'custo_beneficio', 'opcoes_materiais', 'fotossensivel', 'disponibilidade_estoque', 'lente_fina'],
}

// ---------------------------------------------------------------------------
// 2. Acabadas — clinical_category: 'indefinida' → 'visao_simples'
// ---------------------------------------------------------------------------
const ACABADAS_LABELS = [
  'iTop LENTES ACABADAS 1.56',
  'iTop LENTES ACABADAS 1.56 Cilíndrico Estendido',
  'iTop LENTES ACABADAS 1.59',
  'iTop LENTES ACABADAS 1.59 Cilíndrico Estendido',
  'iTop LENTES ACABADAS 1.67',
]

// ---------------------------------------------------------------------------
// 3. Sun Light Photo — corrigir features: remover solar+transitions, adicionar fotossensivel
// ---------------------------------------------------------------------------
const SUN_LIGHT_PHOTO_LABELS = [
  'iTop PROGRESSIVA 1.50 + Sun Light Photo',
  'iTop VISÃO SIMPLES Blocos 1.50 iTop Sun Light Protection Photo',
]

// ---------------------------------------------------------------------------
// 4. Surfaçada 1.56 UV Led — adicionar blue_uv: true
// ---------------------------------------------------------------------------
const SURFACADA_156_LABEL = 'iTop LENTES SURFAÇADAS DIGITAIS 1.56 UV Led Protection Single Digital'

// ---------------------------------------------------------------------------
// 5. Ultra Light — adicionar digital: true
// ---------------------------------------------------------------------------
const ULTRA_LIGHT_LABELS = [
  'iTop ULTRA LIGHT 1.56 UV Led Progressiva',
  'iTop ULTRA LIGHT 1.56 UV Led Single',
  'iTop ULTRA LIGHT 1.67 UV Led Progressiva',
  'iTop ULTRA LIGHT 1.67 UV Led Single',
  'iTop ULTRA LIGHT 1.74 Progressiva',
  'iTop ULTRA LIGHT 1.74 Single',
]

async function main() {
  console.log(`\nDRY-RUN: ${!commit ? 'SIM' : 'NÃO — APLICANDO MUDANÇAS'}\n`)

  // Buscar todos os offers do iTop
  const { data: offers, error } = await supabase
    .from('global_lens_offers')
    .select('id,canonical_label,clinical_category,features')
    .eq('family_id', ITOP_FAMILY_ID)

  if (error) throw error

  const byLabel = new Map(offers.map(o => [o.canonical_label, o]))

  let patched = 0

  // -------------------------------------------------------------------
  // Patch 1: Família — tags_uso e tags_beneficios
  // -------------------------------------------------------------------
  console.log('[Patch 1] Família iTop — tags_uso / tags_beneficios:')
  const { data: family } = await supabase
    .from('global_lens_families')
    .select('id,tags_uso,tags_beneficios')
    .eq('id', ITOP_FAMILY_ID)
    .single()

  console.log(`  tags_uso atual:        ${JSON.stringify(family.tags_uso)}`)
  console.log(`  tags_uso novo:         ${JSON.stringify(FAMILY_PATCH.tags_uso)}`)
  console.log(`  tags_beneficios atual: ${JSON.stringify(family.tags_beneficios)}`)
  console.log(`  tags_beneficios novo:  ${JSON.stringify(FAMILY_PATCH.tags_beneficios)}`)

  if (commit) {
    const { error: e } = await supabase
      .from('global_lens_families')
      .update(FAMILY_PATCH)
      .eq('id', ITOP_FAMILY_ID)
    if (e) throw e
    console.log('  → APLICADO')
  }
  patched++

  // -------------------------------------------------------------------
  // Patch 2: Acabadas — clinical_category → visao_simples
  // -------------------------------------------------------------------
  console.log('\n[Patch 2] Acabadas — clinical_category → visao_simples:')
  for (const label of ACABADAS_LABELS) {
    const offer = byLabel.get(label)
    if (!offer) { console.log(`  AVISO: não encontrada: "${label}"`); continue }
    if (offer.clinical_category === 'visao_simples') { console.log(`  OK (sem mudança): "${label}"`); continue }
    console.log(`  "${label}": ${offer.clinical_category} → visao_simples`)
    if (commit) {
      const { error: e } = await supabase.from('global_lens_offers').update({ clinical_category: 'visao_simples' }).eq('id', offer.id)
      if (e) throw e
    }
    patched++
  }

  // -------------------------------------------------------------------
  // Patch 3: Sun Light Photo — corrigir features
  // -------------------------------------------------------------------
  console.log('\n[Patch 3] Sun Light Photo — features:')
  for (const label of SUN_LIGHT_PHOTO_LABELS) {
    const offer = byLabel.get(label)
    if (!offer) { console.log(`  AVISO: não encontrada: "${label}"`); continue }

    const f = { ...(offer.features || {}) }
    const before = JSON.stringify(f)
    delete f.solar
    delete f.transitions
    delete f.transitions_gens
    f.fotossensivel = true
    const after = JSON.stringify(f)

    if (before === after) { console.log(`  OK (sem mudança): "${label}"`); continue }
    console.log(`  "${label}"`)
    console.log(`    antes: ${before}`)
    console.log(`    depois: ${after}`)

    if (commit) {
      const { error: e } = await supabase.from('global_lens_offers').update({ features: f }).eq('id', offer.id)
      if (e) throw e
    }
    patched++
  }

  // -------------------------------------------------------------------
  // Patch 4: Surfaçada 1.56 UV Led — blue_uv: true
  // -------------------------------------------------------------------
  console.log('\n[Patch 4] Surfaçada 1.56 UV Led — blue_uv:')
  const s156 = byLabel.get(SURFACADA_156_LABEL)
  if (!s156) {
    console.log(`  AVISO: não encontrada: "${SURFACADA_156_LABEL}"`)
  } else if (s156.features?.blue_uv === true) {
    console.log(`  OK (sem mudança): "${SURFACADA_156_LABEL}"`)
  } else {
    const f = { ...(s156.features || {}), blue_uv: true }
    console.log(`  "${SURFACADA_156_LABEL}"`)
    console.log(`    antes: ${JSON.stringify(s156.features)}`)
    console.log(`    depois: ${JSON.stringify(f)}`)
    if (commit) {
      const { error: e } = await supabase.from('global_lens_offers').update({ features: f }).eq('id', s156.id)
      if (e) throw e
    }
    patched++
  }

  // -------------------------------------------------------------------
  // Patch 5: Ultra Light — digital: true
  // -------------------------------------------------------------------
  console.log('\n[Patch 5] Ultra Light — digital: true:')
  for (const label of ULTRA_LIGHT_LABELS) {
    const offer = byLabel.get(label)
    if (!offer) { console.log(`  AVISO: não encontrada: "${label}"`); continue }
    if (offer.features?.digital === true) { console.log(`  OK (sem mudança): "${label}"`); continue }
    const f = { ...(offer.features || {}), digital: true }
    console.log(`  "${label}"`)
    console.log(`    antes: ${JSON.stringify(offer.features)}`)
    console.log(`    depois: ${JSON.stringify(f)}`)
    if (commit) {
      const { error: e } = await supabase.from('global_lens_offers').update({ features: f }).eq('id', offer.id)
      if (e) throw e
    }
    patched++
  }

  console.log(`\nTotal de patches: ${patched}`)
  console.log(commit ? '[COMMIT] Aplicado.' : '[DRY-RUN] Sem alterações. Rode com --commit para efetivar.')
}

main().catch((e) => { console.error(e); process.exit(1) })
