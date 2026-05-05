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

const TARGET_FAMILY = 'Lentes Essilor'
const TARGET_CATEGORY = 'visao_simples'
const args = process.argv.slice(2)
const commit = args.includes('--commit')

function isSingleVisionEssilorOffer(offer) {
  const text = `${offer.canonical_label || ''} ${offer.raw_label || ''}`.toLowerCase()
  if (offer.clinical_category !== 'indefinida') return false
  if (!/(stylis|orma|airwear)/.test(text)) return false
  if (/(varilux|kodak|progressiv|multifocal|add|bifocal|flap|ultex)/.test(text)) return false
  if (/(interview|visão intermediária|visao intermediaria|solar)/.test(text)) return false
  return true
}

async function main() {
  console.log(`DRY-RUN: ${commit ? 'NAO (aplicando)' : 'SIM'}\n`)

  const { data: families, error: familyErr } = await supabase
    .from('global_lens_families')
    .select('id,nome,version_id,clinical_category')
    .eq('nome', TARGET_FAMILY)

  if (familyErr) throw familyErr
  if (!families?.length) {
    console.log(`Nenhuma familia "${TARGET_FAMILY}" encontrada.`)
    return
  }

  const familyIds = families.map((family) => family.id)
  const { data: offers, error: offerErr } = await supabase
    .from('global_lens_offers')
    .select('id,family_id,canonical_label,raw_label,clinical_category,source_page_reference')
    .in('family_id', familyIds)
    .order('source_page_reference')
    .order('canonical_label')

  if (offerErr) throw offerErr

  let analyzed = 0
  let patched = 0
  for (const offer of offers || []) {
    if (!isSingleVisionEssilorOffer(offer)) continue
    analyzed += 1
    if (offer.clinical_category === TARGET_CATEGORY) continue

    console.log(`[offer] ${offer.source_page_reference || 'sem_pagina'} | ${offer.canonical_label || offer.raw_label}`)
    console.log(`  category: ${offer.clinical_category} -> ${TARGET_CATEGORY}`)

    if (commit) {
      const { error } = await supabase
        .from('global_lens_offers')
        .update({ clinical_category: TARGET_CATEGORY })
        .eq('id', offer.id)
      if (error) throw error
    }

    patched += 1
  }

  console.log('\nResumo:')
  console.log(`familias analisadas: ${families.length}`)
  console.log(`offers monofocais Essilor analisadas: ${analyzed}`)
  console.log(`offers a ajustar: ${patched}`)

  if (!commit) {
    console.log('\nPara aplicar: node scripts/fix_essilor_lentes_essilor_single_category.js --commit')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
