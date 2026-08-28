import Link from 'next/link'
import { ArrowRight, ClipboardList, Tag, Sparkles, Smartphone } from 'lucide-react'
import { DesktopModeButton } from '@/components/tablet/DesktopModeButton'
import FullscreenToggleButton from '@/components/FullscreenToggleButton'
import { getStoreModulesForStore } from '@/lib/store-modules.server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSicrediPilotStoreCnpj } from '@/lib/pix/sicredi-availability'
import type { StoreSettings } from '@/lib/store-modules'

export default async function TabletMenuPage(props: { params: Promise<{ storeId: string }> }) {
  const params = await props.params;
  const { storeId } = params
  const storeIdNumber = parseInt(storeId, 10)
  const [modules, storeResult] = await Promise.all([
    getStoreModulesForStore(storeIdNumber),
    (createAdminClient() as any).from('stores').select('cnpj, settings').eq('id', storeIdNumber).maybeSingle(),
  ])
  const store = storeResult.data as { cnpj?: string | null; settings?: StoreSettings | null } | null
  const isSicrediEnabled = Boolean(
    store
    && isSicrediPilotStoreCnpj(store.cnpj)
    && store.settings?.pix_provider === 'sicredi'
  )

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-8 gap-8">
      <FullscreenToggleButton />
      <h1 className="text-2xl font-bold tracking-wide">Menu Tablet</h1>

      <div className="grid grid-cols-1 gap-6 w-full max-w-lg">
        {isSicrediEnabled && <Link
          href={`/tablet/${storeId}/pix-maquininha`}
          prefetch={false}
          className="group rounded-3xl p-6 relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-cyan-500/10 bg-gradient-to-br from-cyan-600/80 to-sky-900/80 border border-cyan-400/30 backdrop-blur-md min-h-44 flex flex-col justify-between"
        >
          <div className="absolute -top-4 -right-4 p-4 opacity-10 group-hover:opacity-20 transition-opacity transform scale-[2.5] rotate-12"><Smartphone className="w-24 h-24 text-white" /></div>
          <div className="relative z-10"><div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center mb-4 border border-white/10 group-hover:bg-white/20 transition-colors shadow-lg"><Smartphone className="w-6 h-6 text-white" /></div><h2 className="text-2xl font-black leading-none text-white drop-shadow-md tracking-tight">Modo Maquininha Pix</h2></div>
          <div className="relative z-10 flex items-center justify-between mt-2 gap-2"><p className="text-xs font-semibold text-white/70 uppercase tracking-widest">Exibir QR Code para o cliente</p><ArrowRight className="w-4 h-4 shrink-0 text-white/50 group-hover:text-white group-hover:translate-x-1 transition-all" /></div>
        </Link>}

        <Link
          href={`/tablet/${storeId}/os`}
          className="
            group rounded-3xl p-6 relative overflow-hidden transition-all duration-300
            hover:-translate-y-1 hover:shadow-2xl hover:shadow-cyan-500/10
            bg-gradient-to-br from-blue-600/80 to-blue-900/80 border border-blue-400/30 backdrop-blur-md
            min-h-44 flex flex-col justify-between
          "
        >
          <div className="absolute -top-4 -right-4 p-4 opacity-10 group-hover:opacity-20 transition-opacity transform scale-[2.5] rotate-12">
            <ClipboardList className="w-24 h-24 text-white" />
          </div>

          <div className="relative z-10">
            <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center mb-4 border border-white/10 group-hover:bg-white/20 transition-colors shadow-lg">
              <ClipboardList className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-2xl font-black leading-none text-white drop-shadow-md tracking-tight">OS</h2>
          </div>
          <div className="relative z-10 flex items-center justify-between mt-2 gap-2">
            <p className="text-xs font-semibold text-white/70 uppercase tracking-widest">Pedidos pendentes de laboratorio</p>
            <ArrowRight className="w-4 h-4 shrink-0 text-white/50 group-hover:text-white group-hover:translate-x-1 transition-all" />
          </div>
        </Link>

        {modules.globalTables && <Link
          href={`/dashboard/loja/${storeId}/tabela-precos`}
          className="
            group rounded-3xl p-6 relative overflow-hidden transition-all duration-300
            hover:-translate-y-1 hover:shadow-2xl hover:shadow-emerald-500/10
            bg-gradient-to-br from-emerald-600/80 to-emerald-900/80 border border-emerald-400/30 backdrop-blur-md
            min-h-44 flex flex-col justify-between
          "
        >
          <div className="absolute -top-4 -right-4 p-4 opacity-10 group-hover:opacity-20 transition-opacity transform scale-[2.5] rotate-12">
            <Tag className="w-24 h-24 text-white" />
          </div>

          <div className="relative z-10">
            <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center mb-4 border border-white/10 group-hover:bg-white/20 transition-colors shadow-lg">
              <Tag className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-2xl font-black leading-none text-white drop-shadow-md tracking-tight">Tabela de Precos</h2>
          </div>
          <div className="relative z-10 flex items-center justify-between mt-2 gap-2">
            <p className="text-xs font-semibold text-white/70 uppercase tracking-widest">Consultar valores e tratamentos</p>
            <ArrowRight className="w-4 h-4 shrink-0 text-white/50 group-hover:text-white group-hover:translate-x-1 transition-all" />
          </div>
        </Link>}

      </div>

      <DesktopModeButton storeId={storeId} />
    </div>
  )
}
