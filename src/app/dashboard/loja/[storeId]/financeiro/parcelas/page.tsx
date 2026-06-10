import ParcelasInterface from '@/components/financeiro/ParcelasInterface'
import ModuleDisabledState from '@/components/modules/ModuleDisabledState'
import { isStoreModuleEnabledForStore } from '@/lib/store-modules.server'

export default async function ParcelasPage({
    params
}: {
    params: { storeId: string }
}) {
    const storeId = parseInt(params.storeId, 10)
    const enabled = await isStoreModuleEnabledForStore(storeId, 'installments')

    if (!enabled) {
        return <ModuleDisabledState storeId={storeId} moduleLabel="Parcelamento" />
    }

    return (
        <ParcelasInterface storeId={storeId} />
    )
}
