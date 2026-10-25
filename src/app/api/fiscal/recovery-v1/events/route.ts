import {createAdminClient} from '@/lib/supabase/admin';
import {createGopRecoveryClient,lookupGopRecovery} from '@/lib/fiscal-recovery.server';
import type {GopRecoveryRpc} from '@/lib/fiscal-recovery-client';
import {handleRecoveryEvent} from '@/lib/fiscal-recovery-event-handler';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function POST(request:Request){
  let database:GopRecoveryRpc;
  const storage=()=>database??(database=createAdminClient() as unknown as GopRecoveryRpc);
  return handleRecoveryEvent(request,{enabled:process.env.FISCAL_RECOVERY_PILOT_ENABLED==='true',
    secret:process.env.FISCAL_RECOVERY_SYNC_SECRET??'',clientId:process.env.NUVEMFISCAL_PROD_CLIENT_ID??'',database:storage,
    get:id=>createGopRecoveryClient(storage()).get(id),lookup:(attempt,event)=>lookupGopRecovery(storage(),attempt,event)});
}
