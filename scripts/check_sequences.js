
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

async function simulateCheckSequence() {
    console.log('--- Verificando Sequences ---');

    const { data: store } = await supabaseAdmin.from('stores').select('tenant_id').eq('id', 1).single();
    if (!store) return;
    const tenantId = store.tenant_id;
    const storeId = 1;

    // 1. PRODUCTS
    const { data: maxProd } = await supabaseAdmin.from('products').select('id').order('id', { ascending: false }).limit(1).single();
    console.log('MAX ID PRODUCTS:', maxProd?.id);

    try {
        const payload = {
            tenant_id: tenantId,
            store_id: storeId,
            nome: 'TESTE SEQ',
            marca: 'TESTE',
            tipo_produto: 'Lente',
            categoria: 'Teste',
            preco_venda: 1
        };
        const { error } = await supabaseAdmin.from('products').insert(payload).select().single();
        if (error) console.error('PRODUCTS INSERT ERROR:', error.code, error.details);
        else console.log('PRODUCTS INSERT OK (Sequence OK)');
    } catch (e) { }

    // 2. CUSTOMERS
    const { data: maxCust } = await supabaseAdmin.from('customers').select('id').order('id', { ascending: false }).limit(1).single();
    console.log('MAX ID CUSTOMERS:', maxCust?.id);

    try {
        const payloadCust = {
            tenant_id: tenantId,
            store_id: storeId,
            full_name: 'TESTE SEQ',
            cpf: '00000000000',
        };
        const { error } = await supabaseAdmin.from('customers').insert(payloadCust).select().single();
        if (error) console.error('CUSTOMERS INSERT ERROR:', error.code, error.details);
        else console.log('CUSTOMERS INSERT OK (Sequence OK)');
    } catch (e) { }

}

simulateCheckSequence();
