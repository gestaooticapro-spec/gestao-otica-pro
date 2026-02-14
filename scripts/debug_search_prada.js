import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Missing credentials");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
    console.log("Searching for Prada products...");

    // Fetch broad match to see the data
    const { data, error } = await supabase
        .from('products')
        .select('*')
        .ilike('nome', '%Prada%')
        .limit(3);

    if (error) {
        console.error("Error:", error);
        return;
    }

    if (data && data.length > 0) {
        console.log("Found products with 'Prada' in name (First 3):");
        printProducts(data);
    } else {
        console.log("No products with 'Prada' in name.");
    }

    // SIMULATE MULTI-TERM SEARCH ALWAYS
    console.log("\n--- SIMULATING 'SPR 65Z' SEARCH ---");
    const terms = ["SPR", "65Z"];
    let query = supabase.from('products').select('*');

    // Using the EXACT logic from vendas.actions.ts
    terms.forEach(t => {
        query = query.or(`nome.ilike.%${t}%,marca.ilike.%${t}%,detalhes->>modelo.ilike.%${t}%,detalhes->>cor.ilike.%${t}%`)
    });

    const { data: dataMulti, error: errMulti } = await query.limit(5);

    if (errMulti) {
        console.error("Simulation Error:", errMulti);
    } else if (dataMulti && dataMulti.length > 0) {
        console.log("SUCCESS! Found with multi-field search:");
        printProducts(dataMulti);
    } else {
        console.log("FAILED to find 'SPR 65Z' with multi-field search.");

        // Try locating 'SPR' anywhere to see where it hides
        console.log("\nTrying strict search for 'SPR' in ANY field...");
        const { data: dataSpr } = await supabase
            .from('products')
            .select('*')
            .or(`nome.ilike.%SPR%,marca.ilike.%SPR%,modelo.ilike.%SPR%,detalhes->>modelo.ilike.%SPR%`)
            .limit(3);

        if (dataSpr && dataSpr.length > 0) {
            console.log("Found 'SPR' here:");
            printProducts(dataSpr);
        } else {
            console.log("No product with 'SPR' found in Name, Brand, Model, or Details->Model.");
        }
    }
}

function printProducts(products) {
    products.forEach(p => {
        console.log("---------------------------------------------------");
        console.log(`ID: ${p.id}`);
        console.log(`Nome: ${p.nome}`);
        console.log(`Marca: ${p.marca}`);
        console.log(`Modelo: ${p.modelo}`);
        console.log(`Referencia: ${p.referencia}`);
        console.log(`Código Barras: ${p.codigo_barras}`);
        console.log(`Tipo: ${p.tipo_produto}`);
        console.log(`Detalhes (JSON):`, JSON.stringify(p.detalhes, null, 2));
        console.log("---------------------------------------------------");
    });
}

run();
