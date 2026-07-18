import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getOrCreateTowerSession } from '@/lib/actions/tower-session.actions'

export default async function StoreTowerMeasurementPage(
  props: {
    params: Promise<{ storeId: string }>
    searchParams?: Promise<{ client?: string; session?: string }>
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const storeId = parseInt(params.storeId, 10)
  if (Number.isNaN(storeId)) return notFound()

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return redirect('/login')

  const session = await getOrCreateTowerSession({
    storeId,
    experience: 'medidas',
    sessionId: searchParams?.session,
  })
  if (!session.success || !session.data) return redirect(`/torre/${storeId}?menu=experiencias`)

  const clientQuery = searchParams?.client === '1' ? '&client=1' : ''
  return redirect(`/torre/${storeId}/medidas?session=${session.data.id}${clientQuery}`)
}
