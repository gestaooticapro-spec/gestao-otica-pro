import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const nativeRequire = createRequire(import.meta.url)

// Executa os módulos reais com banco e dependências externas sintéticos.
function load(path, mocks = {}, globals = {}) {
  const module = { exports: {} }
  const code = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const require = id => {
    if (id in mocks) return mocks[id]
    if (id === '@/lib/express-payment') return load('src/lib/express-payment.ts')
    if (id === 'zod' || id === 'node:crypto') return nativeRequire(id)
    // Dependências não exercidas neste teste ficam sem implementação, sem I/O real.
    return {}
  }
  runInNewContext(code, { module, exports: module.exports, require, console, FormData, ...globals })
  return module.exports
}

const { getExpressPaymentError } = load('src/lib/express-payment.ts')
const cart = [{ originalId: 7, type: 'produtos_gerais', description: 'Produto', price: 100, quantity: 1 }]

function actionHarness() {
  const writes = [], calls = []
  let savedItems = []
  const admin = {
    from(table) {
      calls.push(table)
      let operation = 'read', value
      const chain = {
        select() { return chain }, eq() { return chain }, ilike() { return chain },
        limit() { return chain }, single() { return chain }, maybeSingle() { return chain },
        not() { return chain }, in() { return chain },
        insert(data) { operation = 'insert'; value = data; return chain },
        update(data) { operation = 'update'; value = data; return chain },
        then(resolve, reject) {
          let data
          if (operation !== 'read') {
            writes.push({ table, operation, value })
            if (table === 'venda_itens') savedItems = value
            data = { id: table === 'vendas' ? 42 : 8 }
          } else {
            data = { customers: [{ id: 11 }], venda_itens: savedItems, service_orders: [],
              stock_movements: null, products: { estoque_atual: 10, preco_custo: 20 } }[table]
            if (data === undefined) throw Error(`Leitura inesperada: ${table}`)
          }
          return Promise.resolve({ data, error: null }).then(resolve, reject)
        },
      }
      return chain
    },
  }
  const actions = load('src/lib/actions/vendas.actions.ts', {
    '@/lib/supabase/server': { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user' } } }) } }) },
    '@/lib/supabase/admin': { createAdminClient: () => admin, getProfileByAdmin: async () => ({ tenant_id: 'tenant', store_id: 1 }) },
    '@/lib/billing/billing-guard': { getNewSaleBillingGuard: async () => ({ blocked: false }) },
    '@/lib/store-modules.server': { isStoreModuleEnabledForStore: async () => true },
    '@/lib/server/employee-authorization': { verifyEmployeeAuthorization: () => ({ employeeId: 2 }) },
    './commission.actions': { calcularERegistrarComissao: async () => calls.push('commission'), calcularComissaoMedico: async () => calls.push('doctorCommission') },
    'next/cache': { revalidatePath() {} },
  })
  const pay = (amount, items = cart) => {
    const fd = new FormData()
    fd.set('store_id', '1'); fd.set('employee_id', '2')
    fd.set('itens', JSON.stringify(items))
    fd.set('pagamento', JSON.stringify({ valor: amount, forma: 'Dinheiro', parcelas: 1, data: '2026-11-06' }))
    return actions.finalizarVendaExpress(fd)
  }
  return { actions, pay, writes, calls }
}

for (const amount of [60, 99.99, 0, -1, null, 'inválido']) {
  test(`pagamento ${amount} não cria venda, cliente, comissão ou movimento`, async () => {
    const h = actionHarness()
    const result = await h.pay(amount)
    assert.equal(result.success, false)
    if (amount > 0) assert.match(result.message, /inferior.*Venda Expressa.*Venda Experimental/)
    assert.equal(h.writes.length, 0)
    assert.equal(h.calls.length, 0)
  })
}

for (const amount of [100.01,120]) {
  test(`Expressa recusa excedente de ${amount} antes de criar cliente, venda ou estoque`,async()=>{
    const h=actionHarness()
    const result=await h.pay(amount)
    assert.equal(result.success,false)
    assert.match(result.message,/superar.*valor líquido/)
    assert.equal(h.writes.length,0)
    assert.equal(h.calls.length,0)
  })
}

for (const items of [[], null, [{ ...cart[0], price: -100 }], [{ ...cart[0], quantity: null }]]) {
  test(`cesta inválida é recusada sem gravação: ${JSON.stringify(items)}`, async () => {
    const h = actionHarness()
    assert.equal((await h.pay(100, items)).success, false)
    assert.equal(h.writes.length, 0)
  })
}

test('JSON inválido retorna erro sem gravação', async () => {
  const h = actionHarness(), fd = new FormData()
  fd.set('itens', '{')
  assert.equal((await h.actions.finalizarVendaExpress(fd)).success, false)
  assert.equal(h.writes.length, 0)
})

test('pagamento integral mantém venda fechada, pagamento e saída de estoque', async () => {
  const h = actionHarness()
  const result = await h.pay(100)
  assert.equal(result.success, true)
  const sale = h.writes.find(w => w.table === 'vendas').value
  assert.equal(sale.status, 'Fechada')
  assert.equal(sale.valor_final, 100)
  assert.equal(sale.valor_restante, 0)
  assert.equal(h.writes.find(w => w.table === 'pagamentos').value.valor_pago, 100)
  assert.equal(h.writes.find(w => w.table === 'products').value.estoque_atual, 9)
  assert.equal(h.writes.filter(w => w.table === 'stock_movements').length, 1)
})

test('soma decimal integral não é confundida com pagamento parcial', async () => {
  const h = actionHarness()
  assert.equal((await h.pay(0.3, [{ ...cart[0], price: 0.1, quantity: 3 }])).success, true)
  assert.equal(getExpressPaymentError(0.1 + 0.2, 0.3), null)
  assert.ok(getExpressPaymentError(100, 99.99))
  assert.ok(getExpressPaymentError(Infinity, 100))
  assert.ok(getExpressPaymentError(100, NaN))
})

test('Pix Sicredi recusa um centavo a menos antes de preparar venda ou cobrança', async () => {
  const h = actionHarness()
  const result = await h.actions.criarVendaExpressPixPendente({ storeId: 1, amount: 99.99, items: cart, authorizationToken: 'synthetic' })
  assert.equal(result.success, false)
  assert.match(result.message, /inferior/)
  assert.equal(h.calls.length, 0)
  assert.equal(h.writes.length, 0)
})

function modalHarness() {
  const state = [], alerts = [], submissions = []
  let cursor = 0
  const jsx = (type, props) => ({ type, props })
  const Modal = load('src/components/modals/PaymentModal.tsx', {
    react: {
      useState(initial) {
        const i = cursor++
        if (!(i in state)) state[i] = initial
        return [state[i], value => { state[i] = value }]
      },
      useRef: initial => ({ current: initial }),
      useEffect() {}, useTransition: () => [false, fn => fn()],
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '@/lib/contexts/StoreModulesContext': { useStoreModules: () => ({ installments: true }) },
    '@/components/modals/EmployeeAuthModal': { default: 'auth' },
    '@/lib/actions/vendas.actions': { finalizarVendaExpress: async fd => { submissions.push(fd); return { success: false, message: 'synthetic' } } },
  }, { alert: message => alerts.push(message) }).default
  const nodes = node => !node || typeof node !== 'object' ? []
    : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)]
  const text = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join('') : text(node?.props?.children || '')
  const render = () => {
    cursor = 0
    return Modal({ isOpen: true, storeId: 1, employeeId: 2, valorTotal: 100, cartItems: cart })
  }
  const setAmount = amount => nodes(render()).find(n => n.type === 'input').props.onChange({ target: { value: amount } })
  const confirm = () => nodes(render()).find(n => n.type === 'button' && text(n).includes('Confirmar Pagamento')).props.onClick()
  return { render, nodes, setAmount, confirm, alerts, submissions }
}

test('modal bloqueia valor parcial antes do PIN e libera pagamento integral', () => {
  const h = modalHarness()
  h.setAmount('99,99'); h.confirm()
  assert.match(h.alerts[0], /inferior.*Venda Experimental/)
  assert.ok(!h.nodes(h.render()).some(n => n.type === 'auth'))
  assert.equal(h.submissions.length, 0)
  h.setAmount('100,00'); h.confirm()
  assert.ok(h.nodes(h.render()).some(n => n.type === 'auth'))
})

test('modal revalida o valor ao receber a autorização', () => {
  const h = modalHarness()
  h.confirm()
  h.setAmount('60,00')
  h.nodes(h.render()).find(n => n.type === 'auth').props.onSuccess({ id: 2, full_name: 'Vendedor' })
  assert.match(h.alerts[0], /inferior/)
  assert.equal(h.submissions.length, 0)
})

test('modal da Expressa recusa excedente antes do PIN',()=>{
  const h=modalHarness()
  h.setAmount('100,01');h.confirm()
  assert.match(h.alerts[0],/superar.*troco/)
  assert.ok(!h.nodes(h.render()).some(n=>n.type==='auth'))
  assert.equal(h.submissions.length,0)
})
