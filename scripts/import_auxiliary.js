
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

if (!supabaseUrl || !supabaseKey) {
    console.error('Erro: Variáveis de ambiente obrigatórias faltando.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// --- HELPER FUNCTIONS ---

function normalizeHeader(header) {
    if (!header) return '';
    return header.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\w\s]/g, '')
        .trim();
}

function readCsv(filename) {
    const filePath = path.join(PROJECT_ROOT, filename);
    if (!fs.existsSync(filePath)) {
        console.error(`Arquivo não encontrado: ${filename}`);
        return [];
    }

    let content = fs.readFileSync(filePath, 'utf8');
    if (content.charCodeAt(0) === 0xFEFF) {
        content = content.slice(1);
    }

    const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length === 0) return [];

    const originalHeaders = lines[0].split(';').map(h => h.trim().replace(/^"|"$/g, ''));
    const headers = originalHeaders.map(normalizeHeader);

    const data = [];
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(';');
        const row = {};
        let hasData = false;
        originalHeaders.forEach((_, index) => {
            const key = headers[index];
            if (!key) return;
            let value = values[index] ? values[index].trim() : '';
            if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
            row[key] = value;
            if (value) hasData = true;
        });
        if (hasData) data.push(row);
    }
    return data;
}

function getColumnValue(row, possibleKeys) {
    for (const key of possibleKeys) {
        if (row[key] !== undefined) return row[key];
    }
    return undefined;
}

let GLOBAL_TENANT_ID = null;

async function getTenantId() {
    const { data, error } = await supabase.from('stores').select('tenant_id').eq('id', 1).single();
    if (error || !data) {
        console.error('Erro ao obter tenant_id da loja 1:', error?.message);
        process.exit(1);
    }
    GLOBAL_TENANT_ID = data.tenant_id;
    console.log(`Tenant ID obtido: ${GLOBAL_TENANT_ID}`);
}

async function getExistingIds(table) {
    console.log(`Carregando IDs existentes de ${table}...`);
    let allIds = new Set();
    let from = 0;
    const limit = 10000;

    while (true) {
        const { data, error } = await supabase
            .from(table)
            .select('id')
            .order('id', { ascending: true })
            .range(from, from + limit - 1);

        if (error) {
            console.error(`Erro ao buscar IDs de ${table}:`, error.message);
            process.exit(1);
        }

        if (!data || data.length === 0) break;

        data.forEach(row => allIds.add(row.id));
        from += limit;
        console.log(`Carregados ${allIds.size} IDs...`);
    }
    return allIds;
}

async function importDoctors() {
    const existingIds = await getExistingIds('oftalmologistas');
    const rows = readCsv('medicos.csv');
    console.log(`Total de linhas no CSV de medicos: ${rows.length}`);

    let toImport = [];
    for (const row of rows) {
        const idVal = getColumnValue(row, ['codigo', 'cdigo', 'cÃ³digo']);
        const id = parseInt(idVal);
        if (!id) continue;
        if (existingIds.has(id)) continue;

        const doctor = {
            id: id,
            store_id: 1,
            tenant_id: GLOBAL_TENANT_ID,
            nome_completo: row['nome'] || 'Médico Desconhecido',
            crm: row['crm'],
            telefone: row['fone'],
            clinica: row['clinica'],
            created_at: new Date().toISOString()
        };
        toImport.push(doctor);
    }

    console.log(`Médicos a importar: ${toImport.length}`);

    const BATCH_SIZE = 100;
    for (let i = 0; i < toImport.length; i += BATCH_SIZE) {
        const batch = toImport.slice(i, i + BATCH_SIZE);
        const { error } = await supabase.from('oftalmologistas').upsert(batch);
        if (error) {
            console.error(`Erro no lote médicos ${i}:`, error.message);
        } else {
            console.log(`Importados médicos ${i + 1} a ${Math.min(i + BATCH_SIZE, toImport.length)}`);
        }
    }
}

async function importDependents() {
    const existingIds = await getExistingIds('dependentes');
    const rows = readCsv('dependentes.csv');
    console.log(`Total de linhas no CSV de dependentes: ${rows.length}`);

    let toImport = [];
    for (const row of rows) {
        const idVal = getColumnValue(row, ['codigo', 'cdigo', 'cÃ³digo']);
        const id = parseInt(idVal);
        if (!id) continue;
        if (existingIds.has(id)) continue;

        const customerId = parseInt(row['lk_cliente']);

        const dependent = {
            id: id,
            store_id: 1,
            tenant_id: GLOBAL_TENANT_ID,
            customer_id: customerId || null,
            full_name: row['nome'] || 'Dependente Sem Nome',
            created_at: new Date().toISOString()
        };
        toImport.push(dependent);
    }

    console.log(`Dependentes a importar: ${toImport.length}`);

    const BATCH_SIZE = 100;
    for (let i = 0; i < toImport.length; i += BATCH_SIZE) {
        const batch = toImport.slice(i, i + BATCH_SIZE);
        const { error } = await supabase.from('dependentes').upsert(batch);
        if (error) {
            console.error(`Erro no lote dependentes ${i}:`, error.message);
        } else {
            console.log(`Importados dependentes ${i + 1} a ${Math.min(i + BATCH_SIZE, toImport.length)}`);
        }
    }
}

async function main() {
    await getTenantId();
    await importDoctors();
    await importDependents();
}

main();
