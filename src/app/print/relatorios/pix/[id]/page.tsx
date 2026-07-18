
import { getRelatorioFinanceiroMensal } from '@/lib/actions/cashflow.actions'
import RelatorioPixPrint from '@/components/print/RelatorioPixPrint'
import { getStoreProfile } from '@/lib/actions/store.actions'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function RelatorioPixPage(
    props: {
        params: Promise<{ id: string }>,
        searchParams: Promise<{ mes: string, ano: string }>
    }
) {
    const searchParams = await props.searchParams;
    const params = await props.params;
    const storeId = Number(params.id)
    const mes = searchParams.mes ? Number(searchParams.mes) : new Date().getMonth() + 1
    const ano = searchParams.ano ? Number(searchParams.ano) : new Date().getFullYear()

    if (isNaN(storeId)) redirect('/dashboard')

    const store = await getStoreProfile(storeId)
    const { data: movimentos } = await getRelatorioFinanceiroMensal(storeId, mes, ano, 'pix')

    const periodo = `${mes.toString().padStart(2, '0')}/${ano}`

    return (
        <RelatorioPixPrint
            storeName={store?.name || 'Ótica'}
            data={movimentos || []}
            periodo={periodo}
        />
    )
}
