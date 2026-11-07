import assert from 'node:assert/strict'
import test, { before, beforeEach, after } from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { PGlite } from '../.test-tools/wallet-validation/node_modules/@electric-sql/pglite/dist/index.js'

const read=f=>readFileSync(new URL(`../${f}`,import.meta.url),'utf8')
const tenant='00000000-0000-0000-0000-000000000001', user='00000000-0000-0000-0000-000000000002'
const other='00000000-0000-0000-0000-000000000003'
const migration=read('supabase/migrations/20261107140000_atomic_payment_method_change.sql')
const db=new PGlite()
before(async()=>db.exec('create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);'))
after(async()=>db.close())
beforeEach(async()=>{
  await db.exec(`drop schema public cascade;create schema public;
    create table profiles(id uuid,tenant_id uuid,store_id bigint,role text);
    create table stores(id bigint primary key,tenant_id uuid);
    create table employees(id bigint primary key,tenant_id uuid,store_id bigint,is_active boolean);
    create table vendas(id bigint primary key,tenant_id uuid,store_id bigint,status text,is_historical_import boolean default false,
      valor_total numeric,valor_final numeric,valor_restante numeric,valor_desconto numeric default 0);
    create table pagamentos(id bigint primary key,tenant_id uuid,store_id bigint,venda_id bigint,employee_id bigint,
      valor_pago numeric,forma_pagamento text,parcelas integer,data_pagamento date,parcela_id bigint,receipt_operation_id bigint);
    create table accounts_receivable(id bigint generated always as identity primary key,tenant_id uuid,store_id bigint,
      description text,amount numeric,due_date date,status text,type text,origin_payment_id bigint references pagamentos(id),
      paid_at timestamptz,received_amount numeric default 0,reconciled boolean default false);
    create table pix_sale_charges(settlement_pagamento_id bigint);
    create table venda_itens(venda_id bigint,valor_total_item numeric);
    create table financiamento_loja(venda_id bigint,valor_total_financiado numeric);
    insert into stores values(1,'${tenant}'),(2,'${other}');
    insert into profiles values('${user}','${tenant}',1,'funcionario');
    insert into employees values(5,'${tenant}',1,true),(6,'${tenant}',1,true);
    insert into vendas values(10,'${tenant}',1,'Fechada',false,100,100,0,0);
    insert into pagamentos values(30,'${tenant}',1,10,5,100,'Dinheiro',1,'2026-11-07',null,null);
    insert into venda_itens values(10,100);
    insert into auth.users values('${user}') on conflict do nothing;`)
  await db.exec(read('supabase/migrations/20260829100000_payment_method_change_audit.sql'))
  await db.exec(read('supabase/migrations/20260828193000_exclude_installment_payments_from_sale_balance.sql'))
  await db.exec(read('supabase/migrations/20261106180000_guard_direct_payment_sale_balance.sql'))
  await db.exec(migration)
})
const change=(method='Cartão Crédito',count=3,overrides={})=>{
  const p={payment:30,store:1,employee:5,user,...overrides}
  return db.query('select change_payment_method_with_audit($1,$2,$3,$4,$5,$6)',[p.payment,p.store,method,count,p.employee,p.user])
}
async function state(){
  const out={}
  for(const table of ['pagamentos','vendas','accounts_receivable','payment_method_change_audit','payment_method_change_operations'])
    out[table]=(await db.query(`select to_jsonb(t) value from ${table} t order by id`)).rows.map(x=>x.value)
  return out
}
test('dinheiro para crédito gera parcelas exatas, datas e snapshots sem mexer no saldo',async()=>{
  await change();const s=await state()
  assert.deepEqual(s.accounts_receivable.map(x=>x.amount),[33.34,33.33,33.33])
  assert.deepEqual(s.accounts_receivable.map(x=>x.due_date),['2026-11-07','2026-12-07','2027-01-06'])
  assert.equal(s.pagamentos[0].parcelas,3);assert.equal(s.vendas[0].valor_restante,0)
  assert.equal(s.payment_method_change_audit.length,1)
  const snap=s.payment_method_change_operations[0]
  assert.equal(snap.payment_before.forma_pagamento,'Dinheiro');assert.equal(snap.receivables_before.length,0)
  assert.equal(snap.receivables_after.length,3);assert.equal(snap.authorized_by_user_id,user)
  await change();assert.deepEqual(await state(),s)
})
test('mudar parcelamento na mesma forma e reduzir para uma parcela substitui a agenda',async()=>{
  await change();await change('Cartão Crédito',2)
  assert.deepEqual((await state()).accounts_receivable.map(x=>x.amount),[50,50])
  await change('Cartão Crédito',1)
  const s=await state();assert.equal(s.pagamentos[0].parcelas,1)
  assert.deepEqual(s.accounts_receivable.map(x=>x.amount),[100])
  assert.equal(s.payment_method_change_operations[2].receivables_before.length,2)
})
for(const method of ['Dinheiro','PIX Remoto','PIX na maquininha','Cartão Débito'])test(`crédito para ${method} remove somente recebíveis pendentes e zera parcelamento antigo`,async()=>{
  await change();await change(method,3)
  const s=await state();assert.equal(s.pagamentos[0].parcelas,1);assert.deepEqual(s.accounts_receivable,[])
  assert.equal(s.payment_method_change_operations[1].receivables_before.length,3)
})
test('cheque gera agenda e pode ser convertido em cartão',async()=>{
  await change('Cheque-Pré',2)
  assert.ok((await state()).accounts_receivable.every(x=>x.type==='Cheque-Pré'))
  await change('Cartão Crédito',1)
  assert.equal((await state()).accounts_receivable[0].type,'Cartão Crédito')
})
for(const [name,sql] of [
  ['recebido',"update accounts_receivable set status='Recebido'"],
  ['conciliado',"update accounts_receivable set reconciled=true"],
  ['baixa com status obsoleto',"update accounts_receivable set paid_at=now()"],
  ['recebimento parcial',"update accounts_receivable set received_amount=1"],
  ['status nulo',"update accounts_receivable set status=null"],
  ['outra loja',"update accounts_receivable set store_id=2"],
  ['outra empresa',`update accounts_receivable set tenant_id='${other}'`],
])test(`${name} bloqueia sem perder recebíveis`,async()=>{
  await change();await db.exec(sql);const before=await state()
  await assert.rejects(change('Dinheiro',1),/revisao|inconsistentes/)
  assert.deepEqual(await state(),before)
})
for(const [name,sql] of [
  ['carteira',"update pagamentos set forma_pagamento='Crédito em Loja'"],
  ['Pix Sicredi',"update pagamentos set forma_pagamento='Pix Sicredi'"],
  ['vínculo Pix',"insert into pix_sale_charges values(30)"],
  ['parcela',"update pagamentos set parcela_id=8"],
  ['operação de carnê',"alter table pagamentos disable trigger guard_direct_payment_sale_balance;update pagamentos set receipt_operation_id=8"],
  ['histórico',"update vendas set is_historical_import=true"],
  ['cancelada',"update vendas set status='Cancelada'"],
  ['devolvida',"update vendas set status='Devolvida'"],
  ['funcionário inativo',"update employees set is_active=false"],
])test(`${name} não admite edição`,async()=>{
  await db.exec(sql);const before=await state()
  await assert.rejects(change(),/carteira|Pix integrado|carne|indisponivel|inativo/)
  assert.deepEqual(await state(),before)
})
test('usuário, loja, tenant e autoria do pagamento são conferidos',async()=>{
  for(const p of [{user:null},{user:other},{store:2},{employee:6},{employee:99}])await assert.rejects(change('Cartão Crédito',3,p))
  await db.exec("update profiles set role='admin',store_id=2")
  await change()
})
test('quantidade inválida, forma especial e parcelas abaixo de um centavo não gravam',async()=>{
  for(const [method,count] of [['Crédito em Loja',1],['Pix Sicredi',1],['qualquer',1],['Cartão Crédito',0],['Cartão Crédito',13]])
    await assert.rejects(change(method,count))
  await db.exec('update pagamentos set valor_pago=0.01')
  const before=await state();await assert.rejects(change(),/insuficiente/);assert.deepEqual(await state(),before)
})
test('valor legado com fração de centavo não é convertido silenciosamente',async()=>{
  await db.exec('alter table pagamentos disable trigger guard_direct_payment_sale_balance;update pagamentos set valor_pago=100.001')
  const before=await state();await assert.rejects(change(),/invalidos/);assert.deepEqual(await state(),before)
})
for(const table of ['pagamentos','accounts_receivable','payment_method_change_audit','payment_method_change_operations'])test(`falha em ${table} desfaz alteração, agenda e auditoria`,async()=>{
  await change();const before=await state()
  await db.exec(`create function fail_write() returns trigger language plpgsql as $$begin raise exception 'synthetic failure';end $$;
    create trigger fail_write before insert or update on ${table} for each row execute function fail_write();`)
  await assert.rejects(change('Cheque-Pré',2),/synthetic failure/)
  assert.deepEqual(await state(),before)
})
test('migration reaplicável e execução restrita ao backend',async()=>{
  await db.exec(migration)
  const r=await db.query("select has_function_privilege('authenticated','change_payment_method_with_audit(bigint,bigint,text,integer,bigint,uuid)','execute') allowed")
  assert.equal(r.rows[0].allowed,false)
  await change()
})
test('falha na exclusão preserva agenda e pagamento; snapshot sobrevive à remoção posterior',async()=>{
  await change();const before=await state()
  await db.exec(`create function fail_delete() returns trigger language plpgsql as $$begin raise exception 'delete failure';end $$;
    create trigger fail_delete before delete on accounts_receivable for each row execute function fail_delete();`)
  await assert.rejects(change('Dinheiro',1),/delete failure/)
  assert.deepEqual(await state(),before)
  await db.exec('drop trigger fail_delete on accounts_receivable;delete from accounts_receivable;delete from pagamentos')
  assert.equal((await state()).payment_method_change_operations[0].receivables_after.length,3)
})
test('autor e funcionário de outro tenant não podem editar pagamento da loja',async()=>{
  await db.exec(`update profiles set tenant_id='${other}'`)
  await assert.rejects(change(),/acesso/)
  await db.exec(`update profiles set tenant_id='${tenant}';update employees set tenant_id='${other}'`)
  await assert.rejects(change(),/invalido/)
})
test('action envia somente a RPC e não usa escrita alternativa quando ela falha',async()=>{
  const native=createRequire(import.meta.url),module={exports:{}}
  let logged=true,rpcs=0
  const mocks={
    '@/lib/supabase/server':{createClient:()=>({auth:{getUser:async()=>({data:{user:logged?{id:user}:null}})}})},
    '@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(name,p)=>{rpcs++;assert.equal(name,'change_payment_method_with_audit');assert.equal(p.p_installments,1);return {error:{message:'revisao financeira'}}}})},
  }
  runInNewContext(ts.transpileModule(read('src/lib/actions/cashflow.actions.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,
    {module,exports:module.exports,FormData,console,require:id=>mocks[id]||(id==='zod'?native(id):{})})
  const action=module.exports.alterarFormaPagamento
  assert.match((await action(30,'Dinheiro',5,1,1)).message,/revisao/)
  assert.equal((await action(30,'Dinheiro',5,1,0)).success,false)
  logged=false;assert.equal((await action(30,'Dinheiro',5,1,1)).success,false)
  assert.equal(rpcs,1)
})
