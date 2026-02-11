
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function main() {
    // Corrigir: Inserir o pagamento PIX com venda_id real (não null)
    const { data, error } = await supabase.from('pagamentos').insert({
        tenant_id: '40b34e90-4c9d-4446-b775-770a3e77d6c0',
        store_id: 1,
        venda_id: 61,  // Venda real da Natily
        customer_id: 9262,
        valor_pago: 160,
        forma_pagamento: 'PIX',
        data_pagamento: '2026-02-11',
        created_at: new Date('2026-02-11T12:00:00Z').toISOString(),
        parcelas: 1,
        obs: 'Ref. Venda #61 - Parc. 1 (Principal: 160.00 + Juros: 0.00) - Cliente: NATILY REGINA PEREIRA DA SILVA'
    }).select()

    if (error) {
        console.error("ERRO:", JSON.stringify(error, null, 2))
    } else {
        console.log("✅ Pagamento PIX inserido:", JSON.stringify(data, null, 2))
    }
}

main()
