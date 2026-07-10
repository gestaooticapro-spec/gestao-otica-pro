import { listOSPendentesLab } from '@/lib/actions/medidas.actions'
import Link from 'next/link'
import { ArrowLeft, Camera, Ruler } from 'lucide-react'
import { unstable_noStore as noStore } from 'next/cache'
import { TabletOSAutoRefresh } from '@/components/tablet/TabletOSAutoRefresh'
import FullscreenToggleButton from '@/components/FullscreenToggleButton'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function TabletOSPage({ params }: { params: { storeId: string } }) {
  noStore()
  const storeId = parseInt(params.storeId, 10)
  const lista   = await listOSPendentesLab(storeId)

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      <TabletOSAutoRefresh />
      <FullscreenToggleButton />
      <header className="flex items-center gap-3 px-4 py-4 border-b border-white/10 bg-slate-900">
        <Link href={`/tablet/${storeId}`} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="font-bold text-lg leading-tight">OS Pendentes de Laboratório</h1>
          <p className="text-xs text-slate-400">{lista.length} OS aguardando envio para o lab</p>
        </div>
      </header>

      <div className="border-b border-white/10 bg-slate-900/70 px-4 py-3">
        <Link
          href={`/medidas-armacao?storeId=${storeId}`}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 active:bg-indigo-700"
        >
          <Camera className="h-4 w-4" />
          Tirar foto e informar OS depois
        </Link>
      </div>

      {lista.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
          Nenhuma OS pendente de laboratório
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto divide-y divide-white/5">
          {lista.map(os => {
            const nome    = os.dependente_name ?? os.customer_name ?? 'Cliente'
            const proto   = os.protocolo_fisico ?? `OS #${os.id}`
            const temMed  = !!os.medida_dnp_od
            const temFoto = !!os.foto_medicao_url

            return (
              <Link
                key={os.id}
                href={`/medidas-armacao?osId=${os.id}&storeId=${storeId}`}
                className="flex items-center gap-4 px-4 py-5 hover:bg-white/5 active:bg-white/10 transition-colors"
              >
                {/* Ícone de status */}
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${temFoto ? 'bg-emerald-900/50 text-emerald-400' : temMed ? 'bg-amber-900/50 text-amber-400' : 'bg-slate-800 text-slate-400'}`}>
                  {temFoto ? <Camera className="w-6 h-6" /> : <Ruler className="w-6 h-6" />}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-base truncate">{nome}</p>
                  <p className="text-sm text-slate-400">{proto}</p>
                  {os.obs_os && (
                    <p className="text-xs text-slate-500 truncate mt-0.5">{os.obs_os}</p>
                  )}
                </div>

                {/* Badge de medidas */}
                <div className="shrink-0 text-right">
                  {temMed ? (
                    <span className="text-xs px-2 py-1 rounded-full bg-emerald-900/40 text-emerald-400 border border-emerald-700/40">
                      com medidas
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-1 rounded-full bg-slate-800 text-slate-400 border border-white/10">
                      sem medidas
                    </span>
                  )}
                  <p className="text-xs text-slate-600 mt-1">
                    {new Date(os.created_at).toLocaleDateString('pt-BR')}
                  </p>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
