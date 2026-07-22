import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('contratos web v1 autenticam o token do equipamento e limitam o acesso por loja', async () => {
  const [access, customers, context, sessions, commands, measurements, measurementMigration] = await Promise.all([
    read('src/app/api/tower/v1/web/access/route.ts'),
    read('src/app/api/tower/v1/web/customers/route.ts'),
    read('src/app/api/tower/v1/web/session-context/route.ts'),
    read('src/app/api/tower/v1/web/sessions/route.ts'),
    read('src/app/api/tower/v1/web/sessions/commands/route.ts'),
    read('src/app/api/tower/v1/web/measurements/route.ts'),
    read('supabase/migrations/20260722100000_tower_web_measurements.sql'),
  ])

  for (const source of [access, customers, context, sessions, commands, measurements]) {
    assert.match(source, /Bearer /)
    assert.match(source, /authenticateTowerDeviceWebSessionToken/)
    assert.match(source, /parsed\.data\.storeId/)
  }

  assert.match(customers, /\.eq\('store_id', parsed\.data\.storeId\)/)
  assert.match(context, /\.eq\('store_id', parsed\.data\.storeId\)/)
  assert.match(sessions, /tenant_id: auth\.tenantId/)
  assert.match(commands, /evaluation\.tenant_id !== auth\.tenantId/)
  assert.match(commands, /session\.status !== 'active'/)
  assert.match(commands, /tower_heatmap_sessions/)
  assert.match(access, /deviceId: auth\.deviceId/)
  assert.match(measurements, /save_tower_web_measurement/)
  assert.match(measurements, /p_result_id: parsed\.data\.operationId/)
  assert.match(measurementMigration, /FOR UPDATE/)
  assert.match(measurementMigration, /existing_result\.id/)
  assert.match(measurementMigration, /REVOKE ALL ON FUNCTION public\.save_tower_web_measurement/)
})
