
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkIds() {
    // Check Customer ID 1
    const { data: cust1, error: errC1 } = await supabase.from('customers').select('id, full_name').eq('id', 1).single();
    console.log('Customer ID 1:', cust1 || errC1);

    // Check Employee ID 1 (or first one found)
    const { data: emp1, error: errE1 } = await supabase.from('employees').select('id, full_name').limit(1);
    console.log('First Employee:', emp1);
}

checkIds();
