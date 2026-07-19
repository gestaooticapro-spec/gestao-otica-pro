import { notFound, redirect } from 'next/navigation'
import { getAllLensGeometries } from '@/lib/actions/lens-geometry.actions'
import TowerLensFieldComparison from '@/components/tower/TowerLensFieldComparison'
import { authorizeTowerStoreAccess } from '@/lib/server/tower-device-web-session'

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

  const access = await authorizeTowerStoreAccess(storeId)
  if (!access.ok) return redirect('/login')

  const geometries = await getAllLensGeometries(storeId)
  return <TowerLensFieldComparison storeId={storeId} geometries={geometries} clientMode={searchParams?.client === '1'} />
}
