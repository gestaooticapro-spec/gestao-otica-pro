// ARQUIVO: src/app/dashboard/loja/[storeId]/vendas/[vendaId]/experimental/page.tsx

import { notFound } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getVendaPageData } from '@/lib/actions/vendas.actions'
import VendaInterfaceExperimental from '@/components/vendas/VendaInterfaceExperimental'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStoreAppMode } from '@/lib/app-mode'

type Props = {
    params: { storeId: string; vendaId: string }
    searchParams: { employee_id?: string; employee_name?: string; open_payment?: string }
}
type StoreSettingsRow = {
    settings?: unknown
}
type StoreSettingsTable = {
    select: (columns: string) => {
        eq: (column: string, value: number) => {
            single: () => Promise<{ data: StoreSettingsRow | null }>
        }
    }
}

export default async function VendaPageExperimental({ params }: Props) {
    const storeId = parseInt(params.storeId)
    const vendaId = parseInt(params.vendaId)

    if (isNaN(storeId) || isNaN(vendaId)) return notFound()

    const { success, data, message } = await getVendaPageData(vendaId, storeId)
    const storesTable = createAdminClient().from('stores') as unknown as StoreSettingsTable
    const { data: store } = await storesTable
        .select('settings')
        .eq('id', storeId)
        .single()
    const appMode = getStoreAppMode(store?.settings)

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
            lentes={lentes || []}
            armacoes={armacoes || []}
            tratamentos={tratamentos || []}
            isQuitado={isQuitado}
            isVendaFechadaOuCancelada={isVendaFechadaOuCancelada}
            onDataReload={handleDataReload}
            appMode={appMode}
        />
    )
}
