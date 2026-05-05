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

const TARGET_FAMILY = 'Vision Office'
const TARGET_CATEGORY = 'ocupacional'
const args = process.argv.slice(2)
const commit = args.includes('--commit')

async function main() {
  console.log(`DRY-RUN: ${commit ? 'NAO (aplicando)' : 'SIM'}\n`)

  const { data: families, error: familyErr } = await supabase
    .from('global_lens_families')
    .select('id,nome,version_id,clinical_category')
    .eq('nome', TARGET_FAMILY)
    .order('version_id')

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

  const familyById = new Map(families.map((family) => [family.id, family]))
  let familyUpdates = 0
  let offerUpdates = 0

  for (const family of families) {
    if (family.clinical_category === TARGET_CATEGORY) continue

    console.log(`[family] ${family.nome} (${family.version_id})`)
    console.log(`  category: ${family.clinical_category} -> ${TARGET_CATEGORY}`)

    if (commit) {
      const { error } = await supabase
        .from('global_lens_families')
        .update({ clinical_category: TARGET_CATEGORY })
        .eq('id', family.id)
      if (error) throw error
    }

    familyUpdates += 1
  }

  for (const offer of offers || []) {
    if (offer.clinical_category === TARGET_CATEGORY) continue

    const family = familyById.get(offer.family_id)
    console.log(`[offer] ${family?.nome || TARGET_FAMILY} | ${offer.source_page_reference || 'sem_pagina'}`)
    console.log(`  ${offer.canonical_label || offer.raw_label}`)
    console.log(`  category: ${offer.clinical_category} -> ${TARGET_CATEGORY}`)

    if (commit) {
      const { error } = await supabase
        .from('global_lens_offers')
        .update({ clinical_category: TARGET_CATEGORY })
        .eq('id', offer.id)
      if (error) throw error
    }

    offerUpdates += 1
  }

  console.log('\nResumo:')
  console.log(`familias analisadas: ${families.length}`)
  console.log(`familias a ajustar: ${familyUpdates}`)
  console.log(`offers analisadas: ${(offers || []).length}`)
  console.log(`offers a ajustar: ${offerUpdates}`)

  if (!commit) {
    console.log('\nPara aplicar: node scripts/fix_vision_office_category.js --commit')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
