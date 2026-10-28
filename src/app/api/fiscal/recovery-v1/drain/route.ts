import {NextResponse} from 'next/server';
import {createAdminClient} from '@/lib/supabase/admin';
import type {GopRecoveryRpc} from '@/lib/fiscal-recovery-client';
import {lookupGopRecovery} from '@/lib/fiscal-recovery.server';
import {readAuthenticatedRecoveryRequest} from '@/lib/fiscal-recovery-request-auth';
import {validateRecoveryDrainRequest,drainGopRecovery,drainGopCancellations} from '@/lib/fiscal-recovery-reconcile';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function POST(request:Request) {
  if(process.env.FISCAL_RECOVERY_PILOT_ENABLED!=='true')return NextResponse.json({error:'DISABLED'},{status:503});
  let body:string;
  try{body=await readAuthenticatedRecoveryRequest(request,process.env.FISCAL_RECOVERY_SYNC_SECRET??'');}
  catch{return NextResponse.json({error:'UNAUTHORIZED'},{status:401});}
  try{
    const scope=validateRecoveryDrainRequest(JSON.parse(body),process.env.NUVEMFISCAL_PROD_CLIENT_ID??'');
    const database=createAdminClient() as unknown as GopRecoveryRpc;
    const cancellation=await drainGopCancellations(database,scope,attempt=>lookupGopRecovery(database,attempt));
    // Bound each request to one external lookup, so artifacts fit the runtime
    // deadline. Already-due remaining work gets another signed wake.
    const result=cancellation.handled?{nextWakeAt:new Date().toISOString()}:
      await drainGopRecovery(database,scope,attempt=>lookupGopRecovery(database,attempt));
    const dates=[result.nextWakeAt,cancellation.nextWakeAt].filter((date):date is string=>date!==null);
    return NextResponse.json({nextWakeAt:dates.length?new Date(Math.min(...dates.map(Date.parse))).toISOString():null});
  }catch{return NextResponse.json({error:'RECOVERY_DRAIN_UNAVAILABLE'},{status:503});}
}
