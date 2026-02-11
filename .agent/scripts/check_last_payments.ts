
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Env Vars")
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// Adjust store_id as needed, assumes user's active store
// Using hardcoded storeId from previous runs if needed or passing via arg?
// For now, let's just dump ALL recent payments
async function main() {
    console.log("Checking last 10 payments (all stores)...")

    // Select without strict join to see if data exists
    const { data: payments, error } = await supabase
        .from('pagamentos')
        .select(`
            id, 
            valor_pago, 
            forma_pagamento, 
            created_at, 
            venda_id,
            obs,
            vendas ( id, customer_id )
        `)
        .order('created_at', { ascending: false })
        .limit(10)

    if (error) {
        console.error("Error fetching payments:", error)
        return
    }

    console.log(JSON.stringify(payments, null, 2))
}

main()
