'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, ChevronDown, ChevronUp, CircleDollarSign, ClipboardCheck, Gauge, Handshake, List, Loader2, RefreshCw, ScanSearch } from 'lucide-react'
import EmployeeAuthModal from '@/components/modals/EmployeeAuthModal'
import OperationalCasesModal from '@/components/daily-health/OperationalCasesModal'
import RelationshipCasesModal from '@/components/daily-health/RelationshipCasesModal'
import DataQualityCasesModal from '@/components/daily-health/DataQualityCasesModal'
import ProgramUsageModal from '@/components/daily-health/ProgramUsageModal'
import type { DailyHealthAmountComparison, DailyHealthAlert, DailyHealthArea, DailyHealthReport, PeriodicHealthSnapshot } from '@/lib/daily-store-health'

type Props = { storeId: number; report: DailyHealthReport | null; weeklySnapshot: PeriodicHealthSnapshot | null; monthlySnapshot: PeriodicHealthSnapshot | null; needsPin: boolean; canConfigure: boolean }

const modules: Array<{ id: DailyHealthArea; label: string; icon: typeof CircleDollarSign }> = [
  { id: 'financeiro', label: 'Financeiro', icon: CircleDollarSign },
  { id: 'operacao', label: 'Operação', icon: ClipboardCheck },
  { id: 'relacionamento', label: 'Relacionamento', icon: Handshake },
  { id: 'cadastros', label: 'Cadastros', icon: ScanSearch },
]

function money(value: number | null) {
  if (value === null) return ''
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

function HighlightedNarrative({ text, alerts = [] }: { text: string; alerts?: DailyHealthAlert[] }) {
  const priorities = new Map(alerts.map((alert) => [alert.id, alert.priority]))
  const parts = text.split(/(\[\[highlight:[a-z0-9-]+\]\][\s\S]*?\[\[\/highlight\]\])/gi)
  return <>{parts.map((part, index) => {
    const match = part.match(/^\[\[highlight:([a-z0-9-]+)\]\]([\s\S]*?)\[\[\/highlight\]\]$/i)
    if (!match) return part
    const priority = priorities.get(match[1])
    if (!priority || priority === 'informativo') return match[2]
    return <strong key={`${part}-${index}`} className={priority === 'critico' ? 'text-rose-300' : 'text-amber-200'}>{match[2]}</strong>
  })}</>
}

function AmountRow({ label, amounts, total = false, showHistorical }: { label: string; amounts: DailyHealthAmountComparison; total?: boolean; showHistorical: boolean }) {
  return <tr className={total ? 'border-t border-white/15 text-white' : 'border-t border-white/5 text-slate-300'}>
    <th scope="row" className={`py-1 pr-4 text-left text-sm ${total ? 'font-bold' : 'font-medium'}`}>{label}</th>
    <td className={`py-1 text-right text-sm ${total ? 'font-bold' : ''}`}>{money(amounts.yesterday)}</td>
    <td className={`py-1 text-right text-sm ${total ? 'font-bold' : ''}`}>{money(amounts.monthToDate)}</td>
    {showHistorical && <td className={`py-1 pl-4 text-right text-sm ${total ? 'font-bold' : 'text-slate-400'}`}>{money(amounts.samePeriodLastYear)}</td>}
  </tr>
}

function SummaryTable({ title, rows }: { title: string; rows: Array<{ label: string; amounts: DailyHealthAmountComparison; total?: boolean }> }) {
  const showHistorical = rows.some((row) => row.amounts.samePeriodLastYear !== null)
  return <section className="border border-white/10 bg-black/20 px-4 py-2.5 sm:px-5" aria-label={title}>
    <h2 className="text-sm font-bold text-white">{title}</h2>
    <div className="mt-1 overflow-x-auto">
      <table className={`w-full border-collapse ${showHistorical ? 'min-w-[610px]' : 'min-w-[360px]'}`}>
        <thead><tr className="text-xs font-medium text-slate-400"><th className="pb-3 text-left">&nbsp;</th><th className="pb-3 text-right">Ontem</th><th className="pb-3 text-right">Mes ate ontem</th>{showHistorical && <th className="pb-3 pl-4 text-right">Mes ate esta data no ano passado</th>}</tr></thead>
        <tbody>{rows.map((row) => <AmountRow key={row.label} {...row} showHistorical={showHistorical} />)}</tbody>
      </table>
    </div>
  </section>
}

function moduleNarrative(report: DailyHealthReport, area: DailyHealthArea) {
  const narratives = report.metrics.areaNarratives
  if (area === 'financeiro') return narratives?.financeiro || null
  if (area === 'operacao') return narratives?.operacao || null
  if (area === 'relacionamento') return narratives?.relacionamento || null
  return narratives?.cadastros || null
}

function PeriodicSnapshotView({ snapshot, cadence, onOpenProgramUsage }: { snapshot: PeriodicHealthSnapshot | null; cadence: 'weekly' | 'monthly'; onOpenProgramUsage: () => void }) {
  const usageButton = cadence === 'monthly' ? <button type="button" onClick={onOpenProgramUsage} className="inline-flex h-9 items-center gap-2 border border-emerald-300/30 bg-emerald-300/[0.06] px-3 text-xs font-semibold text-emerald-100 transition-colors hover:border-emerald-200/50 hover:bg-emerald-300/10"><Gauge className="h-4 w-4" />Sub-uso do programa</button> : null
  if (!snapshot) {
    const isWeekly = cadence === 'weekly'
    return <section className="mt-8 max-w-5xl border border-white/10 bg-black/20 px-5 py-6"><div className="flex flex-wrap items-center justify-between gap-4"><h2 className="text-lg font-bold text-white">{isWeekly ? 'Varredura semanal' : 'Varredura mensal'}</h2>{usageButton}</div><p className="mt-3 text-sm leading-6 text-slate-300">{isWeekly ? 'Ainda não existe uma varredura semanal salva. A primeira será disponibilizada na próxima segunda-feira.' : 'Ainda não existe uma varredura mensal salva. A primeira será disponibilizada no primeiro dia do próximo mês.'}</p></section>
  }
  const period = `${new Date(`${snapshot.periodStart}T12:00:00`).toLocaleDateString('pt-BR')} a ${new Date(`${snapshot.periodEnd}T12:00:00`).toLocaleDateString('pt-BR')}`
  const alerts = snapshot.alerts
  return <section className="mt-8 max-w-6xl" aria-label={cadence === 'weekly' ? 'Varredura semanal' : 'Varredura mensal'}><div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-5"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-200">Snapshot salvo</p><h2 className="mt-2 text-2xl font-black text-white">{cadence === 'weekly' ? 'Varredura semanal' : 'Varredura mensal'}</h2><p className="mt-2 text-sm text-slate-400">Período: {period}. Esta leitura é somente consulta.</p></div>{usageButton}</div><p className="mt-6 max-w-6xl text-lg leading-8 text-slate-100">{snapshot.narrative}</p>{alerts.length ? <div className="mt-6 space-y-3">{alerts.map((alert: DailyHealthAlert) => <article key={alert.id} className={`border-l-4 bg-black/20 px-5 py-4 ${alert.priority === 'critico' ? 'border-rose-400' : 'border-amber-300'}`}><p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">{alert.area}</p><h3 className="mt-1 text-base font-bold text-white">{alert.presentation?.title || alert.title}</h3><p className="mt-1 text-sm leading-6 text-slate-200">{alert.presentation?.detail || alert.detail}</p></article>)}</div> : <div className="mt-6 flex items-center gap-3 text-sm text-emerald-100"><CheckCircle2 className="h-4 w-4" />Nenhum ponto de atenção foi consolidado neste período.</div>}</section>
}

export default function DailyHealthClient({ storeId, report, weeklySnapshot, monthlySnapshot, needsPin }: Props) {
  const router = useRouter()
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [needsRefreshPin, setNeedsRefreshPin] = useState(false)
  const [selectedCadence, setSelectedCadence] = useState<'daily' | 'weekly' | 'monthly'>('daily')
  const [expandedAreas, setExpandedAreas] = useState<Partial<Record<DailyHealthArea, boolean>>>({})
  const [selectedOperationalAlert, setSelectedOperationalAlert] = useState<DailyHealthAlert | null>(null)
  const [selectedRelationshipAlert, setSelectedRelationshipAlert] = useState<DailyHealthAlert | null>(null)
  const [selectedDataQualityAlert, setSelectedDataQualityAlert] = useState<DailyHealthAlert | null>(null)
  const [dataQualityChanged, setDataQualityChanged] = useState(false)
  const [programUsageOpen, setProgramUsageOpen] = useState(false)
  const [monthlyPreview, setMonthlyPreview] = useState<PeriodicHealthSnapshot | null>(null)

  const refreshReport = async () => {
    setRefreshing(true)
    setRefreshError(null)
    try {
      const response = await fetch('/api/daily-health', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ storeId, monthlyPreview: storeId === 1 && selectedCadence === 'monthly' }) })
      const data = await response.json()
      if (response.status === 403) {
        setNeedsRefreshPin(true)
        return
      }
      if (!response.ok) throw new Error(data.error || 'Nao foi possivel atualizar o resumo.')
      if (storeId === 1 && selectedCadence === 'monthly') setMonthlyPreview(data.monthlySnapshot || null)
      router.refresh()
    } catch (error) {
      setRefreshError(error instanceof Error ? error.message : 'Nao foi possivel atualizar o resumo.')
    } finally {
      setRefreshing(false)
    }
  }

  if (needsPin) return <main className="min-h-full p-6 text-white lg:p-10"><div className="mx-auto max-w-7xl"><h1 className="text-3xl font-black">Pontos de Atenção</h1><p className="mt-3 text-sm text-slate-300">Aguardando a confirmação do PIN de um gerente.</p></div><EmployeeAuthModal storeId={storeId} isOpen onClose={() => router.back()} onSuccess={() => router.refresh()} title="Abrir Pontos de Atenção" description="Informe o PIN de um gerente para visualizar os pontos de atenção." purpose="daily_health_access" /></main>

  const referenceDate = report ? new Date(`${report.reportDate}T12:00:00`).toLocaleDateString('pt-BR') : null
  const summary = report?.metrics.salesSummary

  return <main className="min-h-full p-6 text-white lg:p-10"><div className="mx-auto max-w-7xl">
    <header className="flex flex-wrap items-end justify-between gap-5 border-b border-white/10 pb-6"><div><h1 className="text-3xl font-black">Pontos de Atenção</h1><p className="mt-1 text-sm text-slate-300">{referenceDate ? `Referência: ${referenceDate}` : 'Resumo diário ainda não gerado.'}</p></div><div className="flex items-center gap-3"><div className="flex items-center border border-white/10 bg-black/20" role="tablist" aria-label="Período dos pontos de atenção">{([['daily', 'Diário'], ['weekly', 'Semanal'], ['monthly', 'Mensal']] as const).map(([cadence, label]) => <button key={cadence} type="button" onClick={() => setSelectedCadence(cadence)} role="tab" aria-selected={selectedCadence === cadence} className={`px-3 py-2 text-xs font-semibold transition-colors ${selectedCadence === cadence ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}>{label}</button>)}</div><button type="button" onClick={refreshReport} disabled={refreshing} aria-label="Atualizar pontos de atenção" title="Atualizar pontos de atenção" className="inline-flex h-9 w-9 items-center justify-center border border-white/15 bg-white/5 text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50">{refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}</button></div></header>
    {refreshError && <p className="mt-4 text-sm text-rose-200">{refreshError}</p>}
    {selectedCadence === 'daily' ? <>
    {summary ? <div className="mt-7 grid gap-4 xl:grid-cols-2"><SummaryTable title="Vendas" rows={[{ label: 'A vista', amounts: summary.sales.cash }, { label: 'A prazo', amounts: summary.sales.credit }, { label: 'Total', amounts: summary.sales.total, total: true }]} /><SummaryTable title="Valores que entraram" rows={[{ label: 'Vendas', amounts: summary.receipts.sales }, { label: 'Parcelas', amounts: summary.receipts.installments }, { label: 'Total', amounts: summary.receipts.total, total: true }]} /></div> : report ? <p className="mt-6 text-sm text-slate-400">O resumo de vendas e caixa sera incluido na proxima geracao.</p> : null}
    <section className="mt-10 max-w-5xl" aria-label="Pontos de atenção"><h2 className="text-lg font-bold text-white">Por favor dê atenção aos seguintes pontos:</h2>
      {!report ? <p className="mt-4 border border-white/10 bg-black/20 px-5 py-5 text-sm text-slate-300">O resumo sera exibido assim que a primeira geracao for concluida.</p> : <div className="mt-5 space-y-10">{modules.map((module) => {
        const alerts = report.alerts.filter((alert) => alert.area === module.id && (alert.lifecycle?.show ?? true))
        const narrative = moduleNarrative(report, module.id)
        const resolved = report.metrics.alertLifecycle?.[module.id]?.resolvedCount || 0
        const isExpanded = expandedAreas[module.id] === true
        return <section key={module.id} className="border-t border-white/10 pt-6" aria-label={module.label}>
          <button type="button" onClick={() => setExpandedAreas((current) => ({ ...current, [module.id]: !isExpanded }))} aria-expanded={isExpanded} aria-label="Expandir ou recolher módulo" className="group flex w-full cursor-pointer items-center justify-between gap-4 rounded-sm py-2 text-left transition-colors hover:bg-white/5">
            <span className="flex items-center gap-3 text-xl font-bold text-white"><module.icon className="h-6 w-6 text-emerald-200" strokeWidth={2} />{module.label}</span>
            <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400 group-hover:text-white">{isExpanded ? 'Fechar' : 'Abrir'}{isExpanded ? <ChevronUp className="h-5 w-5 shrink-0 text-slate-200" /> : <ChevronDown className="h-5 w-5 shrink-0 text-slate-200" />}</span>
          </button>
          {isExpanded && <div>
            {narrative && <p className="mt-3 max-w-6xl text-lg leading-8 text-slate-100"><HighlightedNarrative text={narrative} alerts={alerts} /></p>}
            {module.id === 'relacionamento' && report.metrics.areaNarratives?.relacionamentoConcern && <p className="mt-4 border-l-2 border-amber-300 pl-4 text-sm font-medium leading-6 text-amber-100"><HighlightedNarrative text={report.metrics.areaNarratives.relacionamentoConcern} alerts={alerts} /></p>}
            {alerts.length ? <div className="mt-5 grid gap-3 md:grid-cols-2">{alerts.map((alert) => {
              const presentation = alert.presentation || { title: alert.title, detail: alert.detail }
              const canInspect = module.id === 'operacao' && alert.records.type === 'os' && alert.records.ids.length > 0
              const canInspectRelationship = module.id === 'relacionamento' && alert.records.type === 'pos-venda' && alert.records.ids.length > 0
              const canInspectDataQuality = module.id === 'cadastros' && ['duplicate-customers', 'duplicate-products', 'used-products-without-cost', 'stale-open-sales'].includes(alert.id)
              return <article key={alert.id} className={`border-l-4 bg-black/20 px-5 py-4 ${alert.priority === 'critico' ? 'border-rose-400' : 'border-amber-300'}`}>
                <h4 className="text-base font-bold text-white">{presentation.title}</h4>
                <p className="mt-1 text-sm leading-6 text-slate-200"><HighlightedNarrative text={presentation.detail} alerts={[alert]} /></p>
                {canInspect ? <button type="button" onClick={() => setSelectedOperationalAlert(alert)} className="mt-4 inline-flex h-9 items-center gap-2 border border-white/15 px-3 text-xs font-semibold text-slate-100 transition-colors hover:border-emerald-300/40 hover:bg-emerald-300/10 hover:text-white"><List className="h-4 w-4" />Ver casos</button> : null}
                {canInspectRelationship ? <button type="button" onClick={() => setSelectedRelationshipAlert(alert)} className="mt-4 inline-flex h-9 items-center gap-2 border border-white/15 px-3 text-xs font-semibold text-slate-100 transition-colors hover:border-emerald-300/40 hover:bg-emerald-300/10 hover:text-white"><List className="h-4 w-4" />{alert.id === 'post-sales-human-review' ? 'Ver respostas' : 'Ver casos'}</button> : null}
                {canInspectDataQuality ? <button type="button" onClick={() => { setDataQualityChanged(false); setSelectedDataQualityAlert(alert) }} className="mt-4 inline-flex h-9 items-center gap-2 border border-white/15 px-3 text-xs font-semibold text-slate-100 transition-colors hover:border-emerald-300/40 hover:bg-emerald-300/10 hover:text-white"><List className="h-4 w-4" />{alert.id === 'stale-open-sales' ? 'Ver casos' : alert.id === 'used-products-without-cost' ? 'Corrigir lote de 10' : 'Revisar lote de 10'}</button> : null}
              </article>
            })}</div> : <div className="mt-4 flex items-center gap-3 text-sm text-emerald-100"><CheckCircle2 className="h-4 w-4 shrink-0" />{resolved ? `${resolved} pendencia${resolved === 1 ? '' : 's'} foi${resolved === 1 ? '' : 'ram'} resolvida${resolved === 1 ? '' : 's'} desde ontem.` : 'Nenhuma mudanca material neste modulo desde ontem.'}</div>}
          </div>}
        </section>
      })}</div>}
      {report?.sourceFailures.length ? <p className="mt-5 text-xs text-slate-500">Dados indisponiveis: {report.sourceFailures.join(', ')}.</p> : null}
    </section>
    </> : <PeriodicSnapshotView snapshot={selectedCadence === 'weekly' ? weeklySnapshot : (monthlyPreview || monthlySnapshot)} cadence={selectedCadence} onOpenProgramUsage={() => setProgramUsageOpen(true)} />}
    {selectedOperationalAlert ? <OperationalCasesModal storeId={storeId} alert={selectedOperationalAlert} onClose={() => setSelectedOperationalAlert(null)} /> : null}
    {selectedRelationshipAlert ? <RelationshipCasesModal storeId={storeId} alert={selectedRelationshipAlert} onClose={() => setSelectedRelationshipAlert(null)} /> : null}
    {selectedDataQualityAlert ? <DataQualityCasesModal storeId={storeId} alert={selectedDataQualityAlert} onChanged={() => setDataQualityChanged(true)} onClose={() => { setSelectedDataQualityAlert(null); if (dataQualityChanged) void refreshReport() }} /> : null}
    {programUsageOpen ? <ProgramUsageModal snapshot={(monthlyPreview || monthlySnapshot)?.programUsage || null} onClose={() => setProgramUsageOpen(false)} /> : null}
    <EmployeeAuthModal storeId={storeId} isOpen={needsRefreshPin} onClose={() => setNeedsRefreshPin(false)} onSuccess={() => { setNeedsRefreshPin(false); void refreshReport() }} title="Atualizar Pontos de Atenção" description="Informe o PIN de um gerente para consultar os pontos de atenção salvos." purpose="daily_health_access" />
  </div></main>
}
