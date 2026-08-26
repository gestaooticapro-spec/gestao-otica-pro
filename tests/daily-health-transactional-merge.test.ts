import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync(
  new URL('../supabase/migrations/20260826100000_daily_health_transactional_record_merge.sql', import.meta.url),
  'utf8',
)

test('mesclagem cadastral e atomica, idempotente e restrita ao service role', () => {
  assert.match(migration, /create or replace function public\.merge_daily_health_duplicate_records/)
  assert.match(migration, /security definer/)
  assert.match(migration, /pg_advisory_xact_lock/)
  assert.match(migration, /operation_key uuid/)
  assert.match(migration, /where operation_key = p_operation_key/)
  assert.match(migration, /from pg_constraint/)
  assert.match(migration, /delete from public\.customers where id = any\(v_source_ids\)/)
  assert.match(migration, /delete from public\.products where id = any\(v_source_ids\)/)
  assert.match(migration, /insert into public\.daily_health_data_quality_review_events/)
  assert.match(migration, /revoke all on function[\s\S]+from public, anon, authenticated/)
  assert.match(migration, /grant execute on function[\s\S]+to service_role/)
})

test('mesclagem revalida conflitos criticos dentro da transacao', () => {
  assert.match(migration, /CPFs diferentes impedem a mesclagem/)
  assert.match(migration, /RGs diferentes impedem a mesclagem/)
  assert.match(migration, /datas de nascimento diferentes impedem a mesclagem/)
  assert.match(migration, /carteiras de credito precisam ser consolidadas/)
  assert.match(migration, /referencias diferentes impedem a mesclagem/)
  assert.match(migration, /codigos de barras diferentes impedem a mesclagem/)
  assert.match(migration, /tipos de produto diferentes impedem a mesclagem/)
})
