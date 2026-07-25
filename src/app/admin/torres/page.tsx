import { ShieldCheck } from 'lucide-react'
import TowerDirectoryAdmin from '@/components/admin/TowerDirectoryAdmin'
import LogoutButton from '@/components/LogoutButton'
import { getTowerDirectoryData } from '@/lib/actions/tower-admin.actions'

export default async function TowerPlatformAdminPage() {
  const data = await getTowerDirectoryData()

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-6 sm:py-10">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 text-amber-300"><ShieldCheck size={24} aria-hidden="true" /><span className="text-xs font-black uppercase tracking-[.18em]">Administração da plataforma</span></div>
          <div className="w-28 shrink-0"><LogoutButton /></div>
        </div>
        <div className="mb-8 mt-6"><h1 className="text-3xl font-black sm:text-4xl">Torres</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">Gerencie lojas com Torre, reemita credenciais de instalação e acompanhe a configuração de cada equipamento.</p></div>
        <TowerDirectoryAdmin data={data} />
      </div>
    </main>
  )
}
