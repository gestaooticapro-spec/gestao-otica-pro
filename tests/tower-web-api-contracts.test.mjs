import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('contratos web v1 autenticam o token do equipamento e limitam o acesso por loja', async () => {
  const [customers, context, sessions, commands] = await Promise.all([
    read('src/app/api/tower/v1/web/customers/route.ts'),
    read('src/app/api/tower/v1/web/session-context/route.ts'),
    read('src/app/api/tower/v1/web/sessions/route.ts'),
    read('src/app/api/tower/v1/web/sessions/commands/route.ts'),
  ])

  for (const source of [customers, context, sessions, commands]) {
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
})
