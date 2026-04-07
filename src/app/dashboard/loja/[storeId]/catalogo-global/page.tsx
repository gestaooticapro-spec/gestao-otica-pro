import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ShieldAlert } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getProfileByAdmin } from '@/lib/supabase/admin'
import { getStoreGlobalCatalogOverview } from '@/lib/actions/global-catalog.actions'
import GlobalCatalogActivationInterface from '@/components/catalog/GlobalCatalogActivationInterface'

export default async function StoreGlobalCatalogPage({
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

  return <GlobalCatalogActivationInterface overview={overview} />
}
