import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {runInNewContext} from 'node:vm'
import ts from 'typescript'

const tenant='tenant-a'
const source=readFileSync(new URL('../src/lib/actions/vendas.actions.ts',import.meta.url),'utf8')
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
function harness(){
  let profile={tenant_id:tenant,store_id:1,role:'admin'},logged=true,blocked=false
  const writes=[],billing=[],invalidations=[],reads=[],rpcs=[]
  const tables={stores:[{id:1,tenant_id:tenant,settings:{}},{id:2,tenant_id:tenant,settings:{}},{id:3,tenant_id:'tenant-b',settings:{}}],
    customers:[{id:20,store_id:2,tenant_id:tenant},{id:21,store_id:1,tenant_id:tenant}],
    employees:[{id:5,store_id:2,tenant_id:tenant,is_active:true},{id:6,store_id:1,tenant_id:tenant,is_active:true}],
    vendas:[{id:10,store_id:2,tenant_id:tenant,status:'Em Aberto'}],
    products:[{id:7,store_id:2,tenant_id:tenant},{id:8,store_id:1,tenant_id:tenant}],
    optical_evaluations:[],venda_itens:[],tenant_commercial_offers:[]}
  const client={auth:{getUser:async()=>({data:{user:logged?{id:'user'}:null}})},from(table){
    assert.ok(table in tables,`Unexpected table ${table}`)
    const predicates=[];let op='read',value,single=false
    const q={select(){return q},eq(k,v){predicates.push(x=>x[k]===v);return q},is(k,v){predicates.push(x=>(x[k]??null)===v);return q},
      gte(k,v){predicates.push(x=>x[k]>=v);return q},or(){return q},order(){return q},limit(){return q},
      insert(v){op='insert';value=v;return q},update(v){op='update';value=v;return q},
      single(){single=true;return q},maybeSingle(){single=true;return q},then(resolve,reject){
        const rows=tables[table].filter(x=>predicates.every(p=>p(x)))
        if(op==='insert') {const row={id:100+tables[table].length,...value};tables[table].push(row);writes.push({table,row});return Promise.resolve({data:row,error:null}).then(resolve,reject)}
        if(op==='update'){for(const row of rows)Object.assign(row,value);writes.push({table,value});return Promise.resolve({data:null,error:null}).then(resolve,reject)}
        reads.push(table);return Promise.resolve({data:single?(rows[0]??null):rows,error:null}).then(resolve,reject)
      }};return q
    },rpc:async(name,p)=>{rpcs.push({name,p});return {error:null}}}
  const mocks={
    '@/lib/supabase/server':{createClient:()=>client},
    '@/lib/supabase/admin':{createAdminClient:()=>client,getProfileByAdmin:async()=>profile},
    '@/lib/billing/billing-guard':{getNewSaleBillingGuard:async id=>{billing.push(id);return {blocked,message:'billing blocked'}}},
    './commission.actions':{calcularERegistrarComissao:async()=>{}},
    'next/cache':{revalidatePath:path=>invalidations.push(path)},
  }
  const module={exports:{}},native=createRequire(import.meta.url)
  runInNewContext(compiled,{module,exports:module.exports,FormData,console,require:id=>mocks[id]||(['zod','node:crypto'].includes(id)?native(id):{})})
  const item=async(overrides={})=>{
    const fd=new FormData()
    for(const [k,v] of Object.entries({venda_id:10,item_tipo:'Outro',descricao:'Produto teste',quantidade:1,valor_unitario:100,
      lente_id:'',armacao_id:'',tratamento_id:'',unidade:'Unidade',...overrides}))fd.set(k,String(v))
    return module.exports.addVendaItem({success:false,message:''},fd)
  }
  return {actions:module.exports,item,tables,writes,billing,invalidations,reads,rpcs,
    profile:p=>profile=p,logged:v=>logged=v,blocked:v=>blocked=v}
}
test('admin de loja 1 cria venda na loja 2 e avalia cobrança e avaliação nessa loja',async()=>{
  const h=harness(),r=await h.actions.createNewVenda(20,5,2)
  assert.equal(r.success,true,r.message);assert.equal(r.data.store_id,2);assert.equal(r.data.tenant_id,tenant)
  assert.deepEqual(h.billing,[2]);assert.equal(h.writes.find(x=>x.table==='vendas').row.customer_id,20)
})
test('admin sem loja fixa pode operar loja autorizada do mesmo tenant',async()=>{
  const h=harness();h.profile({tenant_id:tenant,store_id:null,role:'admin'})
  assert.equal((await h.actions.createNewVenda(20,5,2)).success,true)
})
for(const [label,customer,employee,store] of [['loja de outro tenant',20,5,3],['cliente de outra loja',21,5,2],['vendedor de outra loja',20,6,2],['loja ausente',20,5,undefined],['loja inválida',20,5,0]])
test(`${label}: criação bloqueada antes de inserir`,async()=>{
  const h=harness();assert.equal((await h.actions.createNewVenda(customer,employee,store)).success,false)
  assert.equal(h.writes.length,0)
})
test('operador não pode criar em outra loja; pode criar na própria',async()=>{
  const h=harness();h.profile({tenant_id:tenant,store_id:1,role:'vendedor'})
  assert.equal((await h.actions.createNewVenda(20,5,2)).success,false);assert.equal(h.writes.length,0)
  assert.equal((await h.actions.createNewVenda(21,6,1)).success,true)
})
test('sessão, vendedor ativo, bloqueio comercial e avaliação aberta continuam respeitados',async()=>{
  const h=harness();h.logged(false);assert.equal((await h.actions.createNewVenda(20,5,2)).success,false)
  h.logged(true);h.tables.employees[0].is_active=false;assert.equal((await h.actions.createNewVenda(20,5,2)).success,false)
  h.tables.employees[0].is_active=true;h.blocked(true);assert.equal((await h.actions.createNewVenda(20,5,2)).success,false)
  h.blocked(false);h.tables.optical_evaluations.push({id:50,store_id:2,tenant_id:tenant,updated_at:new Date().toISOString()})
  assert.equal((await h.actions.createNewVenda(20,5,2)).blockedEvaluationId,50);assert.equal(h.writes.length,0)
})
for(const itemType of ['Outro','Servico','Armacao','Solar','Tratamento','Lente'])
test(`${itemType}: item usa a loja da venda e invalida suas páginas`,async()=>{
  const h=harness(),fields={item_tipo:itemType}
  if(['Armacao','Solar'].includes(itemType))fields.armacao_id=7
  if(itemType==='Tratamento')fields.tratamento_id=7
  if(itemType==='Lente')fields.lente_id=7
  const r=await h.item(fields)
  assert.equal(r.success,true,r.message);assert.equal(r.data.store_id,2);assert.equal(r.data.tenant_id,tenant)
  assert.ok(h.invalidations.includes('/dashboard/loja/2/vendas/10/experimental'))
  assert.ok(!h.invalidations.some(p=>p.includes('/loja/1/')))
})
test('operador de outra loja não inclui item mesmo conhecendo o ID da venda',async()=>{
  const h=harness();h.profile({tenant_id:tenant,store_id:1,role:'vendedor'})
  assert.equal((await h.item()).success,false);assert.equal(h.writes.length,0);assert.equal(h.rpcs.length,0)
})
test('item e produto de outro tenant/loja ou venda fechada são recusados sem gravar',async()=>{
  const h=harness();assert.equal((await h.item({item_tipo:'Armacao',armacao_id:8})).success,false)
  h.tables.vendas[0].tenant_id='tenant-b';assert.equal((await h.item()).success,false)
  h.tables.vendas[0].tenant_id=tenant;h.tables.vendas[0].status='Fechada';assert.equal((await h.item()).success,false)
  assert.equal(h.writes.length,0)
})
test('lente por unidade conserva conversão de par usando a loja da venda',async()=>{
  const h=harness();h.tables.stores[1].settings={lens_sale_unit_mode:true}
  const r=await h.item({item_tipo:'Lente',lente_id:7,quantidade:1,valor_unitario:100,unidade:'Par'})
  assert.equal(r.success,true,r.message);assert.equal(r.data.quantidade,2);assert.equal(r.data.valor_unitario,50)
  assert.equal(r.data.valor_total_item,100);assert.equal(r.data.store_id,2)
})
test('oferta de tabela ativa pode ser incluída sem produto local, no contexto da venda',async()=>{
  const h=harness();h.tables.tenant_commercial_offers.push({id:1,store_id:2,global_offer_id:'offer',is_active:true})
  const r=await h.item({item_tipo:'Lente',catalog_offer_snapshot:JSON.stringify({globalOfferId:'offer',displayName:'Lente tabela',originalPrice:100})})
  assert.equal(r.success,true,r.message);assert.equal(r.data.product_id,null);assert.equal(r.data.store_id,2)
})
