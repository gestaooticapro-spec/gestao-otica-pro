'use client'

import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import TowerRemoteConfigPanel from '@/components/tower/TowerRemoteConfigPanel'
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
      </div>
    </main>
  )
}
