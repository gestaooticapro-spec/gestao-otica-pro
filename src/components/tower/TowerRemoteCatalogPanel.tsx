'use client'

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { Check, ChevronDown, ChevronUp, Database, Loader2, RefreshCw, Search, UploadCloud } from 'lucide-react'
import type { StoreCatalogOverview, StoreCatalogVersionSummary } from '@/lib/actions/global-catalog.actions'

type Props = { publicCode: string }

function countLabel(version: StoreCatalogVersionSummary) {
  return `${version.familiesCount} famílias · ${version.offersCount} ofertas · ${version.treatmentsCount} tratamentos`
}

export default function TowerRemoteCatalogPanel({ publicCode }: Props) {
  const [overview, setOverview] = useState<StoreCatalogOverview | null>(null)
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [isOpen, setIsOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const load = useCallback(async () => {
    setLoading(true)
    setMessage(null)
    try {
      const response = await fetch(`/api/tower/remote-config/${publicCode}/catalogs`, { cache: 'no-store' })
      const result = await response.json() as { success?: boolean; message?: string; overview?: StoreCatalogOverview }
      if (!response.ok || !result.success || !result.overview) throw new Error(result.message || 'Não foi possível carregar as tabelas.')
      setOverview(result.overview)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Sem comunicação com o servidor.')
    } finally {
      setLoading(false)
    }
  }, [publicCode])

  useEffect(() => { if (isOpen) void load() }, [isOpen, load])

  const versions = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR')
    return (overview?.versions || []).filter((version) => !term || `${version.laboratorio} ${version.versao}`.toLocaleLowerCase('pt-BR').includes(term))
  }, [overview, search])

  function activate(version: StoreCatalogVersionSummary) {
    startTransition(async () => {
      setMessage(null)
      try {
        const response = await fetch(`/api/tower/remote-config/${publicCode}/catalogs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ versionId: version.id }),
        })
        const result = await response.json() as { success?: boolean; message?: string }
        if (!response.ok || !result.success) throw new Error(result.message || 'Não foi possível ativar a tabela.')
        setMessage(`${version.laboratorio} · ${version.versao} está disponível na Torre.`)
        await load()
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Sem comunicação com o servidor.')
      }
    })
  }

  return (
    <section className="mt-6 rounded-3xl border border-violet-300/15 bg-slate-900/80 p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[.16em] text-violet-300"><UploadCloud className="h-4 w-4" /> Catálogo da Torre</p>
          <h2 className="mt-2 text-xl font-black text-white">Importar tabelas globais</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Escolha qualquer tabela global publicada. Ela é ativada somente para esta loja e será baixada pela Torre na próxima sincronização.</p>
        </div>
        <button type="button" onClick={() => setIsOpen((current) => !current)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 px-4 text-sm font-black text-slate-200 hover:bg-white/5">{isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}{isOpen ? 'Recolher' : 'Abrir tabelas'}</button>
      </div>

      {isOpen && <>
      <div className="mt-5 flex justify-end"><button type="button" onClick={() => void load()} disabled={loading || pending} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 px-4 text-xs font-black text-slate-200 hover:bg-white/5 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Atualizar</button></div>
      <div className="mt-6 flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950 px-3"><Search className="h-4 w-4 text-slate-500" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar laboratório ou versão" className="h-11 w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500" /></div>
      {message && <p className="mt-4 rounded-xl border border-violet-300/20 bg-violet-300/10 px-4 py-3 text-sm font-bold text-violet-100">{message}</p>}

      {loading ? <div className="grid min-h-36 place-items-center text-sm text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /></div> : <div className="mt-5 grid gap-3 lg:grid-cols-2">{versions.map((version) => {
        const active = version.activation?.status === 'active'
        return <article key={version.id} className="rounded-2xl border border-white/10 bg-slate-950/45 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.14em] text-violet-200">{version.laboratorio}</p><h3 className="mt-1 font-black text-white">{version.versao}</h3><p className="mt-2 text-xs text-slate-400">{countLabel(version)}</p></div>{active ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-200"><Check className="h-3.5 w-3.5" />Ativa</span> : null}</div><button type="button" onClick={() => activate(version)} disabled={pending || active} className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-violet-300 px-4 text-xs font-black text-violet-950 hover:bg-violet-200 disabled:cursor-not-allowed disabled:opacity-45">{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}{active ? 'Já disponível' : 'Importar para esta Torre'}</button></article>
      })}</div>}
      {!loading && !versions.length ? <p className="mt-5 rounded-2xl border border-dashed border-white/10 px-5 py-8 text-center text-sm text-slate-500">Nenhuma tabela publicada encontrada.</p> : null}
      </>}
    </section>
  )
}
