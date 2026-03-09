import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkDoctors() {
    const { data: vendas, error: vendasError } = await supabase
        .from('vendas')
        .select(`
            id,
            os:service_orders (
                id,
                oftalmologista_id,
                medico:oftalmologistas (
                    nome_completo
                )
            )
        `)
        .limit(10);

    console.log("Service Orders Structure:", JSON.stringify(vendas, null, 2));
    if (vendasError) console.error(vendasError);
}

checkDoctors();
