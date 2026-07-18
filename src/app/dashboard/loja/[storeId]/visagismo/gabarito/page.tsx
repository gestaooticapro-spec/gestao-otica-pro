import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import FrameTemplateEditor from '@/components/visagismo/FrameTemplateEditor'
import { getGlobalVisagismoFrameTemplates } from '@/lib/actions/visagismo.actions'

export default async function StoreVisagismoTemplatePage(
  props: {
    params: Promise<{ storeId: string }>
  }
) {
  const params = await props.params;
  const storeId = parseInt(params.storeId, 10)
  if (Number.isNaN(storeId)) return notFound()

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return redirect('/login')

  const globalTemplates = await getGlobalVisagismoFrameTemplates()

  return <FrameTemplateEditor storeId={storeId} globalTemplates={globalTemplates} />
}
