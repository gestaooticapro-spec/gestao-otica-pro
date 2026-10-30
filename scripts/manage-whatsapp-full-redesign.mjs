import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { loadEnvConfig } = require('@next/env')
const { Client } = require('pg')

// No sending, replay, customer updates or conversation resets are performed.
loadEnvConfig(process.cwd())
const command = process.argv[2]
const storeId = Number(process.argv[3])
// The attendance engine is no longer a per-store choice. This probe is read-only.
async function main() {
  if (command !== 'status' || process.argv.length !== 4 || !Number.isSafeInteger(storeId) || storeId <= 0) {
    throw new Error('O redesign e o padrao. Use somente: node scripts/manage-whatsapp-full-redesign.mjs status <storeId>. Para ligar/desligar o WhatsApp, use as configuracoes da loja.')
  }
  if (!process.env.SUPABASE_DB_URL) throw new Error('Database access is unavailable')
  const db = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } })
  await db.connect()
  try {
    await db.query('begin read only')
    const { rows: [store] } = await db.query('select tenant_id, settings from public.stores where id=$1', [storeId])
    if (!store) throw new Error('The selected store is unavailable')
    const automation = store.settings?.whatsapp_automation
    const { rows: [checks] } = await db.query(`select
      (select count(*)=1 and bool_and(tenant_id=$2 and connection_status='connected')
        from public.whatsapp_store_channels where store_id=$1 and is_active) connected,
      to_regclass('public.whatsapp_inbound_processing_events') is not null trace_available,
      exists(select 1 from supabase_migrations.schema_migrations where version='20261030120000') full_mode_rpc,
      exists(select 1 from pg_constraint where conrelid='public.whatsapp_conversation_states'::regclass
        and contype='c' and pg_get_constraintdef(oid) like '%awaiting_human%') handoff_state_supported`, [storeId, store.tenant_id])
    console.log(JSON.stringify({ storeId, attendanceEngine: 'redesign', requiresRedesignActivation: false,
      automationEnabled: automation?.enabled !== false, aiResponderEnabled: automation?.ai_responder?.enabled === true,
      hasStoreHours: Boolean(store.settings?.store_hours), ...checks }))
    await db.query('rollback')
  } catch (error) {
    await db.query('rollback')
    throw error
  } finally {
    await db.end()
  }
}
main().catch(error => {
  // Driver/network errors may contain credentials; print only their code.
  console.error(error.code ? `Operation failed: ${error.code}`
    : error instanceof TypeError ? 'Network or response validation failed' : error.message)
  process.exitCode = 1
})
