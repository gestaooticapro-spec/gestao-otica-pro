import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAllLensGeometries } from '@/lib/actions/lens-geometry.actions'
import { getOrCreateTowerHeatmapSessionForTowerSession } from '@/lib/actions/tower-heatmap.actions'
import GazeHeatmapLab from '@/components/catalog/GazeHeatmapLab'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export default async function TowerVisualFieldPage({
  params,
  searchParams,
}: {
  params: { storeId: string }
  searchParams?: { client?: string; session?: string }
}) {
  const storeId = parseInt(params.storeId, 10)
  if (Number.isNaN(storeId)) return notFound()

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return redirect('/login')

  const towerSessionId = searchParams?.session
  if (!towerSessionId || !UUID_PATTERN.test(towerSessionId)) {
    return redirect(`/torre/${storeId}?menu=experiencias`)
  }

  const heatmapSession = await getOrCreateTowerHeatmapSessionForTowerSession({
    storeId,
    towerSessionId,
  })
  if (!heatmapSession.success || !heatmapSession.data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100">
        <p className="max-w-md text-center text-sm text-slate-300">{heatmapSession.message}</p>
      </main>
    )
  }

  const geometries = await getAllLensGeometries()
  const geometry = geometries.find((item) => item.family_name === 'Kodak Network UHD') ?? geometries[0] ?? null

  return (
    <GazeHeatmapLab
      storeId={storeId}
      backPath={`/torre/${storeId}?menu=experiencias`}
      geometry={geometry}
      geometries={geometries}
      clientMode={searchParams?.client === '1'}
      heatmapSessionId={heatmapSession.data.id}
      towerSessionId={towerSessionId}
      towerMode
    />
  )
}
