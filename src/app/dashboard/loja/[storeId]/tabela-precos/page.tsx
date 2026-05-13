import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ShieldAlert, Tag } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getProfileByAdmin } from '@/lib/supabase/admin'
import { getStoreGlobalCatalogOverview } from '@/lib/actions/global-catalog.actions'
import { getAllLensGeometries } from '@/lib/actions/lens-geometry.actions'
import {
  getStorePriceTableAllActiveOffersData,
  getStorePriceTableData,
} from '@/lib/actions/price-table.actions'
import PriceTableHeader from '@/components/catalog/PriceTableHeader'
import PriceTableInterface from '@/components/catalog/PriceTableInterface'
import PriceTableLensSearchInterface from '@/components/catalog/PriceTableLensSearchInterface'

export const dynamic = 'force-dynamic'

export default async function StorePriceTablePage({
  params,
  searchParams,
}: {
  params: { storeId: string }
  searchParams?: {
    versionId?: string
    scope?: string
    q?: string
    clinical?: string
    material?: string
    indice?: string
    feature?: string
    section?: string
  }
}) {
  const storeId = parseInt(params.storeId, 10)
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return redirect('/login')

  const profile = (await getProfileByAdmin(user.id)) as any
  const allowedRoles = ['admin', 'manager', 'store_operator', 'vendedor', 'tecnico']
  const canView =
    allowedRoles.includes(profile?.role) &&
    (profile?.role === 'admin' || profile?.store_id === storeId)
  const canManage = (profile?.role === 'admin' || profile?.role === 'manager') && canView

  if (!canView) {
    return (
      <div className="flex min-h-[calc(100vh-64px)] items-center justify-center bg-slate-950 p-6">
        <div className="max-w-md rounded-3xl border border-white/10 border-t-4 border-t-red-500 bg-slate-900 p-8 text-center shadow-xl">
          <ShieldAlert className="mx-auto mb-4 h-16 w-16 text-red-500" />
          <h1 className="mb-2 text-2xl font-black uppercase tracking-tight text-white">
            Acesso Negado
          </h1>
          <p className="mb-6 text-slate-400">
            Você não tem permissão para acessar esta página.
          </p>
          <Link
            href={`/dashboard/loja/${storeId}`}
            className="inline-flex rounded-xl border border-white/10 bg-slate-800 px-5 py-3 font-bold text-white transition hover:bg-slate-700"
          >
            Voltar para o início
          </Link>
        </div>
      </div>
    )
  }

  const overview = await getStoreGlobalCatalogOverview(storeId)
  const scope = searchParams?.scope === 'lente' ? 'lente' : 'laboratorio'
  const initialLabFilters = {
    search: typeof searchParams?.q === 'string' ? searchParams.q : '',
    clinicalFilter: typeof searchParams?.clinical === 'string' ? searchParams.clinical : null,
    materialFilter: typeof searchParams?.material === 'string' ? searchParams.material : null,
    indiceFilter:
      typeof searchParams?.indice === 'string' && searchParams.indice.trim() !== ''
        ? Number(searchParams.indice)
        : null,
    featureFilter:
      typeof searchParams?.feature === 'string' && searchParams.feature.trim() !== ''
        ? searchParams.feature
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean)
        : [],
    sectionFilter: typeof searchParams?.section === 'string' ? searchParams.section : null,
  }
  const labData =
    scope === 'laboratorio'
      ? await getStorePriceTableData(
          storeId,
          typeof searchParams?.versionId === 'string' ? searchParams.versionId : null,
        )
      : null
  const mixedData = scope === 'lente' ? await getStorePriceTableAllActiveOffersData(storeId) : null
  const geometries = scope === 'laboratorio' ? await getAllLensGeometries() : []
  const geometryFamilyNames = geometries.map((geometry) => geometry.family_name)
  const currentTableParams = new URLSearchParams()
  currentTableParams.set('scope', scope)
  if (typeof searchParams?.versionId === 'string' && searchParams.versionId.trim()) {
    currentTableParams.set('versionId', searchParams.versionId.trim())
  }
  if (typeof searchParams?.q === 'string' && searchParams.q.trim()) {
    currentTableParams.set('q', searchParams.q.trim())
  }
  if (typeof searchParams?.clinical === 'string' && searchParams.clinical.trim()) {
    currentTableParams.set('clinical', searchParams.clinical.trim())
  }
  if (typeof searchParams?.material === 'string' && searchParams.material.trim()) {
    currentTableParams.set('material', searchParams.material.trim())
  }
  if (typeof searchParams?.indice === 'string' && searchParams.indice.trim()) {
    currentTableParams.set('indice', searchParams.indice.trim())
  }
  if (typeof searchParams?.feature === 'string' && searchParams.feature.trim()) {
    currentTableParams.set('feature', searchParams.feature.trim())
  }
  if (typeof searchParams?.section === 'string' && searchParams.section.trim()) {
    currentTableParams.set('section', searchParams.section.trim())
  }
  const returnTo = `/dashboard/loja/${storeId}/tabela-precos?${currentTableParams.toString()}`

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
        <PriceTableHeader
          storeId={storeId}
          scope={scope}
          overview={overview}
          canManage={canManage}
        />

        {scope === 'laboratorio' && !labData ? (
          <div className="flex items-center justify-center px-2 py-4 text-white">
            <div className="max-w-2xl rounded-[2rem] border border-white/10 bg-slate-900/80 p-8 text-center shadow-[0_25px_80px_rgba(2,6,23,0.45)]">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-cyan-500/10 text-cyan-200">
                <Tag className="h-8 w-8" />
              </div>
              <h1 className="text-3xl font-black tracking-tight text-white">
                Ative pelo menos uma tabela primeiro
              </h1>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                A consulta de preços usa as tabelas globais ativas da loja. Primeiro ligue pelo
                menos uma tabela e depois consulte os preços logo abaixo.
              </p>
            </div>
          </div>
        ) : null}

        {scope === 'lente' && !mixedData ? (
          <div className="flex items-center justify-center px-2 py-4 text-white">
            <div className="max-w-2xl rounded-[2rem] border border-white/10 bg-slate-900/80 p-8 text-center shadow-[0_25px_80px_rgba(2,6,23,0.45)]">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-cyan-500/10 text-cyan-200">
                <Tag className="h-8 w-8" />
              </div>
              <h1 className="text-3xl font-black tracking-tight text-white">
                Ative pelo menos uma tabela primeiro
              </h1>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                A busca por lente usa todas as tabelas globais ativas da loja. Ligue pelo menos
                uma tabela para pesquisar entre os laboratorios.
              </p>
            </div>
          </div>
        ) : null}

        {scope === 'laboratorio' && labData ? (
          <PriceTableInterface
            data={labData}
            embedded
            initialFilters={initialLabFilters}
            geometryFamilyNames={geometryFamilyNames}
            returnTo={returnTo}
          />
        ) : null}
        {scope === 'lente' && mixedData ? <PriceTableLensSearchInterface data={mixedData} /> : null}
      </div>
    </div>
  )
}
