import {test} from 'node:test';
import assert from 'node:assert/strict';
import {drainGopRecovery,drainGopCancellations,validateRecoveryDrainRequest,GOP_RECOVERY_ORG} from './fiscal-recovery-reconcile';
import {readAuthenticatedRecoveryRequest} from './fiscal-recovery-request-auth';
import {signRecoverySync} from './fiscal-recovery-sync-auth';
import type {GopRecoveryAttempt} from './fiscal-recovery-client';

const scope=validateRecoveryDrainRequest({schema:'recovery-v1',kind:'drain',clientId:'fixture',organizationId:GOP_RECOVERY_ORG,storeId:1},'fixture');
const attempt:GopRecoveryAttempt={requestId:'11111111-1111-4111-8111-111111111111',organizationId:GOP_RECOVERY_ORG,
  storeId:1,cnpj:'01997929000108',clientId:'fixture',model:'NFCe',series:2,number:123,originId:'sale:1',invoiceId:1,
  version:3,serverVersion:0,state:'submission_unknown',postStartedAt:'2026-10-24T12:00:00Z',payload:null,code:'',origin:'transport'};
test('drain request has a separate purpose and exact consumer scope',()=>{
  for(const delta of [{kind:'event'},{clientId:'other'},{organizationId:'other'},{storeId:2}]){
    assert.throws(()=>validateRecoveryDrainRequest({...scope,...delta},'fixture'));
  }
});

test('machine request requires a recent exact-byte signature and bounded body',async()=>{
  const body=JSON.stringify(scope),secret='x'.repeat(32),timestamp=String(Math.floor(Date.now()/1000));
  const headers={'x-recovery-timestamp':timestamp,'x-recovery-signature':signRecoverySync(body,secret,timestamp)};
  assert.equal(await readAuthenticatedRecoveryRequest(new Request('https://fixture.test',{method:'POST',headers,body}),secret),body);
  await assert.rejects(()=>readAuthenticatedRecoveryRequest(new Request('https://fixture.test',{method:'POST',headers,body:body+' '}),secret),/UNAUTHORIZED/);
  await assert.rejects(()=>readAuthenticatedRecoveryRequest(new Request('https://fixture.test',{method:'POST',body:'x'.repeat(4097)}),secret),/TOO_LARGE/);
  await assert.rejects(()=>readAuthenticatedRecoveryRequest(new Request('https://fixture.test',{method:'POST',headers,body}),''),/UNAUTHORIZED/);
});

test('unknown POST only performs a lookup; failed lookup keeps durable retry, no new admission',async()=>{
  const calls:Array<{name:string;args:Record<string,unknown>}>=[];let lookups=0;
  const database={async rpc(name:string,args:Record<string,unknown>){calls.push({name,args});
    return {error:null,data:name.includes('claim')?{token:'lease',version:3,attempt}:name.includes('complete')?true:'2026-10-24T13:00:00Z'};}};
  await drainGopRecovery(database,scope,async a=>{lookups++;assert.equal(a.requestId,attempt.requestId);throw Error('404');});
  assert.equal(lookups,1);
  assert.deepEqual(calls.map(c=>c.name),['gop_recovery_reconcile_claim_v1','gop_recovery_reconcile_complete_v1','gop_recovery_due_v1']);
  assert.equal(calls[1].args.p_observed_version,null);
});

test('interrupted preparation and empty queue never perform an external lookup',async()=>{
  for(const claimed of [null,{attention:true}]){
    let lookups=0;
    const database={async rpc(name:string){return {error:null,data:name.includes('claim')?claimed:null};}};
    assert.deepEqual(await drainGopRecovery(database,scope,async()=>{lookups++;return 1;}),{nextWakeAt:null});assert.equal(lookups,0);
  }
});

test('cancel reconciliation does not treat an older authorized GET as acknowledgement of cancel admission',async()=>{
  const calls:string[]=[];let lookups=0;
  const cancellation={intentId:'22222222-2222-4222-8222-222222222222',requestId:attempt.requestId,version:2,phase:'possibly_sent',
    justification:'Erro no preenchimento da venda',postStartedAt:'2026-10-24T12:00:00Z'};
  const database={async rpc(name:string){calls.push(name);return {error:null,data:name.includes('claim')?
    {token:'lease',cancellation,attempt}:name.includes('retry')?true:'2026-10-24T13:00:00Z'};}};
  const result=await drainGopCancellations(database,scope,async()=>{lookups++;return 1;});
  assert.equal(lookups,1);assert.equal(result.handled,true);assert.ok(result.nextWakeAt);
  assert.deepEqual(calls,['gop_recovery_cancel_claim_v1','gop_recovery_cancel_retry_v1','gop_recovery_cancel_due_v1']);
});

test('cancel preparation abandoned before POST never starts a lookup or transmission',async()=>{
  let lookedUp=false;
  const database={async rpc(name:string){return {error:null,data:name.includes('claim')?{attention:true}:null};}};
  assert.deepEqual(await drainGopCancellations(database,scope,async()=>{lookedUp=true;return 1;}),{handled:true,nextWakeAt:null});
  assert.equal(lookedUp,false);
});
