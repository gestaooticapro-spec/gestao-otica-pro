import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import TowerMeasurementLab from '@/components/medidas/TowerMeasurementLab'
import { getOrCreateTowerSession } from '@/lib/actions/tower-session.actions'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export default async function TowerMeasurementsPage({
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
