import assert from 'node:assert/strict'
import test from 'node:test'
import Module from 'node:module'

let profile: any = { tenant_id: 'tenant-1', store_id: 3, role: 'store_operator' }
let user: any = { id: 'user-1' }
let saved: any[] = []
const admin = { from: (table: string) => table === 'stores'
  ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { tenant_id: 'tenant-1' }, error: null }) }) }) }
  : { upsert: async (row: any) => { saved.push(row); return { error: null } } } }
const loader = Module as unknown as { _load: (...args: any[]) => unknown }
const original = loader._load
loader._load = function (...args: any[]) {
  if (args[0] === '@/lib/supabase/server') return { createAsyncClient: async () => ({ auth: { getUser: async () => ({ data: { user }, error: null }) } }) }
  if (args[0] === '@/lib/supabase/admin') return { createAdminClient: () => admin, getProfileByAdmin: async () => profile }
  return original.apply(this, args)
}
const { POST } = require('../src/app/api/usage-assistant/feedback/route') as typeof import('../src/app/api/usage-assistant/feedback/route')
loader._load = original
const payload = { id: 'a329ff66-72cc-4a79-9366-2453378e629f', storeId: 3, question: 'Como recebo?', answer: 'Abra parcelas.' }
const request = (body: unknown, origin = 'http://localhost:3000') => new Request('http://localhost:3000/api/usage-assistant/feedback', { method: 'POST', headers: { origin }, body: JSON.stringify(body) })

test('salva pergunta e resposta com usuário e loja confirmados', async () => {
  saved = []
  const response = await POST(request(payload))
  assert.equal(response.status, 200)
  assert.deepEqual(saved[0], { id: payload.id, tenant_id: 'tenant-1', store_id: 3, user_id: 'user-1', question: payload.question, answer: payload.answer })
})

test('impede acesso indevido e dados inválidos', async () => {
  saved = []
  assert.equal((await POST(request(payload, 'http://externo.test'))).status, 403)
  user = null
  assert.equal((await POST(request(payload))).status, 401)
  user = { id: 'user-1' }
  assert.equal((await POST(request({ ...payload, answer: '' }))).status, 400)
  profile = { tenant_id: 'outro', store_id: 3, role: 'store_operator' }
  assert.equal((await POST(request(payload))).status, 403)
  profile = { tenant_id: 'tenant-1', store_id: 3, role: 'store_operator' }
  assert.equal(saved.length, 0)
})
