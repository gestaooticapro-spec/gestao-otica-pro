import assert from 'node:assert/strict'
import test, { before, beforeEach, after } from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { PGlite } from '../.test-tools/wallet-validation/node_modules/@electric-sql/pglite/dist/index.js'

const read=f=>readFileSync(new URL(`../${f}`,import.meta.url),'utf8')
const tenant='00000000-0000-0000-0000-000000000001', user='00000000-0000-0000-0000-000000000002'
const migration=read('supabase/migrations/20261107120000_guard_sale_closing_balance.sql')
const db=new PGlite()
before(async()=>db.exec('create role anon;create role authenticated;create role service_role;'))
after(async()=>db.close())
beforeEach(async()=>{
  await db.exec(`drop schema public cascade;create schema public;
    create table profiles(id uuid,tenant_id uuid,store_id bigint,role text);
    create table stores(id bigint,tenant_id uuid);
    create table vendas(id bigint primary key,store_id bigint,tenant_id uuid,status text,
      is_historical_import boolean default false,valor_desconto numeric default 0,
      valor_total numeric,valor_final numeric,valor_restante numeric,data_fechamento timestamptz);
    create table venda_itens(venda_id bigint,valor_total_item numeric);
    create table pagamentos(venda_id bigint,valor_pago numeric,parcela_id bigint);
    create table financiamento_loja(venda_id bigint,valor_total_financiado numeric);
    insert into stores values(1,'${tenant}'),(2,'${tenant}');
    insert into profiles values('${user}','${tenant}',1,'funcionario');
    insert into vendas(id,store_id,tenant_id,status,valor_total,valor_final,valor_restante)
      values(10,1,'${tenant}','Em Aberto',100,100,0);
    insert into venda_itens values(10,100);`)
  await db.exec(migration)
})
const close=(store=1,t=tenant,u=user)=>db.query('select close_sale_with_balance_check(10,$1,$2,$3) result',[store,t,u])
const sale=async()=>(await db.query('select * from vendas where id=10')).rows[0]
for(const gap of [20,0.01,0.04])test(`recusa saldo descoberto ${gap} apesar de valor_restante obsoleto e carnê`,async()=>{
  await db.query('insert into financiamento_loja values(10,$1)',[100-gap])
  const before=await sale()
  await assert.rejects(close(),/saldo a receber/)
  assert.deepEqual(await sale(),before)
  await assert.rejects(db.exec("update vendas set status='Fechada' where id=10"),/saldo a receber/)
})
test('entrada e carnê cobrem o total; parcelas recebidas não contam como entrada',async()=>{
  await db.exec('insert into pagamentos values(10,20,null),(10,10,9);insert into financiamento_loja values(10,80)')
  const result=(await close()).rows[0].result
  assert.equal(result.status,'Fechada');assert.equal(result.valor_restante,0)
  assert.ok(result.data_fechamento)
  await assert.rejects(close(),/em aberto/)
})
test('recebimento de parcela não cobre diferença fora do carnê',async()=>{
  await db.exec('insert into pagamentos values(10,20,9);insert into financiamento_loja values(10,80)')
  await assert.rejects(close(),/saldo a receber/)
})
test('pagamento integral sem carnê permite fechar e recalcula totais reais',async()=>{
  await db.exec('insert into pagamentos values(10,100,null);update vendas set valor_total=999,valor_final=999,valor_restante=999')
  await close();const s=await sale()
  assert.equal(Number(s.valor_total),100);assert.equal(Number(s.valor_restante),0)
})
test('desconto reduz somente o total líquido',async()=>{
  await db.exec('update vendas set valor_desconto=10 where id=10;insert into financiamento_loja values(10,90)')
  await close();assert.equal(Number((await sale()).valor_final),90)
})
test('sessão, tenant, loja e perfil são obrigatórios na RPC',async()=>{
  for(const args of [[2,tenant,user],[1,null,user],[1,tenant,null],[1,tenant,'00000000-0000-0000-0000-000000000099']])
    await assert.rejects(close(...args),/acesso|encontrada/)
  await db.exec(`update profiles set store_id=2,role='admin';insert into financiamento_loja values(10,100)`)
  await close();assert.equal((await sale()).status,'Fechada')
})
for(const status of ['Cancelada','Devolvida'])test(`não fecha venda ${status}`,async()=>{
  await db.query('update vendas set status=$1 where id=10',[status])
  await assert.rejects(close(),/em aberto/)
  await assert.rejects(db.exec("update vendas set status='Fechada' where id=10"),/em aberto/)
})
test('histórico é preservado; Expressa pode nascer fechada; migration reaplicável',async()=>{
  await db.exec(migration)
  await db.exec("update vendas set is_historical_import=true where id=10")
  await assert.rejects(close(),/nao historica/)
  await db.exec("update vendas set status='Fechada' where id=10")
  assert.equal(Number((await sale()).valor_restante),0)
  await db.exec(`insert into vendas(id,status) values(11,'Fechada')`)
  assert.equal((await db.query('select status from vendas where id=11')).rows[0].status,'Fechada')
  const grants=await db.query(`select has_function_privilege('authenticated','close_sale_with_balance_check(bigint,bigint,uuid,uuid)','execute') allowed`)
  assert.equal(grants.rows[0].allowed,false)
})
test('proteções de pagamento e fechamento funcionam juntas, inclusive na Expressa',async()=>{
  await db.exec(`alter table pagamentos add column id bigint generated always as identity;
    alter table pagamentos add column tenant_id uuid default '${tenant}';
    alter table pagamentos add column store_id bigint default 1;
    alter table pagamentos add column receipt_operation_id bigint;`)
  await db.exec(read('supabase/migrations/20260828193000_exclude_installment_payments_from_sale_balance.sql'))
  await db.exec(read('supabase/migrations/20261106180000_guard_direct_payment_sale_balance.sql'))
  await db.exec('insert into pagamentos(venda_id,valor_pago) values(10,99.99)')
  await assert.rejects(close(),/saldo a receber/)
  await db.exec('insert into pagamentos(venda_id,valor_pago) values(10,0.01)')
  await close()
  await db.exec(`insert into vendas(id,store_id,tenant_id,status) values(11,1,'${tenant}','Fechada');
    insert into venda_itens values(11,100);
    insert into pagamentos(venda_id,valor_pago) values(11,100);`)
  assert.equal(Number((await db.query('select valor_restante from vendas where id=11')).rows[0].valor_restante),0)
})

function load(file,mocks={}){
  const native=createRequire(import.meta.url),module={exports:{}}
  const code=ts.transpileModule(read(file),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText
  runInNewContext(code,{module,exports:module.exports,FormData,console,
    require:id=>mocks[id]||(['zod','node:crypto'].includes(id)?native(id):{})})
  return module.exports
}
test('action não grava nem executa efeitos se RPC recusa ou está ausente; valida acesso antes da RPC',async()=>{
  let logged=true,store=1,rpcs=0,writes=0
  const action=load('src/lib/actions/vendas.actions.ts',{
    '@/lib/supabase/server':{createClient:()=>({auth:{getUser:async()=>({data:{user:logged?{id:user}:null}})}})},
    '@/lib/supabase/admin':{getProfileByAdmin:async()=>({tenant_id:tenant,store_id:store,role:'funcionario'}),createAdminClient:()=>({
      from:table=>{const chain={select(){return chain},eq(){return chain},update(){writes++;throw Error('unexpected update')},
        maybeSingle:async()=>({data:table==='stores'?{id:1}:{status:'Em Aberto',is_historical_import:false}})};return chain},
      rpc:async(name)=>{rpcs++;assert.equal(name,'close_sale_with_balance_check');return {data:null,error:{message:'Ainda ha saldo a receber / RPC indisponivel'}}},
    })},
  })
  assert.match((await action.updateVendaStatus(10,1,'Fechada',5)).message,/saldo a receber/)
  logged=false;assert.equal((await action.updateVendaStatus(10,1,'Fechada',5)).success,false)
  logged=true;store=2;assert.equal((await action.updateVendaStatus(10,1,'Fechada',5)).success,false)
  assert.equal(rpcs,1);assert.equal(writes,0)
})
test('tela bloqueia um centavo com ou sem carnê e libera saldo coberto',()=>{
  const jsx=(type,props)=>({type,props})
  const Component=load('src/components/vendas/VendaActions.tsx',{
    react:{useState:initial=>[initial,()=>{}],useTransition:()=>[false,()=>{}]},
    'react/jsx-runtime':{jsx,jsxs:jsx},
    '@/lib/contexts/StoreModulesContext':{useStoreModules:()=>({fiscal:false})},
  }).default
  const nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)]
  for(const finance of [null,1])for(const remaining of [0,0.01,20]){
    const tree=Component({venda:{id:10,store_id:1,status:'Em Aberto',created_at:new Date().toISOString(),valor_restante:remaining,financiamento_id:finance},vendaItens:[],isVendaFechada:false})
    assert.equal(nodes(tree).some(n=>n.type==='span'&&n.props.children==='Finalizar Venda'),remaining===0)
  }
})
test('action usa o resultado da RPC e só depois confirma efeitos operacionais',async()=>{
  const events=[]
  const action=load('src/lib/actions/vendas.actions.ts',{
    '@/lib/supabase/server':{createClient:()=>({auth:{getUser:async()=>({data:{user:{id:user}}})}})},
    '@/lib/supabase/admin':{getProfileByAdmin:async()=>({tenant_id:tenant,store_id:1,role:'funcionario'}),createAdminClient:()=>({
      from:table=>{const chain={select(){return chain},eq(){return chain},
        not:async()=>({data:[]}),
        maybeSingle:async()=>({data:table==='stores'?{id:1}:{status:'Em Aberto',is_historical_import:false}})};return chain},
      rpc:async(name,p)=>{assert.equal(name,'close_sale_with_balance_check');assert.equal(p.p_user_id,user);events.push('close');
        return {data:{id:10,status:'Fechada',valor_restante:0,customer_id:null},error:null}},
    })},
    './commission.actions':{calcularERegistrarComissao:async()=>events.push('commission'),calcularComissaoMedico:async()=>events.push('doctor')},
    './stock.actions':{confirmReservations:async()=>events.push('stock')},
    'next/cache':{revalidatePath(){}},
  })
  const result=await action.updateVendaStatus(10,1,'Fechada',5)
  assert.equal(result.success,true);assert.deepEqual(events,['close','commission','doctor','stock'])
})
