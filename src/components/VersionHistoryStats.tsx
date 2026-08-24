'use client'

import { useState } from 'react'
import { BarChart3, RefreshCw } from 'lucide-react'

type Stats = { total: number; byVersion: Record<string, number>; lastClickedAt: string | null }

export default function VersionHistoryStats() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadStats = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/version-history-clicks', { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Falha na consulta')
      setStats(payload)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Falha na consulta')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="rounded-2xl border border-cyan-400/15 bg-cyan-400/5 p-5 text-slate-200 shadow-lg backdrop-blur-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-white"><BarChart3 className="h-4 w-4 text-cyan-300" />Acessos ao histórico de versões</h2>
          <p className="mt-1 text-xs text-slate-400">Consulta temporária da Loja 1.</p>
        </div>
        <button type="button" onClick={() => void loadStats()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-xs font-black text-cyan-100 transition hover:bg-cyan-300/20 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />{loading ? 'Consultando...' : 'Consultar acessos'}
        </button>
      </div>
      {error && <p className="mt-4 text-xs font-bold text-rose-300">{error}</p>}
      {stats && (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-500">Total</p><p className="mt-1 text-2xl font-black text-white">{stats.total}</p></div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-500">Por versão</p><p className="mt-1 text-xs font-bold text-cyan-200">{Object.entries(stats.byVersion).map(([version, count]) => `${version}: ${count}`).join(' · ') || 'Nenhum clique'}</p></div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-500">Último acesso</p><p className="mt-1 text-xs font-bold text-slate-200">{stats.lastClickedAt ? new Date(stats.lastClickedAt).toLocaleString('pt-BR') : 'Nenhum clique'}</p></div>
        </div>
      )}
    </section>
  )
}
