import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { startOfMonth, endOfMonth, startOfDay, endOfDay } from 'date-fns'

dotenv.config({ path: '.env.local' })

const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function run() {
    const monthStr = '02';
    const yearStr = '2026';

    const month = parseInt(monthStr) - 1; // 0-indexed para date-fns
    const year = parseInt(yearStr);

    const startDate = startOfMonth(new Date(year, month));
    const endDate = endOfMonth(startDate);

    const startDateStr = startOfDay(startDate).toISOString();
    const endDateStr = endOfDay(endDate).toISOString();

    console.log("Date Range:", startDateStr, endDateStr)

    // Test the exact logic in the backend
    const { data: vendas, error: vendError } = await supa
        .from('vendas')
        .select(`
            id, 
            created_at, 
            valor_final,
            financiamento_loja!financiamento_loja_venda_id_fkey ( valor_total_financiado )
        `)
        .eq('store_id', 1)
        .neq('status', 'Cancelada')
        .gte('created_at', startDateStr)
        .lte('created_at', endDateStr);

    console.log("Vendas Error:", vendError?.message)
    console.log("Vendas:", vendas?.length)

    const { data: pagamentos, error: pagError } = await supa
        .from('pagamentos')
        .select('data_pagamento, valor_pago')
        .eq('store_id', 1)
        .gte('data_pagamento', startDateStr)
        .lte('data_pagamento', endDateStr);

    console.log("Pagamentos Error:", pagError?.message)
    console.log("Pagamentos:", pagamentos?.length)
}
run()
