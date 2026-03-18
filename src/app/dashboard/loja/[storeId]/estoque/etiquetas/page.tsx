import { getLabelQueue, suggestLabelsFromMovements } from '@/lib/actions/labels.actions'
import EtiquetasInterface from './_components/EtiquetasInterface'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function EtiquetasPage({
    params
}: {
    params: { storeId: string }
}) {
    const storeId = parseInt(params.storeId, 10)

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
