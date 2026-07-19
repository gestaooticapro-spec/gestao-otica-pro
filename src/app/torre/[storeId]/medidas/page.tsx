import { notFound, redirect } from 'next/navigation'
import TowerMeasurementLab from '@/components/medidas/TowerMeasurementLab'
import { getOrCreateTowerSession } from '@/lib/actions/tower-session.actions'
import { authorizeTowerStoreAccess } from '@/lib/server/tower-device-web-session'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export default async function TowerMeasurementsPage(
  props: {
    params: Promise<{ storeId: string }>
    searchParams?: Promise<{ client?: string; session?: string }>
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const storeId = parseInt(params.storeId, 10)
  if (Number.isNaN(storeId)) return notFound()

  const access = await authorizeTowerStoreAccess(storeId)
  if (!access.ok) return redirect('/login')

  const towerSessionId = searchParams?.session
  if (!towerSessionId || !UUID_PATTERN.test(towerSessionId)) {
    return redirect(`/torre/${storeId}?menu=experiencias`)
  }

  const session = await getOrCreateTowerSession({ storeId, sessionId: towerSessionId, experience: 'medidas' })
  if (!session.success || !session.data) {
    return redirect(`/torre/${storeId}?menu=experiencias`)
  }

  return (
    <TowerMeasurementLab
      storeId={storeId}
      clientMode={searchParams?.client === '1'}
      towerMode
      sessionId={session.data.id}
      backHref={`/torre/${storeId}?menu=experiencias&session=${session.data.id}`}
    />
  )
}
