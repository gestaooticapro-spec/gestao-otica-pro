'use client'

import { useEffect, useState } from 'react'
import { History, Loader2, X } from 'lucide-react'
import type { DailyHealthArea, DailyHealthPriority } from '@/lib/daily-store-health'

type RelevantAlert = { id: string; priority: DailyHealthPriority; title: string; detail: string }
type RelevantMessage = { reportDate: string | null; narrative: string | null; alerts: RelevantAlert[] }

type Props = {
  storeId: number
  area: DailyHealthArea
  label: string
  onClose: () => void
}

export default function LatestRelevantMessageModal({ storeId, area, label, onClose }: Props) {
  const [message, setMessage] = useState<RelevantMessage | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      try {
        const response = await fetch(`/api/daily-health/latest-relevant?storeId=${storeId}&area=${area}`, { credentials: 'same-origin', signal: controller.signal })
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar a última atualização relevante.')
        setMessage(payload)
      } catch (reason: any) {
        if (reason.name !== 'AbortError') setError(reason.message || 'Não foi possível carregar a última atualização relevante.')
      }
    }
    void load()
    return () => controller.abort()
  }, [area, storeId])

  const date = message?.reportDate ? new Date(`${message.reportDate}T12:00:00`).toLocaleDateString('pt-BR') : null
  return <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="latest-relevant-title" onClick={onClose}>
    <section className="max-h-[85vh] w-full max-w-2xl overflow-y-auto border border-white/15 bg-slate-950 shadow-2xl" onClick={(event) => event.stopPropagation()}>
      <header className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
        <div><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-emerald-200"><History className="h-4 w-4" />Última atualização relevante</p><h2 id="latest-relevant-title" className="mt-1 text-lg font-bold text-white">{label}</h2>{date ? <p className="mt-1 text-sm text-slate-400">Identificada em {date}.</p> : null}</div>
        <button type="button" onClick={onClose} aria-label="Fechar" title="Fechar" className="inline-flex h-9 w-9 shrink-0 items-center justify-center border border-white/15 text-slate-300 transition-colors hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
      </header>
      <div className="p-5">
        {!message && !error ? <div className="flex items-center gap-3 py-8 text-sm text-slate-300"><Loader2 className="h-4 w-4 animate-spin" />Buscando a última atualização relevante...</div> : null}
        {error ? <p className="text-sm text-rose-200">{error}</p> : null}
        {message && !message.alerts.length ? <p className="text-sm leading-6 text-slate-300">Ainda não existe uma atualização relevante salva para este módulo.</p> : null}
        {message?.narrative ? <p className="max-w-xl text-base leading-7 text-slate-100">{message.narrative}</p> : null}
        {message?.alerts.length ? <div className="mt-5 space-y-3">{message.alerts.map((alert) => <article key={alert.id} className={`border-l-4 bg-black/20 px-4 py-3 ${alert.priority === 'critico' ? 'border-rose-400' : 'border-amber-300'}`}><h3 className="font-bold text-white">{alert.title}</h3><p className="mt-1 text-sm leading-6 text-slate-200">{alert.detail}</p></article>)}</div> : null}
      </div>
    </section>
  </div>
}
