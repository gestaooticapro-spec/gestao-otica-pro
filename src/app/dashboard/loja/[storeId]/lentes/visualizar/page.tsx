import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAllLensGeometries } from '@/lib/actions/lens-geometry.actions'
import LensVisualizerView from '@/components/catalog/LensVisualizerView'

function hasConfiguredPins(geometry: Awaited<ReturnType<typeof getAllLensGeometries>>[number]) {
  return !!geometry.pins && (
    geometry.pins.distance.length >= 3 ||
    geometry.pins.corridor.length >= 3 ||
    geometry.pins.near.length >= 3
  )
}

export default async function OpenLensVisualizerPage({
  params,
}: {
  params: { storeId: string }
}) {
  const storeId = parseInt(params.storeId, 10)

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return redirect('/login')

  const geometries = await getAllLensGeometries()
  const geometry = geometries.find(hasConfiguredPins) ?? geometries[0]

  if (!geometry) return redirect(`/dashboard/loja/${storeId}`)

  return (
    <LensVisualizerView
      geometry={geometry}
      backPath={`/dashboard/loja/${storeId}/tabela-precos`}
      allGeometries={geometries}
      storeId={storeId}
    />
  )
}
