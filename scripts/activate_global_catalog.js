import dotenv from 'dotenv'
import path from 'path'
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
const storeId = Number(args.find((arg) => arg.startsWith('--store='))?.split('=')[1] || 1)
const laboratorio = args.find((arg) => arg.startsWith('--laboratorio='))?.split('=')[1] || 'HOYA'
const versao = args.find((arg) => arg.startsWith('--versao='))?.split('=')[1] || 'HOYA Dezembro 2025'
const pageSize = 1000
const chunkSize = 500

async function fetchAll(queryFactory) {
  const rows = []

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await queryFactory().range(from, from + pageSize - 1)
    if (error) throw error

    const page = data || []
    rows.push(...page)
    if (page.length < pageSize) break
  }

  return rows
}

function chunkValues(values, size = chunkSize) {
  const chunks = []
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }
  return chunks
}

async function main() {
  const now = new Date().toISOString()

  const { data: version, error: versionError } = await supabase
    .from('global_catalog_versions')
    .select('id,laboratorio')
    .eq('laboratorio', laboratorio)
    .eq('versao', versao)
    .single()

  if (versionError || !version) {
    console.error('Versao global nao encontrada.', versionError)
    process.exit(1)
  }

  const { data: existingActivation } = await supabase
    .from('tenant_catalog_activations')
    .select('tenant_id')
    .eq('store_id', storeId)
    .limit(1)
    .single()

  let tenantId = existingActivation?.tenant_id || null
  if (!tenantId) {
    const { data: storeRow, error: storeError } = await supabase
      .from('stores')
      .select('tenant_id')
      .eq('id', storeId)
      .single()

    if (storeError || !storeRow) {
      console.error('Nao foi possivel identificar o tenant da loja.', storeError)
      process.exit(1)
    }
    tenantId = storeRow.tenant_id
  }

  const { data: sameLabVersions, error: sameLabVersionsError } = await supabase
    .from('global_catalog_versions')
    .select('id')
    .eq('laboratorio', version.laboratorio)

  if (sameLabVersionsError) throw sameLabVersionsError

  const sameLabVersionIds = (sameLabVersions || []).map((row) => row.id)
  if (sameLabVersionIds.length) {
    const { error: deactivateSameLabError } = await supabase
      .from('tenant_catalog_activations')
      .update({ status: 'inactive' })
      .eq('store_id', storeId)
      .eq('status', 'active')
      .in('global_version_id', sameLabVersionIds)
      .neq('global_version_id', version.id)
    if (deactivateSameLabError) throw deactivateSameLabError
  }

  const { data: activation, error: activationError } = await supabase
    .from('tenant_catalog_activations')
    .upsert(
      {
        tenant_id: tenantId,
        store_id: storeId,
        global_version_id: version.id,
        status: 'active',
        activated_at: now,
        last_synced_at: now,
      },
      { onConflict: 'store_id,global_version_id' }
    )
    .select('id')
    .single()

  if (activationError || !activation) {
    console.error('Nao foi possivel ativar o catalogo.', activationError)
    process.exit(1)
  }

  const familyIds = await fetchAll(() =>
    supabase
      .from('global_lens_families')
      .select('id')
      .eq('version_id', version.id),
  )

  const ids = familyIds.map((row) => row.id)
  const offers = []
  for (const chunk of chunkValues(ids)) {
    offers.push(
      ...(await fetchAll(() =>
        supabase
          .from('global_lens_offers')
          .select('id,canonical_label,raw_label,features')
          .in('family_id', chunk),
      )),
    )
  }

  const existingOffers = await fetchAll(() =>
    supabase
      .from('tenant_commercial_offers')
      .select('global_offer_id')
      .eq('activation_id', activation.id),
  )

  const existingOfferIds = new Set(existingOffers.map((row) => row.global_offer_id))

  const missingOffers = offers
    .filter((offer) => !existingOfferIds.has(offer.id))
    .map((offer) => ({
      activation_id: activation.id,
      tenant_id: tenantId,
      store_id: storeId,
      global_offer_id: offer.id,
      display_name: offer.canonical_label || offer.raw_label || null,
      price_cost:
        offer.features && typeof offer.features === 'object' && offer.features.cost_price != null
          ? Number(offer.features.cost_price)
          : null,
    }))

  if (missingOffers.length) {
    for (const chunk of chunkValues(missingOffers)) {
      const { error } = await supabase
        .from('tenant_commercial_offers')
        .upsert(chunk, { onConflict: 'activation_id,global_offer_id' })
      if (error) throw error
    }
  }

  await supabase
    .from('tenant_catalog_activations')
    .update({ status: 'active', last_synced_at: now })
    .eq('id', activation.id)

  console.log('Catalogo ativado na loja.')
  console.log({ activationId: activation.id, offersImported: missingOffers.length })
}

main().catch((error) => {
  console.error('Falha ao ativar catalogo global:', error.message || error)
  process.exit(1)
})
