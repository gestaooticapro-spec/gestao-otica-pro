require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Missing Supabase credentials.");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixPayment() {
    console.log("Searching for payment...");

    // Find payment by value and approximate time (today)
    // Value: 2000.00
    // Customer Name search via join is harder, let's search payment by value and verify

    const { data: payments, error } = await supabase
        .from('pagamentos')
        .select(`
            id,
            valor_pago,
            created_at,
            venda_id,
            vendas (
                customer_id,
                customers (full_name)
            )
        `)
        .eq('valor_pago', 2000)
        .gte('created_at', '2026-01-30T00:00:00') // Created today
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Error searching:", error);
        return;
    }

    console.log(`Found ${payments.length} payments of 2000.00 today.`);

    const target = payments.find(p => p.vendas?.customers?.full_name?.toUpperCase().includes('FATIMA'));

    if (!target) {
        console.log("Payment for FATIMA not found.");
        return;
    }

    console.log("Found Target Payment:", target);
    console.log(`Updating date to 2026-01-19...`);

    // Update created_at to 2026-01-19 12:00:00
    const newDate = '2026-01-19T12:00:00.000Z';

    const { error: updateError } = await supabase
        .from('pagamentos')
        .update({ created_at: newDate, data_pagamento: '2026-01-19' })
        .eq('id', target.id);

    if (updateError) {
        console.error("Error updating:", updateError);
    } else {
        console.log("Payment updated successfully!");
    }
}

fixPayment();
