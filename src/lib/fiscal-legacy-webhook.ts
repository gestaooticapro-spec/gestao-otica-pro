import {timingSafeEqual} from 'node:crypto';
import {readRecoveryArtifact} from './fiscal-recovery-body';
export function authenticateLegacyFiscalWebhook(secret:string|undefined,authorization:string|null):boolean {
  if(!secret||!authorization)return false;
  const expected=Buffer.from(`Bearer ${secret}`),provided=Buffer.from(authorization);
  return expected.length===provided.length&&timingSafeEqual(expected,provided);
}
export type LegacyFiscalWebhookRecord={id:number;organization_id:string;store_id:number;environment:string;
  nuvemfiscal_uuid:string;status:string;numero:string|null;serie:string|null;chave_acesso:string|null};
/** The legacy receiver never owns recovery aggregates or fiscal identity. */
export function planLegacyFiscalWebhook(record:LegacyFiscalWebhookRecord,body:Record<string,unknown>):
  {kind:'managed'}|{kind:'ignored'}|{kind:'update';patch:{status:string;error_message:string|null}} {
  const value=(body.data&&typeof body.data==='object'&&!Array.isArray(body.data)?body.data:body) as Record<string,unknown>;
  if(record.nuvemfiscal_uuid.startsWith('rv1_'))return {kind:'managed'};
  if(String(value.id??'')!==record.nuvemfiscal_uuid)throw new Error('WEBHOOK_IDENTITY_MISMATCH');
  for(const [field,saved] of [['numero',record.numero],['serie',record.serie],['chave',record.chave_acesso]] as const){
    if(value[field]!==undefined&&value[field]!==null&&saved!==null&&String(value[field])!==String(saved))throw new Error('WEBHOOK_IDENTITY_MISMATCH');
  }
  const status=String(value.status??'');
  const next:Record<string,string>={autorizado:'authorized',rejeitado:'rejected',erro:'error',negado:'error',cancelado:'cancelled'};
  if(!next[status])return {kind:'ignored'};
  if(record.status==='cancelled'||(record.status==='authorized'&&next[status]!=='cancelled')||
    (record.status==='rejected'&&next[status]!=='rejected'))return {kind:'ignored'};
  const authorization=value.autorizacao&&typeof value.autorizacao==='object'?value.autorizacao as Record<string,unknown>:null;
  const reason=authorization?.motivo_status??value.motivo_status;
  const error=next[status]==='error'||next[status]==='rejected';
  return {kind:'update',patch:{status:next[status],error_message:error?
    (typeof reason==='string'?reason.slice(0,1000):'Retorno recebido pelo webhook fiscal legado.'):null}};
}

export type LegacyWebhookPort={find(id:string):Promise<LegacyFiscalWebhookRecord[]>;
  update(record:LegacyFiscalWebhookRecord,patch:{status:string;error_message:string|null}):Promise<boolean>};
export async function handleLegacyFiscalWebhook(request:Request,options:{secret:string|undefined;database:()=>LegacyWebhookPort}):Promise<Response>{
  if(!authenticateLegacyFiscalWebhook(options.secret,request.headers.get('authorization')))return Response.json({error:'Unauthorized'},{status:401});
  let body:Record<string,unknown>,id:string;
  try{
    const raw=await readRecoveryArtifact(new Response(request.body,{headers:request.headers.has('content-length')?
      {'content-length':request.headers.get('content-length')!}:undefined}),64_000);
    body=JSON.parse(raw);if(!body||typeof body!=='object'||Array.isArray(body))throw Error();
    const value=(body.data&&typeof body.data==='object'&&!Array.isArray(body.data)?body.data:body) as Record<string,unknown>;
    if(typeof value.id!=='string'||!value.id||value.id.length>200)throw Error();id=value.id;
  }catch{return Response.json({error:'INVALID_WEBHOOK'},{status:400});}
  if(id.startsWith('rv1_'))return Response.json({error:'USE_RECOVERY_V1_EVENTS'},{status:409});
  try{
    const database=options.database(),rows=await database.find(id);
    if(rows.length!==1)return Response.json({error:rows.length?'AMBIGUOUS_DOCUMENT':'DOCUMENT_NOT_FOUND'},{status:rows.length?409:404});
    let plan;
    try{plan=planLegacyFiscalWebhook(rows[0],body);}catch{return Response.json({error:'WEBHOOK_IDENTITY_MISMATCH'},{status:409});}
    if(plan.kind==='managed')return Response.json({error:'USE_RECOVERY_V1_EVENTS'},{status:409});
    if(plan.kind==='ignored')return Response.json({message:'Estado preservado.'});
    if(!await database.update(rows[0],plan.patch))return Response.json({error:'STATUS_CHANGED_RETRY'},{status:409});
    return Response.json({message:'Status atualizado.'});
  }catch{return Response.json({error:'WEBHOOK_NOT_APPLIED'},{status:503});}
}
