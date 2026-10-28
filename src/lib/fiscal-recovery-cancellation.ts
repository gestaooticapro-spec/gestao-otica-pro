import {randomUUID} from 'node:crypto';
import type {GopRecoveryAttempt,GopRecoveryRpc} from './fiscal-recovery-client';
import {resolveNuvemLocalEndpoints} from './nuvem-local-endpoints';

export type GopCancellation={intentId:string;requestId:string;justification:string;phase:string;version:number;postStartedAt:string|null};
export async function cancelGopRecovery(options:{database:GopRecoveryRpc;attempt:GopRecoveryAttempt;actorId:string;justification:string;
  token:()=>Promise<string>;apply:(body:unknown)=>Promise<void>;lookup:()=>Promise<void>;fetch?:typeof fetch}) {
  const {apiUrl}=resolveNuvemLocalEndpoints('production');
  const rpc=async(name:string,args:Record<string,unknown>)=>{const {data,error}=await options.database.rpc(name,args);
    if(error)throw new Error('RECOVERY_CANCEL_STORAGE_UNAVAILABLE');return data;};
  const reserved=await rpc('gop_recovery_cancel_reserve_v1',{p_request:options.attempt.requestId,p_intent:randomUUID(),
    p_actor:options.actorId,p_justification:options.justification.trim()}) as GopCancellation;
  if(!reserved||reserved.requestId!==options.attempt.requestId||!Number.isSafeInteger(reserved.version)||
    !/^[a-f0-9-]{36}$/i.test(reserved.intentId))throw new Error('RECOVERY_CANCEL_RESERVATION_INVALID');
  if(reserved.postStartedAt||reserved.phase!=='prepared'){
    await options.lookup();return;
  }
  const token=await options.token();
  const started=await rpc('gop_recovery_cancel_start_v1',{p_intent:reserved.intentId,p_version:reserved.version}) as GopCancellation|null;
  if(!started){await options.lookup();return;}
  if(started.requestId!==reserved.requestId||started.intentId!==reserved.intentId||!started.postStartedAt)throw new Error('RECOVERY_CANCEL_INTENT_INVALID');
  try{
    const response=await (options.fetch??fetch)(`${apiUrl}/${options.attempt.model==='NFe'?'nfe':'nfce'}/rv1_${options.attempt.requestId}/cancelar`,{
      method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json','x-recovery-cancel-id':started.intentId},
      body:JSON.stringify({justificativa:started.justification}),redirect:'error',signal:AbortSignal.timeout(45_000),cache:'no-store'});
    if(!response.ok)throw new Error('RECOVERY_CANCEL_RESPONSE_UNCERTAIN');
    await options.apply(await response.json());
  }catch{
    // The pre-POST record already scheduled reconciliation. Neither catch nor
    // the next click may repeat this POST or fabricate a cancelled/rejected note.
    try{await options.lookup();}catch{/* durable query-only agenda remains */}
  }
}
