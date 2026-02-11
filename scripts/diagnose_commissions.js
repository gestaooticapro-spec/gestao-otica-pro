
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const envPath = path.join(PROJECT_ROOT, '.env.local');
if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split(/\r?\n/).forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) process.env[key.trim()] = value.trim();
    });
}

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
    const storeId = 1;

    console.log('===================================================================');
    console.log('DIAGNÓSTICO: POR QUE COMISSÃO (R$ 12.335) ≠ VENDAS PAGO (R$ 11.620)');
    console.log('===================================================================\n');

    // 1. Vendas FECHADAS de Fevereiro (mesma visão do Relatório de Vendas)
    console.log('--- PARTE 1: Vendas FECHADAS criadas em FEVEREIRO (o que o Relatório mostra) ---\n');

    const { data: vendasFev } = await supabase
        .from('vendas')
        .select('id, created_at, valor_final, status, employee_id, employees(full_name)')
        .eq('store_id', storeId)
        .eq('status', 'Fechada')
        .gte('created_at', '2026-02-01T00:00:00')
        .lte('created_at', '2026-02-28T23:59:59')
        .order('created_at', { ascending: false });

    let somaFevNatalia = 0;
    let somaFevOzias = 0;

    for (const v of vendasFev) {
        const emp = v.employees?.full_name || '?';
        const vf = Number(v.valor_final);
        if (emp === 'Natália') somaFevNatalia += vf;
        else somaFevOzias += vf;
        console.log(`  Venda #${v.id} | ${v.created_at.slice(0, 10)} | ${emp.padEnd(10)} | R$ ${vf.toFixed(2)}`);
    }

    console.log(`\n  TOTAL Natália (Fev, Fechadas): R$ ${somaFevNatalia.toFixed(2)}`);
    console.log(`  TOTAL Ozias  (Fev, Fechadas): R$ ${somaFevOzias.toFixed(2)}`);
    console.log(`  TOTAL GERAL  (Fev, Fechadas): R$ ${(somaFevNatalia + somaFevOzias).toFixed(2)}`);

    // 2. Comissões de Fevereiro (o que o relatório de comissões mostra)
    console.log('\n--- PARTE 2: Comissões registradas em FEVEREIRO ---\n');

    const { data: comissoesFev } = await supabase
        .from('commissions')
        .select('id, venda_id, amount, created_at')
        .eq('store_id', storeId)
        .gte('created_at', '2026-02-01T00:00:00')
        .lte('created_at', '2026-02-28T23:59:59')
        .order('created_at', { ascending: false });

    let somaComissaoBase = 0;
    let vendasJanNoComFev = [];

    for (const c of comissoesFev) {
        const { data: venda } = await supabase
            .from('vendas')
            .select('id, created_at, valor_final, employees(full_name)')
            .eq('id', c.venda_id)
            .single();

        const vendaCriadaEm = venda?.created_at?.slice(0, 10) || '?';
        const criadaEmJan = vendaCriadaEm < '2026-02-01';
        const vf = Number(venda?.valor_final || 0);
        somaComissaoBase += vf;

        if (criadaEmJan) {
            vendasJanNoComFev.push({ id: c.venda_id, valor: vf, criadaEm: vendaCriadaEm, comissaoEm: c.created_at.slice(0, 10) });
        }

        console.log(
            `  Venda #${c.venda_id} | Criada: ${vendaCriadaEm} | Comissão: ${c.created_at.slice(0, 10)} | ` +
            `R$ ${vf.toFixed(2)} | Com: R$ ${c.amount.toFixed(2)}` +
            (criadaEmJan ? ' ← VENDA DE JANEIRO' : '')
        );
    }

    console.log(`\n  TOTAL BASE COMISSÃO (Feb): R$ ${somaComissaoBase.toFixed(2)}`);

    // 3. Análise da diferença
    console.log('\n--- PARTE 3: DIAGNÓSTICO DA DIFERENÇA ---\n');

    if (vendasJanNoComFev.length > 0) {
        let somaJan = 0;
        console.log('  Vendas de JANEIRO que apareceram nas comissões de FEVEREIRO:');
        vendasJanNoComFev.forEach(v => {
            console.log(`    - Venda #${v.id}: R$ ${v.valor.toFixed(2)} (Criada: ${v.criadaEm}, Comissão: ${v.comissaoEm})`);
            somaJan += v.valor;
        });
        console.log(`    SUBTOTAL: R$ ${somaJan.toFixed(2)}`);

        const baseSemJan = somaComissaoBase - somaJan;
        console.log(`\n  Base Comissão SEM vendas Janeiro: R$ ${baseSemJan.toFixed(2)}`);
        console.log(`  Natália Vendas Fev (Fechadas):    R$ ${somaFevNatalia.toFixed(2)}`);
        console.log(`  Diferença restante:               R$ ${(baseSemJan - somaFevNatalia).toFixed(2)}`);
    }

    // 4. Vendas fechadas de Fevereiro SEM comissão
    console.log('\n--- PARTE 4: Vendas FECHADAS de Fev SEM comissão (Natália) ---\n');

    const vendasComComissao = new Set(comissoesFev.map(c => c.venda_id));
    const semComissao = vendasFev.filter(v =>
        v.employees?.full_name === 'Natália' && !vendasComComissao.has(v.id)
    );

    if (semComissao.length > 0) {
        semComissao.forEach(v => {
            console.log(`  ⚠️ Venda #${v.id} | ${v.created_at.slice(0, 10)} | R$ ${v.valor_final} | SEM COMISSÃO`);
        });
    } else {
        console.log('  ✅ Todas as vendas fechadas de Natália em Fev têm comissão.');
    }

    // 5. Verificar se PAGO no relatório coincide com valor_final para vendas fechadas
    console.log('\n--- PARTE 5: Como o Relatório calcula "PAGO" ---\n');

    // Buscar TODAS as vendas de fevereiro (incluindo Em Aberto)
    const { data: todasVendasFev } = await supabase
        .from('vendas')
        .select('id, created_at, valor_final, valor_restante, status, employees(full_name)')
        .eq('store_id', storeId)
        .gte('created_at', '2026-02-01T00:00:00')
        .lte('created_at', '2026-02-28T23:59:59')
        .order('id');

    let totalPagoRelatorio = 0;
    for (const v of todasVendasFev) {
        const vf = Number(v.valor_final || 0);
        const vr = Number(v.valor_restante || 0);
        const pago = vf - vr; // PAGO = valor_final - valor_restante
        totalPagoRelatorio += pago;
    }

    console.log(`  Soma (valor_final - valor_restante) de TODAS vendas de Fev: R$ ${totalPagoRelatorio.toFixed(2)}`);
    console.log(`  (Referência do usuário: R$ 11.620,00)`);
}

main();
