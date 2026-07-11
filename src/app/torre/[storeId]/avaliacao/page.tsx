import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getStoreGlobalCatalogOverview } from '@/lib/actions/global-catalog.actions'
import TowerEvaluationIntake from '@/components/tower/TowerEvaluationIntake'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export default async function TowerEvaluationPage({
  params,
  searchParams,
}: {
  params: { storeId: string }
  searchParams?: { session?: string; heatmap?: string }
}) {
  const storeId = Number.parseInt(params.storeId, 10)
  if (Number.isNaN(storeId)) return notFound()

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return redirect('/login')

  const towerSessionId = searchParams?.session
  const heatmapSessionId = searchParams?.heatmap
  if (!towerSessionId || !heatmapSessionId || !UUID_PATTERN.test(towerSessionId) || !UUID_PATTERN.test(heatmapSessionId)) {
    return redirect(`/torre/${storeId}?menu=experiencias`)
  }

  const catalog = await getStoreGlobalCatalogOverview(storeId)
  const activeCatalogVersionId = catalog.currentActivation?.id ?? null

  return <TowerEvaluationIntake storeId={storeId} towerSessionId={towerSessionId} heatmapSessionId={heatmapSessionId} activeCatalogVersionId={activeCatalogVersionId} />
}
