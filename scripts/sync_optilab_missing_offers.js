/**
 * sync_optilab_missing_offers.js
 *
 * Importa para tenant_commercial_offers as ofertas do catálogo global da Optilab
 * que ainda não foram sincronizadas na ativação ativa da loja 1.
 *
 * Usage:
 *   node scripts/sync_optilab_missing_offers.js          # dry-run
 *   node scripts/sync_optilab_missing_offers.js --commit # aplica no banco
 */

import path from 'path'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const COMMIT = process.argv.includes('--commit')
const ACTIVATION_ID = 'c3a2bd7f-f6f7-4697-a87c-fcf8c32ec032'
const VERSION_ID    = 'a4886a73-bc92-4b14-9c47-152ef0c78078'
const TENANT_ID     = '40b34e90-4c9d-4446-b775-770a3e77d6c0'
const STORE_ID      = 1

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// --- Helpers ----------------------------------------------------------------

async function fetchAll(table, query) {
  const { data, error } = await query
  if (error) throw new Error(`[${table}] ${error.message}`)
  return data || []
}

// --- Main -------------------------------------------------------------------

console.log(`\n=== sync_optilab_missing_offers [${COMMIT ? 'COMMIT' : 'DRY-RUN'}] ===\n`)

// 1. Carregar todas as ofertas do catálogo global para essa versão
const families = await fetchAll('global_lens_families',
  supabase.from('global_lens_families').select('id').eq('version_id', VERSION_ID)
)
const familyIds = families.map(f => f.id)
console.log(`Famílias no catálogo global: ${familyIds.length}`)

const globalOffers = await fetchAll('global_lens_offers',
  supabase.from('global_lens_offers')
    .select('id, family_id, canonical_label, raw_label, features')
    .in('family_id', familyIds)
)
console.log(`Ofertas no catálogo global: ${globalOffers.length}`)

// 2. Carregar o que já está importado no tenant
const existingRows = await fetchAll('tenant_commercial_offers',
  supabase.from('tenant_commercial_offers')
    .select('global_offer_id')
    .eq('activation_id', ACTIVATION_ID)
)
const existingIds = new Set(existingRows.map(r => r.global_offer_id))
console.log(`Já importadas na loja: ${existingIds.size}`)

// 3. Identificar as faltantes
const missing = globalOffers.filter(o => !existingIds.has(o.id))
console.log(`Faltando importar: ${missing.length}\n`)

if (missing.length === 0) {
  console.log('Nenhuma oferta faltando. Tudo sincronizado.')
  process.exit(0)
}

// 4. Mostrar resumo por família
const familyNames = await fetchAll('global_lens_families',
  supabase.from('global_lens_families').select('id, nome').in('id', familyIds)
)
const familyMap = new Map(familyNames.map(f => [f.id, f.nome]))

const byFamily = {}
for (const o of missing) {
  const nome = familyMap.get(o.family_id) || o.family_id
  byFamily[nome] = (byFamily[nome] || 0) + 1
}
console.log('Ofertas a importar por família:')
Object.entries(byFamily).sort((a, b) => a[0].localeCompare(b[0])).forEach(([nome, count]) => {
  console.log(`  ${nome}: +${count}`)
})
console.log()

if (!COMMIT) {
  console.log('DRY-RUN: passe --commit para aplicar.')
  process.exit(0)
}

// 5. Inserir
const rows = missing.map(o => ({
  activation_id: ACTIVATION_ID,
  tenant_id:     TENANT_ID,
  store_id:      STORE_ID,
  global_offer_id: o.id,
  display_name:  o.canonical_label || o.raw_label || null,
  price_cost:    (o.features && o.features.cost_price != null) ? Number(o.features.cost_price) : null,
}))

const CHUNK = 100
let inserted = 0
for (let i = 0; i < rows.length; i += CHUNK) {
  const chunk = rows.slice(i, i + CHUNK)
  const { error } = await supabase
    .from('tenant_commercial_offers')
    .upsert(chunk, { onConflict: 'activation_id,global_offer_id' })
  if (error) throw new Error(`Erro ao inserir chunk: ${error.message}`)
  inserted += chunk.length
  console.log(`  Inseridos: ${inserted}/${rows.length}`)
}

// 6. Atualizar last_synced_at na ativação
const { error: syncError } = await supabase
  .from('tenant_catalog_activations')
  .update({ last_synced_at: new Date().toISOString() })
  .eq('id', ACTIVATION_ID)
if (syncError) throw new Error(`Erro ao atualizar last_synced_at: ${syncError.message}`)

console.log(`\n✓ ${inserted} ofertas importadas com sucesso.`)
