import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing Supabase credentials in .env.local")
  process.exit(1)
}

const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function run() {
    const { data, error } = await supa.from('vendas').select('*').eq('id', 223).single()
    if (error) {
        console.error("Error fetching venda:", error.message)
    } else {
        console.log("Venda 223:", data)
    }
    
    // Check some distinct statuses just to see what's normal
    const { data: all_vendas } = await supa.from('vendas').select('status').neq('id', 223).limit(50)
    if (all_vendas) {
        const uniqueStatuses = [...new Set(all_vendas.map(v => v.status))]
        console.log("Unique statuses found in 50 rows:", uniqueStatuses)
    }
}
run()
