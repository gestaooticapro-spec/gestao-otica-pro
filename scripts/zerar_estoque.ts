import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
    console.log('--- Iniciando script para ZERAR estoques ---')

    let productsUpdated = 0
    let variantsUpdated = 0

    // Zera products
    const { data: pData, error: pError } = await supabase
        .from('products')
        .update({ estoque_atual: 0 })
        .gt('estoque_atual', 0)
        .select('id')

    if (pError) {
        console.error('Erro ao atualizar products:', pError)
    } else {
        productsUpdated = pData ? pData.length : 0
        console.log(`✅ Produtos atualizados para zero: ${productsUpdated}`)
    }

    // Zera product_variants (lentes, sobras)
    const { data: vData, error: vError } = await supabase
        .from('product_variants')
        .update({ estoque_atual: 0 })
        .gt('estoque_atual', 0)
        .select('id')

    if (vError) {
        console.error('Erro ao atualizar product_variants:', vError)
    } else {
        variantsUpdated = vData ? vData.length : 0
        console.log(`✅ Variantes (lentes/sobras) atualizadas para zero: ${variantsUpdated}`)
    }

    console.log('--- Finalizado com sucesso! ---')
}

run()
