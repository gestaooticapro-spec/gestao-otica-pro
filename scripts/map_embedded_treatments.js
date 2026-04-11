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
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

const args = process.argv.slice(2)
const versionId =
  args.find((arg) => arg.startsWith('--version-id='))?.split('=')[1] ||
  '08f91e88-40f5-4521-b476-d09c7f1955cf'

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function inferGenericTreatments(offer) {
  const descriptor = normalizeText(
    [offer.raw_label, offer.canonical_label, offer.material, offer.source_page_reference]
      .filter(Boolean)
      .join(' '),
  )
  const flags = offer.features || {}
  const treatments = new Set()

  const has = (key) => flags[key] === true || descriptor.includes(key)

  if (/(blue\s?control|blue\s?uv|uv\s?filter)/.test(descriptor) || has('blue_control')) {
    treatments.add('Filtro Luz Azul')
  }
  if (/(sensity|photofusion|photochrom|transitions|fotossens)/.test(descriptor) || has('fotossensivel')) {
    treatments.add('Fotossensível')
  }
  if (/(polarizad|polarized)/.test(descriptor) || has('polarizado')) {
    treatments.add('Polarizado')
    treatments.add('Solar')
  }
  if (/(sun\s?pro|solar|solares|sunwear)/.test(descriptor) || has('solar')) {
    treatments.add('Solar')
  }
  if (/(mirror|espelhado)/.test(descriptor) || has('espelhado')) {
    treatments.add('Espelhado')
  }
  if (/(uv\s?control)/.test(descriptor) || has('uv')) {
    treatments.add('Proteção UV')
  }

  // default antirreflexo for coated offers
  if (
    /(meiryo|longlife|hard|cleanextra|anti-?reflex|antirreflex|no-risk)/.test(descriptor) ||
    has('antirreflexo')
  ) {
    treatments.add('Antirreflexo')
  }

  return Array.from(treatments)
}

async function main() {
  const { data: families, error: familiesError } = await supabase
    .from('global_lens_families')
    .select('id')
    .eq('version_id', versionId)

  if (familiesError) throw familiesError

  const familyIds = (families || []).map((row) => row.id)
  if (!familyIds.length) {
    console.log('Nenhuma família encontrada para a versão.')
    return
  }

  const { data: offers, error } = await supabase
    .from('global_lens_offers')
    .select('id,raw_label,canonical_label,material,features,source_page_reference,already_includes_treatment')
    .in('family_id', familyIds)

  if (error) throw error

  let updated = 0
  for (const offer of offers) {
    if (!offer.already_includes_treatment) continue

    const genericTreatments = inferGenericTreatments(offer)
    if (!genericTreatments.length) continue

    const features = { ...(offer.features || {}), generic_treatments: genericTreatments }
    const { error: updateError } = await supabase
      .from('global_lens_offers')
      .update({ features })
      .eq('id', offer.id)

    if (updateError) throw updateError
    updated += 1
  }

  console.log(`Ofertas embutidas atualizadas: ${updated}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
