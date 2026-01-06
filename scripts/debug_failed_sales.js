
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

function parseCurrency(value) {
    if (!value) return 0;
    let clean = value.replace('R$', '').trim().replace(/\./g, '').replace(',', '.');
    return parseFloat(clean) || 0;
}

function parseDate(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.split(' ')[0].split('/');
    if (parts.length !== 3) return null;
    const day = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1;
    const year = parseInt(parts[2]);
    const date = new Date(year, month, day);
    if (isNaN(date.getTime())) return null;
    return date.toISOString();
}

let GLOBAL_TENANT_ID = null;

async function getTenantId() {
    const { data, error } = await supabase.from('stores').select('tenant_id').eq('id', 1).single();
    if (error || !data) {
        console.error('Erro ao obter tenant_id da loja 1:', error?.message);
        process.exit(1);
    }
    GLOBAL_TENANT_ID = data.tenant_id;
}

async function debugSales() {
    await getTenantId();
    const vendasCsv = readCsv('vendas.csv');
    if (vendasCsv.length > 0) {
        console.log('Headers encontrados:', Object.keys(vendasCsv[0]));
    }

    // IDs identified as missing in DB but present in CSV
    const targetIds = [540, 841, 1000, 4020, 1222];

    const salesToImport = vendasCsv.filter(r => {
        const id = parseInt(r['codigo'] || r['cdigo'] || r['cÃ³digo']);
        return targetIds.includes(id);
    });

    console.log(`Encontradas ${salesToImport.length} vendas alvo no CSV.`);

    for (const row of salesToImport) {
        const id = parseInt(row['codigo'] || row['cdigo'] || row['cÃ³digo']);
        const clienteId = parseInt(row['lk_clientes']);
        console.log(`Venda ${id}: Raw lk_clientes = '${row['lk_clientes']}', Parsed = ${clienteId}`);
        const vendedorId = parseInt(row['cod_vendedor']);
        const statusRaw = row['fechar venda'];
        let status = 'Em Aberto';
        if (statusRaw === 'S' || statusRaw === 'Sim' || statusRaw === 'Fechada') status = 'Fechada';

        const venda = {
            id: id,
            store_id: 1,
            tenant_id: GLOBAL_TENANT_ID,
            customer_id: clienteId,
            employee_id: vendedorId || null,
            status: status,
            valor_total: parseCurrency(row['valor_venda']),
            valor_final: parseCurrency(row['valor_venda']),
            valor_desconto: 0,
            valor_restante: 0,
            created_at: parseDate(row['data_venda']) || new Date().toISOString()
        };

        console.log(`Tentando importar Venda ${id}...`);
        const { error } = await supabase.from('vendas').insert(venda);

        if (error) {
            console.error(`ERRO Venda ${id}:`, error.message);
            // Check specific constraints
            if (error.message.includes('foreign key constraint')) {
                console.log('Verificando dependências...');
                const { data: cust } = await supabase.from('customers').select('id').eq('id', clienteId).single();
                console.log(`Cliente ${clienteId} existe? ${!!cust}`);
                if (vendedorId) {
                    const { data: emp } = await supabase.from('employees').select('id').eq('id', vendedorId).single();
                    console.log(`Vendedor ${vendedorId} existe? ${!!emp}`);
                }
            }
        } else {
            console.log(`SUCESSO Venda ${id}`);
        }
    }
}

debugSales();
