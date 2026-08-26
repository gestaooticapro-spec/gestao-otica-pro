'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ExternalLink, Loader2, X } from 'lucide-react'
import type { DailyHealthAlert } from '@/lib/daily-store-health'

type OperationalCase = {
  id: number
  saleId: number
  customerName: string
  patientName: string
  promisedAt: string | null
  lensArrivedAt: string | null
  mountedAt: string | null
}

type Props = {
  storeId: number
  alert: DailyHealthAlert
  onClose: () => void
}

function date(value: string | null) {
  return value ? new Date(value).toLocaleDateString('pt-BR') : null
}

export default function OperationalCasesModal({ storeId, alert, onClose }: Props) {
  const [cases, setCases] = useState<OperationalCase[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(`/api/daily-health/operational-cases?storeId=${storeId}&ids=${encodeURIComponent(alert.records.ids.join(','))}`, { credentials: 'same-origin', signal: controller.signal })
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error || 'Nao foi possivel carregar os casos.')
        setCases(Array.isArray(payload.cases) ? payload.cases : [])
      } catch (reason: any) {
        if (reason.name !== 'AbortError') setError(reason.message || 'Nao foi possivel carregar os casos.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [alert, storeId])

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="operational-cases-title" onClick={onClose}>
    <section className="max-h-[85vh] w-full max-w-2xl overflow-hidden border border-white/15 bg-slate-950 shadow-2xl" onClick={(event) => event.stopPropagation()}>
      <header className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
        <div><p className="text-xs font-bold uppercase tracking-[0.12em] text-emerald-200">Casos deste alerta</p><h2 id="operational-cases-title" className="mt-1 text-lg font-bold text-white">{alert.presentation?.title || alert.title}</h2></div>
        <button type="button" onClick={onClose} aria-label="Fechar casos" title="Fechar" className="inline-flex h-9 w-9 shrink-0 items-center justify-center border border-white/15 text-slate-300 transition-colors hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
      </header>
      <div className="max-h-[65vh] overflow-y-auto p-5">
        {loading ? <div className="flex items-center gap-3 py-8 text-sm text-slate-300"><Loader2 className="h-4 w-4 animate-spin" />Carregando casos...</div> : null}
        {error ? <p className="text-sm text-rose-200">{error}</p> : null}
        {!loading && !error && !cases.length ? <p className="text-sm text-slate-300">Nenhuma OS deste alerta continua disponível para consulta.</p> : null}
        {!loading && !error && cases.length ? <div className="space-y-3">{cases.map((item) => <article key={item.id} className="border border-white/10 bg-black/20 px-4 py-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold text-white">{item.patientName}</h3>{item.patientName !== item.customerName ? <p className="mt-1 text-sm text-slate-400">Responsável: {item.customerName}</p> : null}<p className="mt-2 text-xs font-semibold text-slate-400">OS #{item.id} · Venda #{item.saleId}</p>{item.promisedAt ? <p className="mt-1 text-xs text-slate-400">Prometido para: {date(item.promisedAt)}</p> : null}{item.lensArrivedAt ? <p className="mt-1 text-xs text-slate-400">Lente chegou: {date(item.lensArrivedAt)}</p> : null}{item.mountedAt ? <p className="mt-1 text-xs text-slate-400">Montado em: {date(item.mountedAt)}</p> : null}</div><Link href={`/dashboard/loja/${storeId}/vendas/${item.saleId}/os?os_id=${item.id}`} onClick={onClose} className="inline-flex h-9 items-center gap-2 border border-emerald-300/40 px-3 text-xs font-semibold text-emerald-100 transition-colors hover:bg-emerald-300/10">Abrir OS<ExternalLink className="h-4 w-4" /></Link></div></article>)}</div> : null}
      </div>
    </section>
  </div>
}
