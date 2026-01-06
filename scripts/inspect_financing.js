
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

async function checkSchema() {
    console.log('--- financiamento_loja Schema ---');
    const { data: fl, error: err1 } = await supabase.from('financiamento_loja').select('*').limit(1);
    if (err1) console.error(err1.message);
    else console.log(fl.length > 0 ? Object.keys(fl[0]) : 'Empty table (financiamento_loja)');

    console.log('--- financiamento_parcelas Schema ---');
    const { data: fp, error: err2 } = await supabase.from('financiamento_parcelas').select('*').limit(1);
    if (err2) console.error(err2.message);
    else console.log(fp.length > 0 ? Object.keys(fp[0]) : 'Empty table (financiamento_parcelas)');
}

function checkCsvHeaders(filename) {
    const filePath = path.join(PROJECT_ROOT, filename);
    if (!fs.existsSync(filePath)) {
        console.log(`${filename} not found`);
        return;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length > 0) {
        console.log(`--- ${filename} Headers ---`);
        console.log(lines[0]);
        if (lines.length > 1) {
            console.log(`--- ${filename} First Row ---`);
            console.log(lines[1]);
        }
    }
}

async function main() {
    await checkSchema();
    checkCsvHeaders('parcelas.csv');
}

main();
