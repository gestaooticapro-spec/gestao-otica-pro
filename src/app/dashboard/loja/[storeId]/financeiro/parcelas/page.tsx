import ParcelasInterface from '@/components/financeiro/ParcelasInterface'
import ModuleDisabledState from '@/components/modules/ModuleDisabledState'
import { isStoreModuleEnabledForStore } from '@/lib/store-modules.server'

export default async function ParcelasPage(
    props: {
        params: Promise<{ storeId: string }>
    }
) {
    const params = await props.params;
    const storeId = parseInt(params.storeId, 10)
    const enabled = await isStoreModuleEnabledForStore(storeId, 'installments')

    if (!enabled) {
        return <ModuleDisabledState storeId={storeId} moduleLabel="Parcelamento" />
    }

    return (
        <ParcelasInterface storeId={storeId} />
    )
}
