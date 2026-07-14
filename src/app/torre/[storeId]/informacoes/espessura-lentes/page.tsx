import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTowerSessionContext } from '@/lib/actions/tower-session.actions'
import { getGlobalVisagismoFrameTemplates } from '@/lib/actions/visagismo.actions'
import TowerLensThicknessDemo from '@/components/tower/TowerLensThicknessDemo'

export default async function TowerLensThicknessPage({
  params,
  searchParams,
}: {
  params: { storeId: string }
  searchParams?: { client?: string; session?: string }
}) {
  const storeId = parseInt(params.storeId, 10)
  if (Number.isNaN(storeId)) return notFound()

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return redirect('/login')

  const sessionId = searchParams?.session
  if (!sessionId) return redirect(`/torre/${storeId}?menu=informacoes`)
  const context = await getTowerSessionContext({ storeId, sessionId })
  if (!context.success || !context.data) return redirect(`/torre/${storeId}?menu=informacoes`)
  const frameTemplates = await getGlobalVisagismoFrameTemplates()

  return <TowerLensThicknessDemo storeId={storeId} sessionId={sessionId} initialContext={context.data} frameTemplates={frameTemplates} clientMode={searchParams?.client === '1'} />
}
