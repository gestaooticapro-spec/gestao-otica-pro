import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseServiceKey)

const STORE_ID = 1

async function run() {
    console.log('--- LIMPEZA V3: Individual delete, skip protegidos ---')

    // Coleta de IDs protegidos: vendas + movimentações de estoque
    console.log('Coletando IDs protegidos (vendas + movimentações)...')

    const { data: salesData } = await supabase
        .from('venda_itens')
        .select('product_id')
        .eq('store_id', STORE_ID)
        .not('product_id', 'is', null)

    const { data: movData } = await supabase
        .from('stock_movements')
        .select('product_id')
        .eq('store_id', STORE_ID)
        .not('product_id', 'is', null)

    const protectedIds = new Set<number>()
    salesData?.forEach(i => protectedIds.add(i.product_id))
    movData?.forEach(i => protectedIds.add(i.product_id))

    console.log(`IDs protegidos: ${protectedIds.size}`)

    let totalDeleted = 0
    let offset = 0
    const PAGE_SIZE = 200

    while (true) {
        const { data: batch } = await supabase
            .from('products')
            .select('id, nome')
            .eq('store_id', STORE_ID)
            .in('tipo_produto', ['Armacao', 'Solar'])
            .eq('estoque_atual', 0)
            .order('id')
            .range(offset, offset + PAGE_SIZE - 1)

        if (!batch || batch.length === 0) break

        // Filtrar: só deletar IDs que NÃO estão protegidos
        const deletable = batch.filter(p => !protectedIds.has(p.id))
        const skipped = batch.length - deletable.length

        if (deletable.length > 0) {
            const idsToDelete = deletable.map(p => p.id)
            const { error, count } = await supabase
                .from('products')
                .delete({ count: 'exact' })
                .in('id', idsToDelete)

            if (error) {
                console.error(`Erro no batch: ${error.message}`)
            } else {
                totalDeleted += (count || idsToDelete.length)
                console.log(`Removidos: ${count || idsToDelete.length} | Protegidos: ${skipped} | Total acumulado: ${totalDeleted}`)
            }
        }

        // Avançar offset pelos itens que foram pulados (protegidos)
        // Itens deletados não existem mais, então o offset avança naturalmente
        offset += skipped

        if (batch.length < PAGE_SIZE) break
    }

    console.log(`\nLimpeza V3 concluída! Total removido: ${totalDeleted}`)
}

run()
