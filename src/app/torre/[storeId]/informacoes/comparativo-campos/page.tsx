import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAllLensGeometries } from '@/lib/actions/lens-geometry.actions'
import TowerLensFieldComparison from '@/components/tower/TowerLensFieldComparison'

export default async function TowerLensFieldComparisonPage(
  props: {
    params: Promise<{ storeId: string }>
    searchParams?: Promise<{ client?: string }>
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const storeId = parseInt(params.storeId, 10)
  if (Number.isNaN(storeId)) return notFound()

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return redirect('/login')

  const geometries = await getAllLensGeometries()
  return <TowerLensFieldComparison storeId={storeId} geometries={geometries} clientMode={searchParams?.client === '1'} />
}
