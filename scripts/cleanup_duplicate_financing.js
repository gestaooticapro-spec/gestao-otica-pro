
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

async function cleanup() {
    console.log('Buscando financiamentos duplicados ou vazios...');

    // 1. Get all financiamento_loja
    const { data: financs, error } = await supabase
        .from('financiamento_loja')
        .select('id, venda_id');

    if (error) {
        console.error('Erro ao buscar financiamentos:', error.message);
        return;
    }

    // 2. Get all financiamento_parcelas
    const { data: parcelas, error: pError } = await supabase
        .from('financiamento_parcelas')
        .select('financiamento_id');

    if (pError) {
        console.error('Erro ao buscar parcelas:', pError.message);
        return;
    }

    const parcelasMap = new Set(parcelas.map(p => p.financiamento_id));

    const toDelete = [];
    const vendaCount = {};

    // Identify duplicates and orphans
    for (const f of financs) {
        // Check if it has parcelas
        const hasParcelas = parcelasMap.has(f.id);

        if (!hasParcelas) {
            toDelete.push(f.id);
            console.log(`Financiamento ${f.id} (Venda ${f.venda_id}) não tem parcelas. Marcado para exclusão.`);
        } else {
            // Check for duplicates (keep the one with parcelas, which we just did implicitly by filtering orphans)
            // But what if both have parcelas? (Unlikely given the failure mode, but let's check)
            if (vendaCount[f.venda_id]) {
                console.warn(`AVISO: Venda ${f.venda_id} tem múltiplos financiamentos COM parcelas!`);
            }
            vendaCount[f.venda_id] = (vendaCount[f.venda_id] || 0) + 1;
        }
    }

    console.log(`Total a excluir: ${toDelete.length}`);

    if (toDelete.length > 0) {
        const { error: delError } = await supabase
            .from('financiamento_loja')
            .delete()
            .in('id', toDelete);

        if (delError) {
            console.error('Erro ao excluir:', delError.message);
        } else {
            console.log('Exclusão concluída com sucesso.');
        }
    }
}

cleanup();
