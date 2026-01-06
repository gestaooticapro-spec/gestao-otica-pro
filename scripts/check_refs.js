
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Erro: Variáveis de ambiente obrigatórias faltando.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkRefs() {
    console.log('Verificando dependências...');

    // Verificar Loja 1
    const { data: store, error: errStore } = await supabase.from('stores').select('id').eq('id', 1).single();
    if (errStore) console.log('Loja 1: NÃO ENCONTRADA ou Erro:', errStore.message);
    else console.log('Loja 1: OK');

    // Verificar Cliente 6510
    const { data: customer, error: errCust } = await supabase.from('customers').select('id, full_name').eq('id', 6510).single();
    if (errCust) console.log('Cliente 6510: NÃO ENCONTRADO ou Erro:', errCust.message);
    else console.log(`Cliente 6510: OK (${customer.full_name})`);

    // Verificar Vendedor 3
    const { data: emp, error: errEmp } = await supabase.from('employees').select('id, full_name').eq('id', 3).single();
    if (errEmp) console.log('Vendedor 3: NÃO ENCONTRADO ou Erro:', errEmp.message);
    else console.log(`Vendedor 3: OK (${emp.full_name})`);
}

checkRefs();
