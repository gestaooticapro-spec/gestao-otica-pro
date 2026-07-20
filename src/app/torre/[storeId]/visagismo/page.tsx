import { notFound, redirect } from 'next/navigation'
import { getGlobalVisagismoFrameTemplates } from '@/lib/actions/visagismo.actions'
import VirtualTryOn from '@/components/visagismo/VirtualTryOn'
import { authorizeTowerStoreAccess } from '@/lib/server/tower-device-web-session'

export default async function TowerVisagismoPage(
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

  const templates = await getGlobalVisagismoFrameTemplates(storeId)

  return (
    <VirtualTryOn
      storeId={storeId}
      templates={templates}
      clientMode={searchParams?.client === '1'}
      backHref={`/torre/${storeId}?menu=experiencias${searchParams?.session ? `&session=${searchParams.session}` : ''}`}
      towerMode
    />
  )
}
