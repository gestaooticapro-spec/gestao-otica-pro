import { randomUUID } from 'node:crypto';
import { resolveNuvemLocalEndpoints } from './nuvem-local-endpoints';
import { protectNfceRecoveryRecipient } from './nfce-recovery-recipient';

export type GopRecoveryAttempt = {
  requestId:string;organizationId:string;storeId:number;cnpj:string;clientId:string;model:'NFe'|'NFCe';series:number;number:number;
  originId:string;invoiceId:number;version:number;serverVersion:number;state:string;postStartedAt:string|null;
  payload:Record<string,unknown>|null;code:string;origin:string;
  resumeLocal?:boolean;
};
export interface GopRecoveryRpc {
  rpc(name:string,args:Record<string,unknown>):PromiseLike<{data:unknown;error:{message:string}|null}>;
}
export type RecoveryClientDependencies = {
  database:GopRecoveryRpc;
  clientId:string;
  token:()=>Promise<string>;
  apply:(attempt:GopRecoveryAttempt,result:unknown)=>Promise<void>;
  fetch?:typeof fetch;
};

function decode(value:unknown):GopRecoveryAttempt {
  const a=value as GopRecoveryAttempt;
  if(!a||typeof a!=='object'||!Number.isSafeInteger(a.invoiceId)||!Number.isSafeInteger(a.version)||a.version<1||
    !Number.isSafeInteger(a.number)||a.number<1||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(a.requestId)||
    a.storeId!==1||a.organizationId!=='40b34e90-4c9d-4446-b775-770a3e77d6c0'||a.cnpj!=='01997929000108'||a.series!==2||
    !['NFe','NFCe'].includes(a.model)||(a.resumeLocal!==undefined&&typeof a.resumeLocal!=='boolean')) throw new Error('RECOVERY_ATTEMPT_INVALID');
  return a;
}
export function isGopRecoveryCandidate(storeId:number|undefined,environment:string|undefined):boolean {
  return process.env.FISCAL_RECOVERY_PILOT_ENABLED==='true'&&storeId===1&&environment==='production';
}

/** This class cannot allocate a number outside the reservation RPC, cannot
 * retry a possibly submitted POST and never interprets HTTP 5xx as rejection.
 */
export class GopRecoveryClient {
  private readonly fetcher;
  constructor(private readonly dependencies:RecoveryClientDependencies) {this.fetcher=dependencies.fetch??fetch;}
  private async rpc(name:string,args:Record<string,unknown>) {
    const {data,error}=await this.dependencies.database.rpc(name,args);
    if(error)throw new Error(error.message.startsWith('RECOVERY_')?error.message:'RECOVERY_LOCAL_STORAGE_UNAVAILABLE');
    return data;
  }
  async reserve(input:{organizationId:string;storeId:number;cnpj:string;model:'NFe'|'NFCe';series:number;
    originId:string;workOrderId:number|null;actorId:string}):Promise<{created:boolean;attempt:GopRecoveryAttempt}> {
    const data=await this.rpc('gop_recovery_reserve_v1',{p_request:randomUUID(),p_org:input.organizationId,p_store:input.storeId,
      p_cnpj:input.cnpj,p_model:input.model,p_series:input.series,p_origin:input.originId,p_work_order:input.workOrderId,p_actor:input.actorId,
      p_client:this.dependencies.clientId}) as
      {created:boolean;attempt:unknown};
    if(!data||typeof data.created!=='boolean')throw new Error('RECOVERY_RESERVATION_INVALID');
    return {created:data.created,attempt:decode(data.attempt)};
  }
  async get(requestId:string):Promise<GopRecoveryAttempt> {
    return decode(await this.rpc('gop_recovery_get_v1',{p_request:requestId,p_invoice:null}));
  }
  async failure(attempt:GopRecoveryAttempt,code:string):Promise<GopRecoveryAttempt> {
    return decode(await this.rpc('gop_recovery_local_failure_v1',{p_request:attempt.requestId,p_code:code}));
  }
  async prepare(attempt:GopRecoveryAttempt,payload:Record<string,unknown>,snapshot:Record<string,unknown>):Promise<GopRecoveryAttempt> {
    if(attempt.model==='NFCe')snapshot=protectNfceRecoveryRecipient(attempt.payload,payload,snapshot);
    const data=await this.rpc('gop_recovery_prepare_v1',{p_request:attempt.requestId,p_version:attempt.version,p_payload:payload,p_snapshot:snapshot});
    return data===null?this.get(attempt.requestId):decode(data);
  }
  async submit(attempt:GopRecoveryAttempt):Promise<GopRecoveryAttempt> {
    // Validate the destination before acquiring a token or recording possible I/O.
    const {apiUrl}=resolveNuvemLocalEndpoints('production');
    if(attempt.postStartedAt)return this.consult(attempt);
    const token=await this.dependencies.token();
    const data=await this.rpc('gop_recovery_start_post_v1',{p_request:attempt.requestId,p_version:attempt.version});
    if(data===null)return this.consult(await this.get(attempt.requestId));
    const started=decode(data);
    try {
      const response=await this.fetcher(`${apiUrl}/${started.model==='NFe'?'nfe':'nfce'}`,{
        method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json',
          'x-recovery-request-id':started.requestId,'x-recovery-origin-id':started.originId,
          'x-recovery-store-id':String(started.storeId),'x-recovery-organization-id':started.organizationId,
          ...(started.resumeLocal?{'x-recovery-resume-local':'true'}:{})},
        body:JSON.stringify(started.payload),redirect:'error',signal:AbortSignal.timeout(45_000),cache:'no-store'});
      // Only a validated canonical recovery response may change local fiscal state.
      if(!response.ok)return this.failure(started,'RECOVERY_POST_RESPONSE_UNCERTAIN');
      const result:unknown=await response.json();
      await this.dependencies.apply(started,result);
      return this.get(started.requestId);
    }catch {return this.failure(started,'RECOVERY_POST_COMMUNICATION_FAILURE');}
  }
  async consult(attempt:GopRecoveryAttempt):Promise<GopRecoveryAttempt> {
    const {apiUrl}=resolveNuvemLocalEndpoints('production');
    const token=await this.dependencies.token();
    try {
      const response=await this.fetcher(`${apiUrl}/${attempt.model==='NFe'?'nfe':'nfce'}/rv1_${attempt.requestId}`,{
        headers:{authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(20_000),cache:'no-store'});
      if(!response.ok)return this.failure(attempt,'RECOVERY_LOOKUP_UNCERTAIN');
      await this.dependencies.apply(attempt,await response.json());
      return this.get(attempt.requestId);
    }catch {return this.failure(attempt,'RECOVERY_LOOKUP_COMMUNICATION_FAILURE');}
  }
  async requestQuery(attempt:GopRecoveryAttempt):Promise<{attempt:GopRecoveryAttempt;scheduled:boolean;nextAt:string|null}> {
    const {apiUrl}=resolveNuvemLocalEndpoints('production');const token=await this.dependencies.token();
    const response=await this.fetcher(`${apiUrl}/${attempt.model==='NFe'?'nfe':'nfce'}/rv1_${attempt.requestId}/consultar`,{
      method:'POST',headers:{authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(20_000),cache:'no-store'});
    if(!response.ok)throw new Error('RECOVERY_QUERY_REQUEST_UNCERTAIN');
    const body=await response.json() as {consulta?:{scheduled:boolean;nextAt:string|null}};
    if(!body.consulta||typeof body.consulta.scheduled!=='boolean'||(body.consulta.nextAt!==null&&
      (typeof body.consulta.nextAt!=='string'||!Number.isFinite(Date.parse(body.consulta.nextAt)))))throw new Error('RECOVERY_QUERY_RESPONSE_INVALID');
    await this.dependencies.apply(attempt,body);
    return {attempt:await this.get(attempt.requestId),scheduled:body.consulta.scheduled,nextAt:body.consulta.nextAt};
  }
}
