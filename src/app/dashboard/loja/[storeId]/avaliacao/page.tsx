import { notFound, redirect } from 'next/navigation'
import EvaluationInterface from '@/components/evaluation/EvaluationInterface'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStoreGlobalCatalogOverview } from '@/lib/actions/global-catalog.actions'
import { getAllLensGeometries } from '@/lib/actions/lens-geometry.actions'
import { Database } from '@/lib/database.types'
import ModuleDisabledState from '@/components/modules/ModuleDisabledState'

type StoreSettings = {
  pre_sale_analysis_enabled?: boolean
}

type StoreSettingsRow = Pick<Database['public']['Tables']['stores']['Row'], 'settings'>

export default async function AvaliacaoPage(
  props: {
    params: Promise<{ storeId: string }>
  }
) {
  const params = await props.params;
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
    return <ModuleDisabledState storeId={storeId} moduleLabel="Avaliacao" />
  }

  const overview = await getStoreGlobalCatalogOverview(storeId)
  const activeCatalog = overview.currentActivation
    ? {
        versionId: overview.currentActivation.id,
        laboratorio: overview.currentActivation.laboratorio,
        versao: overview.currentActivation.versao,
      }
    : null
  const activeCatalogs = overview.activeActivations.map((activation) => ({
    versionId: activation.id,
    laboratorio: activation.laboratorio,
    versao: activation.versao,
  }))

  const geometries = await getAllLensGeometries()
  const kodakNetworkGeometry =
    geometries.find((geometry) => geometry.family_name === 'Kodak Network UHD') ??
    geometries.find((geometry) => geometry.pins?.lensRim && geometry.pins.lensRim.length >= 3) ??
    null
  const lensSearchFields = geometries
    .filter((geometry) =>
      geometry.pins?.lineA &&
      geometry.pins.lineA.length >= 2 &&
      geometry.pins?.lineB &&
      geometry.pins.lineB.length >= 2
    )
    .map((geometry) => ({
      familyName: geometry.family_name,
      lineA: geometry.pins!.lineA,
      lineB: geometry.pins!.lineB,
    }))

  return (
    <EvaluationInterface
      activeCatalog={activeCatalog}
      activeCatalogs={activeCatalogs}
      lensSearchRim={kodakNetworkGeometry?.pins?.lensRim ?? null}
      lensSearchFields={lensSearchFields}
    />
  )
}
