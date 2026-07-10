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

const commit = process.argv.includes('--commit')

const ESSILOR_VERSION_ID = '99497d03-50bf-46b7-a7ab-8cb19e80db5a'
const OPTILAB_VERSION_ID = 'a4886a73-bc92-4b14-9c47-152ef0c78078'

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[®™]/g, '')
    .replace(/[^a-z0-9.]+/gi, ' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function mergeFeatures(offer, label) {
  const features = offer.features && typeof offer.features === 'object' ? offer.features : {}
  return {
    ...features,
    sport: true,
    multifocal_especial: true,
    ...(label.includes('sportwrap') ? { sportwrap: true } : {}),
  }
}

async function fetchFamily(versionId, names) {
  const { data, error } = await supabase
    .from('global_lens_families')
    .select('id,version_id,nome,clinical_category,tags_uso,tags_beneficios')
    .eq('version_id', versionId)
  if (error) throw error

  const wanted = new Set(names.map(normalize))
  return (data || []).find((family) => wanted.has(normalize(family.nome))) || null
}

async function patchEssilorVariluxSport() {
  const family = await fetchFamily(ESSILOR_VERSION_ID, ['Varilux Sport'])
  if (!family) {
    console.log('[skip] Familia Essilor Varilux Sport nao encontrada')
    return { familyUpdates: 0, offerUpdates: 0 }
  }

  let familyUpdates = 0
  if (family.clinical_category !== 'multifocal') {
    familyUpdates = 1
    console.log('[family:multifocal]', family.nome, family.clinical_category, '=> multifocal')
    if (commit) {
      const { error } = await supabase
        .from('global_lens_families')
        .update({ clinical_category: 'multifocal' })
        .eq('id', family.id)
      if (error) throw error
    }
  }

  const { data: offers, error: offerErr } = await supabase
    .from('global_lens_offers')
    .select('id,canonical_label,raw_label,clinical_category,features')
    .eq('family_id', family.id)
    .neq('clinical_category', 'multifocal')
  if (offerErr) throw offerErr

  let offerUpdates = 0
  for (const offer of offers || []) {
    const label = normalize(`${offer.canonical_label || ''} ${offer.raw_label || ''}`)
    offerUpdates += 1
    console.log('[offer:essilor-sport-multifocal]', offer.canonical_label || offer.raw_label)
    if (commit) {
      const { error } = await supabase
        .from('global_lens_offers')
        .update({
          clinical_category: 'multifocal',
          features: mergeFeatures(offer, label),
        })
        .eq('id', offer.id)
      if (error) throw error
    }
  }

  return { familyUpdates, offerUpdates }
}

async function patchOptilabActivitiesSportwrap() {
  const family = await fetchFamily(OPTILAB_VERSION_ID, ['VARILUX® ACTIVITIES', 'Varilux Activities'])
  if (!family) {
    console.log('[skip] Familia Optilab Varilux Activities nao encontrada')
    return { offerUpdates: 0 }
  }

  const { data: offers, error: offerErr } = await supabase
    .from('global_lens_offers')
    .select('id,canonical_label,raw_label,clinical_category,features')
    .eq('family_id', family.id)
  if (offerErr) throw offerErr

  let offerUpdates = 0
  for (const offer of offers || []) {
    const label = normalize(`${offer.canonical_label || ''} ${offer.raw_label || ''}`)
    if (!label.includes('sport') || offer.clinical_category === 'multifocal') continue

    offerUpdates += 1
    console.log('[offer:optilab-activities-sport-multifocal]', offer.canonical_label || offer.raw_label)
    if (commit) {
      const { error } = await supabase
        .from('global_lens_offers')
        .update({
          clinical_category: 'multifocal',
          features: mergeFeatures(offer, label),
        })
        .eq('id', offer.id)
      if (error) throw error
    }
  }

  return { offerUpdates }
}

async function reportRemainingOfferLevelMista() {
  const { data, error } = await supabase
    .from('global_lens_offers')
    .select('id,canonical_label,raw_label,clinical_category,family:global_lens_families(nome,version_id)')
    .eq('clinical_category', 'mista')
  if (error) throw error

  console.log('- Ofertas restantes com clinical_category=mista:', (data || []).length)
  for (const offer of data || []) {
    console.log(
      '  [remaining:mista]',
      offer.family?.nome || 'familia?',
      '|',
      offer.canonical_label || offer.raw_label,
    )
  }
}

async function main() {
  const essilor = await patchEssilorVariluxSport()
  const optilab = await patchOptilabActivitiesSportwrap()

  console.log('Resumo:')
  console.log('- Familias ajustadas:', essilor.familyUpdates)
  console.log('- Ofertas Essilor Sport ajustadas:', essilor.offerUpdates)
  console.log('- Ofertas Optilab Sport/Sportwrap ajustadas:', optilab.offerUpdates)
  await reportRemainingOfferLevelMista()
  console.log(commit ? 'Aplicado.' : 'Modo seco. Use --commit para aplicar.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
