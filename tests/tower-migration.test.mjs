import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const sql = await readFile(
  new URL('../supabase/migrations/20260718103000_harden_tower_asset_operations.sql', import.meta.url),
  'utf8',
)
const remoteConfigSql = await readFile(
  new URL('../supabase/migrations/20260718104000_tower_remote_configuration.sql', import.meta.url),
  'utf8',
)
const offlineSyncSql = await readFile(
  new URL('../supabase/migrations/20260720100000_tower_offline_sync.sql', import.meta.url),
  'utf8',
)
const offlineCustomerSql = await readFile(
  new URL('../supabase/migrations/20260720101000_tower_offline_customer_fallback.sql', import.meta.url),
  'utf8',
)
const hardwareValidationSql = await readFile(
  new URL('../supabase/migrations/20260720102000_tower_hardware_validations.sql', import.meta.url),
  'utf8',
)
const offlineCustomerFixSql = await readFile(
  new URL('../supabase/migrations/20260720110000_fix_tower_sync_customer_mapping_ambiguity.sql', import.meta.url),
  'utf8',
)
const offlineFirstOperationalSql = await readFile(
  new URL('../supabase/migrations/20260727190000_tower_offline_first_operational_sync.sql', import.meta.url),
  'utf8',
)
const adminPinRecoverySql = await readFile(
  new URL('../supabase/migrations/20260727213000_tower_admin_pin_recovery.sql', import.meta.url),
  'utf8',
)
const customerReportSql = await readFile(
  new URL('../supabase/migrations/20260731160000_tower_customer_report_shares.sql', import.meta.url),
  'utf8',
)
const customerReportAssetKindsSql = await readFile(
  new URL('../supabase/migrations/20260803190000_tower_customer_report_asset_kinds.sql', import.meta.url),
  'utf8',
)

test('migração corretiva protege exclusao de loja e imprime lote atomicamente', () => {
  assert.match(sql, /current_store_id\) REFERENCES public\.stores\(id\) ON DELETE RESTRICT/)
  assert.match(sql, /FUNCTION public\.mark_tower_asset_batch_printed/)
})

test('rate limit compartilhado fica sob RLS e acessivel apenas ao service role', () => {
  assert.match(sql, /tower_activation_rate_limits ENABLE ROW LEVEL SECURITY/)
  assert.match(sql, /REVOKE ALL ON TABLE public\.tower_activation_rate_limits FROM PUBLIC, anon, authenticated/)
  assert.match(sql, /consume_tower_activation_rate_limit/)
})

test('pareamento e reassociacao usam a mesma ordem de advisory locks', () => {
  const assetLocks = sql.match(/pg_advisory_xact_lock\(hashtextextended\('tower-asset:'/g) || []
  const storeLocks = sql.match(/pg_advisory_xact_lock\(hashtextextended\('tower-store:'/g) || []
  assert.equal(assetLocks.length, 2)
  assert.equal(storeLocks.length, 2)
})

test('configuracao remota faz merge atomico e fica restrita ao service role', () => {
  assert.match(remoteConfigSql, /COALESCE\(store\.settings, '\{\}'::JSONB\) \|\| jsonb_build_object/)
  assert.match(remoteConfigSql, /tower_remote_config/)
  assert.match(remoteConfigSql, /REVOKE ALL ON FUNCTION public\.set_tower_remote_config\(BIGINT, JSONB\) FROM PUBLIC, anon, authenticated/)
  assert.match(remoteConfigSql, /GRANT EXECUTE ON FUNCTION public\.set_tower_remote_config\(BIGINT, JSONB\) TO service_role/)
})

test('acesso comercial separa link e PIN, usa RLS e bloqueio atomico', () => {
  assert.match(remoteConfigSql, /CREATE TABLE IF NOT EXISTS public\.tower_remote_config_access/)
  assert.match(remoteConfigSql, /public_code TEXT NOT NULL UNIQUE/)
  assert.match(remoteConfigSql, /pin_hash TEXT NOT NULL/)
  assert.match(remoteConfigSql, /tower_remote_config_access ENABLE ROW LEVEL SECURITY/)
  assert.match(remoteConfigSql, /FUNCTION public\.record_tower_remote_config_pin_attempt/)
  assert.match(remoteConfigSql, /next_failed_attempts >= 5/)
  assert.match(remoteConfigSql, /GRANT EXECUTE ON FUNCTION public\.rotate_tower_remote_config_access\(BIGINT, TEXT, TEXT\) TO service_role/)
})

test('sincronizacao offline deriva escopo do dispositivo e registra recibo atomicamente', () => {
  assert.match(offlineSyncSql, /WHERE device\.id = p_device_id AND device\.status = 'active'/)
  assert.match(offlineSyncSql, /CREATE TABLE IF NOT EXISTS public\.tower_device_sync_events/)
  assert.match(offlineSyncSql, /existing_event\.payload_hash <> p_payload_hash/)
  assert.match(offlineSyncSql, /INSERT INTO public\.tower_device_sync_events/)
  assert.match(offlineSyncSql, /GRANT EXECUTE ON FUNCTION public\.apply_tower_device_sync_event[\s\S]*TO service_role/)
})

test('cliente provisório recebe mapeamento idempotente sem confiar na loja enviada', () => {
  assert.match(offlineCustomerSql, /CREATE TABLE IF NOT EXISTS public\.tower_device_customer_mappings/)
  assert.match(offlineCustomerSql, /WHERE device\.id = p_device_id AND device\.status = 'active'/)
  assert.match(offlineCustomerSql, /PRIMARY KEY \(device_id, local_customer_id\)/)
  assert.match(offlineCustomerSql, /TOWER_SYNC_CUSTOMER_NAME_CONFLICT/)
  assert.match(offlineCustomerSql, /FUNCTION public\.apply_tower_device_sync_event_v2/)
  assert.match(offlineCustomerSql, /TO service_role/)
})

test('sync v3 delega eventos operacionais para a v2 corrigida', () => {
  assert.match(hardwareValidationSql, /FUNCTION public\.apply_tower_device_sync_event_v3/)
  assert.match(hardwareValidationSql, /RETURN public\.apply_tower_device_sync_event_v2/)
  assert.match(offlineCustomerFixSql, /FUNCTION public\.apply_tower_device_sync_event_v2/)
})

test('sync v4 persiste Campo Visual e avaliacao local com mapeamento idempotente', () => {
  assert.match(offlineFirstOperationalSql, /CREATE TABLE IF NOT EXISTS public\.tower_device_evaluation_mappings/)
  assert.match(offlineFirstOperationalSql, /PRIMARY KEY \(device_id, local_evaluation_id\)/)
  assert.match(offlineFirstOperationalSql, /'tower_heatmap\.upsert'/)
  assert.match(offlineFirstOperationalSql, /'tower_evaluation\.upsert'/)
  assert.match(offlineFirstOperationalSql, /FUNCTION public\.apply_tower_device_sync_event_v4/)
  assert.match(offlineFirstOperationalSql, /RETURN public\.apply_tower_device_sync_event_v3/)
  assert.match(offlineFirstOperationalSql, /requested_remote_customer_id/)
  assert.match(offlineFirstOperationalSql, /SET full_name = normalized_name/)
  assert.match(offlineFirstOperationalSql, /TOWER_SYNC_CUSTOMER_SCOPE_INVALID/)
  assert.match(offlineFirstOperationalSql, /UPDATE public\.tower_heatmap_sessions AS heatmap/)
  assert.match(offlineFirstOperationalSql, /GRANT EXECUTE ON FUNCTION public\.apply_tower_device_sync_event_v4[\s\S]*TO service_role/)
})

test('recuperacao de PIN e temporaria, atomica e restrita ao service role', () => {
  assert.match(adminPinRecoverySql, /CREATE TABLE IF NOT EXISTS public\.tower_admin_pin_recoveries/)
  assert.match(adminPinRecoverySql, /status IN \('pending', 'consumed', 'revoked'\)/)
  assert.match(adminPinRecoverySql, /FUNCTION public\.issue_tower_admin_pin_recovery/)
  assert.match(adminPinRecoverySql, /FUNCTION public\.consume_tower_admin_pin_recovery/)
  assert.match(adminPinRecoverySql, /device\.status = 'active'/)
  assert.match(adminPinRecoverySql, /recovery\.expires_at > NOW\(\)/)
  assert.match(adminPinRecoverySql, /consumed_by_device_id = p_device_id/)
  assert.match(adminPinRecoverySql, /tower_store_admin_pins/)
  assert.match(adminPinRecoverySql, /TO service_role/)
})

test('relatorios temporarios sao aditivos, privados e isolados do sync operacional', () => {
  assert.match(customerReportSql, /CREATE TABLE IF NOT EXISTS public\.tower_customer_report_shares/)
  assert.match(customerReportSql, /CREATE TABLE IF NOT EXISTS public\.tower_customer_report_assets/)
  assert.match(customerReportSql, /audience IN \('customer', 'retailer_export'\)/)
  assert.match(customerReportSql, /status IN \('preparing', 'published', 'expired', 'revoked', 'failed'\)/)
  assert.match(customerReportSql, /tower_customer_report_shares ENABLE ROW LEVEL SECURITY/)
  assert.match(customerReportSql, /tower_customer_report_assets ENABLE ROW LEVEL SECURITY/)
  assert.match(customerReportSql, /'tower-customer-reports'/)
  assert.match(customerReportSql, /FALSE,/)
  assert.doesNotMatch(customerReportSql, /ALTER TABLE public\.tower_sessions/)
  assert.doesNotMatch(customerReportSql, /apply_tower_device_sync_event/)
  for (const kind of ['visagismo_analysis', 'visagismo_final', 'measurement_front_annotated', 'measurement_profile_annotated', 'heatmap']) {
    assert.match(customerReportAssetKindsSql, new RegExp(kind))
  }
  assert.match(customerReportAssetKindsSql, /DROP CONSTRAINT IF EXISTS tower_customer_report_assets_kind_check/)
})
