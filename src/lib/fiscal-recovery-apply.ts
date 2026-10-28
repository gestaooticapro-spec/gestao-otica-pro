import type {GopRecoveryAttempt,GopRecoveryRpc} from './fiscal-recovery-client';
import {validateRecoveryApiResult,recoveryArtifactUrl,validateRecoveredXml,validateRecoveredCancellationXml} from './fiscal-recovery-result';
import {readRecoveryArtifact} from './fiscal-recovery-body';

async function rpc(database:GopRecoveryRpc,name:string,args:Record<string,unknown>) {
  const {data,error}=await database.rpc(name,args);
  if(error)throw new Error(error.message.startsWith('RECOVERY_')?error.message:'RECOVERY_LOCAL_STORAGE_UNAVAILABLE');
  return data;
}

export async function applyRecoveryResult(database:GopRecoveryRpc,attempt:GopRecoveryAttempt,body:unknown,options:{fetch:typeof fetch;token:()=>Promise<string>},eventId:string|null=null) {
  const result=validateRecoveryApiResult(attempt,body);
  let xml:string|null=null,cancellationXml:string|null=null;
  if(result.recovery.version>attempt.serverVersion&&['autorizado','cancelado'].includes(result.status)) {
    if(!result.xml_url)throw new Error('RECOVERY_AUTHORIZED_XML_MISSING');
    const response=await options.fetch(recoveryArtifactUrl(attempt,result.xml_url,'xml'),{redirect:'error',signal:AbortSignal.timeout(20_000),cache:'no-store'});
    xml=await readRecoveryArtifact(response);validateRecoveredXml(attempt,result,xml);
    if(result.status==='cancelado'){
      const token=await options.token();
      const event=await options.fetch(recoveryArtifactUrl(attempt,result.cancelamento!.xml_evento_url,'cancelamento/xml'),{
        headers:{authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(20_000),cache:'no-store'});
      cancellationXml=await readRecoveryArtifact(event);validateRecoveredCancellationXml(attempt,result,cancellationXml);
    }
  }
  const applied=await rpc(database,'gop_recovery_apply_v1',{p_request:attempt.requestId,p_server_version:result.recovery.version,
    p_result:result,p_xml:xml,p_event:eventId,p_cancel_xml:cancellationXml});
  await rpc(database,'gop_recovery_cancel_observe_v1',{p_request:attempt.requestId,p_result:result});
  return applied;
}
