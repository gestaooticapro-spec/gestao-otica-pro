import {createClient} from './supabase/server';
import {createAdminClient} from './supabase/admin';
import {getNuvemLocalToken} from './nuvem-local';
import {GopRecoveryClient,type GopRecoveryAttempt,type GopRecoveryRpc,isGopRecoveryCandidate} from './fiscal-recovery-client';
import {resolveNuvemLocalEndpoints} from './nuvem-local-endpoints';
import {applyRecoveryResult} from './fiscal-recovery-apply';
import {cancelGopRecovery} from './fiscal-recovery-cancellation';
import {associateGopLegacy} from './fiscal-recovery-legacy';

async function rpc(database:GopRecoveryRpc,name:string,args:Record<string,unknown>) {
  const {data,error}=await database.rpc(name,args);
  if(error)throw new Error(error.message.startsWith('RECOVERY_')?error.message:'RECOVERY_LOCAL_STORAGE_UNAVAILABLE');
  return data;
}

export async function applyGopRecoveryResult(database:GopRecoveryRpc,attempt:GopRecoveryAttempt,body:unknown,eventId:string|null=null) {
  return applyRecoveryResult(database,attempt,body,{fetch,token:()=>getNuvemLocalToken('production')},eventId);
}

export function createGopRecoveryClient(database:GopRecoveryRpc=createAdminClient() as unknown as GopRecoveryRpc) {
  resolveNuvemLocalEndpoints('production');
  const clientId=process.env.NUVEMFISCAL_PROD_CLIENT_ID;
  if(!clientId||!process.env.NUVEMFISCAL_PROD_CLIENT_SECRET)throw new Error('RECOVERY_INTEGRATION_CREDENTIALS_MISSING');
  return new GopRecoveryClient({database,clientId,token:()=>getNuvemLocalToken('production'),
    apply:(attempt,body)=>applyGopRecoveryResult(database,attempt,body).then(()=>undefined)});
}

/** Canonical saved-state lookup only; neither this function nor its caller may
 * retry a document POST when the deterministic ID is missing. */
export async function lookupGopRecovery(database:GopRecoveryRpc,attempt:GopRecoveryAttempt,eventId:string|null=null) {
  const {apiUrl}=resolveNuvemLocalEndpoints('production');
  const token=await getNuvemLocalToken('production');
  const response=await fetch(`${apiUrl}/${attempt.model==='NFe'?'nfe':'nfce'}/rv1_${attempt.requestId}`,{
    headers:{authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(20_000),cache:'no-store'});
  if(!response.ok)throw new Error('RECOVERY_LOOKUP_UNAVAILABLE');
  await applyGopRecoveryResult(database,attempt,await response.json(),eventId);
  return (await createGopRecoveryClient(database).get(attempt.requestId)).serverVersion;
}

export type GopPilotContext={client:GopRecoveryClient;attempt:GopRecoveryAttempt};
export async function reserveGopPilot(input:{organizationId:string;storeId:number;cnpj:string;model:'NFe'|'NFCe';series:number;
  workOrderId?:number|null;kind:'sale'|'operation';draftId?:string}):Promise<GopPilotContext> {
  if(!isGopRecoveryCandidate(input.storeId,'production'))throw new Error('RECOVERY_PILOT_DISABLED');
  const session=createClient();const {data:{user},error}=await session.auth.getUser();
  if(error||!user)throw new Error('RECOVERY_USER_REQUIRED');
  const draft=input.draftId;
  const origin=input.kind==='sale'&&input.workOrderId?`sale:${input.workOrderId}`:
    input.workOrderId?`operation:${input.model}:${input.workOrderId}`:
    draft&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(draft)?`draft:${draft}`:'';
  if(!origin)throw new Error('RECOVERY_STABLE_DRAFT_REQUIRED');
  const client=createGopRecoveryClient();
  const reserved=await client.reserve({organizationId:input.organizationId,storeId:input.storeId,cnpj:input.cnpj.replace(/\D/g,''),
    model:input.model,series:input.series,originId:origin,workOrderId:input.workOrderId??null,actorId:user.id});
  return {client,attempt:reserved.attempt};
}

export function pilotActionResult(attempt:GopRecoveryAttempt) {
  if(attempt.state==='blocked_local')return {success:false,invoiceId:attempt.invoiceId,status:'processing',
    error:'Validacao local: corrija os dados e retome esta tentativa. O numero foi preservado.'};
  if(attempt.state==='rejected')return {success:false,invoiceId:attempt.invoiceId,status:'rejected',
    error:`Rejeicao confirmada pela SEFAZ (${attempt.code}).`};
  return {success:true,invoiceId:attempt.invoiceId,status:attempt.state==='authorized'?'authorized':attempt.state==='cancelled'?'cancelled':'processing',
    message:attempt.state==='authorized'?'Nota autorizada.':attempt.state==='manual_review'?
      'Nota exige conferencia; a origem continua reservada.':'Resultado ainda nao confirmado; nota em acompanhamento.'};
}

export async function completeGopPilot(context:GopPilotContext,payload:Record<string,unknown>,snapshot:Record<string,unknown>) {
  if(context.attempt.postStartedAt&&context.attempt.state!=='blocked_local') {
    return pilotActionResult(await context.client.consult(context.attempt));
  }
  context.attempt=await context.client.prepare(context.attempt,payload,snapshot);
  return pilotActionResult(await context.client.submit(context.attempt));
}

export async function consultGopPilotInvoice(invoice:{id:number;store_id?:number;organization_id?:string;nuvemfiscal_uuid?:string|null},requestQuery=false) {
  if(!invoice.nuvemfiscal_uuid?.startsWith('rv1_'))throw new Error('RECOVERY_INVOICE_NOT_MANAGED');
  const session=createClient();const {data:{user}}=await session.auth.getUser();
  if(!user)throw new Error('RECOVERY_USER_REQUIRED');
  const database=createAdminClient() as any;
  const {data:profile,error}=await database.from('profiles').select('tenant_id,store_id,role').eq('id',user.id).single();
  if(error||!profile||profile.tenant_id!==invoice.organization_id||(profile.role!=='admin'&&profile.store_id!==invoice.store_id)) {
    throw new Error('RECOVERY_INVOICE_ACCESS_DENIED');
  }
  const client=createGopRecoveryClient(database);
  const attempt=await client.get(invoice.nuvemfiscal_uuid.slice(4));
  if(attempt.invoiceId!==Number(invoice.id)||attempt.storeId!==invoice.store_id||attempt.organizationId!==invoice.organization_id) {
    throw new Error('RECOVERY_INVOICE_SCOPE_MISMATCH');
  }
  const query=requestQuery?await client.requestQuery(attempt):null;
  const current=query?query.attempt:await client.consult(attempt);
  const cancellation=await rpc(database,'gop_recovery_cancel_get_v1',{p_request:attempt.requestId}) as {phase:string}|null;
  return {...pilotActionResult(current),success:true,data:undefined,recoveryPhase:current.state,errorOrigin:current.origin,
    recoveryCode:current.code,cancellationPhase:cancellation?.phase??null,queryScheduled:query?.scheduled??false,queryNextAt:query?.nextAt??null,
    status:current.state==='authorized'?'authorized':current.state==='cancelled'?'cancelled':
    current.state==='rejected'?'rejected':'processing'};
}

export async function cancelGopPilotInvoice(invoice:{id:number;store_id:number;organization_id:string;nuvemfiscal_uuid:string},justification:string){
  const session=createClient();const {data:{user},error}=await session.auth.getUser();
  if(error||!user)throw new Error('RECOVERY_USER_REQUIRED');
  const database=createAdminClient() as unknown as GopRecoveryRpc;
  const client=createGopRecoveryClient(database),attempt=await client.get(invoice.nuvemfiscal_uuid.slice(4));
  if(attempt.invoiceId!==Number(invoice.id)||attempt.storeId!==invoice.store_id||attempt.organizationId!==invoice.organization_id)throw new Error('RECOVERY_CANCEL_SCOPE_INVALID');
  await cancelGopRecovery({database,attempt,actorId:user.id,justification,token:()=>getNuvemLocalToken('production'),
    apply:body=>applyGopRecoveryResult(database,attempt,body).then(()=>undefined),
    lookup:()=>lookupGopRecovery(database,attempt).then(()=>undefined)});
  const current=await client.get(attempt.requestId);
  const cancellation=await rpc(database,'gop_recovery_cancel_get_v1',{p_request:attempt.requestId}) as {phase:string}|null;
  return {success:true,error:undefined,status:current.state==='cancelled'?'cancelled':'authorized',message:current.state==='cancelled'?
    'Cancelamento confirmado.':cancellation?.phase==='rejected'?'Cancelamento rejeitado pela SEFAZ. A nota permanece autorizada.':
    cancellation?.phase==='blocked_local'?'Cancelamento bloqueado por validacao interna antes do envio. A nota permanece autorizada.':
    cancellation?.phase==='manual_review'?'O cancelamento exige conferencia. A nota permanece autorizada.':
    'Cancelamento em acompanhamento. A autorizacao permanece ate confirmacao.'};
}

export async function cancelGopLegacyInvoice(invoice:{id:number;store_id:number;organization_id:string;nuvemfiscal_uuid:string;
  tipo_documento:string;numero:string;serie:string},justification:string){
  if(!isGopRecoveryCandidate(invoice.store_id,'production'))throw Error('RECOVERY_PILOT_DISABLED');
  const session=createClient();const {data:{user},error}=await session.auth.getUser();
  if(error||!user)throw Error('RECOVERY_USER_REQUIRED');
  const database=createAdminClient() as unknown as GopRecoveryRpc;
  const clientId=process.env.NUVEMFISCAL_PROD_CLIENT_ID;
  if(!clientId)throw Error('RECOVERY_INTEGRATION_CREDENTIALS_MISSING');
  const attempt=await associateGopLegacy({database,actorId:user.id,clientId,invoice,
    token:()=>getNuvemLocalToken('production')});
  if(!attempt)return {success:true,error:undefined,status:'authorized',message:
    'Conferindo a autorizacao da nota antiga. Nenhum cancelamento foi enviado. Aguarde e solicite o cancelamento novamente.'};
  // Re-read/apply canonical authorization and artifacts before the explicit
  // cancellation is allowed to proceed. A lost reply never schedules a POST.
  await lookupGopRecovery(database,attempt);
  return cancelGopPilotInvoice({...invoice,nuvemfiscal_uuid:`rv1_${attempt.requestId}`},justification);
}
