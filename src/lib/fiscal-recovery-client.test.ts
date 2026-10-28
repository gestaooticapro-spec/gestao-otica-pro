import {test} from 'node:test';
import assert from 'node:assert/strict';
import {GopRecoveryClient,type GopRecoveryAttempt} from './fiscal-recovery-client';

const attempt:GopRecoveryAttempt={requestId:'11111111-1111-4111-8111-111111111111',organizationId:'40b34e90-4c9d-4446-b775-770a3e77d6c0',
  storeId:1,cnpj:'01997929000108',clientId:'fixture',model:'NFCe',series:2,number:123,originId:'sale:1',invoiceId:1,
  version:3,serverVersion:1,state:'submission_unknown',postStartedAt:'2026-10-24T12:00:00Z',payload:null,code:'',origin:'transport'};

test('manual query uses only the existing document query endpoint; does not transmit or reserve',async t=>{
  const previous=process.env.NUVEMFISCAL_PROD_URL,previousAuth=process.env.NUVEMFISCAL_PROD_AUTH_URL;
  process.env.NUVEMFISCAL_PROD_URL='https://fiscal.example.test';delete process.env.NUVEMFISCAL_PROD_AUTH_URL;
  t.after(()=>{if(previous===undefined)delete process.env.NUVEMFISCAL_PROD_URL;else process.env.NUVEMFISCAL_PROD_URL=previous;
    if(previousAuth===undefined)delete process.env.NUVEMFISCAL_PROD_AUTH_URL;else process.env.NUVEMFISCAL_PROD_AUTH_URL=previousAuth;});
  let successful=true,applied=0;const requests:string[]=[],rpcs:string[]=[];
  const client=new GopRecoveryClient({clientId:'fixture',token:async()=>'fixture',
    database:{async rpc(name){rpcs.push(name);return {data:attempt,error:null};}},apply:async()=>{applied++;},
    fetch:async(url,options)=>{
      requests.push(String(url));assert.equal(options?.method,'POST');assert.equal(options?.redirect,'error');
      assert.equal(options?.body,undefined);
      return successful?Response.json({consulta:{scheduled:true,nextAt:'2026-10-24T13:00:00Z'}}):new Response('',{status:404});
    }});
  const result=await client.requestQuery(attempt);assert.equal(result.scheduled,true);assert.equal(result.attempt.number,123);
  successful=false;await assert.rejects(()=>client.requestQuery(attempt),/QUERY_REQUEST_UNCERTAIN/);
  assert.equal(applied,1);assert.deepEqual(rpcs,['gop_recovery_get_v1']);
  assert.ok(requests.every(url=>url===`https://fiscal.example.test/nfce/rv1_${attempt.requestId}/consultar`));
});

test('explicit local correction is carried from durable snapshot to the only allowed first POST',async t=>{
  const previous=process.env.NUVEMFISCAL_PROD_URL,previousAuth=process.env.NUVEMFISCAL_PROD_AUTH_URL;
  process.env.NUVEMFISCAL_PROD_URL='https://fiscal.example.test';delete process.env.NUVEMFISCAL_PROD_AUTH_URL;
  t.after(()=>{if(previous===undefined)delete process.env.NUVEMFISCAL_PROD_URL;else process.env.NUVEMFISCAL_PROD_URL=previous;
    if(previousAuth===undefined)delete process.env.NUVEMFISCAL_PROD_AUTH_URL;else process.env.NUVEMFISCAL_PROD_AUTH_URL=previousAuth;});
  for(const resumeLocal of [false,true]){
    let posts=0;
    const prepared={...attempt,postStartedAt:null,state:'prepared',resumeLocal,payload:{synthetic:true}};
    const client=new GopRecoveryClient({clientId:'fixture',token:async()=>'fixture',apply:async()=>{},
      database:{async rpc(name){return {error:null,data:name==='gop_recovery_start_post_v1'?{...prepared,postStartedAt:'2026-10-24T12:00:00Z'}:prepared};}},
      fetch:async(_url,options)=>{posts++;assert.equal(new Headers(options?.headers).get('x-recovery-resume-local'),resumeLocal?'true':null);return Response.json({});}});
    await client.submit(prepared);assert.equal(posts,1);
  }
});
