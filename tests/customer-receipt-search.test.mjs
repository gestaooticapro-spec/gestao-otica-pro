import assert from 'node:assert/strict'
import test,{before,beforeEach,after} from 'node:test'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {runInNewContext} from 'node:vm'
import ts from 'typescript'
import {PGlite} from '../.test-tools/wallet-validation/node_modules/@electric-sql/pglite/dist/index.js'
const read=f=>readFileSync(new URL(`../${f}`,import.meta.url),'utf8')
const tenant='00000000-0000-0000-0000-000000000001',user='00000000-0000-0000-0000-000000000002'
const other='00000000-0000-0000-0000-000000000003'
const migration=read('supabase/migrations/20261107180000_installment_payment_customer_description.sql')
const db=new PGlite()
before(async()=>db.exec('create role anon;create role authenticated;create role service_role;'))
after(async()=>db.close())
beforeEach(async()=>{
  await db.exec(`drop schema public cascade;create schema public;
    create table customers(id bigint primary key,tenant_id uuid,store_id bigint,full_name text,razao_social text,nome_fantasia text,
      cpf text,cnpj text,fone_movel text,phone text,obs_debito text);
    create table vendas(id bigint primary key,tenant_id uuid,store_id bigint,customer_id bigint,status text,
      is_historical_import boolean default false,valor_restante numeric);
    create table financiamento_loja(id bigint primary key,venda_id bigint,tenant_id uuid,store_id bigint,customer_id bigint);
    create table financiamento_parcelas(id bigint primary key,tenant_id uuid,store_id bigint,financiamento_id bigint,customer_id bigint,
      numero_parcela integer,valor_parcela numeric,valor_pago numeric,status text,obs text,data_pagamento date,
      valor_transferido_entrada numeric default 0,valor_transferido_saida numeric default 0,valor_renegociado_saida numeric default 0);
    create table employees(id bigint primary key,store_id bigint,is_active boolean,role text);
    create table pagamentos(id bigint generated always as identity primary key,tenant_id uuid,store_id bigint,venda_id bigint,
      parcela_id bigint,customer_id bigint,employee_id bigint,created_by_user_id uuid,valor_pago numeric,forma_pagamento text,
      data_pagamento date,created_at timestamptz,parcelas integer,receipt_operation_id bigint,obs text);
    create table installment_receipt_operations(id bigint generated always as identity primary key,tenant_id uuid,store_id bigint,
      financiamento_id bigint,venda_id bigint,customer_id bigint,origin_installment_id bigint,received_amount numeric,interest_amount numeric,
      payment_method text,strategy text,received_on date,received_by_employee_id bigint,created_by_user_id uuid,installments_before jsonb,
      sale_before jsonb,state text,installments_after jsonb,sale_after jsonb,payments_created jsonb,affected_installment_count integer,
      transferred_amount numeric,destination_installment_id bigint,completed_at timestamptz);
    insert into customers values(20,'${tenant}',1,'Maria Teste',null,null,'12345678900',null,'(11) 99999-1234',null,null),
      (21,'${tenant}',1,'Empresa Teste','Razão Social Teste',null,null,'12345678000199',null,'(11) 3333-1234',null),
      (22,'${other}',2,'Outra Loja',null,null,null,null,'11999991234',null,null),
      (23,'${other}',1,'Outro Tenant',null,null,null,null,'11999991234',null,null);
    insert into vendas values(10,'${tenant}',1,20,'Fechada',false,0);
    insert into financiamento_loja values(7,10,'${tenant}',1,20);
    insert into financiamento_parcelas(id,tenant_id,store_id,financiamento_id,customer_id,numero_parcela,valor_parcela,valor_pago,status,obs)
      values(8,'${tenant}',1,7,20,1,100,0,'Pendente','Cliente pediu contato por mensagem'),
        (9,'${tenant}',1,7,20,2,100,0,'Pendente','Segunda anotação');
    insert into employees values(5,1,true,'vendedor');
    insert into pagamentos(venda_id,valor_pago,obs) values(10,1,'Legado preservado');`)
  await db.exec(read('supabase/migrations/20260827170000_installment_receipt_effective_balance.sql'))
  await db.exec(migration)
})
const receive=(amount=50,receipts=[{forma_pagamento:'Dinheiro',valor:amount}])=>db.query(
  "select receive_installment_payment_core(8,10,1,5,$1,$2,$3,0,'2026-11-07','baixa_parcial',$4) result",
  [user,tenant,amount,JSON.stringify(receipts)])
test('recebimento real usa nome cadastral e preserva anotação separada no pagamento e snapshot',async()=>{
  await receive()
  const payments=(await db.query('select * from pagamentos order by id')).rows
  assert.equal(payments[0].obs,'Legado preservado');assert.equal(payments[0].installment_note_snapshot,null)
  assert.equal(payments[1].obs,'Ref. Venda #10 - Parc. 1 - Cliente: Maria Teste')
  assert.equal(payments[1].installment_note_snapshot,'Cliente pediu contato por mensagem')
  const op=(await db.query('select * from installment_receipt_operations')).rows[0]
  assert.equal(op.payments_created[0].obs,payments[1].obs)
  assert.equal(op.payments_created[0].installment_note_snapshot,payments[1].installment_note_snapshot)
  assert.equal((await db.query('select obs from financiamento_parcelas where id=8')).rows[0].obs,'Cliente pediu contato por mensagem')
})
test('excedente e formas múltiplas conservam o nome e a observação de cada parcela alocada',async()=>{
  await receive(150,[{forma_pagamento:'Dinheiro',valor:80},{forma_pagamento:'PIX Remoto',valor:70}])
  const rows=(await db.query('select * from pagamentos where receipt_operation_id is not null order by id')).rows
  assert.equal(rows.length,3);assert.ok(rows.every(p=>p.obs.endsWith('Cliente: Maria Teste')))
  assert.equal(rows[2].installment_note_snapshot,'Segunda anotação')
  assert.equal(rows.reduce((n,p)=>n+Number(p.valor_pago),0),150)
})
test('nome faltante não é substituído pela anotação nem por cliente de outro tenant',async()=>{
  await db.exec(`update customers set tenant_id='${other}' where id=20`)
  await receive();assert.match((await db.query('select obs from pagamentos where receipt_operation_id is not null')).rows[0].obs,/Cliente não identificado$/)
})
test('nome PJ pode usar razão social quando nome principal está vazio',async()=>{
  await db.exec("update customers set full_name='',razao_social='Ótica Empresa' where id=20")
  await receive();assert.match((await db.query('select obs from pagamentos where receipt_operation_id is not null')).rows[0].obs,/Cliente: Ótica Empresa$/)
})
test('falha nos vínculos do snapshot reverte recebimento, parcela e operação',async()=>{
  await db.exec("update financiamento_loja set store_id=2")
  await assert.rejects(receive(),/inconsistente/)
  assert.equal((await db.query('select count(*)::int n from installment_receipt_operations')).rows[0].n,0)
  assert.equal(Number((await db.query('select valor_pago from financiamento_parcelas where id=8')).rows[0].valor_pago),0)
})
test('colunas de telefone normalizam dados antigos e acompanham futuras alterações; migration reaplicável',async()=>{
  await db.exec(migration)
  assert.equal((await db.query('select search_mobile_digits from customers where id=20')).rows[0].search_mobile_digits,'11999991234')
  await db.exec("update customers set fone_movel='+55 (21) 98888-0000' where id=20")
  assert.equal((await db.query('select search_mobile_digits from customers where id=20')).rows[0].search_mobile_digits,'5521988880000')
})

function searchHarness(){
  let logged=true,profile={tenant_id:tenant,store_id:1,role:'funcionario'},lastFilter='',queries=0
  const module={exports:{}},native=createRequire(import.meta.url)
  const admin={from(table){if(table==='financiamento_parcelas'){
    const q={select(){return q},eq(){return q},in(){return q},gt(){return q},lt:async()=>({data:[]})};return q
  }
    assert.equal(table,'customers');queries++;const filters=[]
    const q={select(){return q},eq(key,v){filters.push([key,v]);return q},or(value){lastFilter=value;return q},order(){return q},
      async limit(n){
        const params=[],clauses=[]
        for(const match of lastFilter.matchAll(/(\w+)\.ilike\.("(?:\\.|[^"\\])*"|[^,]+)(?:,|$)/g)){
          params.push(match[2].startsWith('"')?JSON.parse(match[2]):match[2]);clauses.push(`${match[1]} ilike $${params.length}`)
        }
        for(const [k,v] of filters){params.push(v);clauses.push(`${k}=$${params.length}`)}
        const orCount=clauses.length-filters.length
        const where=`(${clauses.slice(0,orCount).join(' or ')}) and ${clauses.slice(orCount).join(' and ')}`
        const data=(await db.query(`select * from customers where ${where} order by full_name limit ${n}`,params)).rows
        return {data,error:null}
      }};return q
  }}
  const mocks={
    '@/lib/supabase/server':{createClient:()=>({auth:{getUser:async()=>({data:{user:logged?{id:user}:null}})}})},
    '@/lib/supabase/admin':{createAdminClient:()=>admin,getProfileByAdmin:async()=>profile},
    '@/lib/customer-document':{documentDigits:value=>String(value||'').replace(/\D/g,'')},
  }
  runInNewContext(ts.transpileModule(read('src/lib/actions/vendas.actions.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,
    {module,exports:module.exports,FormData,console,require:id=>mocks[id]||(['zod','node:crypto'].includes(id)?native(id):{})})
  return {search:module.exports.searchCustomersByName,setLogged:v=>logged=v,setProfile:v=>profile=v,queries:()=>queries,filter:()=>lastFilter}
}
for(const query of ['11999991234','(11) 99999-1234','+55 (11) 99999-1234','99999-1234','Maria','12345678900'])
test(`busca ${query} acha o cadastro da loja e tenant autorizados`,async()=>{
  const h=searchHarness(),result=await h.search(query,1)
  assert.equal(result.success,true);assert.deepEqual(result.data.map(x=>x.id),[20])
})
test('busca telefone fixo e documentos PJ preserva filtros de nome/documento',async()=>{
  const h=searchHarness()
  for(const query of ['1133331234','Empresa','12345678000199'])assert.deepEqual((await h.search(query,1)).data.map(x=>x.id),[21])
})
test('nome com separadores não injeta condições no filtro da busca',async()=>{
  await db.query('update customers set full_name=$1 where id=20',['Maria, (Teste) "A"'])
  const h=searchHarness();assert.deepEqual((await h.search('Maria, (Teste) "A"',1)).data.map(x=>x.id),[20])
})
test('sessão e acesso à loja são obrigatórios; admin continua limitado ao tenant',async()=>{
  const h=searchHarness();h.setLogged(false);assert.equal((await h.search('Maria',1)).success,false)
  h.setLogged(true);assert.equal((await h.search('Maria',2)).success,false);assert.equal(h.queries(),0)
  h.setProfile({tenant_id:tenant,store_id:9,role:'admin'})
  assert.deepEqual((await h.search('Maria',1)).data.map(x=>x.id),[20])
  assert.equal((await h.search('Outra',2)).data.length,0)
})
