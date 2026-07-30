// ARQUIVO: src/app/dashboard/loja/[storeId]/vendas/[vendaId]/experimental/page.tsx

import { notFound } from 'next/navigation'
import { revalidatePath, unstable_noStore as noStore } from 'next/cache'
import { getVendaPageData } from '@/lib/actions/vendas.actions'
import VendaInterfaceExperimental from '@/components/vendas/VendaInterfaceExperimental'
import type { CatalogLensPrefill } from '@/components/vendas/AddItemFormExperimental'

type Props = {
    params: Promise<{ storeId: string; vendaId: string }>
    searchParams: Promise<{
        employee_id?: string
        employee_name?: string
        open_payment?: string
        open_product?: string
        catalog_offer_id?: string
        catalog_offer_name?: string
        catalog_offer_price?: string
        catalog_offer_lab?: string
        catalog_offer_version?: string
    }>
}

export default async function VendaPageExperimental(props: Props) {
    const params = await props.params;
    const searchParams = await props.searchParams
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
    const catalogOfferPrice = Number(searchParams.catalog_offer_price)
    const initialCatalogLens: CatalogLensPrefill | null =
        searchParams.open_product === '1' &&
        searchParams.catalog_offer_id &&
        searchParams.catalog_offer_name &&
        Number.isFinite(catalogOfferPrice) &&
        catalogOfferPrice >= 0
            ? {
                globalOfferId: searchParams.catalog_offer_id,
                displayName: searchParams.catalog_offer_name,
                originalPrice: catalogOfferPrice,
                laboratorio: searchParams.catalog_offer_lab || null,
                versao: searchParams.catalog_offer_version || null,
            }
            : null

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
            initialCatalogLens={initialCatalogLens}
        />
    )
}
