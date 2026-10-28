/** Bound the actual stream, not only Content-Length, before parsing XML/JSON. */
export async function readRecoveryArtifact(response:Response,maxBytes=4_000_000):Promise<string> {
  const declared=response.headers.get('content-length');
  if(!response.ok||(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>maxBytes)))throw new Error('RECOVERY_ARTIFACT_DOWNLOAD_FAILED');
  const reader=response.body?.getReader();if(!reader)throw new Error('RECOVERY_ARTIFACT_EMPTY');
  let size=0;const chunks:Uint8Array[]=[];
  try{
    while(true){const next=await reader.read();if(next.done)break;size+=next.value.length;
      if(size>maxBytes){await reader.cancel();throw new Error('RECOVERY_ARTIFACT_TOO_LARGE');}chunks.push(next.value);}
  }finally{reader.releaseLock();}
  if(!size)throw new Error('RECOVERY_ARTIFACT_EMPTY');
  return new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));
}
