import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import VisagismoShapeStudio from '@/components/visagismo/VisagismoShapeStudio'
import { getGlobalVisagismoFrameTemplates } from '@/lib/actions/visagismo.actions'

export default async function StoreVisagismoPage({
  params,
}: {
  params: { storeId: string }
}) {
  const storeId = parseInt(params.storeId, 10)
  if (Number.isNaN(storeId)) return notFound()

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return redirect('/login')

  const globalTemplates = await getGlobalVisagismoFrameTemplates()

  return <VisagismoShapeStudio storeId={storeId} globalTemplates={globalTemplates} />
}
