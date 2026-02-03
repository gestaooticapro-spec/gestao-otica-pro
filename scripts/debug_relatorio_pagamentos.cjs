
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Error: SUPABASE_URL or SERVICE_ROLE_KEY not found in environment');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkPagamentos(storeId, mes, ano) {
    console.log(`Checking payments for Store ID: ${storeId}, Month: ${mes}, Year: ${ano}`);

    // Create dates
    // Note: Javascript Date uses 0-indexed months.
    const start = new Date(ano, mes - 1, 1);
    const end = new Date(ano, mes, 0, 23, 59, 59);

    console.log('Filter Range:', start.toISOString(), 'to', end.toISOString());

    const { data, error } = await supabase
        .from('pagamentos')
        .select(`
            id,
            valor_pago,
            forma_pagamento,
            created_at,
            obs
        `)
        .eq('store_id', storeId)
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString());

    if (error) {
        console.error('Supabase Error:', error);
        return;
    }

    console.log(`Found ${data.length} records.`);
    if (data.length > 0) {
        console.log('First 5 records:');
        console.table(data.slice(0, 5));

        // Count by payment method
        const counts = data.reduce((acc, curr) => {
            const method = curr.forma_pagamento ? curr.forma_pagamento.toLowerCase() : 'unknown';
            acc[method] = (acc[method] || 0) + 1;
            return acc;
        }, {});
        console.log('Counts by method:', counts);
    } else {
        console.log('No records found. Checking broader range (entire year)...');
        const { data: allData } = await supabase
            .from('pagamentos')
            .select('created_at')
            .eq('store_id', storeId)
            .limit(5);
        console.log('Some records from this store (any date):', allData);
    }
}

// Default to checking for Store 5 (Guaíra from screenshot title) for Jan 2026
const storeId = 5;
const mes = 1;
const ano = 2026;

checkPagamentos(storeId, mes, ano);
