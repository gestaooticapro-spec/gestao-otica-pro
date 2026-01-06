
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Erro: Variáveis de ambiente obrigatórias faltando.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspect() {
    console.log('Testando inserção de venda com status "Em Aberto"...');
    const { error: err1 } = await supabase.from('vendas').insert({
        store_id: 1,
        customer_id: 6510,
        status: 'Em Aberto',
        valor_total: 100,
        valor_final: 100,
        created_at: new Date().toISOString()
    });
    if (err1) console.log('Erro com Em Aberto:', err1.message);
    else console.log('Sucesso com Em Aberto');

    console.log('Testando inserção de venda com status "Fechada"...');
    const { error: err2 } = await supabase.from('vendas').insert({
        store_id: 1,
        customer_id: 6510,
        status: 'Fechada',
        valor_total: 100,
        valor_final: 100,
        created_at: new Date().toISOString()
    });
    if (err2) console.log('Erro com Fechada:', err2.message);
    else console.log('Sucesso com Fechada');

    console.log('Testando inserção de venda com status "open"...');
    const { error: err3 } = await supabase.from('vendas').insert({
        store_id: 1,
        customer_id: 6510,
        status: 'open',
        valor_total: 100,
        valor_final: 100,
        created_at: new Date().toISOString()
    });
    if (err3) console.log('Erro com open:', err3.message);
    else console.log('Sucesso com open');
}

inspect();
