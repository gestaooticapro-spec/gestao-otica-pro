import { notFound, redirect } from 'next/navigation'
import EvaluationInterface from '@/components/evaluation/EvaluationInterface'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStoreGlobalCatalogOverview } from '@/lib/actions/global-catalog.actions'
import { Database } from '@/lib/database.types'

type StoreSettings = {
  pre_sale_analysis_enabled?: boolean
}

type StoreSettingsRow = Pick<Database['public']['Tables']['stores']['Row'], 'settings'>

export default async function AvaliacaoPage({
  params
}: {
  params: { storeId: string }
}) {
  const storeId = parseInt(params.storeId, 10)
  if (Number.isNaN(storeId)) return notFound()

  const supabaseAdmin = createAdminClient()
  const { data } = await supabaseAdmin
    .from('stores')
    .select('settings')
    .eq('id', storeId)
    .single()

  const store = data as StoreSettingsRow | null
  const settings = (store?.settings || {}) as StoreSettings
  if (settings.pre_sale_analysis_enabled !== true) {
    return redirect(`/dashboard/loja/${storeId}`)
  }

  const overview = await getStoreGlobalCatalogOverview(storeId)
  const activeCatalog = overview.currentActivation
    ? {
        versionId: overview.currentActivation.id,
        laboratorio: overview.currentActivation.laboratorio,
        versao: overview.currentActivation.versao,
      }
    : null

  return <EvaluationInterface activeCatalog={activeCatalog} />
}
