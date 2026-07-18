import Link from 'next/link'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { notFound } from 'next/navigation'
import TowerStoreAdminPanel from '@/components/admin/TowerStoreAdminPanel'
import { getTowerStoreAdminData } from '@/lib/actions/tower-admin.actions'

export default async function TowerStoreAdminPage(props: { params: Promise<{ storeId: string }> }) {
  const params = await props.params;
  const storeId = Number(params.storeId)
  if (!Number.isInteger(storeId) || storeId <= 0) notFound()
  const data = await getTowerStoreAdminData(storeId)
  if (!data) notFound()
  return <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-6 sm:py-10"><div className="mx-auto max-w-6xl"><Link href="/admin/torres" className="inline-flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-white"><ArrowLeft className="h-4 w-4" /> Voltar para as Torres</Link><div className="mt-7 flex items-center gap-3 text-amber-300"><ShieldCheck className="h-5 w-5" /><span className="text-xs font-black uppercase tracking-[.16em]">Gestão da instalação</span></div><div className="mb-8 mt-5"><h1 className="text-3xl font-black">{data.store.name}</h1></div><TowerStoreAdminPanel initialData={data} /></div></main>
}
