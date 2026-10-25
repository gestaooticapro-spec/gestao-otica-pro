import {test} from 'node:test';
import assert from 'node:assert/strict';
import {authenticateLegacyFiscalWebhook,planLegacyFiscalWebhook,handleLegacyFiscalWebhook,type LegacyFiscalWebhookRecord} from './fiscal-legacy-webhook';
const record:LegacyFiscalWebhookRecord={id:1,organization_id:'fixture',store_id:1,environment:'production',
  nuvemfiscal_uuid:'legacy-fixture',status:'processing',numero:'123',serie:'2',chave_acesso:'fixture-key'};
test('legacy webhook always requires the configured shared secret',()=>{
  assert.equal(authenticateLegacyFiscalWebhook(undefined,null),false);
  assert.equal(authenticateLegacyFiscalWebhook('', 'Bearer anything'),false);
  assert.equal(authenticateLegacyFiscalWebhook('fixture','Bearer other'),false);
  assert.equal(authenticateLegacyFiscalWebhook('fixture','Bearer fixture'),true);
});
test('legacy statuses retain their mapping but never update identity or artifact URLs',()=>{
  assert.deepEqual(planLegacyFiscalWebhook(record,{data:{id:'legacy-fixture',status:'autorizado',pdf_url:'https://other.test',xml_url:'https://other.test'}}),
    {kind:'update',patch:{status:'authorized',error_message:null}});
  assert.throws(()=>planLegacyFiscalWebhook(record,{id:'legacy-fixture',status:'autorizado',numero:124}),/IDENTITY_MISMATCH/);
  assert.throws(()=>planLegacyFiscalWebhook(record,{id:'other',status:'autorizado'}),/IDENTITY_MISMATCH/);
});
test('pilot documents must use their authenticated versioned receiver',()=>{
  assert.deepEqual(planLegacyFiscalWebhook({...record,nuvemfiscal_uuid:'rv1_fixture'},{id:'rv1_fixture',status:'erro'}),{kind:'managed'});
});
test('delayed legacy notifications cannot regress terminal state',()=>{
  for(const [current,status] of [['authorized','erro'],['authorized','rejeitado'],['cancelled','autorizado'],['rejected','erro']]){
    assert.deepEqual(planLegacyFiscalWebhook({...record,status:current},{id:'legacy-fixture',status}),{kind:'ignored'});
  }
  assert.equal(planLegacyFiscalWebhook({...record,status:'authorized'},{id:'legacy-fixture',status:'cancelado'}).kind,'update');
});

test('HTTP authentication, pilot isolation and bounded parsing run before storage access',async()=>{
  let opens=0;
  const database=()=>{opens++;throw Error('must not open');};
  const make=(body:string,token='Bearer fixture')=>new Request('https://fixture.test/webhook',{method:'POST',body,headers:{authorization:token}});
  assert.equal((await handleLegacyFiscalWebhook(make('{}'),{secret:undefined,database})).status,401);
  assert.equal((await handleLegacyFiscalWebhook(make('{}','Bearer other'),{secret:'fixture',database})).status,401);
  assert.equal((await handleLegacyFiscalWebhook(make('{'),{secret:'fixture',database})).status,400);
  assert.equal((await handleLegacyFiscalWebhook(make('x'.repeat(64001)),{secret:'fixture',database})).status,400);
  assert.equal((await handleLegacyFiscalWebhook(make(JSON.stringify({id:'rv1_fixture',status:'autorizado'})),{secret:'fixture',database})).status,409);
  assert.equal(opens,0);
});

test('HTTP refuses ambiguity/missing row and CAS races; successful patch has no identity/artifacts',async()=>{
  let records=[record],writes=0,changed=false,storageFailed=false;
  const database=()=>({async find(){if(storageFailed)throw Error('sensitive database detail');return records;},
    async update(saved:LegacyFiscalWebhookRecord,patch:{status:string;error_message:string|null}){
      writes++;assert.deepEqual(saved,record);assert.deepEqual(patch,{status:'authorized',error_message:null});return !changed;}});
  const send=()=>handleLegacyFiscalWebhook(new Request('https://fixture.test/webhook',{method:'POST',headers:{authorization:'Bearer fixture'},
    body:JSON.stringify({id:'legacy-fixture',status:'autorizado',pdf_url:'https://untrusted.test'})}),{secret:'fixture',database});
  records=[];assert.equal((await send()).status,404);assert.equal(writes,0);
  records=[record,record];assert.equal((await send()).status,409);assert.equal(writes,0);
  records=[record];changed=true;assert.equal((await send()).status,409);assert.equal(writes,1);
  changed=false;assert.equal((await send()).status,200);assert.equal(writes,2);
  storageFailed=true;const failed=await send();assert.equal(failed.status,503);assert.equal((await failed.text()).includes('sensitive'),false);
});
