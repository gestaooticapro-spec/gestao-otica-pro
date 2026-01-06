
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

async function getExistingSales() {
    console.log('Carregando vendas existentes...');
    let salesMap = {}; // venda_id -> customer_id
    let from = 0;
    const limit = 10000;

    while (true) {
        const { data, error } = await supabase
            .from('vendas')
            .select('id, customer_id')
            .order('id', { ascending: true })
            .range(from, from + limit - 1);

        if (error) {
            console.error('Erro ao buscar vendas:', error.message);
            process.exit(1);
        }

        if (!data || data.length === 0) break;

        data.forEach(row => salesMap[row.id] = row.customer_id);
        from += limit;
        console.log(`Carregadas ${Object.keys(salesMap).length} vendas...`);
    }
    return salesMap;
}

async function importInstallments() {
    const rows = readCsv('parcelas.csv');
    console.log(`Total de linhas no CSV de parcelas: ${rows.length}`);

    // Group by Venda ID
    const groups = {};
    for (const row of rows) {
        const vendaId = parseInt(row['lk_vendas']);
        if (!vendaId) continue;

        if (!groups[vendaId]) groups[vendaId] = [];
        groups[vendaId].push(row);
    }

    const salesMap = await getExistingSales();
    const validVendaIds = Object.keys(groups).filter(id => salesMap[id]);

    console.log(`Vendas com parcelas: ${Object.keys(groups).length}`);
    console.log(`Vendas válidas (existem no banco): ${validVendaIds.length}`);

    // Pre-fetch existing financings to avoid duplicates
    const { data: existingFinancings } = await supabase
        .from('financiamento_loja')
        .select('venda_id');

    const existingVendaIds = new Set(existingFinancings?.map(f => f.venda_id) || []);
    console.log(`Financiamentos já existentes: ${existingVendaIds.size}`);

    let processedCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    for (const vendaId of validVendaIds) {
        if (existingVendaIds.has(parseInt(vendaId))) {
            skippedCount++;
            continue;
        }

        const parcelasRows = groups[vendaId];
        const customerId = salesMap[vendaId];

        // Calculate totals
        let totalFinanciado = 0;
        let dataInicio = null;

        const parcelasData = parcelasRows.map(row => {
            const valor = parseCurrency(row['valor_parcela']);
            const vencimento = parseDate(row['data_venc']);
            const numParcela = parseInt(row['numero_parcela1']) || 1;

            totalFinanciado += valor;
            if (!dataInicio || (vencimento && vencimento < dataInicio)) {
                dataInicio = vencimento;
            }

            // Determine Status
            const valorPago = parseCurrency(row['valor_pago']);
            const dataPgto = parseDate(row['data_pgto']);
            let status = 'Pendente';

            if (valorPago > 0 || dataPgto) {
                status = 'Pago';
            } else if (vencimento && new Date(vencimento) < new Date()) {
                // status = 'Atrasado'; // Optional: keep simple as Pendente or use Atrasado if enum allows
                // Checking schema, status is string, so 'Atrasado' is likely fine, but let's stick to 'Pendente'/'Pago' for safety unless sure
                // FinanciamentoBox uses: const isAtrasado = !isPago && new Date(p.data_vencimento) < new Date(...)
                // So status in DB is likely just 'Pendente' or 'Pago'
                status = 'Pendente';
            }

            return {
                numero_parcela: numParcela,
                data_vencimento: vencimento || new Date().toISOString(),
                valor_parcela: valor,
                status: status,
                data_pagamento: dataPgto,
                customer_id: customerId,
                store_id: 1,
                tenant_id: GLOBAL_TENANT_ID
            };
        });

        // Create Parent (Financiamento Loja)
        const financiamento = {
            venda_id: parseInt(vendaId),
            customer_id: customerId,
            store_id: 1,
            tenant_id: GLOBAL_TENANT_ID,
            valor_total_financiado: totalFinanciado,
            quantidade_parcelas: parcelasRows.length,
            data_inicio: dataInicio || new Date().toISOString(),
            created_at: new Date().toISOString()
        };

        const { data: finData, error: finError } = await supabase
            .from('financiamento_loja')
            .insert(financiamento)
            .select()
            .single();

        if (finError) {
            console.error(`Erro ao criar financiamento para venda ${vendaId}:`, finError.message);
            errorCount++;
            continue;
        }

        // Create Children (Parcelas)
        const parcelasToInsert = parcelasData.map(p => ({
            ...p,
            financiamento_id: finData.id
        }));

        const { error: parcError } = await supabase
            .from('financiamento_parcelas')
            .insert(parcelasToInsert);

        if (parcError) {
            console.error(`Erro ao criar parcelas para venda ${vendaId}:`, parcError.message);
            // Rollback parent? Supabase doesn't support transactions in JS client easily without RPC.
            // For now, log error.
            errorCount++;
        } else {
            processedCount++;
        }

        if (processedCount % 100 === 0) {
            console.log(`Processados ${processedCount} financiamentos...`);
        }
    }

    console.log(`Importação concluída.`);
    console.log(`Sucesso: ${processedCount}`);
    console.log(`Erros: ${errorCount}`);
}

async function main() {
    await getTenantId();
    await importInstallments();
}

main();
