
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Load .env.local manually
const envPath = path.join(PROJECT_ROOT, '.env.local');
if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split(/\r?\n/).forEach(line => {
        const [key, mapValue] = line.split('=');
        if (key && mapValue) {
            process.env[key.trim()] = mapValue.trim();
        }
    });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Erro: Variáveis de ambiente obrigatórias faltando.');
    process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function simulateSaveLente() {
    console.log('--- Simulando SaveLente ---');

    // 1. Precisamos de um tenant_id e store_id válidos.
    const { data: store } = await supabaseAdmin.from('stores').select('tenant_id').eq('id', 1).single();

    if (!store) {
        console.error('Store 1 não encontrada.');
        return;
    }
    const tenantId = store.tenant_id;
    const storeId = 1;

    console.log(`Usando Store: ${storeId}, Tenant: ${tenantId}`);

    // Verificando Max ID
    const { data: maxIdData } = await supabaseAdmin.from('products').select('id').order('id', { ascending: false }).limit(1).single();
    console.log('MAX ID ATUAL DA TABELA:', maxIdData?.id);

    console.log('--- TENTATIVA DE INSERÇÃO ---');

    const payload = {
        tenant_id: tenantId,
        store_id: storeId,
        nome: 'MAXXEE TESTE SCRIPT',
        marca: 'MAXXEE',
        tipo_produto: 'Lente',
        categoria: 'Lente Oftálmica',
        preco_custo: 100,
        preco_venda: 250,
        detalhes: { material: 'Policarbonato', tipo_desenho: 'Visão Simples', indice: '1.59' },
        gerencia_estoque: false,
        tem_grade: false
    };

    try {
        const { data, error } = await supabaseAdmin.from('products').insert(payload).select().single();

        if (error) {
            console.error('ERRO AO INSERIR:', error);
            // console.error('Detalhes do erro:', JSON.stringify(error, null, 2));
        } else {
            console.log('SUCESSO! Produto inserido com ID:', data?.id);
            await supabaseAdmin.from('products').delete().eq('id', data.id);
        }

    } catch (e) {
        console.error('EXCEÇÃO:', e);
    }
}

simulateSaveLente();
