import type { Metadata } from 'next'
import { Clock3, Eye, FileText, ImageIcon, ShieldCheck } from 'lucide-react'
import { loadPublicTowerCustomerReport } from '@/lib/server/tower-customer-report-share'
import { TowerReportLensSimulation, type TowerReportLensGeometry } from '@/components/tower/TowerReportLensSimulation'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Relatório Neosmart',
  robots: { index: false, follow: false, nocache: true },
}

type UnknownRecord = Record<string, unknown>
const SECTION_LABELS: Record<string, string> = {
  customer: 'Seu atendimento', prescription: 'Sua receita', lensRecommendations: 'Lentes para comparar',
  decisionCriteria: 'O que orientou a indicação', heatmap: 'Seu comportamento visual', measurement: 'Suas medidas',
  visagismo: 'Sua escolha de armação', thickness: 'Como fica a sua lente',
}
const VALUE_LABELS: Record<string, string> = { sim: 'Sim', nao: 'Não', multifocal: 'Multifocal', bifocal: 'Bifocal', completed: 'Concluído' }

function record(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : {}
}
function lensGeometry(value: unknown): TowerReportLensGeometry | null {
  const source = record(value)
  const points = (input: unknown, includeThickness: boolean) => Array.isArray(input) ? input.map((item) => {
    const point = record(item)
    const x = Number(point.x); const y = Number(point.y); const thickness = Number(point.thickness)
    if (!Number.isFinite(x) || !Number.isFinite(y) || (includeThickness && !Number.isFinite(thickness))) return null
    return includeThickness ? { x, y, thickness } : { x, y }
  }).filter((point): point is { x: number; y: number; thickness?: number } => Boolean(point)) : []
  const contour = points(source.contour, false).map(({ x, y }) => ({ x, y }))
  const rim = points(source.rim, true).map(({ x, y, thickness }) => ({ x, y, thickness: thickness! }))
  return contour.length >= 3 && rim.length >= 3 ? { contour, rim } : null
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
function assetCaption(kind: unknown) {
  if (kind === 'visagismo_final') return 'Escolha final do Visagismo'
  if (kind === 'visagismo_analysis' || kind === 'visagismo') return 'Análise de Visagismo'
  if (kind === 'measurement_front_annotated') return 'Medida frontal anotada'
  if (kind === 'measurement_profile_annotated') return 'Medida de perfil anotada'
  if (kind === 'measurement_front') return 'Medida frontal original'
  if (kind === 'measurement_profile') return 'Medida de perfil original'
  if (kind === 'heatmap') return 'Mapa de calor'
  return 'Registro visual do atendimento'
}

function Values({ value }: { value: unknown }) {
  const entries = Object.entries(record(value)).filter(([, item]) => scalar(item))
  if (!entries.length) return <p className="text-sm text-slate-500">Informação não disponível.</p>
  return <dl className="grid gap-2 sm:grid-cols-2">{entries.map(([key, item]) => <div key={key} className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2.5"><dt className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label(key)}</dt><dd className="mt-1 text-sm font-semibold text-slate-700">{scalar(item)}</dd></div>)}</dl>
}

function LensRecommendationContent({ snapshot }: { snapshot: UnknownRecord }) {
  const recommendations = Array.isArray(snapshot.lensRecommendations)
    ? snapshot.lensRecommendations.map(record)
    : []
  const support = record(snapshot.lensDecisionSupport)
  const supportOptions = Array.isArray(support.options) ? support.options.map(record) : []
  if (!recommendations.length) return <p className="text-sm text-slate-500">Nenhuma lente sugerida.</p>
  return <div className="space-y-2">{scalar(support.sellerOpening) && <p className="rounded-xl bg-violet-50 p-3 text-sm leading-6 text-violet-950">{scalar(support.sellerOpening)}</p>}{recommendations.map((item, index) => {
    const narrative = supportOptions.find((option) => scalar(option.configKey) === scalar(item.configKey)) ?? supportOptions[index] ?? {}
    const aiText = scalar(narrative.sellerArgument) || scalar(narrative.whyThisLens) || scalar(narrative.headline)
    const details = [scalar(item.offerLabel), scalar(item.treatmentName), aiText || scalar(item.commercialSummary)].filter(Boolean)
    return <div key={index} className={`rounded-2xl p-4 ${index === 0 ? 'border border-cyan-200 bg-cyan-50' : 'border border-slate-100 bg-slate-50'}`}><p className="text-[10px] font-black uppercase tracking-[.16em] text-cyan-700">{index === 0 ? 'Sua primeira opção' : `Alternativa ${index + 1}`}</p><p className="mt-1 font-black text-slate-900">{scalar(item.familyName) || 'Lente indicada'}</p>{details.length > 0 && <p className="mt-1 text-sm leading-6 text-slate-600">{details.join(' · ')}</p>}</div>
  })}</div>
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
    return <LensRecommendationContent snapshot={snapshot} />
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
    const thickness = record(snapshot.thickness); const lens = record(thickness.lens); const frame = record(thickness.frame); const geometry = lensGeometry(thickness.geometry)
    const minimum = Number(lens.minimumThicknessMm); const maximum = Number(lens.maximumThicknessMm); const width = Number(frame.widthMm); const height = Number(frame.heightMm)
    return <div><Values value={{ indice: lens.index, espessuraMinima: lens.minimumThicknessMm ? `${scalar(lens.minimumThicknessMm)} mm` : '', espessuraMaxima: lens.maximumThicknessMm ? `${scalar(lens.maximumThicknessMm)} mm` : '', armacao: frame.name, montagem: frame.mount }} />{[minimum, maximum, width, height].every(Number.isFinite) && <TowerReportLensSimulation minimumThicknessMm={minimum} maximumThicknessMm={maximum} widthMm={width} heightMm={height} geometry={geometry} />}</div>
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
  const customer = record(snapshot.customer)
  return <main className="min-h-screen bg-[radial-gradient(circle_at_12%_0%,rgba(34,211,238,.18),transparent_28%),#f8fafc] px-4 py-6 text-slate-900 sm:py-10"><div className="mx-auto max-w-4xl"><header className="overflow-hidden rounded-[30px] bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 p-6 text-white shadow-2xl shadow-cyan-950/20 sm:p-8"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.18em] text-cyan-200">Neosmart · experiência óptica</p><h1 className="mt-3 text-3xl font-black">{title}</h1><p className="mt-2 text-sm text-slate-300">{scalar(customer.fullName) ? `Olá, ${scalar(customer.fullName)}.` : 'Um resumo da sua experiência na ótica.'}</p><p className="mt-4 text-xs font-bold text-cyan-100">Disponível até {date(report.expiresAt)}</p></div><FileText className="shrink-0 text-cyan-200" size={38} /></div></header>
    <section className="mt-5 rounded-3xl border border-cyan-100 bg-white p-5 shadow-sm"><p className="text-xs font-black uppercase tracking-[.16em] text-cyan-700">O resultado da sua experiência</p><p className="mt-2 text-sm leading-6 text-slate-600">Aqui estão as descobertas, escolhas e registros que ajudam você a conversar com segurança sobre a melhor solução para o seu olhar.</p></section>
    <div className="mt-5 space-y-4">{selectedSections.map((id) => <section key={id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><p className="text-[10px] font-black uppercase tracking-[.16em] text-slate-400">Experiência personalizada</p><h2 className="mt-1.5 mb-4 flex items-center gap-2 text-lg font-black"><Eye size={18} className="text-cyan-700" />{SECTION_LABELS[id]}</h2><SectionContent id={id} snapshot={snapshot} /></section>)}
      {report.assets.length > 0 && <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><p className="text-[10px] font-black uppercase tracking-[.16em] text-slate-400">Registros da experiência</p><h2 className="mt-1.5 mb-4 flex items-center gap-2 text-lg font-black"><ImageIcon size={18} className="text-cyan-700" />Imagens que comprovam suas escolhas</h2><div className="grid gap-3 sm:grid-cols-3">{report.assets.map((asset) => <figure key={asset!.id} className="overflow-hidden rounded-2xl border border-slate-100 bg-slate-50"><img src={asset!.url} alt={assetCaption(asset!.kind)} className="aspect-[4/3] h-auto w-full object-cover" /><figcaption className="p-3 text-xs font-medium text-slate-500">{assetCaption(asset!.kind)}</figcaption></figure>)}</div></section>}
    </div><footer className="mt-6 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs leading-5 text-emerald-900"><ShieldCheck className="mt-0.5 shrink-0" size={18} /><p>Este resultado foi compartilhado temporariamente pela sua ótica. As imagens utilizam acesso privado e expiram junto com o relatório.</p></footer></div></main>
}
