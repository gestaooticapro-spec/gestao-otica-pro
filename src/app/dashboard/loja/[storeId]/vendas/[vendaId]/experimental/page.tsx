// ARQUIVO: src/app/dashboard/loja/[storeId]/vendas/[vendaId]/experimental/page.tsx

import { notFound } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getVendaPageData } from '@/lib/actions/vendas.actions'
import VendaInterfaceExperimental from '@/components/vendas/VendaInterfaceExperimental'

type Props = {
    params: { storeId: string; vendaId: string }
    searchParams: { employee_id?: string; employee_name?: string; open_payment?: string }
}

export default async function VendaPageExperimental({ params }: Props) {
    const storeId = parseInt(params.storeId)
    const vendaId = parseInt(params.vendaId)

    if (isNaN(storeId) || isNaN(vendaId)) return notFound()

    const { success, data, message } = await getVendaPageData(vendaId, storeId)

    if (!success || !data || !data.venda) {
        console.error('Erro venda:', message)
        return notFound()
    }

    const {
        venda,
        customer,
        employee,
        vendaItens,
        pagamentos,
        serviceOrders,
        financiamento,
        lentes,
        armacoes,
        tratamentos
    } = data

    const handleDataReload = async () => {
        'use server'
        revalidatePath(`/dashboard/loja/${storeId}/vendas/${vendaId}/experimental`)
    }

    const isVendaFechadaOuCancelada = ['Fechada', 'Cancelada'].includes(venda.status)
    const isQuitado = (venda.valor_restante ?? 0) <= 0.01;

    return (
        <VendaInterfaceExperimental
            venda={venda}
            customer={customer}
            employee={employee}
            vendaItens={vendaItens}
            serviceOrders={serviceOrders}
            pagamentos={pagamentos}
            financiamento={financiamento}
            lentes={lentes || []}
            armacoes={armacoes || []}
            tratamentos={tratamentos || []}
            isQuitado={isQuitado}
            isVendaFechadaOuCancelada={isVendaFechadaOuCancelada}
            onDataReload={handleDataReload}
        />
    )
}
