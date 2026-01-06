
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Carrega .env.local se existir, senão .env
dotenv.config({ path: '.env.local' });
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    dotenv.config({ path: '.env' });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Erro: Variáveis de ambiente obrigatórias faltando (NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY).');
    process.exit(1);
}

console.log(`--- DIAGNÓSTICO DE VENDAS FANTASMAS ---`);
console.log(`Conectando em: ${supabaseUrl}`);
console.log(`Usando chave (início): ${supabaseKey.substring(0, 10)}...`);

const supabase = createClient(supabaseUrl, supabaseKey);

const salesToCheck = [56, 60, 62, 65, 70, 71, 72, 73];

async function diagnose() {
    console.log(`\nVerificando vendas: ${salesToCheck.join(', ')}...\n`);

    const { data: sales, error } = await supabase
        .from('vendas')
        .select('id, status, created_at, valor_total, customer_id')
        .in('id', salesToCheck);

    if (error) {
        console.error('ERRO AO CONSULTAR BANCO:', error.message);
        return;
    }

    if (!sales || sales.length === 0) {
        console.log('RESULTADO: Nenhuma dessas vendas foi encontrada no banco de dados.');
        console.log('CONCLUSÃO: Se elas aparecem na tela, o seu "npm run dev" está conectado em OUTRO banco de dados ou há um cache local persistente.');
    } else {
        console.log(`RESULTADO: Encontrei ${sales.length} vendas no banco de dados!`);
        sales.forEach(s => {
            console.log(`- Venda #${s.id}: Status=${s.status}, Data=${s.created_at}, Total=${s.valor_total}`);
        });
        console.log('\nCONCLUSÃO: Elas EXISTEM neste banco. O script de limpeza pode ser rodado.');
    }
}

diagnose();
