
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
        const [key, value] = line.split('=');
        if (key && value) {
            process.env[key.trim()] = value.trim();
        }
    });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Erro: Variáveis de ambiente obrigatórias faltando.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkProgress() {
    const tables = ['vendas', 'venda_itens', 'service_orders', 'products', 'oftalmologistas', 'dependentes'];

    console.log('--- Progresso da Importação ---');

    for (const table of tables) {
        // Get count
        const { count, error: countError } = await supabase
            .from(table)
            .select('*', { count: 'exact', head: true });

        if (countError) {
            console.error(`Erro ao contar ${table}:`, countError.message);
            continue;
        }

        // Get max ID
        const { data: maxData, error: maxError } = await supabase
            .from(table)
            .select('id')
            .order('id', { ascending: false })
            .limit(1);

        const maxId = maxData && maxData.length > 0 ? maxData[0].id : 0;

        if (maxError) {
            console.error(`Erro ao obter max ID de ${table}:`, maxError.message);
        } else {
            console.log(`${table}: ${count} registros. Último ID: ${maxId}`);
        }
    }
}

checkProgress();
