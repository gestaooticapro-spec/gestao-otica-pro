
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function diagnose() {
    console.log("--- DIAGNOSIS START ---");

    // 1. Check Store 1 Details
    const { data: store, error: errStore } = await supabase
        .from('stores')
        .select('*')
        .eq('id', 1)
        .single();

    if (errStore) {
        console.error("Error fetching Store 1:", errStore);
    } else {
        console.log("Store 1 found:", store.name, "(ID:", store.id, ")");
    }

    // 2. Check Payments for Store 1 in Jan 2026
    const start = new Date(2026, 0, 1, 0, 0, 0).toISOString();
    const end = new Date(2026, 1, 0, 23, 59, 59).toISOString();

    console.log("Checking payments between:", start, "and", end);

    const { data: pagamentos, error: errPag } = await supabase
        .from('pagamentos')
        .select('*')
        .eq('store_id', 1)
        .gte('created_at', start)
        .lte('created_at', end);

    if (errPag) {
        console.error("Error fetching payments:", errPag);
    } else {
        console.log(`Found ${pagamentos.length} payments for Store 1 in Jan 2026.`);

        // Count by method
        const counts = pagamentos.reduce((acc, curr) => {
            const method = curr.forma_pagamento || 'Unknown';
            acc[method] = (acc[method] || 0) + 1;
            return acc;
        }, {});

        console.log("Payment Method Counts:", counts);

        // Check if query logic would match
        const pixCount = pagamentos.filter(p => p.forma_pagamento && p.forma_pagamento.toLowerCase().includes('pix')).length;
        const cardCount = pagamentos.filter(p => p.forma_pagamento && (
            p.forma_pagamento.toLowerCase().includes('cartão') ||
            p.forma_pagamento.toLowerCase().includes('credito') ||
            p.forma_pagamento.toLowerCase().includes('debito')
        )).length;

        console.log(`Simulated Query Logic Matches: PIX=${pixCount}, CARDS=${cardCount}`);

        if (pixCount > 0) {
            console.log("\n--- DETAILED PIX TRANSACTIONS ---");
            const pixTransactions = pagamentos.filter(p => p.forma_pagamento && p.forma_pagamento.toLowerCase().includes('pix'));
            pixTransactions.forEach(p => {
                console.log(`ID: ${p.id} | Date: ${p.created_at} | Value: ${p.valor_pago} | Desc: ${p.obs || 'N/A'}`);
            });
            console.log("---------------------------------\n");
        }
    }

    // 3. Check ANY payments for Store 1 (to see if date is the issue)
    const { data: allPag, error: errAll } = await supabase
        .from('pagamentos')
        .select('created_at, forma_pagamento')
        .eq('store_id', 1)
        .order('created_at', { ascending: false })
        .limit(5);

    if (allPag && allPag.length > 0) {
        console.log("Latest 5 payments for Store 1 (Any Date):");
        console.log(allPag);
    } else {
        console.log("No payments EVER found for Store 1.");
    }

    console.log("--- DIAGNOSIS END ---");
}

diagnose();
