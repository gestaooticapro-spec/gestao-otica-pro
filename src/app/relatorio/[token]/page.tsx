import type { Metadata } from 'next'
import { Clock3, Eye, FileText, ImageIcon, ShieldCheck } from 'lucide-react'
import { loadPublicTowerCustomerReport } from '@/lib/server/tower-customer-report-share'
import { TowerReportLensSimulation } from '@/components/tower/TowerReportLensSimulation'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Relatório Neosmart',
  robots: { index: false, follow: false, nocache: true },
}

type UnknownRecord = Record<string, unknown>
const SECTION_LABELS: Record<string, string> = {
  customer: 'Cliente', prescription: 'Receita e grau', lensRecommendations: 'Lentes sugeridas',
  decisionCriteria: 'Critérios da indicação', heatmap: 'Campo visual', measurement: 'Medidas',
  visagismo: 'Visagismo', thickness: 'Espessura da lente',
}
const VALUE_LABELS: Record<string, string> = { sim: 'Sim', nao: 'Não', multifocal: 'Multifocal', bifocal: 'Bifocal', completed: 'Concluído' }

function record(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : {}
}
function scalar(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não'
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(2)
  if (typeof value === 'string') return VALUE_LABELS[value] ?? value.replace(/_/g, ' ')
  if (Array.isArray(value)) return value.map(scalar).filter(Boolean).join(', ')
  return ''
}
function label(value: string) {
  const spaced = value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}
function date(value: string) {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(parsed)
}
function degree(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? `${parsed >= 0 ? '+' : ''}${parsed.toFixed(2)}` : '—'
}

function Values({ value }: { value: unknown }) {
  const entries = Object.entries(record(value)).filter(([, item]) => scalar(item))
  if (!entries.length) return <p className="text-sm text-slate-500">Informação não disponível.</p>
  return <dl className="grid gap-2 sm:grid-cols-2">{entries.map(([key, item]) => <div key={key} className="rounded-xl bg-slate-50 px-3 py-2"><dt className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label(key)}</dt><dd className="mt-1 text-sm font-semibold text-slate-700">{scalar(item)}</dd></div>)}</dl>
}

function SectionContent({ id, snapshot }: { id: string; snapshot: UnknownRecord }) {
  if (id === 'customer') {
    const customer = record(snapshot.customer)
    return <div><p className="text-lg font-black text-slate-900">{scalar(customer.fullName) || 'Cliente'}</p>{scalar(customer.mobilePhone) && <p className="mt-1 text-sm text-slate-500">{scalar(customer.mobilePhone)}</p>}</div>
  }
  if (id === 'prescription') {
    const prescription = record(snapshot.prescription)
    return <div className="grid gap-3 sm:grid-cols-2">{(['od', 'oe'] as const).map((eye) => { const values = record(prescription[eye]); return <div key={eye} className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-black uppercase text-violet-700">{eye.toUpperCase()}</p><p className="mt-2 text-sm text-slate-700">Esf. <strong>{degree(values.sphere)}</strong> · Cil. <strong>{degree(values.cylinder)}</strong> · Eixo <strong>{scalar(values.axis) || '—'}°</strong></p></div> })}<p className="text-sm text-slate-600 sm:col-span-2">Adição: <strong>{degree(prescription.addition)}</strong></p></div>
  }
  if (id === 'lensRecommendations') {
    const recommendations = Array.isArray(snapshot.lensRecommendations) ? snapshot.lensRecommendations.map(record) : []
    return recommendations.length ? <div className="space-y-2">{recommendations.map((item, index) => <div key={index} className="rounded-xl bg-slate-50 p-3"><p className="font-black text-slate-900">{scalar(item.familyName) || `Opção ${index + 1}`}</p><p className="mt-1 text-sm text-slate-500">{[scalar(item.offerLabel), scalar(item.treatmentName), scalar(item.commercialSummary)].filter(Boolean).join(' · ')}</p></div>)}</div> : <p className="text-sm text-slate-500">Nenhuma lente sugerida.</p>
  }
  if (id === 'decisionCriteria') return <Values value={snapshot.decisionCriteria} />
  if (id === 'heatmap') return <Values value={record(snapshot.heatmap).summary} />
  if (id === 'measurement') {
    const measurement = record(snapshot.measurement)
    return <div className="space-y-3"><Values value={{ tipo: measurement.lensMode, referencia: measurement.referenceMm ? `${scalar(measurement.referenceMm)} mm` : '' }} /><Values value={measurement.frontMeasurements} /><Values value={measurement.profileMeasurements} /></div>
  }
  if (id === 'visagismo') {
    const visagismo = record(snapshot.visagismo); const frame = record(visagismo.selectedFrame); const analysis = record(visagismo.analysis)
    return <div className="space-y-3"><Values value={{ formatoDoRosto: analysis.faceShape, tomDePele: visagismo.detectedSkinTone }} />{scalar(frame.name) && <p className="rounded-xl bg-violet-50 p-3 text-sm text-violet-950">Armação selecionada: <strong>{scalar(frame.name)}</strong></p>}</div>
  }
  if (id === 'thickness') {
    const thickness = record(snapshot.thickness); const lens = record(thickness.lens); const frame = record(thickness.frame)
    const minimum = Number(lens.minimumThicknessMm); const maximum = Number(lens.maximumThicknessMm); const width = Number(frame.widthMm); const height = Number(frame.heightMm)
    return <div><Values value={{ indice: lens.index, espessuraMinima: lens.minimumThicknessMm ? `${scalar(lens.minimumThicknessMm)} mm` : '', espessuraMaxima: lens.maximumThicknessMm ? `${scalar(lens.maximumThicknessMm)} mm` : '', armacao: frame.name, montagem: frame.mount }} />{[minimum, maximum, width, height].every(Number.isFinite) && <TowerReportLensSimulation minimumThicknessMm={minimum} maximumThicknessMm={maximum} widthMm={width} heightMm={height} />}</div>
  }
  return null
}

export default async function PublicTowerReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const report = await loadPublicTowerCustomerReport(token)
  if (!report) return <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6"><div className="max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl"><Clock3 className="mx-auto text-slate-400" size={38} /><h1 className="mt-4 text-2xl font-black text-slate-900">Relatório indisponível</h1><p className="mt-2 text-sm leading-6 text-slate-500">Este link expirou, foi revogado ou não existe mais.</p></div></main>

  const envelope = record(report.snapshot)
  const selectedSections = Array.isArray(envelope.selectedSections) ? envelope.selectedSections.filter((item): item is string => typeof item === 'string' && Boolean(SECTION_LABELS[item])) : []
  const snapshot = record(envelope.snapshot)
  const title = report.audience === 'retailer_export' ? 'Relatório técnico do atendimento' : 'Seu relatório Neosmart'
  return <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900"><div className="mx-auto max-w-4xl"><header className="overflow-hidden rounded-3xl bg-gradient-to-br from-violet-800 to-fuchsia-700 p-6 text-white shadow-xl sm:p-8"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.18em] text-violet-100">MB Optical · Neosmart</p><h1 className="mt-3 text-3xl font-black">{title}</h1><p className="mt-2 text-sm text-violet-100">Disponível até {date(report.expiresAt)}</p></div><FileText className="shrink-0 text-violet-200" size={38} /></div></header>
    <div className="mt-5 space-y-4">{selectedSections.map((id) => <section key={id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><h2 className="mb-4 flex items-center gap-2 text-lg font-black"><Eye size={18} className="text-violet-700" />{SECTION_LABELS[id]}</h2><SectionContent id={id} snapshot={snapshot} /></section>)}
      {report.assets.length > 0 && <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><h2 className="mb-4 flex items-center gap-2 text-lg font-black"><ImageIcon size={18} className="text-violet-700" />Fotos selecionadas</h2><div className="grid gap-3 sm:grid-cols-3">{report.assets.map((asset) => <figure key={asset!.id} className="overflow-hidden rounded-2xl bg-slate-100"><img src={asset!.url} alt="Registro visual do atendimento" className="aspect-[4/3] h-auto w-full object-cover" /><figcaption className="p-3 text-xs text-slate-500">Registro protegido do atendimento</figcaption></figure>)}</div></section>}
    </div><footer className="mt-6 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs leading-5 text-emerald-900"><ShieldCheck className="mt-0.5 shrink-0" size={18} /><p>Este relatório foi compartilhado temporariamente pela ótica. As imagens utilizam acesso privado e expiram com o relatório.</p></footer></div></main>
}
