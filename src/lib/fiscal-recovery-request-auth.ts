import {verifyRecoverySync} from './fiscal-recovery-sync-auth';

export async function readAuthenticatedRecoveryRequest(request:Request,secret:string):Promise<string> {
  const reader=request.body?.getReader();if(!reader)throw new Error('RECOVERY_REQUEST_INVALID');
  let size=0;const chunks:Uint8Array[]=[];
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;
    if(size>4096){await reader.cancel();throw new Error('RECOVERY_REQUEST_TOO_LARGE');}chunks.push(value);}
  const body=Buffer.concat(chunks).toString('utf8');
  if(!verifyRecoverySync(body,secret,request.headers.get('x-recovery-timestamp'),request.headers.get('x-recovery-signature'))) {
    throw new Error('RECOVERY_REQUEST_UNAUTHORIZED');
  }
  return body;
}
