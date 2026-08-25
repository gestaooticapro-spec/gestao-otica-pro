'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2, RefreshCw } from 'lucide-react'
import EmployeeAuthModal from '@/components/modals/EmployeeAuthModal'
import type { DailyHealthAmountComparison, DailyHealthArea, DailyHealthReport } from '@/lib/daily-store-health'

type Props = { storeId: number; report: DailyHealthReport | null; needsPin: boolean; canConfigure: boolean }

const modules: Array<{ id: DailyHealthArea; label: string }> = [
  { id: 'financeiro', label: 'Financeiro' },
  { id: 'operacao', label: 'Operacao' },
  { id: 'relacionamento', label: 'Relacionamento' },
]

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

function moduleNarrative(report: DailyHealthReport, area: DailyHealthArea) {
  const narratives = report.metrics.areaNarratives
  if (area === 'financeiro') return narratives?.financeiro || null
  if (area === 'operacao') return narratives?.operacao || null
  return narratives?.relacionamento || null
}

export default function DailyHealthClient({ storeId, report, needsPin }: Props) {
  const router = useRouter()
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [needsRefreshPin, setNeedsRefreshPin] = useState(false)

  const refreshReport = async () => {
    setRefreshing(true)
    setRefreshError(null)
    try {
      const response = await fetch('/api/daily-health', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storeId }) })
      const data = await response.json()
      if (response.status === 403) {
        setNeedsRefreshPin(true)
        return
      }
      if (!response.ok) throw new Error(data.error || 'Nao foi possivel atualizar o resumo.')
      router.refresh()
    } catch (error) {
      setRefreshError(error instanceof Error ? error.message : 'Nao foi possivel atualizar o resumo.')
    } finally {
      setRefreshing(false)
    }
  }

  if (needsPin) return <main className="min-h-full p-6 text-white lg:p-10"><div className="mx-auto max-w-7xl"><p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-200">Central diaria</p><h1 className="mt-2 text-3xl font-black">Saude da Loja</h1><p className="mt-3 text-sm text-slate-300">Aguardando a confirmacao do PIN de um gerente.</p></div><EmployeeAuthModal storeId={storeId} isOpen onClose={() => router.back()} onSuccess={() => router.refresh()} title="Abrir Saude da Loja" description="Informe o PIN de um gerente para visualizar o resumo diario." purpose="daily_health_access" /></main>

  const referenceDate = report ? new Date(`${report.reportDate}T12:00:00`).toLocaleDateString('pt-BR') : null
  const summary = report?.metrics.salesSummary

  return <main className="min-h-full p-6 text-white lg:p-10"><div className="mx-auto max-w-7xl">
    <header className="flex flex-wrap items-start justify-between gap-5 border-b border-white/10 pb-6"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-200">Central diaria</p><h1 className="mt-2 text-3xl font-black">Saude da Loja</h1><p className="mt-1 text-sm text-slate-300">{referenceDate ? `Referencia: ${referenceDate}` : 'Resumo diario ainda nao gerado.'}</p></div><button type="button" onClick={refreshReport} disabled={refreshing} className="inline-flex h-10 items-center gap-2 border border-white/15 bg-white/5 px-3 text-sm font-semibold text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50">{refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Atualizar</button></header>
    {refreshError && <p className="mt-4 text-sm text-rose-200">{refreshError}</p>}
    {summary ? <div className="mt-7 grid gap-4 xl:grid-cols-2"><SummaryTable title="Vendas" rows={[{ label: 'A vista', amounts: summary.sales.cash }, { label: 'A prazo', amounts: summary.sales.credit }, { label: 'Total', amounts: summary.sales.total, total: true }]} /><SummaryTable title="Valores que entraram" rows={[{ label: 'Vendas', amounts: summary.receipts.sales }, { label: 'Parcelas', amounts: summary.receipts.installments }, { label: 'Total', amounts: summary.receipts.total, total: true }]} /></div> : report ? <p className="mt-6 text-sm text-slate-400">O resumo de vendas e caixa sera incluido na proxima geracao.</p> : null}
    <section className="mt-10 max-w-5xl" aria-label="Leituras por modulo"><h2 className="text-lg font-bold text-white">Leitura da noite</h2>
      {!report ? <p className="mt-4 border border-white/10 bg-black/20 px-5 py-5 text-sm text-slate-300">O resumo sera exibido assim que a primeira geracao for concluida.</p> : <div className="mt-5 space-y-10">{modules.map((module) => {
        const alerts = report.alerts.filter((alert) => alert.area === module.id && (alert.lifecycle?.show ?? true))
        const narrative = moduleNarrative(report, module.id)
        const resolved = report.metrics.alertLifecycle?.[module.id]?.resolvedCount || 0
        return <section key={module.id} className="border-t border-white/10 pt-6" aria-label={module.label}><h3 className="text-xl font-bold text-white">{module.label}</h3>{narrative && <p className="mt-3 max-w-4xl text-base leading-7 text-slate-100">{narrative}</p>}{module.id === 'relacionamento' && report.metrics.areaNarratives?.relacionamentoConcern && <p className="mt-4 border-l-2 border-amber-300 pl-4 text-sm font-medium leading-6 text-amber-100">{report.metrics.areaNarratives.relacionamentoConcern}</p>}{alerts.length ? <div className="mt-5 space-y-3">{alerts.map((alert) => { const presentation = alert.presentation || { title: alert.title, detail: alert.detail }; return <article key={alert.id} className={`border-l-4 bg-black/20 px-5 py-4 ${alert.priority === 'critico' ? 'border-rose-400' : 'border-amber-300'}`}><h4 className="text-base font-bold text-white">{presentation.title}</h4><p className="mt-1 text-sm leading-6 text-slate-200">{presentation.detail}</p></article> })}</div> : <div className="mt-4 flex items-center gap-3 text-sm text-emerald-100"><CheckCircle2 className="h-4 w-4 shrink-0" />{resolved ? `${resolved} pendencia${resolved === 1 ? '' : 's'} foi${resolved === 1 ? '' : 'ram'} resolvida${resolved === 1 ? '' : 's'} desde ontem.` : 'Nenhuma mudanca material neste modulo desde ontem.'}</div>}</section>
      })}</div>}
      {report?.sourceFailures.length ? <p className="mt-5 text-xs text-slate-500">Dados indisponiveis: {report.sourceFailures.join(', ')}.</p> : null}
    </section>
    <EmployeeAuthModal storeId={storeId} isOpen={needsRefreshPin} onClose={() => setNeedsRefreshPin(false)} onSuccess={() => { setNeedsRefreshPin(false); void refreshReport() }} title="Atualizar Saude da Loja" description="Informe o PIN de um gerente para consultar o resumo diario salvo." purpose="daily_health_access" />
  </div></main>
}
