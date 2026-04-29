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
const commit = args.includes('--commit')
const versionId = args.find((a) => a.startsWith('--version-id='))?.split('=')[1] || null

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function inferFulfillmentMode({ offer, family }) {
  const existing = offer.features?.fulfillment_mode
  if (existing === 'pronta' || existing === 'sob_demanda') {
    return existing
  }

  const descriptor = normalizeText(
    [
      family?.design || '',
      family?.nome || '',
      offer.raw_label,
      offer.canonical_label,
      offer.material,
      offer.source_page_reference,
    ]
      .filter(Boolean)
      .join(' '),
  )

  const hasProntaSignals = /(pronta|stock|acabada|acabado|lentes prontas|pronta entrega)/.test(descriptor)
  const hasSobDemandaSignals = /(surfac|surfa|sob demanda|digital)/.test(descriptor)

  if (offer.allows_composition === true && offer.is_atomic_offer !== true) return 'sob_demanda'
  if (offer.is_atomic_offer === true || offer.already_includes_treatment === true) return 'pronta'
  if (hasSobDemandaSignals && !hasProntaSignals) return 'sob_demanda'
  if (hasProntaSignals) return 'pronta'
  return 'pronta'
}

function enrichFeatures(features, mode) {
  return {
    ...(features || {}),
    fulfillment_mode: mode,
    pronta: mode === 'pronta',
    sob_demanda: mode === 'sob_demanda',
    potential_thinner_lighter: mode === 'sob_demanda',
    longer_lead_time: mode === 'sob_demanda',
    pronta_entrega: mode === 'pronta',
  }
}

async function fetchAll(table, selectClause, applyFilters, pageSize = 1000) {
  let from = 0
  const rows = []
  for (;;) {
    let query = supabase.from(table).select(selectClause)
    if (applyFilters) query = applyFilters(query)
    const { data, error } = await query.range(from, from + pageSize - 1)
    if (error) throw error
    const batch = data || []
    rows.push(...batch)
    if (batch.length < pageSize) break
    from += pageSize
  }
  return rows
}

async function main() {
  console.log(`DRY-RUN: ${commit ? 'NAO (aplicando)' : 'SIM'}`)
  if (versionId) {
    console.log(`Escopo: version_id=${versionId}`)
  } else {
    console.log('Escopo: TODAS as versoes')
  }
  console.log('')

  const families = await fetchAll(
    'global_lens_families',
    'id,version_id,nome,design',
    versionId ? (q) => q.eq('version_id', versionId) : null,
  )
  const familyById = new Map(families.map((f) => [f.id, f]))
  const familyIds = families.map((f) => f.id)

  if (!familyIds.length) {
    console.log('Nenhuma familia encontrada para o escopo informado.')
    return
  }

  const offers = []
  const batchSize = 500
  for (let i = 0; i < familyIds.length; i += batchSize) {
    const batchIds = familyIds.slice(i, i + batchSize)
    const batchOffers = await fetchAll(
      'global_lens_offers',
      'id,family_id,raw_label,canonical_label,material,source_page_reference,is_atomic_offer,allows_composition,already_includes_treatment,features',
      (q) => q.in('family_id', batchIds),
    )
    offers.push(...batchOffers)
  }

  let changed = 0
  const counters = {
    pronta: 0,
    sob_demanda: 0,
    untouched: 0,
  }

  for (const offer of offers) {
    const family = familyById.get(offer.family_id) || null
    const mode = inferFulfillmentMode({ offer, family })
    const nextFeatures = enrichFeatures(offer.features || {}, mode)
    const same = JSON.stringify(offer.features || {}) === JSON.stringify(nextFeatures)

    if (mode === 'pronta') counters.pronta += 1
    if (mode === 'sob_demanda') counters.sob_demanda += 1

    if (same) {
      counters.untouched += 1
      continue
    }

    changed += 1

    if (commit) {
      const { error } = await supabase
        .from('global_lens_offers')
        .update({ features: nextFeatures })
        .eq('id', offer.id)
      if (error) throw error
    }
  }

  console.log('Resumo:')
  console.log(`familias analisadas: ${families.length}`)
  console.log(`ofertas analisadas: ${offers.length}`)
  console.log(`ofertas com patch: ${changed}`)
  console.log(`ofertas sem mudanca: ${counters.untouched}`)
  console.log(`classificadas pronta: ${counters.pronta}`)
  console.log(`classificadas sob_demanda: ${counters.sob_demanda}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
