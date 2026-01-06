
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Erro: Variáveis de ambiente obrigatórias faltando.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspect() {
    console.log('Testando inserção com "Receituario"...');
    const { error: err1 } = await supabase.from('products').insert({
        store_id: 1, nome: 'Teste Constraint Receituario', preco_venda: 10, tipo_produto: 'Receituario', estoque_atual: 0, estoque_minimo: 0, gerencia_estoque: false
    });
    if (err1) console.log('Erro com Receituario:', err1.message);
    else console.log('Sucesso com Receituario');

    console.log('Testando inserção com "Receituário"...');
    const { error: err2 } = await supabase.from('products').insert({
        store_id: 1, nome: 'Teste Constraint Receituário', preco_venda: 10, tipo_produto: 'Receituário', estoque_atual: 0, estoque_minimo: 0, gerencia_estoque: false
    });
    if (err2) console.log('Erro com Receituário:', err2.message);
    else console.log('Sucesso com Receituário');
}

inspect();
