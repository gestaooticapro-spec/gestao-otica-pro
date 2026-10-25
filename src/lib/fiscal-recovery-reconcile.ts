import type {GopRecoveryAttempt,GopRecoveryRpc} from './fiscal-recovery-client';
import type {GopCancellation} from './fiscal-recovery-cancellation';

export const GOP_RECOVERY_ORG='40b34e90-4c9d-4446-b775-770a3e77d6c0';
export type RecoveryDrainRequest={schema:'recovery-v1';kind:'drain';clientId:string;organizationId:string;storeId:number};
export function validateRecoveryDrainRequest(body:unknown,clientId:string):RecoveryDrainRequest {
  const value=body as RecoveryDrainRequest;
  if(!value||value.schema!=='recovery-v1'||value.kind!=='drain'||value.clientId!==clientId||!clientId||
    value.organizationId!==GOP_RECOVERY_ORG||value.storeId!==1)throw new Error('RECOVERY_DRAIN_SCOPE_INVALID');
  return value;
}

/** One bounded lookup per HTTP wake. It never calls reserve, prepare or POST. */
export async function drainGopRecovery(database:GopRecoveryRpc,scope:RecoveryDrainRequest,
  lookup:(attempt:GopRecoveryAttempt)=>Promise<number>):Promise<{nextWakeAt:string|null}> {
  const rpc=async(name:string,args:Record<string,unknown>)=>{
    const {data,error}=await database.rpc(name,args);if(error)throw new Error('RECOVERY_RECONCILE_STORAGE_UNAVAILABLE');return data;
  };
  const args={p_client:scope.clientId,p_org:scope.organizationId,p_store:scope.storeId};
  const raw=await rpc('gop_recovery_reconcile_claim_v1',args);
  if(raw!==null) {
    const lease=raw as {attention?:boolean;token:string;version:number;attempt:GopRecoveryAttempt};
    if(lease.attention!==true){
      const a=lease.attempt;
      if(!a||a.organizationId!==scope.organizationId||a.storeId!==scope.storeId||a.clientId!==scope.clientId||
        !a.postStartedAt||typeof lease.token!=='string'||!Number.isSafeInteger(lease.version))throw new Error('RECOVERY_RECONCILE_LEASE_INVALID');
      let observed:number|null=null;
      try{const version=await lookup(a);if(Number.isSafeInteger(version)&&version>0)observed=version;}catch{/* retain reservation and retry */}
      await rpc('gop_recovery_reconcile_complete_v1',{p_request:a.requestId,p_version:lease.version,p_token:lease.token,p_observed_version:observed});
    }
  }
  const next=await rpc('gop_recovery_due_v1',args);
  if(next!==null&&(typeof next!=='string'||!Number.isFinite(Date.parse(next))))throw new Error('RECOVERY_RECONCILE_NEXT_INVALID');
  return {nextWakeAt:next as string|null};
}

export async function drainGopCancellations(database:GopRecoveryRpc,scope:RecoveryDrainRequest,lookup:(attempt:GopRecoveryAttempt)=>Promise<number>){
  const rpc=async(name:string,args:Record<string,unknown>)=>{const {data,error}=await database.rpc(name,args);
    if(error)throw new Error('RECOVERY_CANCEL_RECONCILE_UNAVAILABLE');return data;};
  const args={p_client:scope.clientId,p_org:scope.organizationId,p_store:scope.storeId};
  const raw=await rpc('gop_recovery_cancel_claim_v1',args);
  if(raw!==null){
    const lease=raw as {attention?:boolean;token:string;cancellation:GopCancellation;attempt:GopRecoveryAttempt};
    if(lease.attention!==true){
      if(!lease.attempt||lease.attempt.clientId!==scope.clientId||lease.attempt.storeId!==scope.storeId||
        lease.attempt.organizationId!==scope.organizationId||lease.cancellation?.requestId!==lease.attempt.requestId||
        !lease.cancellation.postStartedAt||typeof lease.token!=='string')throw new Error('RECOVERY_CANCEL_RECONCILE_LEASE_INVALID');
      try{await lookup(lease.attempt);}catch{/* unknown canonical state is still pending */}
      // A matching observation clears/versions the lease; otherwise preserve it
      // with backoff even if the GET returned an older authorized note.
      await rpc('gop_recovery_cancel_retry_v1',{p_intent:lease.cancellation.intentId,p_version:lease.cancellation.version,p_token:lease.token});
    }
  }
  const next=await rpc('gop_recovery_cancel_due_v1',args);
  if(next!==null&&(typeof next!=='string'||!Number.isFinite(Date.parse(next))))throw new Error('RECOVERY_CANCEL_NEXT_INVALID');
  return {handled:raw!==null,nextWakeAt:next as string|null};
}
