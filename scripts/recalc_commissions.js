
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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Erro: SUPABASE_URL ou SUPABASE_KEY não encontrados no .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    const storeId = parseInt(process.argv[2]);
    if (!storeId) {
        console.log('Uso: node scripts/recalc_commissions.js <STORE_ID>');
        return;
    }

    console.log(`\n=== RECÁLCULO FINAL (v3) - Loja ${storeId} ===`);
    console.log(`Regras:`);
    console.log(`  1. Apenas vendas FECHADAS`);
    console.log(`  2. Data da comissão = created_at da venda`);
    console.log(`  3. Comissão = 1% (respeita taxas do funcionário)\n`);

    // 1. Limpar TODAS as comissões existentes da loja (recomeçar do zero)
    const { error: delError, count: delCount } = await supabase
        .from('commissions')
        .delete({ count: 'exact' })
        .eq('store_id', storeId);

    if (delError) {
        console.error('Erro ao limpar comissões:', delError.message);
        return;
    }
    console.log(`Limpeza: ${delCount} comissões antigas removidas.\n`);

    // 2. Buscar TODAS as vendas fechadas da loja (sem limite de data)
    const { data: vendas, error } = await supabase
        .from('vendas')
        .select(`
            *,
            venda_itens ( valor_total_item, product_id, quantidade, produtos:products(preco_custo) ),
            pagamentos ( valor_pago, forma_pagamento ),
            employees ( 
                id, 
                full_name,
                comm_rate_guaranteed, 
                comm_rate_store_credit, 
                comm_rate_profit 
            )
        `)
        .eq('store_id', storeId)
        .eq('status', 'Fechada')
        .order('created_at', { ascending: true });

    if (error) {
        console.error('Erro ao buscar vendas:', error.message);
        return;
    }

    console.log(`Encontradas ${vendas.length} vendas FECHADAS.\n`);

    let ok = 0, skip = 0, errs = 0;
    let totalComissao = 0;

    for (const venda of vendas) {
        if (!venda.employee_id || !venda.employees) { skip++; continue; }

        const emp = venda.employees;
        const rateGuaranteed = emp.comm_rate_guaranteed || 0;
        const rateCredit = emp.comm_rate_store_credit || 0;
        const rateProfit = emp.comm_rate_profit || 0;

        if (rateGuaranteed === 0 && rateCredit === 0 && rateProfit === 0) { skip++; continue; }

        const valorVenda = venda.valor_final;
        let comissaoTotal = 0;

        // A. POR PAGAMENTO (garantido vs risco)
        const totalPagoGarantido = venda.pagamentos?.reduce((acc, pg) => {
            const forma = (pg.forma_pagamento || '').toLowerCase();
            if (forma.includes('pix') || forma.includes('dinheiro') || forma.includes('cart') || forma.includes('débito')) {
                return acc + (pg.valor_pago || 0);
            }
            return acc;
        }, 0) || 0;

        const totalRisco = valorVenda - totalPagoGarantido;

        if (totalPagoGarantido > 0 && rateGuaranteed > 0) {
            comissaoTotal += totalPagoGarantido * (rateGuaranteed / 100);
        }
        if (totalRisco > 0 && rateCredit > 0) {
            comissaoTotal += totalRisco * (rateCredit / 100);
        }

        // B. SOBRE LUCRO
        if (rateProfit > 0) {
            const custoTotal = venda.venda_itens?.reduce((acc, item) => {
                const custoUnit = item.produtos?.preco_custo || 0;
                return acc + (custoUnit * (item.quantidade || 1));
            }, 0) || 0;
            const lucroBruto = valorVenda - custoTotal;
            if (lucroBruto > 0) comissaoTotal += lucroBruto * (rateProfit / 100);
        }

        comissaoTotal = parseFloat(comissaoTotal.toFixed(2));

        if (comissaoTotal > 0) {
            const { error: insertError } = await supabase
                .from('commissions')
                .insert({
                    tenant_id: venda.tenant_id,
                    store_id: venda.store_id,
                    employee_id: venda.employee_id,
                    venda_id: venda.id,
                    amount: comissaoTotal,
                    status: 'Pendente',
                    created_at: venda.created_at // ← DATA DA VENDA (não do pagamento)
                });

            if (insertError) {
                console.error(`  ❌ Venda #${venda.id}: ${insertError.message}`);
                errs++;
            } else {
                console.log(`  ✅ #${venda.id} [${venda.created_at.slice(0, 10)}] R$ ${comissaoTotal.toFixed(2)} (${emp.full_name})`);
                totalComissao += comissaoTotal;
                ok++;
            }
        }
    }

    console.log(`\n=== RESULTADO ===`);
    console.log(`  Processadas: ${ok} | Ignoradas: ${skip} | Erros: ${errs}`);
    console.log(`  Total Comissões: R$ ${totalComissao.toFixed(2)}`);
}

main();
