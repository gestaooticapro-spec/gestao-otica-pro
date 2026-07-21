import { notFound, redirect } from 'next/navigation'
import { getTowerStoreGlobalCatalogOverview } from '@/lib/actions/global-catalog.actions'
import { getTowerSessionContext } from '@/lib/actions/tower-session.actions'
import TowerEvaluationIntake from '@/components/tower/TowerEvaluationIntake'
import { authorizeTowerStoreAccess } from '@/lib/server/tower-device-web-session'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export default async function TowerEvaluationPage(
  props: {
    params: Promise<{ storeId: string }>
    searchParams?: Promise<{ session?: string; heatmap?: string }>
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const storeId = Number.parseInt(params.storeId, 10)
  if (Number.isNaN(storeId)) return notFound()

  const access = await authorizeTowerStoreAccess(storeId)
  if (!access.ok) return redirect(`/torre/${storeId}?menu=experiencias`)

  const towerSessionId = searchParams?.session
  const heatmapSessionId = searchParams?.heatmap
  if (!towerSessionId || !heatmapSessionId || !UUID_PATTERN.test(towerSessionId) || !UUID_PATTERN.test(heatmapSessionId)) {
    return redirect(`/torre/${storeId}?menu=experiencias`)
  }

  const catalog = await getTowerStoreGlobalCatalogOverview(storeId)
  const activeCatalogVersionId = catalog.currentActivation?.id ?? null
  const context = await getTowerSessionContext({ storeId, sessionId: towerSessionId })

  return <TowerEvaluationIntake
    storeId={storeId}
    towerSessionId={towerSessionId}
    heatmapSessionId={heatmapSessionId}
    activeCatalogVersionId={activeCatalogVersionId}
    activeCatalogVersionIds={catalog.activeActivations.map((activation) => activation.id)}
    initialSessionContext={context.success ? context.data : undefined}
  />
}
