import { createClient } from '@supabase/supabase-js';

// dotenv removido, usar node --env-file=.env.local

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function inspectSchema() {
    console.log('🕵️‍♂️ Inspecionando schema do Supabase...\n');

    const tables = ['suppliers', 'products', 'vendas', 'venda_itens', 'service_orders'];

    for (const table of tables) {
        const { data, error } = await supabase
            .from(table)
            .select('*')
            .limit(1);

        if (error) {
            console.log(`❌ Erro ao ler tabela '${table}': ${error.message}`);
            continue;
        }

        if (data && data.length > 0) {
            console.log(`📋 COLUNAS DA TABELA '${table.toUpperCase()}':`);
            const columns = Object.keys(data[0]);
            console.log(columns.join(', '));
        } else {
            console.log(`⚠️  Tabela '${table}' está vazia ou inacessível.`);
        }
        console.log('---------------------------------------------------');
    }
}

inspectSchema();
