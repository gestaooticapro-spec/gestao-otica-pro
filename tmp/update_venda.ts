import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing Supabase credentials in .env.local")
  process.exit(1)
}

const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function run() {
    const { data, error } = await supa
        .from('vendas')
        .update({ status: 'Em Aberto', data_fechamento: null })
        .eq('id', 223)
        .select()
        .single()
        
    if (error) {
        console.error("Error updating venda:", error.message)
    } else {
        console.log("Venda 223 updated successfully:", data)
    }
}
run()
