import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('deletePagamento autentica o usuario e recusa pagamentos de parcela', () => {
  const source = readFileSync(
    new URL('../src/lib/actions/vendas.actions.ts', import.meta.url),
    'utf8',
  )
  const start = source.indexOf('export async function deletePagamento(')
  const end = source.indexOf('// ================================================================\n// HELPER:', start)
  const action = source.slice(start, end)

  assert.match(action, /createClient\(\)\.auth\.getUser\(\)/)
  assert.match(action, /getProfileByAdmin\(user\.id\)/)
  assert.match(action, /pagamento\.parcela_id != null/)
  assert.match(action, /\.is\('parcela_id', null\)/)
  assert.match(action, /\.eq\('tenant_id', profile\.tenant_id\)/)
})
