import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const nativeRequire = createRequire(import.meta.url)
const root = resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const clone = value => JSON.parse(JSON.stringify(value))

// Run the real action/client with synthetic storage and no real HTTP or secrets.
function load(file, mocks = {}, globals = {}) {
  const cache = new Map()
  function moduleAt(path) {
    if (!existsSync(path)) path += '.ts'
    if (cache.has(path)) return cache.get(path).exports
    const module = { exports: {} }
    cache.set(path, module)
    const source = ts.transpileModule(readFileSync(path, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText
    const require = id => {
      if (id in mocks) return mocks[id]
      if (id.startsWith('@/')) return moduleAt(resolve(root, 'src', id.slice(2)))
      if (id.startsWith('.')) return moduleAt(resolve(dirname(path), id))
      return nativeRequire(id)
    }
    runInNewContext(source, { module, exports: module.exports, require,
      process: { env: { NUVEMFISCAL_PROD_URL: 'https://provider.invalid', NUVEMFISCAL_HOM_URL: 'https://provider.invalid' } },
      console: { log() {}, error() {}, warn() {} }, AbortSignal, URL, fetch: () => { throw Error('Unexpected HTTP') },
      ...globals }, { filename: path })
    return module.exports
  }
  return moduleAt(resolve(root, file))
}

const store = { id: 1, tenant_id: 'tenant-a', cnpj: '11222333000181', name: 'Loja de teste',
  razao_social: 'Loja', street: 'Rua', number: '1', neighborhood: 'Centro', city: 'Curitiba',
  state: 'PR', cep: '80000000', codigo_municipio_ibge: '4106902', inscricao_estadual: '123', nfce_serie: 2 }
const customer = { id: 11, tenant_id: 'tenant-a', store_id: 1, person_type: 'PF',
  full_name: 'Cliente da venda', cpf: '52998224725', email: 'cliente@example.test',
  rua: 'Rua do cadastro', numero: '2', bairro: 'Centro', cidade: 'Curitiba', uf: 'PR', codigo_municipio_ibge: '4106902' }
const input = { organization_id: 'tenant-a', store_id: 1, work_order_id: 42, environment: 'homologation',
  cliente: { cpf_cnpj: '12345678909', nome: 'Nome forjado', somente_documento: false, email: 'forjado@example.test',
    endereco: { uf: 'SP', logradouro: 'Endereco forjado' }, razao_social: 'Razao forjada' },
  itens: [{ codigo: 'A', descricao: 'Produto', ncm: '90031100', cfop: '5102', unidade: 'UN', quantidade: 1, valor_unitario: 100, valor_total: 100 }],
  pagamentos: [{ meio: '01', valor: 100 }], valor_total: 100 }

function harness(options = {}) {
  const queries = [], writes = [], rpcs = [], requests = []
  let tokens = 0, modules = 0
  const rows = { profiles: { id: 'user', tenant_id: 'tenant-a', store_id: 1, role: 'funcionario' },
    stores: store, vendas: { id: 42, tenant_id: 'tenant-a', store_id: 1, customer_id: 11 }, customers: customer,
    ...options.rows }
  const admin = {
    from(table) {
      const q = { table, filters: {}, operation: 'read' }
      queries.push(q)
      const chain = {
        select() { return chain }, eq(key, value) { q.filters[key] = value; return chain },
        in() { return chain }, limit() { return chain },
        insert(value) { q.operation = 'insert'; q.value = clone(value); return chain },
        update(value) { q.operation = 'update'; q.value = clone(value); return chain },
        single() { return chain }, maybeSingle() { return chain },
        then(done, fail) {
          let data = rows[table] ?? null
          if (q.operation !== 'read') { writes.push(clone(q)); data = q.operation === 'insert' ? { id: 99 } : null }
          else if (data && Object.entries(q.filters).some(([k, v]) => data[k] !== v)) data = null
          return Promise.resolve({ data, error: null }).then(done, fail)
        },
      }
      return chain
    },
    async rpc(name, args) { rpcs.push({ name, args }); return { data: 222, error: null } },
  }
  const actions = load('src/lib/actions/fiscal.actions.ts', {
    '@/lib/supabase/server': { createClient: () => ({ auth: { getUser: async () => ({
      data: { user: options.noUser ? null : { id: 'user' } }, error: options.authError ? { message: 'expired' } : null }) } }) },
    '@/lib/supabase/admin': { createAdminClient: () => admin },
    '@/lib/nuvem-local': { getNuvemLocalToken: async () => { tokens++; return 'synthetic-token' } },
    '@/lib/store-modules.server': { isStoreModuleEnabledForStore: async () => { modules++; return true } },
    '@/lib/fiscal-recovery-client': { isGopRecoveryCandidate: () => Boolean(options.pilot) },
    '@/lib/fiscal-recovery.server': options.recovery || {},
  }, { fetch: async (url, init) => {
    requests.push({ url, init, payload: JSON.parse(init.body) })
    return new Response(JSON.stringify({ id: 'synthetic-note', status: 'processando', numero: 222, serie: 2 }))
  } })
  return { actions, queries, writes, rpcs, requests, get tokens() { return tokens }, get modules() { return modules } }
}

for (const options of [{ noUser: true }, { authError: true }]) {
  test(`sessão ausente/expirada bloqueia antes de qualquer leitura administrativa: ${JSON.stringify(options)}`, async () => {
    const h = harness(options)
    assert.equal((await h.actions.emitirNFCe(clone(input))).success, false)
    assert.equal(h.queries.length, 0)
    assert.equal(h.tokens + h.modules + h.rpcs.length + h.requests.length + h.writes.length, 0)
  })
}

for (const profile of [null, { tenant_id: 'outro', store_id: 1, role: 'admin' },
  { tenant_id: 'tenant-a', store_id: 2, role: 'funcionario' }]) {
  test(`perfil sem acesso bloqueia antes de dados fiscais: ${JSON.stringify(profile)}`, async () => {
    const h = harness({ rows: { profiles: profile && { id: 'user', ...profile } } })
    assert.equal((await h.actions.emitirNFCe(clone(input))).success, false)
    assert.deepEqual(h.queries.map(q => q.table), ['profiles'])
    assert.equal(h.tokens + h.modules + h.rpcs.length + h.requests.length + h.writes.length, 0)
  })
}

test('mesmo um admin não acessa loja de outro tenant', async () => {
  const h = harness({ rows: { profiles: { id: 'user', tenant_id: 'tenant-a', store_id: 2, role: 'admin' },
    stores: { ...store, tenant_id: 'outro' } } })
  assert.equal((await h.actions.emitirNFCe(clone(input))).success, false)
  assert.deepEqual(h.queries.map(q => q.table), ['profiles', 'stores'])
  assert.equal(h.tokens + h.modules + h.rpcs.length + h.requests.length + h.writes.length, 0)
})

test('produção com recuperação habilitada também exige sessão antes de reservar', async () => {
  let reserved = 0
  const h = harness({ noUser: true, pilot: true, recovery: { reserveGopPilot: () => { reserved++ } } })
  assert.equal((await h.actions.emitirNFCe({ ...clone(input), environment: 'production' })).success, false)
  assert.equal(reserved + h.tokens + h.rpcs.length + h.requests.length + h.queries.length, 0)
})

test('payload manipulado não injeta nome/contato/endereço no POST ou no snapshot', async () => {
  const h = harness()
  assert.equal((await h.actions.emitirNFCe(clone(input))).success, true)
  assert.deepEqual(h.requests[0].payload.infNFe.dest, { CPF: '12345678909', indIEDest: 9 })
  const saved = h.writes.find(w => w.operation === 'insert').value
  assert.equal(saved.destinatario_nome, null)
  assert.equal(saved.destinatario_cnpj, '12345678909')
  assert.deepEqual(saved.payload_json.infNFe.dest, h.requests[0].payload.infNFe.dest)
  assert.ok(!JSON.stringify(saved).includes('forjado'))
})

test('documento do cadastro usa os dados reais e aceita admin do mesmo tenant em outra loja', async () => {
  const h = harness({ rows: { profiles: { id: 'user', tenant_id: 'tenant-a', store_id: 2, role: 'admin' } } })
  const payload = clone(input); payload.cliente.cpf_cnpj = customer.cpf
  assert.equal((await h.actions.emitirNFCe(payload)).success, true)
  const dest = h.requests[0].payload.infNFe.dest
  assert.equal(dest.CPF, customer.cpf)
  assert.equal(dest.xNome, customer.full_name)
  assert.equal(dest.email, customer.email)
  assert.equal(dest.enderDest.xLgr, customer.rua)
})

test('PJ mantém razão social e IE apenas no seu CNPJ', async () => {
  const h = harness({ rows: { customers: { ...customer, person_type: 'PJ', cnpj: '11222333000181',
    razao_social: 'Empresa do cadastro', inscricao_estadual: '123' } } })
  const payload = clone(input); payload.cliente.cpf_cnpj = '11222333000181'
  assert.equal((await h.actions.emitirNFCe(payload)).success, true)
  const dest = h.requests[0].payload.infNFe.dest
  assert.equal(dest.CNPJ, '11222333000181'); assert.equal(dest.xNome, 'Empresa do cadastro'); assert.equal(dest.IE, '123')
})

test('sem identificação não envia dest nem identificação no snapshot', async () => {
  const h = harness(); const payload = clone(input); payload.cliente.cpf_cnpj = ''
  assert.equal((await h.actions.emitirNFCe(payload)).success, true)
  assert.equal('dest' in h.requests[0].payload.infNFe, false)
  const saved = h.writes.find(w => w.operation === 'insert').value
  assert.equal(saved.destinatario_nome, null); assert.equal(saved.destinatario_cnpj, null)
})

test('somente_documento não herda o nome mesmo digitando o CPF cadastrado', async () => {
  const h = harness(); const payload = clone(input)
  payload.cliente = { ...payload.cliente, cpf_cnpj: customer.cpf, somente_documento: true }
  assert.equal((await h.actions.emitirNFCe(payload)).success, true)
  assert.deepEqual(h.requests[0].payload.infNFe.dest, { CPF: customer.cpf, indIEDest: 9 })
})

test('emissão avulsa com documento não aproveita nome ou contato informado', async () => {
  const h = harness(); const payload = clone(input); delete payload.work_order_id
  assert.equal((await h.actions.emitirNFCe(payload)).success, true)
  assert.deepEqual(h.requests[0].payload.infNFe.dest, { CPF: '12345678909', indIEDest: 9 })
})

test('venda ou cliente de outra loja/tenant bloqueia sem token ou numeração', async () => {
  for (const rows of [{ vendas: { id: 42, tenant_id: 'outro', store_id: 1 } },
    { customers: { ...customer, store_id: 2 } }]) {
    const h = harness({ rows })
    assert.equal((await h.actions.emitirNFCe(clone(input))).success, false)
    assert.equal(h.tokens + h.rpcs.length + h.requests.length + h.writes.length, 0)
  }
})

const originalPayload = { infNFe: { dest: { CPF: '52998224725', xNome: 'Original', indIEDest: 9 }, det: [] } }
const attempt = { requestId: '12345678-1234-1234-1234-123456789012', organizationId: '40b34e90-4c9d-4446-b775-770a3e77d6c0',
  storeId: 1, cnpj: '01997929000108', clientId: 'synthetic-client', model: 'NFCe', series: 2, number: 222,
  originId: 'sale:42', invoiceId: 99, version: 2, serverVersion: 0, state: 'blocked_local', postStartedAt: null,
  payload: originalPayload, code: '', origin: 'consumer' }

function recoveryHarness(current = clone(attempt)) {
  const calls = [], posts = []
  const database = { async rpc(name, args) {
    calls.push({ name, args: clone(args) })
    if (name === 'gop_recovery_get_v1') return { data: current, error: null }
    if (name === 'gop_recovery_prepare_v1') {
      // Model the existing SQL's compare-and-swap, not an unconditional write.
      if (args.p_version !== current.version) return { data: null, error: null }
      current = { ...current, payload: clone(args.p_payload), version: current.version + 1, state: 'prepared', postStartedAt: null }
      return { data: current, error: null }
    }
    if (name === 'gop_recovery_start_post_v1') {
      if (args.p_version !== current.version || current.postStartedAt || current.state !== 'prepared') return { data: null, error: null }
      current = { ...current, version: current.version + 1, postStartedAt: '2026-11-06T12:00:00Z', state: 'submission_unknown' }
      return { data: current, error: null }
    }
    throw Error(`Unexpected RPC: ${name}`)
  } }
  const endpoints = { resolveNuvemLocalEndpoints: () => ({ apiUrl: 'https://provider.invalid' }) }
  const { GopRecoveryClient } = load('src/lib/fiscal-recovery-client.ts', { './nuvem-local-endpoints': endpoints })
  const client = new GopRecoveryClient({ database, clientId: 'synthetic-client', token: async () => 'synthetic-token',
    apply: async () => {}, fetch: async (url, init = {}) => {
      if (init.method === 'POST') posts.push(JSON.parse(init.body))
      return new Response('{}')
    } })
  const { completeGopPilot } = load('src/lib/fiscal-recovery.server.ts', {
    './supabase/server': {}, './supabase/admin': {}, './nuvem-local': {}, './nuvem-local-endpoints': endpoints,
    './fiscal-recovery-apply': {}, './fiscal-recovery-cancellation': {}, './fiscal-recovery-legacy': {},
  })
  return { client, calls, posts, completeGopPilot, get current() { return clone(current) } }
}

test('blocked_local recusa outro CPF, nome, contato ou identificação antes de preparar/enviar', async () => {
  for (const dest of [undefined, { CPF: '12345678909', indIEDest: 9 },
    { ...originalPayload.infNFe.dest, xNome: 'Outro nome' }, { ...originalPayload.infNFe.dest, email: 'novo@example.test' }]) {
    const h = recoveryHarness()
    await assert.rejects(h.completeGopPilot({ client: h.client, attempt: clone(attempt) },
      { infNFe: { dest } }, {}), /RECOVERY_NFCE_RECIPIENT_IMMUTABLE/)
    assert.equal(h.calls.length, 0); assert.equal(h.posts.length, 0)
    assert.deepEqual(h.current, attempt)
  }
})

test('blocked_local aceita correção de item mantendo destinatário, número e snapshot canônico', async () => {
  const h = recoveryHarness()
  const payload = clone(originalPayload); payload.infNFe.det = [{ corrigido: true }]
  await h.completeGopPilot({ client: h.client, attempt: clone(attempt) }, payload,
    { destinatario_nome: 'Forjado', destinatario_cnpj: '12345678909' })
  assert.equal(h.posts.length, 1)
  assert.deepEqual(h.posts[0].infNFe.dest, originalPayload.infNFe.dest)
  assert.equal(h.current.number, attempt.number)
  assert.equal(h.calls[0].args.p_snapshot.destinatario_nome, 'Original')
  assert.equal(h.calls[0].args.p_snapshot.destinatario_cnpj, customer.cpf)
})

test('concorrência com preparação inicial obsoleta preserva o destinatário vencedor', async () => {
  const h = recoveryHarness({ ...clone(attempt), state: 'prepared' })
  const stale = { ...clone(attempt), version: 1, payload: null }
  await h.completeGopPilot({ client: h.client, attempt: stale },
    { infNFe: { dest: { CPF: '12345678909' } } }, {})
  assert.deepEqual(h.current.payload.infNFe.dest, originalPayload.infNFe.dest)
  assert.deepEqual(h.posts[0].infNFe.dest, originalPayload.infNFe.dest)
})

test('POST já iniciado somente consulta; nenhuma preparação ou novo POST', async () => {
  const started = { ...clone(attempt), postStartedAt: '2026-11-06T12:00:00Z', state: 'submission_unknown' }
  const h = recoveryHarness(started)
  await h.completeGopPilot({ client: h.client, attempt: clone(started) }, { infNFe: { dest: { CPF: '12345678909' } } }, {})
  assert.equal(h.posts.length, 0)
  assert.ok(h.calls.every(c => c.name === 'gop_recovery_get_v1'))
})

test('action retorna bloqueio de destinatário sem registrar falha ou reenviar', async () => {
  const h = harness({ pilot: true, recovery: {
    reserveGopPilot: async () => ({ attempt: clone(attempt), client: { failure: () => { throw Error('Must not mutate attempt') } } }),
    completeGopPilot: async () => { throw Error('RECOVERY_NFCE_RECIPIENT_IMMUTABLE') },
  } })
  const result = await h.actions.emitirNFCe(clone(input))
  assert.equal(result.success, false); assert.match(result.error, /destinatario.*definido/)
  assert.equal(h.requests.length + h.writes.length + h.rpcs.length, 0)
})

function modalHarness(personType) {
  const state = [], effects = [], emitted = []
  let cursor = 0
  const jsx = (type, props) => ({ type, props })
  const Modal = load('src/components/modals/FiscalEmissionModal.tsx', {
    react: {
      useState(initial) {
        const i = cursor++
        if (!(i in state)) state[i] = initial
        return [state[i], value => { state[i] = typeof value === 'function' ? value(state[i]) : value }]
      },
      useEffect(callback) { const i = cursor++; if (!(i in state)) { state[i] = true; effects.push(callback) } },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-dom': { createPortal: node => node },
    'lucide-react': {}, 'next/link': { default: 'link' },
    '@/lib/actions/fiscal-db.actions': {
      getTenantIdByStore: async () => 'tenant-a', getProductFiscalData: async () => null,
      getEmissoesByVenda: async () => [],
    },
    '@/lib/actions/fiscal.actions': { emitirNFCe: async payload => { emitted.push(clone(payload)); return { success: false, error: 'synthetic-stop' } } },
  }, { document: { body: {} } }).default
  const render = () => {
    cursor = 0
    const tree = Modal({ isOpen: true, onClose() {}, onSuccess() {}, venda: { id: 42, store_id: 1, valor_final: 100 },
      vendaItens: [], customer: { ...customer, person_type: personType, cnpj: '11222333000181' } })
    for (const effect of effects.splice(0)) effect()
    return tree
  }
  const nodes = node => !node || typeof node !== 'object' ? []
    : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)]
  const text = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join('') : text(node?.props?.children || '')
  return { render, nodes, text, emitted }
}

for (const [personType, document] of [['PF', '11222333000181'], ['PJ', '52998224725']]) {
  test(`modal ${personType}: outro documento aceita o tipo oposto e volta ao cadastro sem gravá-lo`, async () => {
    const h = modalHarness(personType)
    h.render(); await Promise.resolve()
    let tree = h.render()
    h.nodes(tree).find(n => n.type === 'button' && h.text(n).includes('Informar outro documento')).props.onClick()
    tree = h.render()
    const field = h.nodes(tree).find(n => n.type === 'input' && n.props.placeholder === 'CPF ou CNPJ')
    assert.equal(field.props.maxLength, 18)
    field.props.onChange({ target: { value: document } })
    tree = h.render()
    assert.ok(h.text(tree).includes('Somente CPF/CNPJ'))
    assert.ok(!h.nodes(tree).some(n => n.type === 'button' && h.text(n) === 'Salvar'))
    await h.nodes(tree).find(n => n.type === 'button' && h.text(n).includes('Emitir NFC-e')).props.onClick()
    assert.equal(h.emitted.length, 1)
    assert.deepEqual(h.emitted[0].cliente, { cpf_cnpj: document, nome: '', somente_documento: true })
    tree = h.render()
    h.nodes(tree).find(n => n.type === 'button' && h.text(n).includes('Usar documento do cadastro')).props.onClick()
    tree = h.render()
    assert.ok(h.text(tree).includes(personType === 'PJ' ? '11222333000181' : customer.cpf))
  })
}
