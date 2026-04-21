import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import GazeHeatmapLab from '@/components/catalog/GazeHeatmapLab'

export default async function StoreLensHeatmapLabPage({
  params,
}: {
  params: { storeId: string }
}) {
  const storeId = parseInt(params.storeId, 10)
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return redirect('/login')

  return (
    <GazeHeatmapLab
      storeId={storeId}
      backPath={`/dashboard/loja/${storeId}/recomendacao-lentes`}
    />
  )
}
