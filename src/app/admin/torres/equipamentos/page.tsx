import Link from 'next/link'
import { ArrowLeft, Boxes, ShieldCheck } from 'lucide-react'
import TowerAssetAdmin from '@/components/admin/TowerAssetAdmin'
import { getTowerAssetAdminData } from '@/lib/actions/tower-assets.actions'

export default async function TowerAssetsAdminPage() {
  const data = await getTowerAssetAdminData()
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-6 sm:py-10">
      <div className="mx-auto max-w-7xl">
        <Link href="/admin/torres" className="inline-flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-white"><ArrowLeft className="h-4 w-4" />Voltar para Torres</Link>
        <div className="mt-7 flex items-center gap-3 text-amber-300"><ShieldCheck className="h-5 w-5" /><span className="text-xs font-black uppercase tracking-[.16em]">Administração da plataforma</span></div>
        <div className="mb-8 mt-5 flex items-start gap-4"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-cyan-300/10 text-cyan-200"><Boxes className="h-6 w-6" /></div><div><h1 className="text-3xl font-black">Equipamentos físicos</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Gere etiquetas, prepare o Electron, acompanhe o ciclo de vida e associe cada Torre à loja correta.</p></div></div>
        <TowerAssetAdmin initialData={data} />
      </div>
    </main>
  )
}
