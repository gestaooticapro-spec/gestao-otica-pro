
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
    console.log(`Tenant ID obtido: ${GLOBAL_TENANT_ID}`);
}

// --- RESUME LOGIC ---

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
    console.log(`Total de IDs existentes em ${table}: ${allIds.size}`);
    return allIds;
}

function getColumnValue(row, possibleKeys) {
    for (const key of possibleKeys) {
        if (row[key] !== undefined) return row[key];
    }
    return undefined;
}

async function resumeSales() {
    const existingIds = await getExistingIds('vendas');
    const rows = readCsv('vendas.csv');

    console.log(`Total de linhas no CSV de vendas: ${rows.length}`);

    let toImport = [];
    for (const row of rows) {
        const idVal = getColumnValue(row, ['codigo', 'cdigo', 'cÃ³digo']);
        const id = parseInt(idVal);
        if (!id) continue;
        if (existingIds.has(id)) continue;

        const clienteId = parseInt(row['lk_clientes']);
        const vendedorId = parseInt(row['lk_vendedor']);
        const fecharVenda = row['fechar venda'];
        let status = 'Em Aberto';
        if (fecharVenda === 'VERDADEIRO') status = 'Fechada';

        toImport.push({
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
        });
    }

    console.log(`Vendas a importar: ${toImport.length}`);

    const BATCH_SIZE = 100;
    for (let i = 0; i < toImport.length; i += BATCH_SIZE) {
        const batch = toImport.slice(i, i + BATCH_SIZE);
        const { error } = await supabase.from('vendas').upsert(batch);
        if (error) {
            console.error(`Erro no lote ${i}:`, error.message);
        } else {
            console.log(`Importadas vendas ${i + 1} a ${Math.min(i + BATCH_SIZE, toImport.length)}`);
        }
    }
}

async function resumeSaleItems() {
    const existingIds = await getExistingIds('venda_itens');
    const existingSalesIds = await getExistingIds('vendas');

    const rows = readCsv('itens.csv');
    console.log(`Total de linhas no CSV de itens: ${rows.length}`);

    let toImport = [];
    let skippedCount = 0;

    for (const row of rows) {
        const idVal = getColumnValue(row, ['codigo', 'cdigo']);
        const id = parseInt(idVal);

        if (id && existingIds.has(id)) continue;

        const vendaId = parseInt(row['lk_venda']);
        if (!existingSalesIds.has(vendaId)) {
            skippedCount++;
            continue;
        }

        const produtoId = parseInt(row['lk_produto']);
        let qtd = parseFloat((row['qtd'] || '0').replace(',', '.')) || 0;
        if (qtd === 0.5) qtd = 1;

        const item = {
            venda_id: vendaId,
            store_id: 1,
            tenant_id: GLOBAL_TENANT_ID,
            product_id: produtoId,
            quantidade: qtd,
            valor_unitario: parseCurrency(row['valor vendido']),
            valor_total_item: parseCurrency(row['valor vendido']) * qtd,
        };
        if (id) item.id = id;

        toImport.push(item);
    }

    console.log(`Itens a importar: ${toImport.length} (Pulados por falta de venda pai: ${skippedCount})`);

    const BATCH_SIZE = 100;
    for (let i = 0; i < toImport.length; i += BATCH_SIZE) {
        const batch = toImport.slice(i, i + BATCH_SIZE);
        const { error } = await supabase.from('venda_itens').upsert(batch);
        if (error) {
            console.error(`Erro no lote itens ${i}:`, error.message);
        } else {
            console.log(`Importados itens ${i + 1} a ${Math.min(i + BATCH_SIZE, toImport.length)}`);
        }
    }
}

async function resumeServiceOrders() {
    const existingIds = await getExistingIds('service_orders');
    const existingDoctors = await getExistingIds('oftalmologistas');
    const existingDependents = await getExistingIds('dependentes');

    const rows = readCsv('receitas.csv');

    console.log(`Total de linhas no CSV de receitas: ${rows.length}`);

    let toImport = [];
    for (const row of rows) {
        const idVal = getColumnValue(row, ['codigo', 'cdigo', 'cÃ³digo']);
        const id = parseInt(idVal);
        if (!id) continue;
        if (existingIds.has(id)) continue;

        const vendaId = parseInt(row['lk_vendas']);
        let medicoId = parseInt(row['lk_medico']);
        let dependenteId = parseInt(row['lk_dependente']);

        // Validate FKs
        if (medicoId && !existingDoctors.has(medicoId)) {
            medicoId = null;
        }
        if (dependenteId && !existingDependents.has(dependenteId)) {
            dependenteId = null;
        }

        const formatDegree = (val) => {
            if (!val) return null;
            let clean = val.replace('+', '').trim().replace(',', '.');
            let num = parseFloat(clean);
            if (isNaN(num)) return null;
            if (Math.abs(num) > 25) num = num / 100;
            return (num > 0 ? '+' : '') + num.toFixed(2);
        };

        const os = {
            id: id,
            store_id: 1,
            tenant_id: GLOBAL_TENANT_ID,
            venda_id: vendaId,
            customer_id: 0, // Will fetch below
            oftalmologista_id: medicoId || null,
            dependente_id: dependenteId || null,
            created_at: parseDate(row['data']) || new Date().toISOString(),
            dt_prometido_para: parseDate(row['prometido para data']),
            receita_longe_od_esferico: formatDegree(row['longe od esf']),
            receita_longe_od_cilindrico: formatDegree(row['longe od cil']),
            receita_longe_od_eixo: row['longe od eix'],
            receita_longe_oe_esferico: formatDegree(row['longe oe esf']),
            receita_longe_oe_cilindrico: formatDegree(row['longe oe cil']),
            receita_longe_oe_eixo: row['longe oe eix'],
            receita_perto_od_esferico: formatDegree(row['perto od esf']),
            receita_perto_od_cilindrico: formatDegree(row['perto od cil']),
            receita_perto_od_eixo: row['perto od eix'],
            receita_perto_oe_esferico: formatDegree(row['perto oe esf']),
            receita_perto_oe_cilindrico: formatDegree(row['perto oe cil']),
            receita_perto_oe_eixo: row['perto oe eix'],
            receita_adicao: formatDegree(row['ad']),
            medida_dnp_od: row['longe dp'],
            medida_altura_od: row['altura'],
            obs_os: row['obs']
        };

        toImport.push(os);
    }

    console.log(`OS a importar: ${toImport.length}`);

    const neededVendaIds = [...new Set(toImport.map(os => os.venda_id).filter(id => id))];
    console.log(`Buscando customer_ids para ${neededVendaIds.length} vendas...`);

    const vendaCustomerMap = {};
    const CHUNK_SIZE = 1000;
    for (let i = 0; i < neededVendaIds.length; i += CHUNK_SIZE) {
        const chunk = neededVendaIds.slice(i, i + CHUNK_SIZE);
        const { data, error } = await supabase
            .from('vendas')
            .select('id, customer_id')
            .in('id', chunk);

        if (data) {
            data.forEach(v => vendaCustomerMap[v.id] = v.customer_id);
        }
    }

    const validToImport = [];
    let skippedCount = 0;
    for (const os of toImport) {
        if (os.venda_id && vendaCustomerMap[os.venda_id]) {
            os.customer_id = vendaCustomerMap[os.venda_id];
            validToImport.push(os);
        } else {
            skippedCount++;
        }
    }

    console.log(`OS válidas para importação: ${validToImport.length} (Pulados por falta de venda: ${skippedCount})`);

    const BATCH_SIZE = 100;
    for (let i = 0; i < validToImport.length; i += BATCH_SIZE) {
        const batch = validToImport.slice(i, i + BATCH_SIZE);
        const { error } = await supabase.from('service_orders').upsert(batch);
        if (error) {
            console.error(`Erro no lote OS ${i}:`, error.message);
        } else {
            console.log(`Importadas OS ${i + 1} a ${Math.min(i + BATCH_SIZE, validToImport.length)}`);
        }
    }
}

async function main() {
    await getTenantId();
    await resumeSales();
    await resumeSaleItems();
    await resumeServiceOrders();
}

main();
