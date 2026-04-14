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

const args = process.argv.slice(2)
const versionId = args.find((arg) => arg.startsWith('--version-id='))?.split('=')[1]
const commit = args.includes('--commit')

if (!versionId) {
  console.error('Uso: node scripts/fix_itop_grids.js --version-id=UUID [--commit]')
  process.exit(1)
}

const TARGETS = [
  { match: '1.50', min: -9, max: 6 },
  { match: '1.59', min: -10, max: 8 },
  { match: '1.67', min: -12, max: 9 },
  { match: '1.74', min: -15, max: 12 },
  { match: '1.56', min: -8, max: 7 },
]

function normalizeRange(min, max) {
  if (min == null || max == null) return { min, max }
  return min <= max ? { min, max } : { min: max, max: min }
}

async function main() {
  const { data: families, error: famError } = await supabase
    .from('global_lens_families')
    .select('id,nome')
    .eq('version_id', versionId)

  if (famError) throw famError
  const familyIds = (families || []).map((f) => f.id)
  if (!familyIds.length) {
    console.log('Nenhuma família encontrada para version_id', versionId)
    return
  }

  const { data: offers, error: offerError } = await supabase
    .from('global_lens_offers')
    .select('id,family_id,raw_label,canonical_label')
    .in('family_id', familyIds)

  if (offerError) throw offerError

  const itopOffers = (offers || []).filter((offer) => {
    const label = `${offer.raw_label || ''} ${offer.canonical_label || ''}`.toLowerCase()
    return label.includes('itop') && (label.includes('surfa') || label.includes('digit'))
  })

  if (!itopOffers.length) {
    console.log('Nenhuma oferta iTop encontrada.')
    return
  }

  console.log(`Ofertas iTop encontradas: ${itopOffers.length}`)

  let updatedOffers = 0
  for (const offer of itopOffers) {
    const { data: grids, error: gridError } = await supabase
      .from('global_offer_diopter_grids')
      .select('id,offer_id,sph_min,sph_max,cyl_min,cyl_max,add_min,add_max,metadata')
      .eq('offer_id', offer.id)

    if (gridError) throw gridError
    if (!grids?.length) continue

    const sample = grids[0]
    const cyl = normalizeRange(sample.cyl_min, sample.cyl_max)
    const add = normalizeRange(sample.add_min, sample.add_max)

    const label = `${offer.raw_label || ''} ${offer.canonical_label || ''}`.toLowerCase()
    const matched =
      TARGETS.find((entry) => label.includes(entry.match)) || {
        min: -15,
        max: 12,
      }

    const updatePayload = {
      sph_min: matched.min,
      sph_max: matched.max,
      cyl_min: cyl.min,
      cyl_max: cyl.max,
      add_min: add.min,
      add_max: add.max,
    }

    console.log('---')
    console.log('Oferta:', offer.canonical_label || offer.raw_label)
    console.log('Antes (exemplo):', {
      sph_min: sample.sph_min,
      sph_max: sample.sph_max,
      cyl_min: sample.cyl_min,
      cyl_max: sample.cyl_max,
      add_min: sample.add_min,
      add_max: sample.add_max,
    })
    console.log('Depois:', updatePayload)

    if (!commit) continue

    const { error: updateError } = await supabase
      .from('global_offer_diopter_grids')
      .update(updatePayload)
      .eq('offer_id', offer.id)

    if (updateError) throw updateError
    updatedOffers += 1
  }

  if (commit) {
    console.log(`Atualizações aplicadas: ${updatedOffers}`)
  } else {
    console.log('Rodou em modo seco. Use --commit para aplicar.')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
