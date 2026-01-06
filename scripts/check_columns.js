
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkColumns() {
    const { data: customers, error: errCust } = await supabase.from('customers').select('*').limit(1);
    const { data: employees, error: errEmp } = await supabase.from('employees').select('*').limit(1);

    if (customers && customers.length > 0) {
        console.log('Customers columns:', Object.keys(customers[0]));
    } else {
        console.log('Customers table empty or error:', errCust);
    }

    if (employees && employees.length > 0) {
        console.log('Employees columns:', Object.keys(employees[0]));
    } else {
        console.log('Employees table empty or error:', errEmp);
    }
}

checkColumns();
