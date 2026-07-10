import { getLabelQueue, suggestLabelsFromMovements } from '@/lib/actions/labels.actions'
import EtiquetasInterface from './_components/EtiquetasInterface'
import ModuleDisabledState from '@/components/modules/ModuleDisabledState'
import { isStoreModuleEnabledForStore } from '@/lib/store-modules.server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function EtiquetasPage({
    params
}: {
    params: { storeId: string }
}) {
    const storeId = parseInt(params.storeId, 10)
    const enabled = await isStoreModuleEnabledForStore(storeId, 'labels')

    if (!enabled) {
        return <ModuleDisabledState storeId={storeId} moduleLabel="Etiquetas" />
    }

    const [queue, suggestions] = await Promise.all([
        getLabelQueue(storeId),
        suggestLabelsFromMovements(storeId)
    ])

    return (
        <EtiquetasInterface
            storeId={storeId}
            initialQueue={queue}
            suggestions={suggestions}
        />
    )
}
