import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: 'g:/projetos/gestao-otica-pro/.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const { data, error } = await sb.from('caixa_diario')
        .select('*')
        .eq('status', 'Fechado')
        .order('created_at', { ascending: false })
        .limit(20);

    console.log(JSON.stringify(data, null, 2));
}

check();
