
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Configuração do Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Erro: Variáveis de ambiente obrigatórias faltando.');
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

let GLOBAL_TENANT_ID = null;

async function getTenantId() {
    const { data, error } = await supabase.from('stores').select('tenant_id').eq('id', 1).single();
    if (error || !data) {
        console.error('Erro ao obter tenant_id da loja 1:', error?.message);
        process.exit(1);
    }
    GLOBAL_TENANT_ID = data.tenant_id;
}

async function rescueProducts() {
    await getTenantId();
    console.log('--- Resgatando Produtos Falhos ---');

    // Obter IDs já existentes para não tentar inserir duplicados (embora upsert resolva, é bom evitar tráfego)
    // Como são muitos, vamos confiar no upsert com onConflict: id e ignoreDuplicates: true se possível, 
    // mas o supabase upsert atualiza. 
    // Melhor estratégia: Tentar inserir. Se já existe, ok. Se falhar FK, usar fallback.
    // Mas o script original já tentou e falhou.
    // Então vamos ler o CSV e tentar inserir APENAS os que não estão no banco?
    // Ou tentar inserir TODOS forçando supplier_id = 1 se o original falhar?

    // Vamos simplificar: Ler todos do CSV. Verificar se existe no banco. Se NÃO existir, inserir com supplier_id = 1.

    const rows = readCsv('produtos.csv');
    console.log(`Total CSV: ${rows.length}`);

    // Buscar IDs existentes em lotes ou apenas tentar inserir e tratar erro?
    // Vamos tentar inserir com supplier_id = 1 apenas se o produto NÃO existir.

    // Para ser rápido: Pegar todos IDs do banco.
    const { data: existingIds, error } = await supabase.from('products').select('id');
    if (error) {
        console.error('Erro ao buscar produtos existentes:', error.message);
        return;
    }

    const existingIdSet = new Set(existingIds.map(p => p.id));
    console.log(`Produtos já no banco: ${existingIdSet.size}`);

    let rescuedCount = 0;

    for (const row of rows) {
        const id = parseInt(row['codigo']);
        if (!id) continue;

        if (existingIdSet.has(id)) {
            continue; // Já existe
        }

        // Não existe, vamos resgatar
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
            marca: 'Marca Desconhecida', // Fallback
            supplier_id: 1, // FALLBACK FORNECEDOR
            tipo_produto: tipoProduto,
            unidade_medida: unidadeMedida,
            categoria: categoria,
            codigo_barras: row['codigo_1'] || row['codigo'],
            created_at: new Date().toISOString(),
            detalhes: {}
        };

        const { error: insertError } = await supabase.from('products').insert(product);
        if (insertError) {
            console.error(`Erro ao resgatar produto ${id}:`, insertError.message);
        } else {
            rescuedCount++;
            if (rescuedCount % 50 === 0) console.log(`Resgatados: ${rescuedCount}...`);
        }
    }

    console.log(`Total resgatados: ${rescuedCount}`);
}

rescueProducts();
