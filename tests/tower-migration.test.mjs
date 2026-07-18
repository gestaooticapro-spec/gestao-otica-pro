import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const sql = await readFile(
  new URL('../supabase/migrations/20260718103000_harden_tower_asset_operations.sql', import.meta.url),
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
