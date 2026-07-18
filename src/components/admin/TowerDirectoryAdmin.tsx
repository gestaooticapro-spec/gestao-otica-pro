import Link from 'next/link'
import { Boxes, Building2, ChevronRight, Clock3, Plus, Store, TowerControl } from 'lucide-react'
import type { TowerDirectoryData } from '@/lib/actions/tower-admin.actions'

type Props = { data: TowerDirectoryData }

const activationLabels = { pending: 'Aguardando ativação', consumed: 'Ativada', revoked: 'Revogada', expired: 'Expirada' }

export default function TowerDirectoryAdmin({ data }: Props) {
  return (
    <div className="space-y-7">
      <section className="flex flex-col justify-between gap-5 rounded-3xl border border-white/10 bg-slate-900/75 p-6 sm:flex-row sm:items-center sm:p-8">
        <div>
          <p className="text-xs font-black uppercase tracking-[.16em] text-amber-300">Torres cadastradas</p>
          <h2 className="mt-2 text-2xl font-black text-white">Lojas e instalações</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Entre em uma loja para alterar os dados, consultar o histórico e reemitir a instalação se o equipamento precisar ser configurado novamente.</p>
        </div>
        <div className="flex flex-wrap gap-3"><Link href="/admin/torres/equipamentos" className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl border border-white/10 px-5 text-sm font-black text-white transition hover:bg-white/5"><Boxes className="h-5 w-5" />Equipamentos físicos</Link><Link href="/admin/torres/nova" className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-amber-300 px-5 text-sm font-black text-slate-950 transition hover:bg-amber-200"><Plus className="h-5 w-5" />Nova loja com Torre</Link></div>
      </section>

      {!data.stores.length ? (
        <section className="rounded-3xl border border-dashed border-white/15 bg-slate-900/50 px-6 py-16 text-center"><TowerControl className="mx-auto h-10 w-10 text-slate-600" /><h2 className="mt-4 text-xl font-black text-white">Nenhuma Torre cadastrada</h2><p className="mt-2 text-sm text-slate-500">Cadastre a primeira loja para preparar a instalação.</p></section>
      ) : (
        <section className="grid gap-4 lg:grid-cols-2">
          {data.stores.map((store) => (
            <Link key={store.id} href={`/admin/torres/${store.id}`} className="group rounded-3xl border border-white/10 bg-slate-900/70 p-5 transition hover:border-amber-300/35 hover:bg-slate-900">
              <div className="flex items-start justify-between gap-4"><div className="min-w-0"><div className="flex items-center gap-2 text-amber-300"><Store className="h-4 w-4" /><span className="text-xs font-black uppercase tracking-[.14em]">Loja com Torre</span></div><h2 className="mt-3 truncate text-xl font-black text-white">{store.name}</h2><p className="mt-1 flex items-center gap-2 text-sm text-slate-400"><Building2 className="h-4 w-4" />{store.tenantName}</p></div><ChevronRight className="mt-2 h-5 w-5 shrink-0 text-slate-600 transition group-hover:translate-x-1 group-hover:text-amber-200" /></div>
              <div className="mt-5 flex flex-wrap gap-3 text-xs font-bold text-slate-400"><span>{[store.city, store.state].filter(Boolean).join(' · ') || 'Localização não informada'}</span><span className={store.isActive ? 'text-emerald-300' : 'text-rose-300'}>{store.isActive ? 'Loja ativa' : 'Loja inativa'}</span></div>
              <div className="mt-5 flex items-center gap-2 rounded-xl border border-white/5 bg-slate-950/45 px-3 py-2.5 text-xs text-slate-400"><Clock3 className="h-4 w-4 text-slate-500" />{store.latestActivation ? `Última ativação: ${activationLabels[store.latestActivation.status]}` : 'Nenhuma ativação registrada'}</div>
            </Link>
          ))}
        </section>
      )}
    </div>
  )
}
