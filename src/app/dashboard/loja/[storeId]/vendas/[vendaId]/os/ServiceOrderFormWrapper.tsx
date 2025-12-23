// ARQUIVO: src/app/dashboard/loja/[storeId]/vendas/[vendaId]/os/ServiceOrderFormWrapper.tsx
'use client'

import { useFormState } from 'react-dom'
import { saveServiceOrder, type OSPageData } from '@/lib/actions/vendas.actions'
import ServiceOrderFormContent from './ServiceOrderForm'
import { useState } from 'react'

export default function ServiceOrderFormWrapper({
    initialData,
    storeId,
    vendaId,
    authedEmployeeName
}: {
    initialData: OSPageData
    storeId: number
    vendaId: number
    authedEmployeeName: string
}) {
    const [saveState, dispatch] = useFormState(saveServiceOrder, { success: false, message: '' })

    // Estado local para a lista de OS, para permitir atualização otimista ou pós-save
    const [existingOrders, setExistingOrders] = useState(initialData.existingOrders)

    return (
        <ServiceOrderFormContent
            storeId={storeId}
            vendaId={vendaId}
            customer={initialData.customer}
            vendaItens={initialData.vendaItens}
            dependentes={initialData.dependentes}
            oftalmosList={initialData.oftalmologistas}
            employees={initialData.employees}
            existingOrders={existingOrders}
            authedEmployeeName={authedEmployeeName}
            onListChange={setExistingOrders}
            saveState={saveState}
            dispatch={dispatch}
            venda={initialData.venda}
        />
    )
}
