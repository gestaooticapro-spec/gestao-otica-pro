import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cancelGopRecovery,type GopCancellation} from './fiscal-recovery-cancellation';
import type {GopRecoveryAttempt} from './fiscal-recovery-client';

const attempt:GopRecoveryAttempt={requestId:'11111111-1111-4111-8111-111111111111',organizationId:'40b34e90-4c9d-4446-b775-770a3e77d6c0',
  storeId:1,cnpj:'01997929000108',clientId:'fixture',model:'NFCe',series:2,number:123,originId:'sale:1',invoiceId:1,
  version:3,serverVersion:1,state:'authorized',postStartedAt:'2026-10-24T12:00:00Z',payload:null,code:'100',origin:'sefaz'};

test('cancel adapter persists once before POST; concurrent and lost-response retries only query',async t=>{
  const old=process.env.NUVEMFISCAL_PROD_URL,oldAuth=process.env.NUVEMFISCAL_PROD_AUTH_URL;
  process.env.NUVEMFISCAL_PROD_URL='https://fiscal.example.test';delete process.env.NUVEMFISCAL_PROD_AUTH_URL;
  t.after(()=>{if(old===undefined)delete process.env.NUVEMFISCAL_PROD_URL;else process.env.NUVEMFISCAL_PROD_URL=old;
    if(oldAuth===undefined)delete process.env.NUVEMFISCAL_PROD_AUTH_URL;else process.env.NUVEMFISCAL_PROD_AUTH_URL=oldAuth;});
  const initial:GopCancellation={intentId:'22222222-2222-4222-8222-222222222222',requestId:attempt.requestId,
    justification:'Erro no preenchimento da venda',phase:'prepared',version:1,postStartedAt:null};
  let saved={...initial},posts=0,queries=0,applied=0,failStorage=false,failToken=false;
  const options={attempt,actorId:'fixture',justification:initial.justification,
    database:{async rpc(name:string,args:Record<string,unknown>){
      if(name.includes('reserve'))return {data:{...saved},error:null};
      assert.equal(name,'gop_recovery_cancel_start_v1');
      if(failStorage)return {data:null,error:{message:'unavailable'}};
      if(args.p_version!==saved.version||saved.postStartedAt)return {data:null,error:null};
      saved={...saved,phase:'possibly_sent',version:2,postStartedAt:'2026-10-24T12:00:00Z'};return {data:{...saved},error:null};}},
    token:async()=>{if(failToken)throw Error('token unavailable');return 'fixture';},apply:async()=>{applied++;},lookup:async()=>{queries++;},
    fetch:async(url:Parameters<typeof fetch>[0],request?:RequestInit)=>{
      posts++;assert.ok(saved.postStartedAt);assert.equal(String(url),`https://fiscal.example.test/nfce/rv1_${attempt.requestId}/cancelar`);
      assert.equal(new Headers(request?.headers).get('x-recovery-cancel-id'),initial.intentId);assert.equal(request?.redirect,'error');
      throw Error('response lost');}};
  await Promise.all([cancelGopRecovery(options),cancelGopRecovery(options)]);assert.equal(posts,1);assert.equal(queries,2);assert.equal(applied,0);
  await cancelGopRecovery(options);assert.equal(posts,1);assert.equal(queries,3);
  saved={...initial};failToken=true;await assert.rejects(()=>cancelGopRecovery(options));assert.equal(saved.postStartedAt,null);assert.equal(posts,1);
  failToken=false;failStorage=true;await assert.rejects(()=>cancelGopRecovery(options),/STORAGE_UNAVAILABLE/);assert.equal(posts,1);
});
