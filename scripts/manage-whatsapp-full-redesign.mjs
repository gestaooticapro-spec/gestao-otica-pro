import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { loadEnvConfig } = require('@next/env')
const { Client } = require('pg')

// No sending, replay, customer updates or conversation resets are performed.
loadEnvConfig(process.cwd())
const command = process.argv[2]
const productionOrigin = 'https://gestao-otica-pro.vercel.app'

async function main() {
  if (!['status', 'activate', 'rollback'].includes(command) || process.argv.length !== 3) {
    throw new Error('Use: node scripts/manage-whatsapp-full-redesign.mjs status|activate|rollback')
  }
  if (!process.env.SUPABASE_DB_URL) throw new Error('Database access is unavailable')
  if (command === 'activate') {
    const secret = process.env.WHATSAPP_INTERNAL_SECRET || process.env.CRON_SECRET
    if (!secret) throw new Error('Missing internal credential for deployment verification')
    const response = await fetch(`${productionOrigin}/api/whatsapp/redesign/capabilities`, {
      headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) throw new Error(`Deployment verification failed: HTTP ${response.status}`)
    const capability = await response.json()
    if (capability.decisionProcessorVersion !== 2
      || !capability.fullRoutingStoreIds?.includes(1)) {
      throw new Error('The production deployment does not support full routing for Store 1')
    }
  }

  const db = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } })
  await db.connect()
  try {
    await db.query('begin')
    const { rows: [store] } = await db.query('select settings from public.stores where id=1 for update')
    if (!store) throw new Error('Store 1 is unavailable')
    const automation = store.settings?.whatsapp_automation
    const { rows: [checks] } = await db.query(`select
      exists(select 1 from public.whatsapp_store_channels where store_id=1 and is_active and connection_status='connected') connected,
      to_regclass('public.whatsapp_inbound_processing_events') is not null trace_available,
      position('v_conversation.store_id = 1' in pg_get_functiondef('public.finish_whatsapp_redesign_shadow_turn(uuid,jsonb)'::regprocedure)) > 0 full_mode_rpc,
      exists(select 1 from pg_constraint where conrelid='public.whatsapp_conversation_states'::regclass
        and contype='c' and pg_get_constraintdef(oid) like '%awaiting_human%') handoff_state_supported`)
    if (command === 'status') {
      console.log(JSON.stringify({ storeId: 1, mode: automation?.ai_redesign?.mode,
        safeRepliesEnabled: automation?.ai_redesign?.safe_replies_enabled === true, ...checks }))
      await db.query('rollback')
      return
    }
    if (command === 'activate' && (automation?.enabled !== true || automation?.ai_responder?.enabled !== true
      || !store.settings?.store_hours || !Object.values(checks).every(Boolean))) {
      throw new Error('Store 1 prerequisites are incomplete; no setting was changed')
    }
    const mode = command === 'activate' ? 'redesign' : 'shadow'
    await db.query(`update public.stores set settings=jsonb_set(settings, '{whatsapp_automation}',
      coalesce(settings->'whatsapp_automation','{}'::jsonb) || jsonb_build_object('ai_redesign',
        coalesce(settings#>'{whatsapp_automation,ai_redesign}','{}'::jsonb)
        || jsonb_build_object('mode',$1::text,'safe_replies_enabled',true))) where id=1`, [mode])
    const { rows: [verified] } = await db.query(`select settings#>>'{whatsapp_automation,ai_redesign,mode}' mode
      from public.stores where id=1`)
    if (verified.mode !== mode) throw new Error('Configuration verification failed')
    await db.query('commit')
    console.log(JSON.stringify({ storeId: 1, mode, safeRepliesEnabled: true,
      conversationHistoryPreserved: true, captureCacheMaxDelaySeconds: 60 }))
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
