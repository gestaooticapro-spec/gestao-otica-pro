
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkCounts() {
    console.log('--- Contagem de Registros ---');

    const { count: countLoja, error: errLoja } = await supabase
        .from('financiamento_loja')
        .select('*', { count: 'exact', head: true });

    if (errLoja) console.error('Erro financiamento_loja:', errLoja.message);
    else console.log(`financiamento_loja: ${countLoja}`);

    const { count: countParcelas, error: errParcelas } = await supabase
        .from('financiamento_parcelas')
        .select('*', { count: 'exact', head: true });

    if (errParcelas) console.error('Erro financiamento_parcelas:', errParcelas.message);
    else console.log(`financiamento_parcelas: ${countParcelas}`);
}

checkCounts();
