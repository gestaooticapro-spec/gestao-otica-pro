import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAllLensGeometries } from '@/lib/actions/lens-geometry.actions'
import LensVisualizerView from '@/components/catalog/LensVisualizerView'

export default async function LensVisualizerPage({
  params,
}: {
  params: { storeId: string; familySlug: string }
}) {
  const familyName = decodeURIComponent(params.familySlug)
  const storeId = parseInt(params.storeId, 10)

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return redirect('/login')

  const geometries = await getAllLensGeometries()
  const geometry = geometries.find((g) => g.family_name === familyName)

  if (!geometry) return redirect(`/dashboard/loja/${storeId}`)

  return (
    <LensVisualizerView
      geometry={geometry}
      backPath={`/dashboard/loja/${storeId}/tabela-precos`}
    />
  )
}
