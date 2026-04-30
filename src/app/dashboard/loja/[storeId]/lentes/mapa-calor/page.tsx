import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAllLensGeometries } from '@/lib/actions/lens-geometry.actions'
import GazeHeatmapLab from '@/components/catalog/GazeHeatmapLab'

export default async function StoreLensHeatmapLabPage({
  params,
  searchParams,
}: {
  params: { storeId: string }
  searchParams?: { family?: string }
}) {
  const storeId = parseInt(params.storeId, 10)
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return redirect('/login')

  const geometries = await getAllLensGeometries()
  const requestedFamily = searchParams?.family ? decodeURIComponent(searchParams.family) : null
  const geometry =
    geometries.find((item) => item.family_name === requestedFamily) ??
    geometries.find((item) => item.family_name === 'Kodak Network UHD') ??
    null

  return (
    <GazeHeatmapLab
      storeId={storeId}
      backPath={`/dashboard/loja/${storeId}/recomendacao-lentes`}
      geometry={geometry}
      geometries={geometries}
    />
  )
}
