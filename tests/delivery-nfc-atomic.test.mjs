import assert from 'node:assert/strict'
import test,{before,beforeEach,after} from 'node:test'
import {readFileSync} from 'node:fs'
import {PGlite} from '../.test-tools/wallet-validation/node_modules/@electric-sql/pglite/dist/index.js'
import ts from 'typescript'
import {runInNewContext} from 'node:vm'
const read=f=>readFileSync(new URL(`../${f}`,import.meta.url),'utf8')
const db=new PGlite(),migration=read('supabase/migrations/20261107200000_atomic_delivery_nfc_release.sql')
before(async()=>db.exec('create role anon;create role authenticated;'))
after(async()=>db.close())
beforeEach(async()=>{
  await db.exec(`drop schema public cascade;create schema public;
    create table service_orders(id bigint primary key,store_id bigint,dt_entregue_em timestamptz,lab_nome text);
    create table nfc_trays(id text primary key,store_id bigint,current_service_order_id bigint);
    create table nfc_tray_events(id bigint generated always as identity primary key,tray_id text,store_id bigint,
      service_order_id bigint,action text,metadata jsonb);
    insert into service_orders values(10,1,null,'Antes'),(11,1,null,'Outra');
    insert into nfc_trays values('a',1,10),('b',1,10),('c',1,11);`)
  await db.exec(migration)
})
const deliver=()=>db.exec("update service_orders set dt_entregue_em='2026-11-07T12:00:00Z',lab_nome='Depois' where id=10")
async function state(){const out={};for(const t of ['service_orders','nfc_trays','nfc_tray_events'])out[t]=(await db.query(`select to_jsonb(x) x from ${t} x order by id`)).rows.map(x=>x.x);return out}
test('entrega, dois envelopes e eventos confirmam juntos; repetição não duplica evento',async()=>{
  await deliver();const s=await state()
  assert.equal(s.service_orders[0].lab_nome,'Depois')
  assert.deepEqual(s.nfc_trays.map(x=>x.current_service_order_id),[null,null,11])
  assert.equal(s.nfc_tray_events.length,2);assert.equal(s.nfc_tray_events[0].metadata.reason,'delivered_to_customer')
  await deliver();assert.deepEqual(await state(),s)
})
for(const table of ['nfc_trays','nfc_tray_events'])test(`falha em ${table} desfaz entrega e liberações`,async()=>{
  await db.exec(`create function fail_write() returns trigger language plpgsql as $$begin raise exception 'synthetic failure';end $$;
    create trigger fail_write before insert or update on ${table} for each row execute function fail_write();`)
  const before=await state();await assert.rejects(deliver(),/synthetic failure/);assert.deepEqual(await state(),before)
})
test('envelope de outra loja bloqueia a transação inteira',async()=>{
  await db.exec("update nfc_trays set store_id=2 where id='b'")
  const before=await state();await assert.rejects(deliver(),/outra loja/);assert.deepEqual(await state(),before)
})
test('sem envelope permite entrega; remover data não reassocia tag; migration reaplicável',async()=>{
  await db.exec(migration);await db.exec("delete from nfc_trays where current_service_order_id=10")
  await deliver();assert.equal((await state()).nfc_tray_events.length,0)
  await db.exec('update service_orders set dt_entregue_em=null where id=10')
  assert.equal((await state()).nfc_trays[0].current_service_order_id,11)
})
test('inserção de OS já entregue também usa a proteção',async()=>{
  await db.exec("insert into nfc_trays values('legacy',1,12);insert into service_orders values(12,1,now(),'Entregue')")
  assert.equal((await db.query("select current_service_order_id x from nfc_trays where id='legacy'")).rows[0].x,null)
})
test('action exige acesso e confirma a linha salva, sem limpeza posterior separada',async()=>{
  let logged=true,role='funcionario',store=1,exists=true,failed=false,writes=0
  const module={exports:{}},admin={from(table){const q={select(){return q},eq(){return q},update(){writes++;return q},
    maybeSingle:async()=>({data:table==='stores'?{id:1}:exists?{id:10}:null,error:failed?{message:'synthetic'}:null})};return q}}
  const mocks={'@/lib/supabase/admin':{createAdminClient:()=>admin,getProfileByAdmin:async()=>({tenant_id:'tenant',role,store_id:store})},
    '@/lib/supabase/server':{createClient:()=>({auth:{getUser:async()=>({data:{user:logged?{id:'user'}:null}})}})},'next/cache':{revalidatePath(){}}}
  runInNewContext(ts.transpileModule(read('src/lib/actions/lab.actions.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,
    {module,exports:module.exports,FormData,console:{error(){}},require:id=>mocks[id]||{}})
  const fd=new FormData();fd.set('dt_entregue_em','2026-11-07T12:00:00Z')
  logged=false;assert.equal((await module.exports.updateLabTracking(10,1,fd)).success,false)
  logged=true;store=2;assert.equal((await module.exports.updateLabTracking(10,1,fd)).success,false);assert.equal(writes,0)
  role='admin';assert.equal((await module.exports.updateLabTracking(10,1,fd)).success,true)
  exists=false;assert.equal((await module.exports.updateLabTracking(10,1,fd)).success,false)
  failed=true;assert.equal((await module.exports.updateLabTracking(10,1,fd)).success,false)
})
