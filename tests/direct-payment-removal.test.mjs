import assert from 'node:assert/strict'
import test, { before, beforeEach, after } from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { PGlite } from '../.test-tools/wallet-validation/node_modules/@electric-sql/pglite/dist/index.js'

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
const tenant = '00000000-0000-0000-0000-000000000001'
const user = '00000000-0000-0000-0000-000000000002'
const other = '00000000-0000-0000-0000-000000000003'
const migration = read('supabase/migrations/20261106170000_atomic_direct_payment_removal.sql')
const db = new PGlite()
before(async () => { await db.exec('create role anon; create role authenticated; create role service_role;') })
after(async () => { await db.close() })
beforeEach(async () => {
  await db.exec(`drop schema public cascade; create schema public;
    create table profiles(id uuid primary key,tenant_id uuid,store_id bigint,role text);
    create table stores(id bigint primary key,tenant_id uuid);
    create table vendas(id bigint primary key,tenant_id uuid,store_id bigint,status text,
      is_historical_import boolean default false,valor_total numeric,valor_final numeric,valor_restante numeric,valor_desconto numeric default 0);
    create table pagamentos(id bigint primary key,tenant_id uuid,store_id bigint,venda_id bigint,
      valor_pago numeric,forma_pagamento text,parcela_id bigint,receipt_operation_id bigint);
    create table accounts_receivable(id bigint primary key,tenant_id uuid,store_id bigint,
      origin_payment_id bigint references pagamentos(id),amount numeric,status text);
    create table pix_sale_charges(id bigint primary key,settlement_pagamento_id bigint references pagamentos(id) on delete set null);
    create table venda_itens(venda_id bigint,valor_total_item numeric);
    create table financiamento_loja(venda_id bigint,valor_total_financiado numeric);
    insert into stores values(1,'${tenant}'),(2,'${other}');
    insert into profiles values('${user}','${tenant}',1,'funcionario');
    insert into vendas values(10,'${tenant}',1,'Em Aberto',false,200,200,50,0);
    insert into pagamentos values(30,'${tenant}',1,10,100,'Cartão Crédito',null,null),
      (31,'${tenant}',1,10,50,'Dinheiro',null,null);
    insert into accounts_receivable values(1,'${tenant}',1,30,50,'Pendente'),(2,'${tenant}',1,30,50,'Pendente'),
      (3,'${tenant}',1,31,50,'Pendente');
    insert into venda_itens values(10,200);
  `)
  await db.exec(read('supabase/migrations/20260828193000_exclude_installment_payments_from_sale_balance.sql'))
  await db.exec(migration)
  await db.exec(read('supabase/migrations/20261106180000_guard_direct_payment_sale_balance.sql'))
})
const remove = (overrides = {}) => {
  const p = { payment:30,sale:10,store:1,tenant,user,...overrides }
  return db.query('select remove_direct_sale_payment($1,$2,$3,$4,$5) result',[p.payment,p.sale,p.store,p.tenant,p.user])
}
// Somente no banco sintético: reproduz dados legados inconsistentes que a
// migration 180000 já impediria de criar, para testar o bloqueio da remoção.
async function seedLegacy(change) {
  await db.exec('alter table pagamentos disable trigger guard_direct_payment_sale_balance; alter table pagamentos disable trigger recalculate_direct_payment_sale_balance;')
  try { await db.exec(change) }
  finally { await db.exec('alter table pagamentos enable trigger guard_direct_payment_sale_balance; alter table pagamentos enable trigger recalculate_direct_payment_sale_balance;') }
}
async function state() {
  const result = {}
  for (const table of ['vendas','pagamentos','accounts_receivable','direct_payment_removals','pix_sale_charges']) {
    result[table] = (await db.query(`select to_jsonb(t) value from ${table} t order by id`)).rows.map(x => x.value)
  }
  return result
}

test('remove somente o pagamento e seus recebíveis; saldo e auditoria confirmam juntos', async () => {
  const result = (await remove()).rows[0].result, s = await state()
  assert.equal(result.receivables_removed,2)
  assert.deepEqual(s.pagamentos.map(x=>x.id),[31])
  assert.deepEqual(s.accounts_receivable.map(x=>x.id),[3])
  assert.equal(s.vendas[0].valor_restante,150)
  assert.equal(s.vendas[0].status,'Em Aberto')
  assert.equal(s.direct_payment_removals[0].created_by_user_id,user)
  assert.equal(s.direct_payment_removals[0].payment_snapshot.valor_pago,100)
  assert.equal(s.direct_payment_removals[0].receivables_snapshot.length,2)
  assert.equal(s.direct_payment_removals[0].sale_before.valor_restante,50)
  assert.equal(s.direct_payment_removals[0].sale_after.valor_restante,150)
  await assert.rejects(remove(),/ja removido/)
  assert.deepEqual(await state(),s)
})

for (const method of ['Dinheiro','PIX Remoto','PIX na maquininha','Cartão Débito','Cartão Crédito','Cheque-Pré','Transferência','Boleto']) {
  test(`${method}: pagamento sem recebíveis também pode ser removido`, async () => {
    await db.query('update pagamentos set forma_pagamento=$1 where id=30',[method])
    await db.exec('delete from accounts_receivable where origin_payment_id=30')
    await remove()
    assert.equal((await state()).vendas[0].valor_restante,150)
    assert.deepEqual((await state()).direct_payment_removals[0].receivables_snapshot,[])
  })
}

for (const [name,change,error] of [
  ['histórica','update vendas set is_historical_import=true',/historica/],
  ['fechada',"update vendas set status='Fechada'",/Reabra/],
  ['devolvida',"update vendas set status='Devolvida'",/devolvidas/],
  ['cancelada',"update vendas set status='Cancelada'",/Reabra/],
  ['parcela','update pagamentos set parcela_id=99 where id=30',/carne/],
  ['operação de carnê','update pagamentos set receipt_operation_id=99 where id=30',/carne/],
  ['crédito',"update pagamentos set forma_pagamento='Crédito em Loja' where id=30",/carteira/],
  ['forma Sicredi',"update pagamentos set forma_pagamento='Pix Sicredi' where id=30",/Pix integrado/],
  ['vínculo Sicredi','insert into pix_sale_charges values(1,30)',/Pix integrado/],
  ['recebível de outra loja','update accounts_receivable set store_id=2 where id=1',/inconsistentes/],
  ['recebível de outra empresa',`update accounts_receivable set tenant_id='${other}' where id=1`,/inconsistentes/],
]) test(`${name}: recusa sem alterações`, async () => {
  await seedLegacy(change)
  const before=await state()
  await assert.rejects(remove(),error)
  assert.deepEqual(await state(),before)
})

test('sessão, empresa, loja, venda e pagamento são conferidos no banco',async()=>{
  const before=await state()
  for(const args of [{user:null},{tenant:other},{store:2},{sale:99},{payment:99},{payment:-1}]){
    await assert.rejects(remove(args))
    assert.deepEqual(await state(),before)
  }
  await seedLegacy('update pagamentos set venda_id=99 where id=30')
  await assert.rejects(remove(),/nao encontrado/)
})

test('administrador opera outra loja somente da mesma empresa',async()=>{
  await db.exec("update profiles set role='admin',store_id=99")
  await remove()
  await assert.rejects(remove({payment:31,store:2}),/acesso/)
})

test('recálculo mantém o valor formalizado no carnê e ignora recebimentos de parcelas',async()=>{
  await db.exec(`insert into financiamento_loja values(10,50);
    insert into pagamentos values(32,'${tenant}',1,10,20,'Dinheiro',99,1)`)
  await remove()
  assert.equal((await state()).vendas[0].valor_restante,100)
  assert.ok((await state()).pagamentos.some(x=>x.id===32))
})

for(const table of ['accounts_receivable','pagamentos','vendas','direct_payment_removals']) {
  test(`falha em ${table} desfaz todas as exclusões e o recálculo`,async()=>{
    await db.exec(`create function fail_write() returns trigger language plpgsql as $$ begin raise exception 'synthetic failure'; end $$;
      create trigger fail before insert or update or delete on ${table} for each row execute function fail_write()`)
    const before=await state()
    await assert.rejects(remove(),/synthetic failure/)
    assert.deepEqual(await state(),before)
  })
}

test('RPC e histórico são restritos; migration pode ser reaplicada',async()=>{
  await db.exec(migration)
  for(const role of ['anon','authenticated','service_role']){
    const result=await db.query("select has_function_privilege($1,'remove_direct_sale_payment(bigint,bigint,bigint,uuid,uuid)','EXECUTE') allowed",[role])
    assert.equal(result.rows[0].allowed,role==='service_role')
  }
  assert.equal((await db.query("select has_table_privilege('authenticated','direct_payment_removals','SELECT') allowed")).rows[0].allowed,false)
})

test('action integra a RPC real, sem exclusões alternativas; falha de comissão não oculta remoção concluída',async()=>{
  const calls=[]
  let failRpc=false, failCommission=false, noUser=false
  const nativeRequire=createRequire(import.meta.url), module={exports:{}}
  const admin={
    from(table){
      assert.ok(['vendas','pagamentos'].includes(table))
      const filters={}
      const chain={select(){return chain},eq(k,v){filters[k]=v;return chain},async maybeSingle(){
        const rows=(await db.query(`select * from ${table} where id=$1`,[filters.id])).rows
        const row=rows.find(x=>Object.entries(filters).every(([k,v])=>x[k]===v))
        return {data:row??null,error:null}
      }}
      return chain
    },
    async rpc(name,args){
      calls.push(name)
      assert.equal(name,'remove_direct_sale_payment')
      if(failRpc)return {error:{message:'RPC unavailable'}}
      try{return {data:(await remove({payment:args.p_payment_id,sale:args.p_sale_id,store:args.p_store_id,tenant:args.p_tenant_id,user:args.p_user_id})).rows[0].result,error:null}}
      catch(e){return {error:{message:e.message}}}
    },
  }
  const mocks={
    '@/lib/supabase/server':{createClient:()=>({auth:{getUser:async()=>({data:{user:noUser?null:{id:user}},error:null})}})},
    '@/lib/supabase/admin':{createAdminClient:()=>admin,getProfileByAdmin:async()=>({tenant_id:tenant,store_id:1,role:'funcionario'})},
    './commission.actions':{calcularERegistrarComissao:async()=>{if(failCommission)throw Error('synthetic commission failure')}},
    'next/cache':{revalidatePath(){}},
  }
  const code=ts.transpileModule(read('src/lib/actions/vendas.actions.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
  runInNewContext(code,{module,exports:module.exports,console:{error(){}},require:id=>mocks[id]||(['zod','node:crypto'].includes(id)?nativeRequire(id):{})})
  const actions=module.exports, before=await state()
  noUser=true;assert.equal((await actions.deletePagamento(30,10,1)).success,false);noUser=false
  assert.equal(calls.length,0)
  failRpc=true
  assert.equal((await actions.deletePagamento(30,10,1)).message,'RPC unavailable')
  assert.deepEqual(await state(),before)
  failRpc=false;failCommission=true
  const result=await actions.deletePagamento(30,10,1)
  assert.equal(result.success,true)
  assert.match(result.message,/comissão precisa ser revisada/)
  assert.equal((await state()).pagamentos.length,1)
  assert.equal((await actions.deletePagamento(30,10,1)).success,false)
  assert.equal(calls.length,2)
})
