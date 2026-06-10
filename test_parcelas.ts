import { createAdminClient } from './src/lib/supabase/admin'
import { getParcelasFiltradas } from './src/lib/actions/parcelas.actions'

async function run() {
    const res = await getParcelasFiltradas(1, { status: 'pendente' })
    console.log(JSON.stringify(res, null, 2))
}
run()
