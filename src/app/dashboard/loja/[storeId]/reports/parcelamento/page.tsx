import ParcelasInterface from '@/components/financeiro/ParcelasInterface'
import ModuleDisabledState from '@/components/modules/ModuleDisabledState'
import { isStoreModuleEnabledForStore } from '@/lib/store-modules.server'

export default async function ParcelamentoReportPage(
    props: { params: Promise<{ storeId: string }> }
) {
    const params = await props.params
    const storeId = Number(params.storeId)
    const enabled = await isStoreModuleEnabledForStore(storeId, 'installments')

    if (!enabled) {
        return <ModuleDisabledState storeId={storeId} moduleLabel="Parcelamento" backHref={`/dashboard/loja/${storeId}/reports`} />
    }

    return <ParcelasInterface storeId={storeId} reportMode />
}
