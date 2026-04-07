import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Bot, ShieldAlert } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getProfileByAdmin } from '@/lib/supabase/admin'
import { getStoreGlobalCatalogOverview } from '@/lib/actions/global-catalog.actions'
import LensRecommendationInterface from '@/components/catalog/LensRecommendationInterface'

export default async function StoreLensRecommendationPage({
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

  const profile = (await getProfileByAdmin(user.id)) as any
  const isAllowed =
    (profile?.role === 'admin' || profile?.role === 'manager') &&
    (profile?.role === 'admin' || profile?.store_id === storeId)

  if (!isAllowed) {
    return (
      <div className="flex min-h-[calc(100vh-64px)] items-center justify-center bg-slate-950 p-6">
        <div className="max-w-md rounded-3xl border border-white/10 border-t-4 border-t-red-500 bg-slate-900 p-8 text-center shadow-xl">
          <ShieldAlert className="mx-auto mb-4 h-16 w-16 text-red-500" />
          <h1 className="mb-2 text-2xl font-black uppercase tracking-tight text-white">
            Acesso Negado
          </h1>
          <p className="mb-6 text-slate-400">
            Esta área é restrita a gerentes e administradores da loja.
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
  const activeCatalog = overview.currentActivation

  if (!activeCatalog) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-10 text-white">
        <div className="max-w-2xl rounded-[2rem] border border-white/10 bg-slate-900/80 p-8 text-center shadow-[0_25px_80px_rgba(2,6,23,0.45)]">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-fuchsia-500/10 text-fuchsia-200">
            <Bot className="h-8 w-8" />
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white">
            Ative um catálogo antes de recomendar
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            A recomendação usa a tabela global ativa da loja. Primeiro ative uma versão em
            catálogo global e depois volte para esta tela.
          </p>
          <Link
            href={`/dashboard/loja/${storeId}/catalogo-global`}
            className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-fuchsia-500 px-5 py-3 font-black text-white transition hover:bg-fuchsia-400"
          >
            Abrir catálogo global
          </Link>
        </div>
      </div>
    )
  }

  return (
    <LensRecommendationInterface
      storeId={storeId}
      versionId={activeCatalog.id}
      laboratorio={activeCatalog.laboratorio}
      versao={activeCatalog.versao}
    />
  )
}
