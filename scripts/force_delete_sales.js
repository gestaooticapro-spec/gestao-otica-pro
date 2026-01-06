
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Carrega variáveis de ambiente
dotenv.config({ path: '.env.local' });
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    dotenv.config({ path: '.env' });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // PRECISA SER A SERVICE ROLE

if (!supabaseUrl || !supabaseKey) {
    console.error('ERRO CRÍTICO: Variáveis de ambiente faltando.');
    console.error('Certifique-se de que NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY estão no .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false }
});

const SALES_TO_DELETE = [56, 60, 62, 65, 70, 71, 72, 73];

async function forceDelete() {
    console.log(`--- INICIANDO LIMPEZA FORÇADA ---`);
    console.log(`Alvos: ${SALES_TO_DELETE.join(', ')}`);

    try {
        // 1. Remover Itens da Venda
        console.log('Removendo itens...');
        const { error: errItens } = await supabase.from('venda_itens').delete().in('venda_id', SALES_TO_DELETE);
        if (errItens) console.error('Erro itens:', errItens.message);

        // 2. Remover Pagamentos
        console.log('Removendo pagamentos...');
        const { error: errPag } = await supabase.from('pagamentos').delete().in('venda_id', SALES_TO_DELETE);
        if (errPag) console.error('Erro pagamentos:', errPag.message);

        // 3. Remover Comissões
        console.log('Removendo comissões...');
        const { error: errCom } = await supabase.from('commissions').delete().in('venda_id', SALES_TO_DELETE);
        if (errCom) console.error('Erro comissões:', errCom.message);

        // 4. Remover Financiamentos (Loja)
        console.log('Removendo financiamentos...');
        const { error: errFin } = await supabase.from('financiamento_loja').delete().in('venda_id', SALES_TO_DELETE);
        if (errFin) console.error('Erro financiamentos:', errFin.message);

        // 5. Desvincular Ordens de Serviço (Setar null em vez de apagar a OS inteira, por segurança)
        console.log('Desvinculando OS...');
        const { error: errOS } = await supabase.from('service_orders')
            .update({ venda_id: null })
            .in('venda_id', SALES_TO_DELETE);
        if (errOS) console.error('Erro OS:', errOS.message);

        // 6. Remover Transações de Carteira
        console.log('Removendo transações de carteira...');
        const { error: errWallet } = await supabase.from('wallet_transactions').delete().in('related_venda_id', SALES_TO_DELETE);
        if (errWallet) console.error('Erro wallet:', errWallet.message);

        // 7. Remover Movimentações de Estoque
        console.log('Removendo movimentações de estoque...');
        const { error: errStock } = await supabase.from('stock_movements').delete().in('related_venda_id', SALES_TO_DELETE);
        if (errStock) console.error('Erro stock:', errStock.message);

        // 8. FINALMENTE: Remover as Vendas
        console.log('REMOVENDO VENDAS...');
        const { data, error: errVenda } = await supabase.from('vendas').delete().in('id', SALES_TO_DELETE).select();

        if (errVenda) {
            console.error('ERRO FATAL AO DELETAR VENDAS:', errVenda.message);
        } else {
            console.log(`SUCESSO! ${data.length} vendas foram deletadas permanentemente.`);
        }

    } catch (e) {
        console.error('Exceção:', e);
    }
}

forceDelete();
