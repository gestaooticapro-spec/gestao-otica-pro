import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getGlobalVisagismoFrameTemplates } from '@/lib/actions/visagismo.actions'
import VirtualTryOn from '@/components/visagismo/VirtualTryOn'

export default async function StoreVisagismoTryOnPage(
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
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return redirect('/login')

  const globalTemplates = await getGlobalVisagismoFrameTemplates()

  return <VirtualTryOn storeId={storeId} templates={globalTemplates} clientMode={searchParams?.client === '1'} />
}
