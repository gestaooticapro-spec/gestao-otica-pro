'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, CheckCircle2, Loader2, RefreshCw } from 'lucide-react'
import EmployeeAuthModal from '@/components/modals/EmployeeAuthModal'
import type { DailyHealthAlert, DailyHealthAmountComparison, DailyHealthReport } from '@/lib/daily-store-health'

type Props = { storeId: number; report: DailyHealthReport | null; needsPin: boolean; canConfigure: boolean }

function money(value: number | null) {
  if (value === null) return 'Historico indisponivel'
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

function AmountRow({ label, amounts, total = false }: { label: string; amounts: DailyHealthAmountComparison; total?: boolean }) {
  return <tr className={total ? 'border-t border-white/15 text-white' : 'border-t border-white/5 text-slate-300'}>
    <th scope="row" className={`py-3 pr-4 text-left text-sm ${total ? 'font-bold' : 'font-medium'}`}>{label}</th>
    <td className={`py-3 text-right text-sm ${total ? 'font-bold' : ''}`}>{money(amounts.yesterday)}</td>
    <td className={`py-3 text-right text-sm ${total ? 'font-bold' : ''}`}>{money(amounts.monthToDate)}</td>
    <td className={`py-3 pl-4 text-right text-sm ${total ? 'font-bold' : 'text-slate-400'}`}>{money(amounts.samePeriodLastYear)}</td>
  </tr>
}

function SummaryTable({ title, rows }: { title: string; rows: Array<{ label: string; amounts: DailyHealthAmountComparison; total?: boolean }> }) {
  return <section className="border border-white/10 bg-black/20 px-5 py-5 sm:px-6" aria-label={title}>
    <h2 className="text-sm font-bold text-white">{title}</h2>
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[610px] border-collapse">
        <thead><tr className="text-xs font-medium text-slate-400"><th className="pb-3 text-left">&nbsp;</th><th className="pb-3 text-right">Ontem</th><th className="pb-3 text-right">Mes ate ontem</th><th className="pb-3 pl-4 text-right">Mes ate esta data no ano passado</th></tr></thead>
        <tbody>{rows.map((row) => <AmountRow key={row.label} {...row} />)}</tbody>
      </table>
    </div>
  </section>
}

function actionLabel(alert: DailyHealthAlert, requeueCandidates: number) {
  if (alert.id === 'post-sales-delivery' && requeueCandidates > 0) return `Vamos recolocar ${requeueCandidates} pos-vendas na fila`
  const labels: Record<string, string> = {
    'overdue-installments': 'Abrir parcelas vencidas para cobrar',
    'multiple-financing': 'Revisar clientes com mais de um contrato',
    'orders-without-lab': 'Abrir lentes que precisam ser pedidas',
    'lenses-not-arrived': 'Abrir lentes que nao chegaram do laboratorio',
    'lab-orders-without-update': 'Conferir pedidos sem prazo ou atualizacao',
    'orders-without-promise': 'Preencher datas prometidas das OS',
    'invalid-order-timeline': 'Revisar datas inconsistentes das OS',
    'cancelled-sales-with-open-order': 'Encerrar OS de vendas canceladas',
    'duplicate-open-orders': 'Comparar OS abertas da mesma venda',
    'lens-sales-without-order': 'Conferir vendas de lente sem OS',
    'whatsapp-pending': 'Abrir conversas aguardando a equipe',
    'post-sales-delivery': 'Abrir pos-vendas com falha de contato',
    'post-sales-human-review': 'Abrir respostas para revisao humana',
    'post-sales-satisfaction': 'Revisar casos de adaptacao e reclamacao',
    'cost-coverage': 'Abrir produtos com custo pendente',
  }
  return labels[alert.id] || 'Abrir para resolver'
}

export default function DailyHealthClient({ storeId, report, needsPin }: Props) {
  const router = useRouter()
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [requeueing, setRequeueing] = useState(false)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const refreshReport = async () => {
    setRefreshing(true); setRefreshError(null)
    try {
      const response = await fetch('/api/daily-health', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storeId }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Nao foi possivel refazer o resumo.')
      router.refresh()
    } catch (error) {
      setRefreshError(error instanceof Error ? error.message : 'Nao foi possivel refazer o resumo.')
    } finally { setRefreshing(false) }
  }

  const requeuePostSales = async () => {
    setRequeueing(true); setActionMessage(null); setActionError(null)
    try {
      const response = await fetch('/api/daily-health/post-sales/requeue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storeId }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Nao foi possivel recolocar os pos-vendas na fila.')
      const result = data.result || {}
      const requeued = Number(result.requeuedFailures || 0) + Number(result.scheduledMissingAttempts || 0)
      setActionMessage(`${requeued} caso${requeued === 1 ? '' : 's'} foi${requeued === 1 ? '' : 'ram'} recolocado${requeued === 1 ? '' : 's'} na fila para o proximo horario comercial.`)
      router.refresh()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Nao foi possivel recolocar os pos-vendas na fila.')
    } finally { setRequeueing(false) }
  }

  if (needsPin) return <main className="min-h-full p-6 text-white lg:p-10"><div className="mx-auto max-w-7xl"><p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-200">Central diaria</p><h1 className="mt-2 text-3xl font-black">Saude da Loja</h1><p className="mt-3 text-sm text-slate-300">Aguardando a confirmacao do PIN de um gerente.</p></div><EmployeeAuthModal storeId={storeId} isOpen onClose={() => router.back()} onSuccess={() => router.refresh()} title="Abrir Saude da Loja" description="Informe o PIN de um gerente para visualizar o resumo diario." purpose="daily_health_access" /></main>

  const referenceDate = report ? new Date(`${report.reportDate}T12:00:00`).toLocaleDateString('pt-BR') : null
  const summary = report?.metrics.salesSummary
  const requeueCandidates = report?.metrics.postSaleAnalysis ? report.metrics.postSaleAnalysis.messageFailed + report.metrics.postSaleAnalysis.noMessageAttempt : 0

  return <main className="min-h-full p-6 text-white lg:p-10"><div className="mx-auto max-w-7xl">
    <header className="flex flex-wrap items-start justify-between gap-5 border-b border-white/10 pb-6"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-200">Central diaria</p><h1 className="mt-2 text-3xl font-black">Saude da Loja</h1><p className="mt-1 text-sm text-slate-300">{referenceDate ? `Referencia: ${referenceDate}` : 'Resumo diario ainda nao gerado.'}</p></div><button type="button" onClick={refreshReport} disabled={refreshing} className="inline-flex h-10 items-center gap-2 border border-white/15 bg-white/5 px-3 text-sm font-semibold text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50">{refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Refazer</button></header>
    {refreshError && <p className="mt-4 text-sm text-rose-200">{refreshError}</p>}
    {summary && <div className="mt-7 grid gap-4 xl:grid-cols-2"><SummaryTable title="Vendas" rows={[{ label: 'A vista', amounts: summary.sales.cash }, { label: 'A prazo', amounts: summary.sales.credit }, { label: 'Total', amounts: summary.sales.total, total: true }]} /><SummaryTable title="Valores que entraram" rows={[{ label: 'Vendas', amounts: summary.receipts.sales }, { label: 'Parcelas', amounts: summary.receipts.installments }, { label: 'Total', amounts: summary.receipts.total, total: true }]} /></div>}
    <section className="mt-9 max-w-5xl" aria-label="Pontos que precisam de atencao"><h2 className="text-lg font-bold text-white">O que merece atencao hoje</h2>
      {!report ? <p className="mt-4 border border-white/10 bg-black/20 px-5 py-5 text-sm text-slate-300">O resumo sera exibido assim que a primeira geracao for concluida.</p> : report.alerts.length === 0 ? <div className="mt-4 flex items-center gap-3 border border-emerald-300/30 bg-emerald-300/10 px-5 py-5 text-emerald-50"><CheckCircle2 className="h-5 w-5 shrink-0" /><p className="text-sm font-medium">Nenhuma inconsistencia relevante foi encontrada nas fontes disponiveis.</p></div> : <div className="mt-4 space-y-4">{report.alerts.map((alert) => {
        const isRequeueAction = alert.id === 'post-sales-delivery' && requeueCandidates > 0
        const presentation = alert.presentation || { title: alert.title, detail: alert.detail }
        return <article key={alert.id} className={`border-l-4 bg-black/20 px-5 py-5 sm:px-6 ${alert.priority === 'critico' ? 'border-rose-400' : 'border-amber-300'}`}><p className={`text-xs font-bold uppercase tracking-[0.12em] ${alert.priority === 'critico' ? 'text-rose-200' : 'text-amber-100'}`}>{alert.area}</p><h3 className="mt-2 text-lg font-bold leading-7 text-white">{presentation.title}</h3><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-200">{presentation.detail}</p><button type="button" onClick={() => isRequeueAction ? void requeuePostSales() : router.push(alert.href)} disabled={isRequeueAction && requeueing} className="mt-5 inline-flex min-h-11 items-center gap-2 border border-emerald-300/40 bg-emerald-300/10 px-4 py-2 text-sm font-bold text-emerald-50 transition-colors hover:bg-emerald-300 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50">{isRequeueAction && requeueing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}{actionLabel(alert, requeueCandidates)}</button></article>
      })}</div>}
      {actionMessage && <p className="mt-4 text-sm text-emerald-100">{actionMessage}</p>}{actionError && <p className="mt-4 text-sm text-rose-200">{actionError}</p>}{report?.sourceFailures.length ? <p className="mt-5 text-xs text-slate-500">Dados indisponiveis: {report.sourceFailures.join(', ')}.</p> : null}
    </section>
  </div></main>
}
