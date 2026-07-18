import { getRelatorioFinanceiroMensal } from '@/lib/actions/cashflow.actions'
import RelatorioCartoesPrint from '@/components/print/RelatorioCartoesPrint'
import { getStoreProfile } from '@/lib/actions/store.actions'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function RelatorioCartoesPage(
    props: {
        params: Promise<{ storeId: string }>,
        searchParams: Promise<{ mes: string, ano: string }>
    }
) {
    const searchParams = await props.searchParams;
    const params = await props.params;
    const storeId = Number(params.storeId)
    const mes = searchParams.mes ? Number(searchParams.mes) : new Date().getMonth() + 1
    const ano = searchParams.ano ? Number(searchParams.ano) : new Date().getFullYear()

    if (isNaN(storeId)) redirect('/dashboard')

    const store = await getStoreProfile(storeId)
    const { data: movimentos } = await getRelatorioFinanceiroMensal(storeId, mes, ano, 'cartoes')

    const periodo = `${mes.toString().padStart(2, '0')}/${ano}`

    return (
        <RelatorioCartoesPrint
            storeName={store?.name || 'Ótica'}
            data={movimentos || []}
            periodo={periodo}
        />
    )
}
