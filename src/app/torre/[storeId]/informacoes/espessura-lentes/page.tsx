import { notFound, redirect } from 'next/navigation'
import { getTowerSessionContext } from '@/lib/actions/tower-session.actions'
import { getGlobalVisagismoFrameTemplates } from '@/lib/actions/visagismo.actions'
import TowerLensThicknessDemo from '@/components/tower/TowerLensThicknessDemo'
import { authorizeTowerStoreAccess } from '@/lib/server/tower-device-web-session'

export default async function TowerLensThicknessPage(
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

  const sessionId = searchParams?.session
  if (!sessionId) return redirect(`/torre/${storeId}?menu=informacoes`)
  const context = await getTowerSessionContext({ storeId, sessionId })
  if (!context.success || !context.data) return redirect(`/torre/${storeId}?menu=informacoes`)
  const frameTemplates = await getGlobalVisagismoFrameTemplates(storeId)

  return <TowerLensThicknessDemo storeId={storeId} sessionId={sessionId} initialContext={context.data} frameTemplates={frameTemplates} clientMode={searchParams?.client === '1'} />
}
