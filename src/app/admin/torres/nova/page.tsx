import Link from 'next/link'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import TowerOnboardingAdmin from '@/components/admin/TowerOnboardingAdmin'
import { getTowerAdminDashboardData } from '@/lib/actions/tower-admin.actions'

export default async function NewTowerStorePage() {
  const initialData = await getTowerAdminDashboardData()
  return <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-6 sm:py-10"><div className="mx-auto max-w-6xl"><Link href="/admin/torres" className="inline-flex items-center gap-2 text-sm font-bold text-slate-400 transition hover:text-white"><ArrowLeft className="h-4 w-4" /> Voltar para as Torres</Link><div className="mt-7 flex items-center gap-3 text-amber-300"><ShieldCheck size={24} /><span className="text-xs font-black uppercase tracking-[.18em]">Administração da plataforma</span></div><div className="mb-8 mt-6"><h1 className="text-3xl font-black sm:text-4xl">Nova loja com Torre</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">Cadastre a loja e gere as credenciais temporárias para a primeira instalação.</p></div><TowerOnboardingAdmin initialData={initialData} /></div></main>
}
