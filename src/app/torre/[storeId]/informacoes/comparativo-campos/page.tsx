import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAllLensGeometries } from '@/lib/actions/lens-geometry.actions'
import TowerLensFieldComparison from '@/components/tower/TowerLensFieldComparison'

export default async function TowerLensFieldComparisonPage({
  params,
  searchParams,
}: {
  params: { storeId: string }
  searchParams?: { client?: string }
}) {
  const storeId = parseInt(params.storeId, 10)
  if (Number.isNaN(storeId)) return notFound()

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return redirect('/login')

  const geometries = await getAllLensGeometries()
  return <TowerLensFieldComparison storeId={storeId} geometries={geometries} clientMode={searchParams?.client === '1'} />
}
