'use client'

import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import TowerRemoteConfigPanel from '@/components/tower/TowerRemoteConfigPanel'
import TowerRemoteCatalogPanel from '@/components/tower/TowerRemoteCatalogPanel'
import AiSuggestionConfigPanel from '@/components/config/AiSuggestionConfigPanel'
import type { TowerRemoteConfig } from '@/lib/tower/remote-config'

export default function TowerRemoteConfigWorkspace({
  publicCode,
  storeId,
  initialConfig,
}: {
  publicCode: string
  storeId: number
  initialConfig: TowerRemoteConfig
}) {
  const router = useRouter()
  async function logout() {
    await fetch(`/api/tower/remote-config/${publicCode}/session`, { method: 'DELETE' })
    router.refresh()
  }
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-7 text-white sm:px-7">
      <div className="mx-auto max-w-6xl">
        <div className="mb-5 flex justify-end"><button type="button" onClick={() => void logout()} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 px-4 text-xs font-black text-slate-300 hover:bg-white/5"><LogOut className="h-4 w-4" />Encerrar acesso</button></div>
        <TowerRemoteConfigPanel publicCode={publicCode} storeId={storeId} initialConfig={initialConfig} />
        <TowerRemoteCatalogPanel publicCode={publicCode} />
        <section className="mt-6 rounded-3xl border border-amber-300/15 bg-slate-900/80 p-6 sm:p-8">
          <div className="mb-6"><p className="text-xs font-black uppercase tracking-[.16em] text-amber-300">Decisões comerciais</p><h2 className="mt-2 text-xl font-black text-white">Prioridades das sugestões</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Estas estrelas e preferências são as mesmas usadas no programa completo. Elas ajustam a ordem comercial depois da compatibilidade clínica.</p></div>
          <AiSuggestionConfigPanel storeId={storeId} endpoint={`/api/tower/remote-config/${publicCode}/ai-suggestion-config`} collapsible />
        </section>
      </div>
    </main>
  )
}
