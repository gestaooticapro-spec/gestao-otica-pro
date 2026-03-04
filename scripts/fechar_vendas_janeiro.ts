import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { join } from 'path'

// Load environment variables from .env.local
dotenv.config({ path: join(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Missing Supabase URL or Service Key in .env.local")
    process.exit(1)
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

async function main() {
    console.log("Buscando vendas paradas de janeiro...")

    // Considerando Janeiro de 2026
    const start = new Date('2026-01-01T00:00:00.000Z')
    const end = new Date('2026-01-31T23:59:59.999Z')

    const { data: vendas, error } = await supabaseAdmin
        .from('vendas')
        .select('id, created_at, status')
        .neq('status', 'Fechada')
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString())

    if (error) {
        console.error("Erro ao buscar vendas:", error)
        return
    }

    console.log(`Encontrei ${vendas?.length || 0} vendas abertas de Janeiro.`)

    if (!vendas || vendas.length === 0) {
        console.log("Nenhuma ação necessária.")
        return
    }

    let successCount = 0
    let errorCount = 0

    for (const venda of vendas) {
        console.log(`Fechando venda #${venda.id} (criada em ${new Date(venda.created_at).toLocaleDateString('pt-BR')})...`)

        const { error: updateError } = await supabaseAdmin
            .from('vendas')
            .update({
                status: 'Fechada',
                data_fechamento: venda.created_at, // Força a data de fechamento ser a mesma de abertura
                valor_restante: 0 // Zera saldo devedor
            })
            .eq('id', venda.id)

        if (updateError) {
            console.error(`Erro ao atualizar venda #${venda.id}:`, updateError)
            errorCount++
        } else {
            successCount++
        }
    }

    console.log(`Processo concluído! Sucesso: ${successCount}, Erros: ${errorCount}`)
}

main().catch(console.error)
