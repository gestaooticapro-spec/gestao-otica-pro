import { getParcelasFiltradas } from './src/lib/actions/parcelas.actions'

async function run() {
    const res = await getParcelasFiltradas(1, { 
        status: 'todas',
        dataInicial: '2026-06-15',
        dataFinal: '2026-06-30',
        busca: ''
    })
    console.log(`Return count: ${res.data?.length}`);
    if (res.data?.length > 0) {
        console.log(`First item: ${res.data[0].id} - ${res.data[0].data_vencimento}`);
        // Let's check if all items are within the date
        const allWithin = res.data.every(p => p.data_vencimento >= '2026-06-15' && p.data_vencimento <= '2026-06-30T23:59:59')
        console.log(`All within date: ${allWithin}`);
    }
}
run()
