import assert from 'node:assert/strict'
import test, {before,beforeEach,after} from 'node:test'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {runInNewContext} from 'node:vm'
import ts from 'typescript'
import {PGlite} from '../.test-tools/wallet-validation/node_modules/@electric-sql/pglite/dist/index.js'
const read=f=>readFileSync(new URL(`../${f}`,import.meta.url),'utf8')
const native=createRequire(import.meta.url)
function load(file,mocks={},globals={}){
  const module={exports:{}}
  runInNewContext(ts.transpileModule(read(file),{compilerOptions:{module:ts.ModuleKind.CommonJS,
    target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,
    {module,exports:module.exports,FormData,Buffer,console,require:id=>mocks[id]||(['crypto','zod'].includes(id)?native(id):{}),...globals})
  return module.exports
}
const db=new PGlite(),migration=read('supabase/migrations/20261107220000_atomic_immediate_assistance.sql')
const tenant='11111111-1111-4111-8111-111111111111',user='22222222-2222-4222-8222-222222222222'
const key='33333333-3333-4333-8333-333333333333'
const params=()=>[1,20,30,40,'Armacao','Quebrada',[], '11988887777',5,user,tenant,key]
const call=async(p=params())=>(await db.query('select create_immediate_assistance_atomic($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) x',p.map((x,i)=>i===6?JSON.stringify(x):x))).rows[0].x
before(async()=>db.exec('create role anon;create role authenticated;create role service_role;'))
after(async()=>db.close())
beforeEach(async()=>{
  await db.exec(`drop schema public cascade;create schema public;
    create table stores(id bigint primary key,tenant_id uuid);
    create table profiles(id uuid primary key,tenant_id uuid,store_id bigint,role text);
    create table employees(id bigint primary key,tenant_id uuid,store_id bigint,is_active boolean);
    create table customers(id bigint primary key,tenant_id uuid,store_id bigint,full_name text,fone_movel text);
    create table products(id bigint primary key,tenant_id uuid,store_id bigint,estoque_atual numeric,preco_custo numeric);
    create table vendas(id bigint primary key,tenant_id uuid,store_id bigint,customer_id bigint);
    create table assistance_tickets(id bigint generated always as identity primary key,tracking_token uuid default gen_random_uuid(),
      tenant_id uuid,store_id bigint,customer_id bigint,venda_original_id bigint,product_id bigint,product_descricao text,
      modalidade text,descricao_defeito text,fotos_urls jsonb,contato_usado text,status text,status_publico text,
      created_by_user_id uuid,dt_troca_cliente timestamptz);
    create table stock_movements(id bigint generated always as identity primary key,tenant_id uuid,store_id bigint,
      product_id bigint,variant_id bigint,tipo text,quantidade numeric,motivo text,custo_unitario_momento numeric,
      registrado_por_id uuid,employee_id bigint,created_at timestamptz);
    create table assistance_timeline(id bigint generated always as identity primary key,tenant_id uuid,ticket_id bigint,
      tipo text,mensagem text,usuario_id uuid);
    insert into stores values(1,'${tenant}'),(2,'${tenant}');
    insert into profiles values('${user}','${tenant}',1,'funcionario');
    insert into employees values(5,'${tenant}',1,true),(6,'${tenant}',1,true);
    insert into customers values(20,'${tenant}',1,'Cliente teste','11999999999');
    insert into products values(30,'${tenant}',1,0,25.50);
    insert into vendas values(40,'${tenant}',1,20);`)
  await db.exec(migration)
})
const tables=['customers','products','assistance_tickets','stock_movements','assistance_timeline','immediate_assistance_operations']
async function state(){const s={};for(const t of tables)s[t]=(await db.query(`select to_jsonb(x) x from ${t} x order by ${t==='immediate_assistance_operations'?'key':'id'}`)).rows.map(x=>x.x);return s}
test('troca confirma ticket, telefone, baixa negativa, funcionario exato e historico; repeticao nao duplica',async()=>{
  const result=await call(),s=await state()
  assert.equal(result.status,'LogisticaReversa');assert.equal(result.status_publico,'Troca Realizada')
  assert.equal(result.customers.fone_movel,'11988887777');assert.equal(s.products[0].estoque_atual,-1)
  assert.equal(s.stock_movements[0].employee_id,5);assert.equal(s.stock_movements[0].registrado_por_id,user)
  assert.equal(s.stock_movements[0].custo_unitario_momento,25.5);assert.equal(s.assistance_timeline.length,2)
  assert.equal(s.immediate_assistance_operations[0].authorized_by_employee_id,5)
  assert.deepEqual(await call(),result);assert.deepEqual(await state(),s)
  const changed=params();changed[5]='Outro defeito';await assert.rejects(call(changed),/outros dados/)
  assert.deepEqual(await state(),s)
})
for(const table of tables)test(`falha em ${table} desfaz todas as gravacoes`,async()=>{
  await db.exec(`create function fail_write() returns trigger language plpgsql as $$begin raise exception 'synthetic failure';end $$;
    create trigger fail_write before insert or update on ${table} for each row execute function fail_write();`)
  const s=await state();await assert.rejects(call(),/synthetic failure/);assert.deepEqual(await state(),s)
})
for(const [name,sql] of [
  ['funcionario inativo','update employees set is_active=false where id=5'],
  ['funcionario de outra loja','update employees set store_id=2 where id=5'],
  ['cliente de outra loja','update customers set store_id=2'],
  ['produto de outra loja','update products set store_id=2'],
  ['produto de outro tenant',"update products set tenant_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'"],
  ['venda de outro cliente','update vendas set customer_id=21'],
  ['operador de outra loja','update profiles set store_id=2'],
])test(`${name} bloqueia sem efeitos`,async()=>{
  await db.exec(sql);const s=await state();await assert.rejects(call());assert.deepEqual(await state(),s)
})
test('migration reaplicavel e RPC restrita a service role',async()=>{
  await db.exec(migration)
  assert.equal((await db.query(`select has_function_privilege('authenticated',
    'create_immediate_assistance_atomic(bigint,bigint,bigint,bigint,text,text,jsonb,text,bigint,uuid,uuid,uuid)','execute') x`)).rows[0].x,false)
  await call()
})

function actionHarness(){
  const signing=load('src/lib/server/employee-authorization.ts',{}, {process:{env:{SUPABASE_SERVICE_ROLE_KEY:'synthetic-test-key-long-enough-for-signing'}}})
  const defaults={userId:user,tenantId:tenant,storeId:1,employeeId:5,purpose:'immediate_assistance',context:`immediate:20:30:${key}`}
  const calls=[]
  const admin={from(){throw Error('Immediate flow must use only atomic RPC')},rpc:async(name,args)=>{
    calls.push({name,args})
    try{return {data:await call([args.p_store_id,args.p_customer_id,args.p_product_id,args.p_original_sale_id,args.p_description,
      args.p_defect,args.p_photos,args.p_phone,args.p_employee_id,args.p_user_id,args.p_tenant_id,args.p_key]),error:null}}
    catch(e){return {data:null,error:{message:e.message}}}
  }}
  const action=load('src/lib/actions/assistance.actions.ts',{
    '@/lib/server/employee-authorization':signing,
    '@/lib/supabase/admin':{createAdminClient:()=>admin,getProfileByAdmin:async()=>({tenant_id:tenant,store_id:1,role:'funcionario'})},
    '@/lib/supabase/server':{createClient:()=>({auth:{getUser:async()=>({data:{user:{id:user}}})}})},
    'next/cache':{revalidatePath(){}},
  }).createAssistanceTicket
  const fd=()=>{const f=new FormData();for(const [k,v] of Object.entries({store_id:1,customer_id:20,product_id:30,
    venda_original_id:40,product_descricao:'Armacao',descricao_defeito:'Quebrada',modalidade:'TrocaImediata',
    updated_phone:'11988887777',idempotency_key:key}))f.set(k,String(v));return f}
  return {action,fd,calls,token:extra=>signing.issueEmployeeAuthorization({...defaults,...extra})}
}
test('action verifica token e contexto; RPC registra funcionario assinado, nao campo adulterado',async()=>{
  const h=actionHarness(),f=h.fd()
  assert.equal((await h.action(f)).success,false);assert.equal(h.calls.length,0)
  f.set('authorization_token',h.token({storeId:2}));assert.equal((await h.action(f)).success,false)
  f.set('authorization_token',h.token({purpose:'sale_return'}));assert.equal((await h.action(f)).success,false)
  f.set('authorization_token',h.token({context:`immediate:21:30:${key}`}));assert.equal((await h.action(f)).success,false)
  f.set('authorization_token',h.token({})+'tampered');assert.equal((await h.action(f)).success,false)
  f.set('authorization_token',h.token({}));f.set('employee_id','6')
  assert.equal((await h.action(f)).success,true);assert.equal(h.calls.length,1)
  assert.equal(h.calls[0].args.p_employee_id,5);assert.equal((await h.action(f)).success,true)
  assert.equal((await state()).stock_movements.length,1)
})
test('action retorna falha de banco sem alternativa parcial e rejeita fotos invalidas',async()=>{
  const h=actionHarness(),f=h.fd();f.set('authorization_token',h.token({}))
  await db.exec('update employees set is_active=false where id=5')
  assert.equal((await h.action(f)).success,false);assert.equal((await state()).assistance_tickets.length,0)
  f.set('fotos_urls','{');assert.equal((await h.action(f)).success,false);assert.equal(h.calls.length,1)
})

test('PIN de vendedor ativo autoriza troca; PIN ausente ou contexto invalido nao autoriza',async()=>{
  const signing=load('src/lib/server/employee-authorization.ts',{}, {process:{env:{SUPABASE_SERVICE_ROLE_KEY:'synthetic-test-key-long-enough-for-signing'}}})
  const admin={from(table){const filters={};const q={select(){return q},eq(k,v){filters[k]=v;return q},
    maybeSingle:async()=>({data:table==='profiles'?{tenant_id:tenant,store_id:1,role:'funcionario'}:
      table==='stores'?{id:1}:filters.pin==='1234'&&filters.is_active===true?
      {id:5,full_name:'Vendedor teste',role:'vendedor',is_active:true}:null})};return q}}
  const action=load('src/lib/actions/vendas.actions.ts',{
    '@/lib/server/employee-authorization':signing,
    '@/lib/supabase/admin':{createAdminClient:()=>admin},
    '@/lib/supabase/server':{createClient:()=>({auth:{getUser:async()=>({data:{user:{id:user}}})}})},
  }).autenticarFuncionarioPorPin
  const fd=new FormData();fd.set('store_id','1');fd.set('pin','1234')
  fd.set('authorization_purpose','immediate_assistance');fd.set('authorization_context',`immediate:20:30:${key}`)
  const result=await action({success:false,message:''},fd)
  assert.equal(result.success,true);assert.equal(result.employee.id,5)
  assert.equal(signing.verifyEmployeeAuthorization(result.employee.authorization_token,{userId:user,tenantId:tenant,
    storeId:1,purpose:'immediate_assistance',context:`immediate:20:30:${key}`}).employeeId,5)
  fd.set('pin','bad');assert.equal((await action({success:false,message:''},fd)).success,false)
  fd.set('pin','1234');fd.set('authorization_context','invalid');assert.equal((await action({success:false,message:''},fd)).success,false)
})

for(const modalidade of ['Padrao','TrocaGarantida','TrocaImediata'])test(`produto manual em ${modalidade} permanece em triagem, sem baixa nem PIN`,async()=>{
  const writes=[]
  const admin={from(table){const q={select(){return q},eq(){return q},
    insert(data){writes.push({table,data});return q},update(data){writes.push({table,data});return q},
    maybeSingle:async()=>({data:{id:table==='stores'?1:20},error:null}),
    single:async()=>({data:{id:1,status:'Triagem'},error:null}),then:resolve=>resolve({error:null})};return q},
    rpc(){throw Error('Manual product must not lower stock')}}
  const action=load('src/lib/actions/assistance.actions.ts',{
    '@/lib/supabase/admin':{createAdminClient:()=>admin,getProfileByAdmin:async()=>({tenant_id:tenant,store_id:1,role:'funcionario'})},
    '@/lib/supabase/server':{createClient:()=>({auth:{getUser:async()=>({data:{user:{id:user}}})}})},
    'next/cache':{revalidatePath(){}},
  }).createAssistanceTicket
  const fd=new FormData();for(const [k,v] of Object.entries({store_id:1,customer_id:20,updated_phone:'11999999999',
    modalidade,product_descricao:'Externo',descricao_defeito:'Quebrado'}))fd.set(k,String(v))
  assert.equal((await action(fd)).success,true)
  assert.equal(writes.find(x=>x.table==='assistance_tickets').data.status,'Triagem')
  assert.equal(writes.find(x=>x.table==='assistance_tickets').data.product_id,null)
  assert.ok(!writes.some(x=>['stock_movements','products'].includes(x.table)))
})

const nodes=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(nodes):[n,...nodes(n.props?.children)]
const label=n=>typeof n==='string'?n:Array.isArray(n)?n.map(label).join(''):label(n?.props?.children||'')
test('modal pede PIN, congela dados, impede envio duplicado e reutiliza chave apos erro',async()=>{
  let cursor=0,uuidCalls=0;const states=[],requests=[],alerts=[],pending=[]
  const react={useState(initial){const i=cursor++;if(!(i in states))states[i]=initial;return [states[i],v=>states[i]=v]},
    useRef(initial){const i=cursor++;if(!(i in states))states[i]={current:initial};return states[i]}}
  const jsx=(type,props)=>({type,props})
  let result={success:false,message:'synthetic uncertain result'},release
  const Component=load('src/components/modals/NewAssistanceModal.tsx',{
    react,'react/jsx-runtime':{jsx,jsxs:jsx},'./EmployeeAuthModal':{default:'auth'},
    '@/lib/actions/assistance.actions':{createAssistanceTicket:async fd=>{requests.push(fd);await new Promise(r=>release=r);return result}},
    '@/lib/actions/vendas.actions':{searchCustomersByName:async()=>({success:true,data:[{id:20,full_name:'Cliente teste',fone_movel:'11999999999'}]}),
      getItensCompradosPorCliente:async()=>[{product_id:30,venda_id:40,venda_item_id:1,descricao:'Armacao',data_venda:'2026-11-07',valor:100}]},
  },{crypto:{randomUUID:()=>{uuidCalls++;return key}},alert:m=>alerts.push(m)}).default
  let closed=0,saved=0
  const render=()=>{cursor=0;return Component({isOpen:true,storeId:1,onClose:()=>closed++,onSuccess:()=>saved++})}
  const button=l=>nodes(render()).find(n=>n.type==='button'&&label(n).includes(l))
  nodes(render()).find(n=>n.type==='input').props.onChange({target:{value:'Cliente'}})
  await nodes(render()).find(n=>n.type==='form').props.onSubmit({preventDefault(){}})
  await button('Cliente teste').props.onClick();button('Confirmar').props.onClick();button('Armacao').props.onClick()
  nodes(render()).find(n=>n.type==='textarea').props.onChange({target:{value:'Quebrada'}})
  button('Imediata').props.onClick();button('ABRIR TICKET').props.onClick()
  let auth=nodes(render()).find(n=>n.type==='auth');assert.equal(requests.length,0)
  assert.equal(auth.props.purpose,'immediate_assistance');assert.equal(auth.props.authorizationContext,`immediate:20:30:${key}`)
  auth.props.onSuccess({id:5,authorization_token:'signed-token'})
  auth.props.onSuccess({id:5,authorization_token:'signed-token'})
  assert.equal(requests.length,1);assert.equal(button('').props.disabled,true)
  release();await new Promise(r=>setImmediate(r))
  button('ABRIR TICKET').props.onClick();auth=nodes(render()).find(n=>n.type==='auth')
  auth.props.onSuccess({id:5,authorization_token:'renewed-token'})
  assert.equal(requests[0].get('idempotency_key'),requests[1].get('idempotency_key'));assert.equal(uuidCalls,1)
  assert.equal(requests[1].get('authorization_token'),'renewed-token')
  result={success:true,ticket:{id:1}};release();await new Promise(r=>setImmediate(r))
  assert.equal(saved,1);assert.equal(closed,1);assert.equal(alerts.length,1)
})
