import {createAdminClient} from '@/lib/supabase/admin';
import {handleLegacyFiscalWebhook} from '@/lib/fiscal-legacy-webhook';

export const runtime='nodejs';
export async function POST(request:Request) {
    return handleLegacyFiscalWebhook(request,{secret:process.env.NUVEMFISCAL_WEBHOOK_SECRET,database:()=>{
        const database=createAdminClient() as any;
        return {
            async find(id){
                const {data,error}=await database.from('fiscal_invoices')
                    .select('id,organization_id,store_id,environment,nuvemfiscal_uuid,status,numero,serie,chave_acesso')
                    .eq('nuvemfiscal_uuid',id).limit(2);
                if(error)throw Error('WEBHOOK_STORAGE_UNAVAILABLE');return data??[];
            },
            async update(record,patch){
                // CAS plus the database ownership barrier prevent stale writes.
                const {data,error}=await database.from('fiscal_invoices').update(patch).eq('id',record.id)
                    .eq('organization_id',record.organization_id).eq('store_id',record.store_id).eq('environment',record.environment)
                    .eq('nuvemfiscal_uuid',record.nuvemfiscal_uuid).eq('status',record.status).select('id');
                if(error)throw Error('WEBHOOK_STORAGE_UNAVAILABLE');return data?.length===1;
            }
        };
    }});
}
