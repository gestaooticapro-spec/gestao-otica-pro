import {randomUUID} from 'node:crypto';
import type {GopRecoveryAttempt,GopRecoveryRpc} from './fiscal-recovery-client';
import {resolveNuvemLocalEndpoints} from './nuvem-local-endpoints';
import {validateRecoveryApiResult} from './fiscal-recovery-result';
import {readRecoveryArtifact} from './fiscal-recovery-body';

/** Association can be repeated with the saved identity: its server adapter
 * only consults and cannot authorize/cancel. A pending association does not
 * mean a cancellation request was sent. Cancellation still needs the explicit
 * action to continue after association, never a background first POST. */
export async function associateGopLegacy(options:{database:GopRecoveryRpc;actorId:string;clientId:string;
  invoice:{id:number;store_id:number;organization_id:string;tipo_documento:string;numero:string;serie:string};
  token:()=>Promise<string>;fetch?:typeof fetch}):Promise<GopRecoveryAttempt|null>{
  const rpc=async(name:string,args:Record<string,unknown>)=>{
    const {data,error}=await options.database.rpc(name,args);if(error)throw Error('RECOVERY_LEGACY_STORAGE_UNAVAILABLE');return data as any;
  };
  const i=options.invoice;
  const saved=await rpc('gop_recovery_legacy_reserve_v1',{p_invoice:i.id,p_request:randomUUID(),p_actor:options.actorId,p_client:options.clientId});
  if(!saved||!/^[a-f0-9-]{36}$/i.test(saved.requestId)||typeof saved.legacyId!=='string'||
    typeof saved.originId!=='string'||typeof saved.associated!=='boolean')throw Error('RECOVERY_LEGACY_RESERVATION_INVALID');
  if(saved.associated)return rpc('gop_recovery_get_v1',{p_request:saved.requestId,p_invoice:i.id});
  if(!['NFe','NFCe'].includes(i.tipo_documento))throw Error('RECOVERY_LEGACY_MODEL_INVALID');
  const {apiUrl}=resolveNuvemLocalEndpoints('production');const token=await options.token();
  const response=await (options.fetch??fetch)(`${apiUrl}/${i.tipo_documento==='NFe'?'nfe':'nfce'}/${encodeURIComponent(saved.legacyId)}/associar-recuperacao`,{
    method:'POST',headers:{authorization:`Bearer ${token}`,'x-recovery-request-id':saved.requestId,'x-recovery-origin-id':saved.originId},
    redirect:'error',signal:AbortSignal.timeout(45_000),cache:'no-store'});
  if(response.status===202){
    const pending=JSON.parse(await readRecoveryArtifact(response));
    if(pending?.associacao?.requestId!==saved.requestId||pending?.associacao?.legacyId!==saved.legacyId||
      !['pending','manual_review'].includes(pending?.associacao?.state)||pending.cancelamento_enviado!==false)
      throw Error('RECOVERY_LEGACY_PENDING_INVALID');
    if(pending.associacao.state==='manual_review')throw Error('Nota antiga exige conferencia da autorizacao. Nenhum cancelamento foi enviado.');
    return null;
  }
  if(!response.ok)throw Error('RECOVERY_LEGACY_ASSOCIATION_UNCONFIRMED');
  const body=JSON.parse(await readRecoveryArtifact(response));
  const attempt={requestId:saved.requestId,originId:saved.originId,organizationId:i.organization_id,storeId:i.store_id,
    invoiceId:Number(i.id),cnpj:'01997929000108',clientId:options.clientId,model:i.tipo_documento,number:Number(i.numero),series:Number(i.serie),
    version:1,serverVersion:0,state:'authorized',postStartedAt:null,payload:null,code:'',origin:'central'} as GopRecoveryAttempt;
  const result=validateRecoveryApiResult(attempt,body);
  if(result.status!=='autorizado'||result.recovery.phase!=='authorized')throw Error('RECOVERY_LEGACY_AUTHORIZATION_UNCONFIRMED');
  return rpc('gop_recovery_legacy_finish_v1',{p_invoice:i.id,p_request:saved.requestId,p_actor:options.actorId,
    p_client:options.clientId,p_result:result});
}
