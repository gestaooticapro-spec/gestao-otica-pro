
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function main() {
    // Busca parcelas pagas HOJE
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)

    const { data: parcelas, error } = await supabase
        .from('financiamento_parcelas')
        .select(`id, valor_parcela, data_pagamento, status, customer_id, numero_parcela, financiamento_id, customers (full_name), financiamento_loja(venda_id)`)
        .eq('status', 'Pago')
        .gte('data_pagamento', hoje.toISOString())
        .order('data_pagamento', { ascending: false })

    if (error) { console.error("Erro:", error); return }

    console.log("=== PARCELAS PAGAS HOJE ===")
    console.log(JSON.stringify(parcelas, null, 2))

    // Agora vamos ver as colunas da tabela
    console.log("\n=== TOTAL ENCONTRADAS ===")
    console.log(parcelas?.length || 0)
}

main()
