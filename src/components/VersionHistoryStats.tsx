'use client'

import { useState } from 'react'
import { BarChart3, Loader2, RefreshCw } from 'lucide-react'

const PAGE_SIZE = 10

type AccessEntry = {
  clickedAt: string
  version: string
  store: string
}

type AccessLog = {
  entries: AccessEntry[]
  total: number
  hasMore: boolean
}

export default function VersionHistoryStats() {
  const [log, setLog] = useState<AccessLog | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadEntries = async (offset: number, append = false) => {
    const response = await fetch(`/api/version-history-clicks?offset=${offset}&limit=${PAGE_SIZE}`, { cache: 'no-store' })
    const payload = await response.json() as AccessLog & { error?: string }
    if (!response.ok) throw new Error(payload.error || 'Falha na consulta')

    setLog((current) => ({
      ...payload,
      entries: append ? [...(current?.entries ?? []), ...payload.entries] : payload.entries,
    }))
  }

  const refresh = async () => {
    setLoading(true)
    setError(null)
    try {
      await loadEntries(0)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Falha na consulta')
    } finally {
      setLoading(false)
    }
  }

  const loadMore = async () => {
    if (!log) return
    setLoadingMore(true)
    setError(null)
    try {
      await loadEntries(log.entries.length, true)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Falha na consulta')
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <section className="rounded-2xl border border-cyan-400/15 bg-cyan-400/5 p-5 text-slate-200 shadow-lg backdrop-blur-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-white"><BarChart3 className="h-4 w-4 text-cyan-300" />Acessos ao histórico de versões</h2>
          <p className="mt-1 text-xs text-slate-400">Últimos acessos registrados por loja.</p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-xs font-black text-cyan-100 transition hover:bg-cyan-300/20 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />{loading ? 'Consultando...' : 'Consultar acessos'}
        </button>
      </div>
      {error && <p className="mt-4 text-xs font-bold text-rose-300">{error}</p>}
      {log && (
        <div className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-black/20">
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-500">
            <span>Últimos {log.entries.length} de {log.total} acessos</span>
          </div>
          {log.entries.length ? (
            <div className="divide-y divide-white/10">
              {log.entries.map((entry, index) => (
                <div key={`${entry.clickedAt}-${entry.version}-${index}`} className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 px-3 py-3 text-xs sm:grid-cols-3 sm:items-center sm:gap-y-0">
                  <time dateTime={entry.clickedAt} className="font-bold text-slate-200">{new Date(entry.clickedAt).toLocaleString('pt-BR')}</time>
                  <span className="font-black text-cyan-200">Versão {entry.version}</span>
                  <span className="col-span-2 text-slate-400 sm:col-span-1">{entry.store}</span>
                </div>
              ))}
            </div>
          ) : <p className="px-3 py-5 text-center text-xs font-bold text-slate-500">Nenhum acesso registrado.</p>}
          {log.hasMore && (
            <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="flex w-full items-center justify-center gap-2 border-t border-white/10 px-3 py-3 text-xs font-black text-cyan-200 transition hover:bg-white/5 hover:text-white disabled:opacity-50">
              {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}{loadingMore ? 'Carregando...' : 'Carregar acessos anteriores'}
            </button>
          )}
        </div>
      )}
    </section>
  )
}
