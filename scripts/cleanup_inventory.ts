import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Erro: Variáveis de ambiente NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não encontradas.')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

const STORE_ID = 1

async function runCleanup() {
    const isRealRun = process.argv.includes('--execute')
    const dryRun = !isRealRun

    console.log(`--- INICIANDO LIMPEZA DE ESTOQUE (ZERO STOCK & SEM VENDAS - MODO COMPLETO) ---`)
    if (dryRun) console.log(`[MODO: DRY-RUN] Nenhum dado será apagado.\n`)
    else console.log(`[MODO: EXECUÇÃO REAL] ATENÇÃO: Os dados serão removidos permanentemente.\n`)

    // 1. Buscar todos os product_ids que possuem pelo menos uma venda na loja (Carregando todos uma vez)
    console.log('Mapeando produtos com vendas...')
    const { data: productsInSales, error: salesError } = await supabase
        .from('venda_itens')
        .select('product_id')
        .eq('store_id', STORE_ID)
        .not('product_id', 'is', null)

    if (salesError) {
        console.error('Erro ao buscar itens de venda:', salesError.message)
        return
    }

    const soldProductIds = new Set(productsInSales?.map(item => item.product_id) || [])
    console.log(`Produtos com vendas preservados: ${soldProductIds.size}`)

    let allDeletedCount = 0
    let page = 0
    const PAGE_SIZE = 1000
    let hasMore = true

    // 2. Loop com paginação para buscar e deletar
    while (hasMore) {
        const from = page * PAGE_SIZE
        const to = from + PAGE_SIZE - 1

        const { data: zeroStockProducts, error: productsError } = await supabase
            .from('products')
            .select('id, nome, tipo_produto, codigo_barras')
            .eq('store_id', STORE_ID)
            .in('tipo_produto', ['Armacao', 'Solar'])
            .eq('estoque_atual', 0)
            .range(from, to)
            .order('id')

        if (productsError) {
            console.error('Erro ao buscar produtos:', productsError.message)
            break
        }

        if (!zeroStockProducts || zeroStockProducts.length === 0) {
            hasMore = false
            break
        }

        const productsToDelete = zeroStockProducts.filter(p => !soldProductIds.has(p.id))

        if (productsToDelete.length > 0) {
            console.log(`Lote ${page + 1}: ${productsToDelete.length} itens para processar...`)

            for (const product of productsToDelete) {
                if (dryRun) {
                    console.log(`[DRY-RUN] Candidato a remoção: [${product.tipo_produto}] ${product.nome} (ID: ${product.id})`)
                } else {
                    const { error: deleteError } = await supabase
                        .from('products')
                        .delete()
                        .eq('id', product.id)

                    if (deleteError) {
                        console.error(`Erro ao apagar ID ${product.id}:`, deleteError.message)
                    } else {
                        allDeletedCount++
                    }
                }
            }
        }

        if (zeroStockProducts.length < PAGE_SIZE) {
            hasMore = false
        } else {
            page++
        }
    }

    if (dryRun) {
        console.log(`\nFim do Dry-Run. Rode com --execute para efetivar.`)
    } else {
        console.log(`\nLimpeza concluída! Total de ${allDeletedCount} itens removidos.`)
    }
}

runCleanup()
