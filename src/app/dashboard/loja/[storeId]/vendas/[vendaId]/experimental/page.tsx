// ARQUIVO: src/app/dashboard/loja/[storeId]/vendas/[vendaId]/experimental/page.tsx

import { notFound } from 'next/navigation'
import { revalidatePath, unstable_noStore as noStore } from 'next/cache'
import { getVendaPageData } from '@/lib/actions/vendas.actions'
import VendaInterfaceExperimental from '@/components/vendas/VendaInterfaceExperimental'

type Props = {
    params: Promise<{ storeId: string; vendaId: string }>
    searchParams: Promise<{ employee_id?: string; employee_name?: string; open_payment?: string }>
}

export default async function VendaPageExperimental(props: Props) {
    const params = await props.params;
    noStore()

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
        storeSettings,
        dependentes,
        oftalmologistas,
        employees,
        lentes,
        armacoes,
        tratamentos
    } = data

    const handleDataReload = async () => {
        'use server'
        revalidatePath(`/dashboard/loja/${storeId}/vendas/${vendaId}/experimental`)
    }

    const isVendaFechadaOuCancelada = ['Fechada', 'Cancelada', 'Devolvida'].includes(venda.status)

    // FIX: Quitado = valor restante zerado E (não tem carnê OU todas parcelas do carnê pagas)
    const temParcelasPendentes = financiamento?.financiamento_parcelas.some(p => p.status !== 'Pago') ?? false;
    const isQuitado = (venda.valor_restante ?? 0) <= 0.01 && !temParcelasPendentes;

    return (
        <VendaInterfaceExperimental
            venda={venda}
            customer={customer}
            employee={employee}
            vendaItens={vendaItens}
            serviceOrders={serviceOrders}
            pagamentos={pagamentos}
            financiamento={financiamento}
            storeSettings={storeSettings}
            dependentes={dependentes}
            oftalmologistas={oftalmologistas}
            employees={employees}
            lentes={lentes || []}
            armacoes={armacoes || []}
            tratamentos={tratamentos || []}
            isQuitado={isQuitado}
            isVendaFechadaOuCancelada={isVendaFechadaOuCancelada}
            onDataReload={handleDataReload}
        />
    )
}
