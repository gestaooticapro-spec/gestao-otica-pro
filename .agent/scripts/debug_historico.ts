
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function run() {
    const storeId = 1

    console.log(`Checking caixa_diario for Store ${storeId}...`)

    // Check Open
    const { data: openCaixas } = await supabase
        .from('caixa_diario')
        .select('*')
        .eq('store_id', storeId)
        .eq('status', 'Aberto')

    console.log('Open caixas:', openCaixas?.length, openCaixas)

    // Check Closed
    const { data: closedCaixas } = await supabase
        .from('caixa_diario')
        .select('*')
        .eq('store_id', storeId)
        .eq('status', 'Fechado')

    console.log('Closed caixas:', closedCaixas?.length)

    // Check logic of getHistoricoCaixa
    // Replicating the logic
    if (closedCaixas && closedCaixas.length > 0) {
        console.log('Found closed caixas. Logic should work.')
        const ids = closedCaixas.map(c => c.id)
        const { data: movs } = await supabase
            .from('caixa_movimentacoes')
            .select('*')
            .in('caixa_id', ids)
        console.log('Movimentacoes for closed caixas:', movs?.length)
    } else {
        console.log('NO CLOSED CAIXAS FOUND. This explains why history is empty.')
    }
}

run()
