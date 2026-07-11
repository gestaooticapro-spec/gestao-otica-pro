import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getGlobalVisagismoFrameTemplates } from '@/lib/actions/visagismo.actions'
import VirtualTryOn from '@/components/visagismo/VirtualTryOn'

export default async function TowerVisagismoPage({
  params,
  searchParams,
}: {
  params: { storeId: string }
  searchParams?: { client?: string }
}) {
  const storeId = parseInt(params.storeId, 10)
  if (Number.isNaN(storeId)) return notFound()

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return redirect('/login')

  const templates = await getGlobalVisagismoFrameTemplates()

  return (
    <VirtualTryOn
      storeId={storeId}
      templates={templates}
      clientMode={searchParams?.client === '1'}
      backHref={`/torre/${storeId}?menu=experiencias`}
      towerMode
    />
  )
}
