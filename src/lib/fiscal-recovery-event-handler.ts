import type {GopRecoveryAttempt,GopRecoveryRpc} from './fiscal-recovery-client';
import {readAuthenticatedRecoveryRequest} from './fiscal-recovery-request-auth';
import {parseRecoverySyncEvent,admitRecoverySync} from './fiscal-recovery-sync';

/** Production and integration tests share this receiver. The event carries no
 * fiscal outcome; only canonical lookup and validated application can ACK it.
 */
export async function handleRecoveryEvent(request:Request,options:{enabled:boolean;secret:string;clientId:string;
  database:()=>GopRecoveryRpc;get:(requestId:string)=>Promise<GopRecoveryAttempt>;
  lookup:(attempt:GopRecoveryAttempt,eventId:string)=>Promise<number>}):Promise<Response>{
  if(!options.enabled)return Response.json({error:'DISABLED'},{status:503});
  let body:string;
  try{body=await readAuthenticatedRecoveryRequest(request,options.secret);}catch{return Response.json({error:'UNAUTHORIZED'},{status:401});}
  try{
    const event=parseRecoverySyncEvent(body);
    if(event.clientId!==options.clientId)throw new Error('RECOVERY_EVENT_SCOPE_INVALID');
    const admitted=await admitRecoverySync(options.database(),event,body);
    if(admitted.applied)return Response.json({eventId:event.eventId,appliedVersion:admitted.serverVersion});
    const attempt=await options.get(event.requestId),version=await options.lookup(attempt,event.eventId);
    if(version<event.version)throw new Error('RECOVERY_VERSION_NOT_APPLIED');
    return Response.json({eventId:event.eventId,appliedVersion:version});
  }catch{return Response.json({error:'RECOVERY_SYNC_NOT_APPLIED'},{status:503});}
}
