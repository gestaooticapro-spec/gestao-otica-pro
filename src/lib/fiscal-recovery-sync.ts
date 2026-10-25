import {createHash} from 'node:crypto';
import type {GopRecoveryRpc} from './fiscal-recovery-client';

export type RecoverySyncEvent={schema:'recovery-v1';eventId:string;requestId:string;version:number;
  clientId:string;organizationId:string;storeId:number};
export function parseRecoverySyncEvent(body:string):RecoverySyncEvent {
  if(Buffer.byteLength(body)>4096)throw new Error('RECOVERY_EVENT_INVALID');
  const e=JSON.parse(body) as RecoverySyncEvent;
  if(!e||e.schema!=='recovery-v1'||!Number.isSafeInteger(e.version)||e.version<1||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(e.requestId)||
    e.eventId!==`${e.requestId}:${e.version}`||e.storeId!==1||
    e.organizationId!=='40b34e90-4c9d-4446-b775-770a3e77d6c0'||typeof e.clientId!=='string'||!e.clientId||e.clientId.length>200) {
    throw new Error('RECOVERY_EVENT_INVALID');
  }
  return e;
}
export async function admitRecoverySync(database:GopRecoveryRpc,event:RecoverySyncEvent,body:string) {
  const {data,error}=await database.rpc('gop_recovery_inbox_v1',{p_event:event.eventId,p_request:event.requestId,
    p_version:event.version,p_hash:createHash('sha256').update(body).digest('hex'),p_client:event.clientId,
    p_org:event.organizationId,p_store:event.storeId});
  if(error)throw new Error('RECOVERY_INBOX_UNAVAILABLE');
  const result=data as {applied:boolean;serverVersion:number};
  if(!result||typeof result.applied!=='boolean'||!Number.isSafeInteger(result.serverVersion)||result.serverVersion<0) {
    throw new Error('RECOVERY_INBOX_RESPONSE_INVALID');
  }
  return result;
}
