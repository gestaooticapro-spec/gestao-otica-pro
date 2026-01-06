
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

function normalizeHeader(header) {
    if (!header) return '';
    return header.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\w\s]/g, '')
        .trim();
}

function readCsv(filename) {
    const filePath = path.join(PROJECT_ROOT, filename);
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length === 0) return [];

    const originalHeaders = lines[0].split(';').map(h => h.trim().replace(/^"|"$/g, ''));
    const headers = originalHeaders.map(normalizeHeader);

    return lines.slice(1).map(line => {
        const values = line.split(';');
        const row = {};
        headers.forEach((h, i) => {
            if (h) row[h] = values[i] ? values[i].trim().replace(/^"|"$/g, '') : '';
        });
        return row;
    });
}

function getColumnValue(row, possibleKeys) {
    for (const key of possibleKeys) {
        if (row[key] !== undefined) return row[key];
    }
    return undefined;
}

async function analyze() {
    console.log('Lendo arquivos CSV...');
    const vendasCsv = readCsv('vendas.csv');
    const receitasCsv = readCsv('receitas.csv');

    console.log(`Vendas no CSV: ${vendasCsv.length}`);
    console.log(`Receitas (OS) no CSV: ${receitasCsv.length}`);

    // Map Vendas CSV IDs
    const vendasCsvIds = new Set();
    vendasCsv.forEach(r => {
        const id = getColumnValue(r, ['codigo', 'cdigo', 'cÃ³digo']);
        if (id) vendasCsvIds.add(parseInt(id));
    });

    // Get DB Vendas IDs
    console.log('Buscando Vendas no Banco de Dados...');
    const dbVendasIds = new Set();
    let from = 0;
    const BATCH_SIZE = 1000;
    while (true) {
        const { data, error } = await supabase.from('vendas').select('id').range(from, from + BATCH_SIZE - 1);
        if (error) {
            console.error('Erro ao buscar vendas:', error.message);
            break;
        }
        if (!data || data.length === 0) break;

        data.forEach(r => dbVendasIds.add(r.id));
        from += BATCH_SIZE;
        console.log(`Carregadas ${dbVendasIds.size} vendas do banco...`);
        if (data.length < BATCH_SIZE) break;
    }

    // Analyze OS
    let totalOS = 0;
    let missingParentInCsv = 0;
    let missingParentInDb = 0;
    let success = 0;
    let noVendaId = 0;

    const examplesMissingInCsv = [];
    const examplesMissingInDb = [];

    for (const row of receitasCsv) {
        totalOS++;
        const vendaId = parseInt(row['lk_vendas']);

        if (!vendaId) {
            noVendaId++;
            continue;
        }

        const existsInCsv = vendasCsvIds.has(vendaId);
        const existsInDb = dbVendasIds.has(vendaId);

        if (existsInDb) {
            success++;
        } else {
            if (existsInCsv) {
                missingParentInDb++;
                if (examplesMissingInDb.length < 5) examplesMissingInDb.push({ osId: row['codigo'], vendaId });
            } else {
                missingParentInCsv++;
                if (examplesMissingInCsv.length < 5) examplesMissingInCsv.push({ osId: row['codigo'], vendaId });
            }
        }
    }

    console.log('\n--- RESULTADO DA ANÁLISE ---');
    console.log(`Total OS analisadas: ${totalOS}`);
    console.log(`OS sem ID de Venda (lk_vendas vazio/zero): ${noVendaId}`);
    console.log(`OS com Venda no Banco (Sucesso Potencial): ${success}`);
    console.log(`OS com Venda no CSV mas NÃO no Banco (Falha na Importação da Venda): ${missingParentInDb}`);
    console.log(`OS com Venda INEXISTENTE no CSV (Dados Órfãos Originais): ${missingParentInCsv}`);

    if (missingParentInDb > 0) {
        console.log('\nExemplos de Vendas que existem no CSV mas não entraram no Banco:');
        console.log(examplesMissingInDb);
    }

    if (missingParentInCsv > 0) {
        console.log('\nExemplos de Vendas que NÃO existem nem no CSV (Órfãos Reais):');
        console.log(examplesMissingInCsv);
    }
}

analyze();
