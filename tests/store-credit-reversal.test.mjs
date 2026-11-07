import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import test, { before, beforeEach, after } from 'node:test'
import ts from 'typescript'
import { PGlite } from '../.test-tools/wallet-validation/node_modules/@electric-sql/pglite/dist/index.js'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const migration = read('supabase/migrations/20261106140000_reverse_store_credit_payment.sql')
const balanceMigration = read('supabase/migrations/20260828193000_exclude_installment_payments_from_sale_balance.sql')
const operationsMigration = read('supabase/migrations/20261106150000_atomic_wallet_operations.sql')
const tenant = '00000000-0000-0000-0000-000000000001'
const user = '00000000-0000-0000-0000-000000000002'
const otherTenant = '00000000-0000-0000-0000-000000000003'
const db = new PGlite()
before(async () => { await db.exec('create role anon; create role authenticated; create role service_role;') })
after(async () => { await db.close() })

// Banco PostgreSQL/WASM isolado: somente estrutura mínima e dados sintéticos.
beforeEach(async () => {
  await db.exec(`
    drop schema public cascade; create schema public;
    create table profiles(id uuid primary key, tenant_id uuid, store_id bigint, role text);
    create table stores(id bigint primary key, tenant_id uuid);
    create table vendas(id bigint primary key, tenant_id uuid, store_id bigint, customer_id bigint,
      status text, is_historical_import boolean default false, valor_total numeric, valor_final numeric,
      valor_desconto numeric default 0, valor_restante numeric);
    create table pagamentos(id bigint primary key, tenant_id uuid, store_id bigint, venda_id bigint,
      customer_id bigint, employee_id bigint, valor_pago numeric(10,2), forma_pagamento text, parcela_id bigint);
    create table customer_wallets(id bigint primary key, tenant_id uuid, store_id bigint,
      customer_id bigint, balance numeric(10,2), updated_at timestamptz,
      unique(store_id, customer_id));
    create table wallet_transactions(id bigint generated always as identity primary key,
      tenant_id uuid, store_id bigint, wallet_id bigint references customer_wallets(id), amount numeric(10,2),
      operation_type text, description text, related_venda_id bigint, created_by_user_id uuid,
      employee_id bigint, created_at timestamptz default now());
    create table accounts_receivable(id bigint primary key, origin_payment_id bigint);
    create table venda_itens(venda_id bigint, valor_total_item numeric);
    create table financiamento_loja(venda_id bigint, valor_total_financiado numeric);
    insert into profiles values ('${user}', '${tenant}', 1, 'funcionario');
    insert into stores values (1, '${tenant}'), (2, '${otherTenant}');
    insert into vendas values (10, '${tenant}', 1, 20, 'Em Aberto', false, 200, 200, 0, 100);
    insert into pagamentos values (30, '${tenant}', 1, 10, 20, 5, 100, 'Crédito em Loja', null);
    insert into customer_wallets values (40, '${tenant}', 1, 20, 50, now());
    insert into wallet_transactions(tenant_id,store_id,wallet_id,amount,operation_type,related_venda_id)
      values ('${tenant}',1,40,-100,'Uso_Venda',10);
    insert into accounts_receivable values (1,30);
    insert into venda_itens values (10,200);
    create table customers(id bigint primary key, tenant_id uuid, store_id bigint);
    create table employees(id bigint primary key, tenant_id uuid, store_id bigint);
    insert into customers values(20,'${tenant}',1),(21,'${tenant}',1);
    insert into employees values(5,'${tenant}',1);
    create sequence payment_ids start 100;
    alter table pagamentos alter column id set default nextval('payment_ids');
    alter table pagamentos add column parcelas int, add column data_pagamento date,
      add column obs text, add column created_by_user_id uuid, add column created_at timestamptz,
      add column receipt_operation_id bigint;
    create sequence wallet_ids start 100;
    alter table customer_wallets alter column id set default nextval('wallet_ids');
  `)
  await db.exec(balanceMigration)
  await db.exec(migration)
  await db.exec(operationsMigration)
  await db.exec(read('supabase/migrations/20261106180000_guard_direct_payment_sale_balance.sql'))
})
const reverse = (payment = 30, sale = 10, store = 1, company = tenant, actor = user) => db.query(
  'select reverse_store_credit_payment($1,$2,$3,$4,$5) result', [payment, sale, store, company, actor])
const key = '00000000-0000-4000-8000-000000000001'
const key2 = '00000000-0000-4000-8000-000000000002'
const credit = (overrides = {}) => {
  const p = { store: 1, customer: 20, amount: 25, description: 'Crédito de teste', employee: 5, sale: 10, tenant, user, key, ...overrides }
  return db.query('select add_store_credit_atomic($1,$2,$3,$4,$5,$6,$7,$8,$9) result',
    [p.store,p.customer,p.amount,p.description,p.employee,p.sale,p.tenant,p.user,p.key])
}
const pay = (overrides = {}) => {
  const p = { sale: 10, store: 1, customer: 20, employee: 5, amount: 20, date: '2026-11-06', obs: null, tenant, user, key, ...overrides }
  return db.query('select pay_sale_with_store_credit($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) result',
    [p.sale,p.store,p.customer,p.employee,p.amount,p.date,p.obs,p.tenant,p.user,p.key])
}
async function state() {
  return (await db.query(`select
    (select balance from customer_wallets where id=40) balance,
    (select count(*) from pagamentos) payments,
    (select count(*) from wallet_transactions where reversed_payment_id is not null) refunds,
    (select count(*) from accounts_receivable) receivables,
    (select valor_restante from vendas where id=10) remaining`)).rows[0]
}

test('devolve crédito, mantém débito no extrato e recalcula venda atomicamente', async () => {
  await reverse()
  assert.deepEqual(await state(), { balance: '150.00', payments: 0, refunds: 1, receivables: 0, remaining: '200.00' })
  const audit = (await db.query('select * from wallet_transactions where reversed_payment_id=30')).rows[0]
  assert.equal(audit.amount, '100.00')
  assert.equal(audit.created_by_user_id, user)
  assert.equal(audit.employee_id, null) // Não atribuir a remoção ao vendedor original.
  assert.equal(audit.operation_type, 'Estorno_Pagamento')
  assert.match(audit.description, /#30.*#10/)
  assert.equal((await db.query("select count(*) n from wallet_transactions where operation_type='Uso_Venda'")).rows[0].n, 1)
  await assert.rejects(reverse(), /ja removido/)
  assert.equal((await state()).balance, '150.00')
})

test('titular transferido não recebe o crédito de quem pagou', async () => {
  await db.exec(`update vendas set customer_id=21; insert into customer_wallets values(41,'${tenant}',1,21,0,now())`)
  await reverse()
  assert.equal((await state()).balance, '150.00')
  assert.equal((await db.query('select balance from customer_wallets where id=41')).rows[0].balance, '0.00')
})

test('dois pagamentos devolvem somente seus valores, uma vez cada', async () => {
  await db.exec(`update pagamentos set valor_pago=60;
    insert into pagamentos(id,tenant_id,store_id,venda_id,customer_id,employee_id,valor_pago,forma_pagamento,parcela_id)
      values(31,'${tenant}',1,10,20,5,40,'Crédito em Loja',null)`)
  await reverse()
  assert.equal((await state()).balance, '110.00')
  await reverse(31)
  assert.equal((await state()).balance, '150.00')
  assert.equal((await state()).refunds, 2)
})

for (const [name, change, message] of [
  ['venda fechada', "update vendas set status='Fechada'", /Reabra/],
  ['venda histórica', 'update vendas set is_historical_import=true', /Reabra/],
  ['pagamento de parcela', 'update pagamentos set parcela_id=99', /somente pagamento direto/],
  ['outra forma', "update pagamentos set forma_pagamento='Dinheiro'", /somente pagamento direto/],
  ['cliente ausente', 'update pagamentos set customer_id=null', /sem cliente/],
  ['carteira ausente', 'update pagamentos set customer_id=99', /Carteira original/],
  ['sem débito no extrato', 'delete from wallet_transactions', /nao comprovado/],
  ['débito insuficiente', 'update wallet_transactions set amount=-90', /nao comprovado/],
  ['outra empresa na carteira', `update customer_wallets set tenant_id='${otherTenant}'`, /Carteira original/],
]) {
  test(`${name}: bloqueio preserva o estado`, async () => {
    await db.exec(change)
    const before = await state()
    await assert.rejects(reverse(), message)
    assert.deepEqual(await state(), before)
  })
}

test('sessão, loja, empresa e vínculo de pagamento são validados na RPC', async () => {
  const before = await state()
  for (const args of [[30,10,1,tenant,null], [30,10,2], [30,10,1,otherTenant], [30,99], [99]]) {
    await assert.rejects(reverse(...args))
    assert.deepEqual(await state(), before)
  }
})

for (const table of ['wallet_transactions', 'customer_wallets', 'pagamentos']) {
  test(`falha em ${table} reverte toda a operação`, async () => {
    await db.exec(`create function fail_write() returns trigger language plpgsql as $$ begin raise exception 'synthetic failure'; end $$;
      create trigger fail before insert or update or delete on ${table} for each row execute function fail_write()`)
    const before = await state()
    await assert.rejects(reverse(), /synthetic failure/)
    assert.deepEqual(await state(), before)
  })
}

test('falha ao recalcular a venda também reverte carteira, extrato e exclusões', async () => {
  await db.exec(`create or replace function update_venda_financeiro(p_venda_id bigint) returns void language plpgsql as $$ begin raise exception 'balance failure'; end $$`)
  const before = await state()
  await assert.rejects(reverse(), /balance failure/)
  assert.deepEqual(await state(), before)
})

test('migration reaplicável, auditoria única e execução restrita', async () => {
  await db.exec(migration)
  const signature = 'public.reverse_store_credit_payment(bigint,bigint,bigint,uuid,uuid)'
  for (const role of ['anon', 'authenticated', 'service_role']) {
    const result = await db.query("select has_function_privilege($1, $2, 'EXECUTE') allowed", [role, signature])
    assert.equal(result.rows[0].allowed, role === 'service_role')
  }
  await reverse()
  await assert.rejects(db.exec(`insert into wallet_transactions(wallet_id,amount,operation_type,reversed_payment_id) values(40,100,'Estorno_Pagamento',30)`), /unique/)
})

test('action usa a RPC, bloqueia falhas e informa estorno concluído mesmo se a comissão falhar', async () => {
  const writes = [], rpcs = []
  let rpcFailure = true, commissionFailure = false
  const module = { exports: {} }, nativeRequire = createRequire(import.meta.url)
  const admin = {
    from(table) {
      const chain = {
        select() { return chain }, eq() { return chain },
        maybeSingle: async () => ({ data: table === 'vendas' ? { is_historical_import: false }
          : { id: 30, parcela_id: null, forma_pagamento: 'Crédito em Loja' }, error: null }),
        delete() { writes.push(table); throw Error('Unexpected delete') },
      }
      return chain
    },
    rpc: async (name, args) => { rpcs.push({ name, args }); return { error: rpcFailure ? { message: 'RPC unavailable' } : null } },
  }
  const mocks = {
    '@/lib/supabase/server': { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: user } } }) } }) },
    '@/lib/supabase/admin': { createAdminClient: () => admin, getProfileByAdmin: async () => ({ tenant_id: tenant, store_id: 1 }) },
    './commission.actions': { calcularERegistrarComissao: async () => { if (commissionFailure) throw Error('commission failure') } },
    'next/cache': { revalidatePath() {} },
  }
  const code = ts.transpileModule(read('src/lib/actions/vendas.actions.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  runInNewContext(code, { module, exports: module.exports, console: { error() {} },
    require: id => mocks[id] || (id === 'zod' || id === 'node:crypto' ? nativeRequire(id) : {}) })
  const result = await module.exports.deletePagamento(30, 10, 1)
  assert.equal(result.success, false)
  assert.equal(result.message, 'RPC unavailable')
  assert.equal(writes.length, 0)
  assert.equal(rpcs.length, 1)
  assert.equal(rpcs[0].name, 'reverse_store_credit_payment')
  assert.equal(rpcs[0].args.p_user_id, user)
  rpcFailure = false
  const success = await module.exports.deletePagamento(30, 10, 1)
  assert.equal(success.success, true)
  assert.match(success.message, /crédito devolvido/)
  commissionFailure = true
  const warning = await module.exports.deletePagamento(30, 10, 1)
  assert.equal(warning.success, true)
  assert.match(warning.message, /comissão precisa ser revisada/)
  assert.equal(writes.length, 0)
})

test('adição é atômica, acumula valores e reconhece a mesma tentativa', async () => {
  const first = await credit()
  const repeated = await credit()
  assert.equal(first.rows[0].result.transaction_id, repeated.rows[0].result.transaction_id)
  assert.equal((await state()).balance, '75.00')
  await credit({ key: key2, amount: 15 })
  assert.equal((await state()).balance, '90.00')
  assert.equal((await db.query('select count(*) n from wallet_transactions where operation_key is not null')).rows[0].n, 2)
})

test('cria carteira uma vez e grava o primeiro crédito com extrato', async () => {
  await credit({ customer: 21, sale: null })
  await credit({ customer: 21, sale: null })
  const result = await db.query('select balance from customer_wallets where customer_id=21')
  assert.equal(result.rows.length, 1)
  assert.equal(result.rows[0].balance, '25.00')
})

test('pagamento, débito e extrato confirmam juntos; replay não cobra novamente', async () => {
  const first = (await pay()).rows[0].result
  assert.equal(first.valor_pago, 20)
  assert.equal((await state()).balance, '30.00')
  assert.equal((await state()).remaining, '80.00')
  await db.exec("update vendas set status='Fechada'")
  const repeated = (await pay()).rows[0].result
  assert.equal(first.id, repeated.id)
  assert.equal((await state()).payments, 2)
  assert.equal((await state()).balance, '30.00')
})

test('estorno e adição preservam valores; replay de pagamento removido não debita', async () => {
  const payment = (await pay()).rows[0].result
  await credit({ key: key2, amount: 15 })
  await reverse(payment.id)
  assert.equal((await state()).balance, '65.00')
  assert.equal((await state()).remaining, '100.00')
  await assert.rejects(pay(), /ja foi removido/)
  assert.equal((await state()).balance, '65.00')
})

test('mesma chave não aceita novo valor, titular ou tipo de operação', async () => {
  await credit()
  await assert.rejects(credit({ amount: 26 }), /outros dados/)
  await assert.rejects(credit({ customer: 21, sale: null }), /outros dados/)
  await assert.rejects(pay(), /outros dados/)
  assert.equal((await state()).balance, '75.00')
})

test('pagamento insuficiente não altera saldo, extrato ou venda', async () => {
  const before = await state()
  await assert.rejects(pay({ amount: 60 }), /Saldo insuficiente/)
  assert.deepEqual(await state(), before)
  assert.equal((await db.query('select count(*) n from wallet_transactions')).rows[0].n, 1)
})

test('saldo da venda inclui carnê e impede pagamento acima da parte descoberta', async () => {
  await db.exec('insert into financiamento_loja values(10,90)')
  await assert.rejects(pay(), /supera o saldo/)
  await pay({ amount: 10 })
  assert.equal((await state()).remaining, '0.00')
  assert.equal((await state()).balance, '40.00')
})

test('saldo disponível é revalidado a cada novo pagamento', async () => {
  await pay({ amount: 30 })
  await assert.rejects(pay({ amount: 30, key: key2 }), /Saldo insuficiente/)
  assert.equal((await state()).balance, '20.00')
  assert.equal((await state()).payments, 2)
})

for (const table of ['pagamentos','customer_wallets','wallet_transactions']) {
  test(`pagamento: falha em ${table} não deixa débito ou pagamento parcial`, async () => {
    await db.exec(`create function fail_write() returns trigger language plpgsql as $$ begin raise exception 'synthetic failure'; end $$;
      create trigger fail before insert or update on ${table} for each row execute function fail_write()`)
    const before = await state()
    await assert.rejects(pay(), /synthetic failure/)
    assert.deepEqual(await state(), before)
    assert.equal((await db.query('select count(*) n from wallet_transactions')).rows[0].n, 1)
  })
}

test('falha de recálculo depois do pagamento reverte também o débito', async () => {
  await db.exec(`create or replace function update_venda_financeiro(p_venda_id bigint) returns void language plpgsql as $$
    begin if exists(select 1 from pagamentos where id >= 100) then raise exception 'balance failure'; end if; end $$`)
  const before = await state()
  await assert.rejects(pay(), /balance failure/)
  assert.deepEqual(await state(), before)
})

test('falha no extrato reverte a criação da carteira e permite repetir a chave', async () => {
  await db.exec(`create function fail_write() returns trigger language plpgsql as $$ begin raise exception 'synthetic failure'; end $$;
    create trigger fail before insert on wallet_transactions for each row execute function fail_write()`)
  await assert.rejects(credit({ customer: 21, sale: null }), /synthetic failure/)
  assert.equal((await db.query('select count(*) n from customer_wallets where customer_id=21')).rows[0].n, 0)
  await db.exec('drop trigger fail on wallet_transactions')
  await credit({ customer: 21, sale: null })
  assert.equal((await db.query('select balance from customer_wallets where customer_id=21')).rows[0].balance, '25.00')
})

test('novas operações validam acesso, cliente, funcionário, valor e chave', async () => {
  const before = await state()
  for (const change of [{ user: null }, { tenant: otherTenant }, { store: 2 }, { employee: 999 },
    { customer: 999 }, { amount: 0 }, { amount: -1 }, { amount: 'NaN' }, { amount: 0.001 }, { key: null }]) {
    await assert.rejects(credit(change))
    await assert.rejects(pay(change))
    assert.deepEqual(await state(), before)
  }
})

test('nova cobrança recusa venda fechada, histórica ou de outro cliente', async () => {
  await db.exec("update vendas set status='Fechada'")
  await assert.rejects(pay(), /nao esta aberta/)
  await db.exec("update vendas set status='Em Aberto',is_historical_import=true")
  await assert.rejects(pay(), /nao esta aberta/)
  await db.exec('update vendas set is_historical_import=false,customer_id=21')
  await assert.rejects(pay(), /nao esta aberta/)
})

test('novas RPCs são restritas e a migration pode ser reaplicada', async () => {
  await db.exec(operationsMigration)
  for (const signature of [
    'add_store_credit_atomic(bigint,bigint,numeric,text,bigint,bigint,uuid,uuid,uuid)',
    'pay_sale_with_store_credit(bigint,bigint,bigint,bigint,numeric,date,text,uuid,uuid,uuid)',
  ]) {
    for (const role of ['anon','authenticated','service_role']) {
      const result = await db.query("select has_function_privilege($1,$2,'EXECUTE') allowed", [role,signature])
      assert.equal(result.rows[0].allowed, role === 'service_role')
    }
  }
})

function loadAction(path, mocks, globals = {}) {
  const nativeRequire = createRequire(import.meta.url), module = { exports: {} }
  const code = ts.transpileModule(read(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  runInNewContext(code, { module, exports: module.exports, FormData, console: { error() {} },
    require: id => mocks[id] || (id === 'zod' || id === 'node:crypto' ? nativeRequire(id) : {}), ...globals })
  return module.exports
}

test('action de pagamento usa a transação real e preserva a chave no retry', async () => {
  const calls = []
  let failure = false
  const admin = {
    from(table) {
      assert.equal(table, 'vendas') // Nenhuma escrita direta em carteira/pagamentos.
      const execute = async () => ({ data: (await db.query('select status,valor_restante,null as financiamento_id from vendas where id=10')).rows[0] })
      const chain = { select() { return chain }, eq() { return chain }, maybeSingle: execute, single: execute }
      return chain
    },
    async rpc(name, args) {
      calls.push(name)
      assert.equal(name, 'pay_sale_with_store_credit')
      if (failure) return { data: null, error: { message: 'RPC unavailable' } }
      const result = await db.query('select pay_sale_with_store_credit($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) result',
        [args.p_sale_id,args.p_store_id,args.p_customer_id,args.p_employee_id,args.p_amount,args.p_date,args.p_obs,args.p_tenant_id,args.p_user_id,args.p_key])
      return { data: result.rows[0].result, error: null }
    },
  }
  const actions = loadAction('src/lib/actions/vendas.actions.ts', {
    '@/lib/supabase/server': { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: user } } }) } }) },
    '@/lib/supabase/admin': { createAdminClient: () => admin, getProfileByAdmin: async () => ({ tenant_id: tenant, store_id: 1 }) },
    './commission.actions': { calcularERegistrarComissao: async () => {}, calcularComissaoMedico: async () => {} },
    'next/cache': { revalidatePath() {} },
  })
  const fd = new FormData()
  for (const [k,v] of Object.entries({ venda_id:10,customer_id:20,employee_id:5,forma_pagamento:'Crédito em Loja',
    valor_pago:'20,00',parcelas:1,data_pagamento:'2026-11-06',obs:'',idempotency_key:key })) fd.set(k,String(v))
  const first = await actions.addPagamento({},fd)
  assert.equal(first.success,true)
  assert.equal((await actions.addPagamento({},fd)).data.id,first.data.id)
  assert.equal((await state()).balance,'30.00')
  fd.set('idempotency_key',key2)
  failure = true
  const before = await state()
  assert.equal((await actions.addPagamento({},fd)).success,false)
  assert.deepEqual(await state(),before)
  fd.delete('idempotency_key')
  assert.equal((await actions.addPagamento({},fd)).success,false)
  assert.equal(calls.length,3)
})

test('action de adição usa RPC sem gravação alternativa, inclusive na falha', async () => {
  let failure = false
  const admin = { async rpc(name, args) {
    assert.equal(name,'add_store_credit_atomic')
    if (failure) return { error: { message: 'RPC unavailable' } }
    await credit({ amount:args.p_amount,description:args.p_description,key:args.p_key })
    return { error:null }
  } }
  const actions = loadAction('src/lib/actions/wallet.actions.ts', {
    '@/lib/supabase/server': { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id:user } } }) } }) },
    '@/lib/supabase/admin': { createAdminClient: () => admin, getProfileByAdmin: async () => ({ tenant_id:tenant }) },
    'next/cache': { revalidatePath() {} },
  })
  const fd = new FormData()
  for (const [k,v] of Object.entries({ store_id:1,customer_id:20,employee_id:5,amount:25,
    description:'Crédito de teste',related_venda_id:10,idempotency_key:key })) fd.set(k,String(v))
  assert.equal((await actions.addCredit(fd)).success,true)
  assert.equal((await actions.addCredit(fd)).success,true)
  assert.equal((await state()).balance,'75.00')
  failure = true
  assert.equal((await actions.addCredit(fd)).success,false)
  assert.equal((await state()).balance,'75.00')
  assert.equal(actions.useCredit,undefined)
})

test('formulário mantém a chave para a mesma tentativa e renova para outro pagamento', () => {
  const submissions = [], refs = [], states = []
  let cursor = 0, sequence = 0
  const jsx = (type,props) => ({ type,props })
  const Form = loadAction('src/components/vendas/AddPagamentoForm.tsx', {
    react: {
      useRef(initial) { const i=cursor++; return refs[i] ??= { current:initial } },
      useState(initial) { const i=cursor++; if (!(i in states)) states[i]=initial; return [states[i],v => { states[i]=v }] },
      useEffect() {},
    },
    'react-dom': { useFormState: () => [{ success:false,message:'' },fd => submissions.push(Object.fromEntries(fd.entries()))] },
    'react/jsx-runtime': { jsx,jsxs:jsx },
  }, { crypto: { randomUUID: () => `key-${++sequence}` } }).default
  const nodes = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node,...nodes(node.props?.children)]
  const render = () => { cursor=0; return Form({ vendaId:10,customerId:20,storeId:1,valorRestante:100,onPaymentAdded:async()=>{},disabled:false }) }
  const fd = new FormData()
  fd.set('forma_pagamento','Crédito em Loja'); fd.set('valor_pago','20,00')
  nodes(render()).find(n=>n.type==='form').props.action(fd)
  nodes(render()).find(n=>n.type==='form').props.action(fd)
  assert.equal(submissions[0].idempotency_key,submissions[1].idempotency_key)
  fd.set('valor_pago','25,00')
  nodes(render()).find(n=>n.type==='form').props.action(fd)
  assert.notEqual(submissions[1].idempotency_key,submissions[2].idempotency_key)
})

test('devolução usa somente a RPC integral e não faz gravações alternativas na falha', async () => {
  const calls = []
  const actions = loadAction('src/lib/actions/return.actions.ts', {
    '@/lib/supabase/server': { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id:user } } }) } }) },
    '@/lib/supabase/admin': { getProfileByAdmin: async () => ({ tenant_id:tenant, store_id:1, role:'funcionario' }), createAdminClient: () => ({
      rpc: async (name,args) => { calls.push({name,args}); return {error:{message:'RPC unavailable'}} },
    }) },
    '@/lib/sale-return-request': loadAction('src/lib/sale-return-request.ts', {}),
    '@/lib/server/employee-authorization': { verifyEmployeeAuthorization: () => ({employeeId:5}) },
  })
  const fd = new FormData()
  for (const [k,v] of Object.entries({store_id:1,venda_id:10,customer_id:20,employee_id:5,tipo_reembolso:'Carteira',idempotency_key:key,authorization_token:'synthetic',
    itens_json:JSON.stringify([{venda_item_id:1,product_id:1,quantidade:1,valor_unitario:25,condicao:'Defeito'}])})) fd.set(k,String(v))
  const result = await actions.processarDevolucao({},fd)
  assert.equal(result.success,false)
  assert.equal(result.message,'RPC unavailable')
  assert.equal(calls[0].name,'return_sale_integral')
  assert.equal(calls[0].args.p_key,key)
  fd.delete('idempotency_key')
  await actions.processarDevolucao({},fd)
  assert.equal(calls.length,1)
})
