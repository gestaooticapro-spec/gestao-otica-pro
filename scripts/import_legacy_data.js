
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Configuração do Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Erro: Variáveis de ambiente NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Utilitários
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

function normalizeHeader(header) {
    if (!header) return '';
    return header.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove acentos
        .replace(/[^\w\s]/g, '') // Remove caracteres especiais
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

    console.log(`Headers normalizados para ${filename}:`, headers.join(', '));

    const data = [];

    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(';');
        const row = {};
        let hasData = false;

        originalHeaders.forEach((_, index) => {
            const key = headers[index];
            if (!key) return;

            let value = values[index] ? values[index].trim() : '';
            if (value.startsWith('"') && value.endsWith('"')) {
                value = value.slice(1, -1);
            }
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

// --- IMPORTAÇÃO DE FORNECEDORES ---
async function importSuppliers() {
    console.log('--- Importando Fornecedores ---');
    const rows = readCsv('fornecedor.csv');

    let successCount = 0;
    let errorCount = 0;

    for (const row of rows) {
        const id = parseInt(row['codigo']);
        if (!id) continue;

        const supplier = {
            id: id,
            store_id: 1,
            tenant_id: GLOBAL_TENANT_ID,
            nome_fantasia: row['fornecedor'] || 'Fornecedor Desconhecido',
            razao_social: row['fornecedor'],
            telefone: row['fone'] || row['celular'],
            cidade: row['cidade'],
            uf: row['uf'],
            cnpj: row['cnpj'],
            created_at: new Date().toISOString()
        };

        const { error } = await supabase.from('suppliers').upsert(supplier);
        if (error) {
            console.error(`Erro ao importar fornecedor ${id}:`, error.message);
            errorCount++;
        } else {
            successCount++;
        }
    }
    console.log(`Fornecedores: ${successCount} importados, ${errorCount} erros.`);
}

// --- IMPORTAÇÃO DE PRODUTOS ---
async function importProducts() {
    console.log('--- Importando Produtos ---');

    const marcasRows = readCsv('marcas.csv');
    const marcasMap = {};
    marcasRows.forEach(m => {
        const id = parseInt(m['codigo']);
        const supplierId = parseInt(m['lk_fornecedor']);
        if (id) {
            marcasMap[id] = {
                nome: m['marca'],
                supplier_id: supplierId || null
            };
        }
    });
    console.log(`Mapa de marcas carregado: ${Object.keys(marcasMap).length} marcas.`);

    const rows = readCsv('produtos.csv');
    let successCount = 0;
    let errorCount = 0;

    for (const row of rows) {
        const id = parseInt(row['codigo']);
        if (!id) continue;

        const marcaId = parseInt(row['lk_marca']);
        const marcaInfo = marcasMap[marcaId] || { nome: null, supplier_id: null };

        const tipoRaw = row['solarrec'];
        let tipoProduto = 'Outro';
        let unidadeMedida = 'Unidade';
        let categoria = null;

        if (tipoRaw === '1') {
            tipoProduto = 'Solar';
            categoria = 'Solar';
        } else if (tipoRaw === '2') {
            tipoProduto = 'Receituario';
            categoria = 'Receituário';
        }

        const nome = row['modelo'] || 'Produto Sem Nome';
        const nomeLower = nome.toLowerCase();

        if (nomeLower.includes('lente') && !nomeLower.includes('contato')) {
            tipoProduto = 'Lente';
            unidadeMedida = 'Par';
        }

        if (nomeLower.includes('lente de contato') || nomeLower.includes('contact')) {
            tipoProduto = 'Lente';
            unidadeMedida = 'Caixa';
        }

        const product = {
            id: id,
            store_id: 1,
            tenant_id: GLOBAL_TENANT_ID,
            nome: nome,
            preco_venda: parseCurrency(row['valor venda']),
            preco_custo: parseCurrency(row['valor compra']),
            estoque_atual: parseInt(row['quantidade']) || 0,
            estoque_minimo: 0,
            gerencia_estoque: true,
            marca: marcaInfo.nome,
            supplier_id: marcaInfo.supplier_id,
            tipo_produto: tipoProduto,
            unidade_medida: unidadeMedida,
            categoria: categoria,
            codigo_barras: row['codigo_1'] || row['codigo'],
            created_at: new Date().toISOString(),
            detalhes: {}
        };

        const { error } = await supabase.from('products').upsert(product);
        if (error) {
            console.error(`Erro ao importar produto ${id}:`, error.message);
            errorCount++;
        } else {
            successCount++;
        }
    }
    console.log(`Produtos: ${successCount} importados, ${errorCount} erros.`);
}

// --- IMPORTAÇÃO DE VENDAS ---
async function importSales() {
    console.log('--- Importando Vendas ---');
    const rows = readCsv('vendas.csv');
    let successCount = 0;
    let errorCount = 0;

    for (const row of rows) {
        const id = parseInt(row['codigo']);
        if (!id) continue;

        const clienteId = parseInt(row['lk_clientes']);
        const vendedorId = parseInt(row['lk_vendedor']);

        const fecharVenda = row['fechar venda'];
        let status = 'Em Aberto';
        if (fecharVenda === 'VERDADEIRO') {
            status = 'Fechada';
        }

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

        const { error } = await supabase.from('vendas').upsert(venda);
        if (error) {
            console.error(`Erro ao importar venda ${id}:`, error.message);
            errorCount++;
        } else {
            successCount++;
            if (successCount % 100 === 0) console.log(`Vendas importadas: ${successCount}...`);
        }
    }
    console.log(`Vendas: ${successCount} importados, ${errorCount} erros.`);
}

// --- IMPORTAÇÃO DE ITENS DE VENDA ---
async function importSaleItems() {
    console.log('--- Importando Itens de Venda ---');
    const rows = readCsv('itens.csv');
    let successCount = 0;
    let errorCount = 0;

    for (const row of rows) {
        const id = parseInt(row['codigo']);
        const vendaId = parseInt(row['lk_venda']);
        const produtoId = parseInt(row['lk_produto']);
        let qtd = parseFloat((row['qtd'] || '0').replace(',', '.')) || 0;

        if (qtd === 0.5) {
            qtd = 1;
        }

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

        const { error } = await supabase.from('venda_itens').upsert(item);
        if (error) {
            console.error(`Erro ao importar item ${id} da venda ${vendaId}:`, error.message);
            errorCount++;
        } else {
            successCount++;
        }
    }
    console.log(`Itens de Venda: ${successCount} importados, ${errorCount} erros.`);
}

// --- IMPORTAÇÃO DE ORDENS DE SERVIÇO ---
async function importServiceOrders() {
    console.log('--- Importando Ordens de Serviço ---');
    const rows = readCsv('receitas.csv');
    let successCount = 0;
    let errorCount = 0;

    for (const row of rows) {
        const id = parseInt(row['codigo']);
        if (!id) continue;

        const vendaId = parseInt(row['lk_vendas']);
        const medicoId = parseInt(row['lk_medico']);
        const dependenteId = parseInt(row['lk_dependente']);

        const formatDegree = (val) => {
            if (!val) return null;
            let clean = val.replace('+', '').trim().replace(',', '.');
            let num = parseFloat(clean);
            if (isNaN(num)) return null;
            if (Math.abs(num) > 25) {
                num = num / 100;
            }
            return (num > 0 ? '+' : '') + num.toFixed(2);
        };

        const os = {
            id: id,
            store_id: 1,
            tenant_id: GLOBAL_TENANT_ID,
            venda_id: vendaId,
            customer_id: 0,
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

        if (vendaId) {
            const { data: venda } = await supabase.from('vendas').select('customer_id').eq('id', vendaId).single();
            if (venda) {
                os.customer_id = venda.customer_id;
            } else {
                console.warn(`Venda ${vendaId} não encontrada para OS ${id}. Pulando.`);
                errorCount++;
                continue;
            }
        } else {
            console.warn(`OS ${id} sem venda vinculada. Pulando.`);
            errorCount++;
            continue;
        }

        const { error } = await supabase.from('service_orders').upsert(os);
        if (error) {
            console.error(`Erro ao importar OS ${id}:`, error.message);
            errorCount++;
        } else {
            successCount++;
        }
    }
    console.log(`Ordens de Serviço: ${successCount} importados, ${errorCount} erros.`);
}


// --- EXECUÇÃO PRINCIPAL ---
async function main() {
    await getTenantId();
    // await importSuppliers();
    // await importProducts();
    await importSales();
    await importSaleItems();
    await importServiceOrders();
}

main();
