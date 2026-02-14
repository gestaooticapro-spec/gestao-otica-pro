
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase environment variables');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectVarejo() {
    console.log('Fetching sample Varejo product (limited columns)...');

    const { data, error } = await supabase
        .from('products')
        .select('id, nome, detalhes, tipo_produto')
        .eq('tipo_produto', 'Outro')
        .limit(1);

    if (error) {
        console.error('Error:', error);
        return;
    }

    if (!data || data.length === 0) {
        console.log('No Varejo products found.');
        return;
    }

    const p = data[0];
    console.log('Product Found:', JSON.stringify(p, null, 2));
}

inspectVarejo();
