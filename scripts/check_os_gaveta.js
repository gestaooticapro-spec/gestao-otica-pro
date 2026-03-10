import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: '.env.local' });
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    dotenv.config({ path: '.env' });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false }
});

async function checkGavetaItems() {
    const { data, error } = await supabase
        .from('service_orders')
        .select(`
        *,
        customers (
          id,
          full_name,
          fone_movel, 
          fone_movel, 
          phone 
        ),
        vendas (
          id,
          valor_restante
        ),
        dependente:dependentes (
          id,
          full_name
        )
      `)
        .eq('store_id', 1)
        .not('dt_montado_em', 'is', null) // Já está pronto
        .is('dt_entregue_em', null)       // Ainda não foi entregue
        .order('dt_montado_em', { ascending: true }); // Os mais antigos primeiro

    if (error) {
        console.error('ERRO SUPABASE:', error);
        return;
    }

    console.log("SUCESSO. Itens encontrados:", data?.length);
}

checkGavetaItems();
