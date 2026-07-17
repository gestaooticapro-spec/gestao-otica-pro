'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, HelpCircle, Maximize2, Minimize2, MonitorUp, RotateCcw, Ruler, Search, SlidersHorizontal, UserRound, X } from 'lucide-react'
import { closeTowerClientScreen, openTowerClientScreen } from '@/lib/tower/client-screen'
import { searchCustomersByName } from '@/lib/actions/vendas.actions'
import { saveTowerSessionPrescription, type TowerPrescriptionSnapshot, type TowerSessionContext } from '@/lib/actions/tower-session.actions'
import type { GlobalVisagismoFrameTemplate } from '@/lib/actions/visagismo.actions'
import { LensPhysicalView } from '@/components/tower/LensPhysicalView'

type Mount = 'aro' | 'fio' | 'parafusado'
type Shape = 'arredondada' | 'quadrada'
type TemplateId = 'miopia' | 'miopiaAlta' | 'astigmatismo' | 'hipermetropia' | 'hipermetropiaAlta' | 'real'
type DidacticTemplateId = Exclude<TemplateId, 'real'>
type Eye = 'od' | 'oe'

type LensState = {
  template: TemplateId
  eye: Eye
  sphere: number
  cylinder: number
  axis: number
  index: number
  baseCurve: number
  frameScale: number
  frameTemplateId: string | null
  frameName: string
  frameWidthMm: number
  frameHeightMm: number
  frameContour: Array<{ x: number; y: number }> | null
  rotationAngle: number
  mount: Mount
  shape: Shape
  focalX: number
  focalY: number
  calibrationScale: number
  displayScale: 1 | 1.8
  showCalibrator: boolean
}

type LensMessage =
  | { type: 'lens-state'; state: LensState }
  | { type: 'lens-client-ready' }

type Sample = { x: number; y: number; thickness: number; displayFrontSag: number; withinLens: boolean }

const PX_PER_MM = 4.1
// Referência gráfica fixa: a face frontal permanece ancorada na base +4.
// O índice continua participando do cálculo de espessura, mas não faz a lente
// inteira "respirar" quando o cliente está comparando materiais.
const MOUNTS: Record<Mount, { label: string; edge: number; center: number }> = {
  aro: { label: 'Aro fechado', edge: 1.1, center: 1.2 },
  fio: { label: 'Fio de nylon', edge: 1.8, center: 1.2 },
  parafusado: { label: 'Parafusada', edge: 1.5, center: 1.8 },
}

const TEMPLATES: Record<DidacticTemplateId, { label: string; sphere: number; cylinder: number; axis: number }> = {
  miopia: { label: 'Miopia com astigmatismo', sphere: -3, cylinder: -2, axis: 90 },
  miopiaAlta: { label: 'Miopia alta', sphere: -6, cylinder: -2.5, axis: 90 },
  astigmatismo: { label: 'Astigmatismo forte', sphere: 0, cylinder: -4, axis: 90 },
  hipermetropia: { label: 'Hipermetropia com astigmatismo', sphere: 3.5, cylinder: -2, axis: 90 },
  hipermetropiaAlta: { label: 'Hipermetropia alta', sphere: 5.5, cylinder: -1, axis: 90 },
}

const DEFAULT_STATE: LensState = {
  template: 'miopia',
  eye: 'od',
  ...TEMPLATES.miopia,
  index: 1.67,
  baseCurve: 4,
  frameScale: 100,
  frameTemplateId: null,
  frameName: 'Oval de referência',
  frameWidthMm: 52,
  frameHeightMm: 38,
  frameContour: null,
  rotationAngle: 0,
  mount: 'aro',
  shape: 'arredondada',
  focalX: 0,
  focalY: 0,
  calibrationScale: 100,
  displayScale: 1,
  showCalibrator: false,
}

function localPower(sphere: number, cylinder: number, axis: number, angle: number) {
  return sphere + cylinder * Math.sin(angle - axis * Math.PI / 180) ** 2
}

function signedSag(power: number, radius: number, index: number) {
  if (Math.abs(power) < 0.01) return 0
  const curveRadius = ((index - 1) * 1000) / power
  const radiusAbs = Math.abs(curveRadius)
  if (radius >= radiusAbs) return 0
  return curveRadius - Math.sign(curveRadius) * Math.sqrt(radiusAbs ** 2 - radius ** 2)
}

function rotatePoint(point: { x: number; y: number }, angleDegrees: number) {
  const angle = angleDegrees * Math.PI / 180
  return {
    x: point.x * Math.cos(angle) - point.y * Math.sin(angle),
    y: point.x * Math.sin(angle) + point.y * Math.cos(angle),
  }
}

function rotateAround(point: { x: number; y: number }, center: { x: number; y: number }, angleDegrees: number) {
  const rotated = rotatePoint({ x: point.x - center.x, y: point.y - center.y }, angleDegrees)
  return { x: center.x + rotated.x, y: center.y + rotated.y }
}

function pointInsideContour(x: number, y: number, contour: Array<{ x: number; y: number }>) {
  let insidePolygon = false
  for (let current = 0, previous = contour.length - 1; current < contour.length; previous = current++) {
    const a = contour[current]
    const b = contour[previous]
    if (((a.y > y) !== (b.y > y)) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) insidePolygon = !insidePolygon
  }
  return insidePolygon
}

function ovalContour(width: number, height: number, shape: Shape) {
  const exponent = shape === 'quadrada' ? 7 : 2.7
  return Array.from({ length: 96 }, (_, index) => {
    const angle = index / 96 * Math.PI * 2
    const cosine = Math.cos(angle)
    const sine = Math.sin(angle)
    const radius = (Math.abs(cosine) ** exponent + Math.abs(sine) ** exponent) ** (-1 / exponent)
    return { x: cosine * radius * width / 2, y: sine * radius * height / 2 }
  })
}

function resampleContour(points: Array<{ x: number; y: number }>, count = 96) {
  if (points.length < 3) return points
  const segments = points.map((point, index) => {
    const next = points[(index + 1) % points.length]
    return Math.hypot(next.x - point.x, next.y - point.y)
  })
  const perimeter = segments.reduce((sum, length) => sum + length, 0)
  return Array.from({ length: count }, (_, sampleIndex) => {
    let target = perimeter * sampleIndex / count
    let segmentIndex = 0
    while (segmentIndex < segments.length - 1 && target > segments[segmentIndex]) {
      target -= segments[segmentIndex]
      segmentIndex += 1
    }
    const start = points[segmentIndex]
    const end = points[(segmentIndex + 1) % points.length]
    const progress = target / Math.max(segments[segmentIndex], 0.000001)
    return { x: start.x + (end.x - start.x) * progress, y: start.y + (end.y - start.y) * progress }
  })
}

function framePath(points: Array<{ x: number; y: number }>, pxPerMm = PX_PER_MM, centerX = 180, centerY = 112) {
  const rendered = points.map((point) => ({ x: centerX + point.x * pxPerMm, y: centerY + point.y * pxPerMm }))
  if (!rendered.length) return ''
  return `M ${rendered.map((point) => `${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' L ')} Z`
}

function calculate(state: LensState) {
  const width = state.frameWidthMm * state.frameScale / 100
  const height = state.frameHeightMm * state.frameScale / 100
  const scale = state.frameScale / 100
  const baseContour = state.frameContour?.length
    ? state.frameContour.map((point) => ({ x: point.x * scale, y: point.y * scale }))
    : ovalContour(width, height, state.shape)
  const contour = resampleContour(baseContour)
  const mount = MOUNTS[state.mount]
  const raw: Array<Sample & { raw: number }> = []
  const steps = 30
  const frontBase = state.baseCurve
  const rawSample = (x: number, y: number) => {
    const opticalX = x - state.focalX
    const opticalY = y - state.focalY
    const radius = Math.hypot(opticalX, opticalY)
    const power = localPower(state.sphere, state.cylinder, state.axis, Math.atan2(opticalY, opticalX))
    const frontSag = signedSag(frontBase, radius, state.index)
    const backSag = signedSag(power - frontBase, radius, state.index)
    return { x, y, raw: frontSag + backSag, thickness: 0, withinLens: pointInsideContour(x, y, contour), displayFrontSag: frontSag }
  }

  for (let row = 0; row < steps; row += 1) {
    for (let column = 0; column < steps; column += 1) {
      const x = ((column + .5) / steps - .5) * width
      const y = ((row + .5) / steps - .5) * height
      raw.push(rawSample(x, y))
    }
  }

  const rimRaw = contour.map((point) => ({ angle: Math.atan2(point.y, point.x), ...rawSample(point.x, point.y) }))
  const maxRaw = Math.max(...raw.map((item) => item.raw), ...rimRaw.map((item) => item.raw))
  const equivalent = state.sphere + state.cylinder / 2
  const negative = equivalent < 0
  const toThicknessSample = ({ raw, ...sample }: Sample & { raw: number }) => ({
    ...sample,
    thickness: negative ? mount.center - raw : mount.edge + maxRaw - raw,
  })
  const rotationCenter = { x: state.focalX, y: state.focalY }
  const samples = raw.map(toThicknessSample).map((sample) => ({ ...sample, ...rotateAround(sample, rotationCenter, state.rotationAngle) }))
  // Os cálculos de espessura e os extremos usam somente a área real da lente.
  // Mantemos também as células vizinhas para que o clipPath preencha o contorno
  // inteiro, sem as pequenas falhas entre o mapa e a borda.
  const lensSamples = samples.filter((sample) => sample.withinLens)
  const maximum = lensSamples.reduce((result, sample) => sample.thickness > result.thickness ? sample : result)
  const minimum = lensSamples.reduce((result, sample) => sample.thickness < result.thickness ? sample : result)
  const rim = rimRaw.map(({ angle, ...sample }) => ({ angle, ...toThicknessSample(sample), ...rotateAround(sample, rotationCenter, state.rotationAngle) }))
  const rotatedContour = contour.map((point) => rotateAround(point, rotationCenter, state.rotationAngle))
  const leftIndex = rim.reduce((best, sample, index) => sample.x < rim[best].x ? index : best, 0)
  const rightIndex = rim.reduce((best, sample, index) => sample.x > rim[best].x ? index : best, 0)
  const walk = (step: 1 | -1) => {
    const result = [] as typeof rim
    let index = leftIndex
    while (true) {
      result.push(rim[index])
      if (index === rightIndex) break
      index = (index + step + rim.length) % rim.length
    }
    return result
  }
  const arcA = walk(1)
  const arcB = walk(-1)
  const averageY = (arc: typeof rim) => arc.reduce((sum, point) => sum + point.y, 0) / Math.max(arc.length, 1)
  const topEdge = averageY(arcA) <= averageY(arcB) ? arcA : arcB
  const bottomEdge = averageY(arcA) > averageY(arcB) ? arcA : arcB
  return { width, height, contour: rotatedContour, samples, maximum, minimum, rim, topEdge, bottomEdge, negative }
}

type CustomerOption = { id: number; full_name: string; fone_movel?: string | null }

function smoothClosedContour(controlPoints: Array<{ x: number; y: number }>, samplesPerSegment = 12) {
  if (controlPoints.length < 3) return controlPoints
  const midpoint = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
  let start = midpoint(controlPoints[controlPoints.length - 1], controlPoints[0])
  const sampled: Array<{ x: number; y: number }> = []
  controlPoints.forEach((control, index) => {
    const next = controlPoints[(index + 1) % controlPoints.length]
    const end = midpoint(control, next)
    for (let step = 0; step < samplesPerSegment; step += 1) {
      const t = step / samplesPerSegment
      const inverse = 1 - t
      sampled.push({
        x: inverse * inverse * start.x + 2 * inverse * t * control.x + t * t * end.x,
        y: inverse * inverse * start.y + 2 * inverse * t * control.y + t * t * end.y,
      })
    }
    start = end
  })
  return sampled
}

function frameGeometryFromTemplate(template: GlobalVisagismoFrameTemplate) {
  const source = template.sourcePaths as Record<string, { points?: Array<{ x?: number; y?: number }> }>
  const candidates = [source.innerRight?.points, source.innerLeft?.points]
  const rawPoints = candidates.find((points) => Array.isArray(points) && points.length >= 6)
  if (!rawPoints) return null
  const controls = rawPoints
    .map((point) => ({ x: Number(point.x), y: Number(point.y) }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
  if (controls.length < 6) return null
  // Reproduz exatamente a mesma sequência de curvas quadráticas usada pelo
  // editor do Gabarito, mas a transforma em pontos uniformemente amostrados
  // para cálculo e rotação.
  const smoothPoints = smoothClosedContour(controls)
  const minX = Math.min(...smoothPoints.map((point) => point.x))
  const maxX = Math.max(...smoothPoints.map((point) => point.x))
  const minY = Math.min(...smoothPoints.map((point) => point.y))
  const maxY = Math.max(...smoothPoints.map((point) => point.y))
  const calibration = template.calibration as { unitToMm?: number }
  const fallbackScale = (template.realWidthMm ?? 132) / Math.max(template.viewBox.width, 1)
  const unitToMm = Number(calibration.unitToMm) > 0 ? Number(calibration.unitToMm) : fallbackScale
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2
  const contour = smoothPoints.map((point) => ({ x: (point.x - centerX) * unitToMm, y: (point.y - centerY) * unitToMm }))
  return {
    contour,
    width: (maxX - minX) * unitToMm,
    height: (maxY - minY) * unitToMm,
  }
}

export default function TowerLensThicknessDemo({
  storeId,
  sessionId,
  initialContext,
  frameTemplates,
  clientMode = false,
}: {
  storeId: number
  sessionId: string
  initialContext: TowerSessionContext
  frameTemplates: GlobalVisagismoFrameTemplate[]
  clientMode?: boolean
}) {
  const channelName = `tower-lens-thickness-${storeId}`
  const channelRef = useRef<BroadcastChannel | null>(null)
  const stateRef = useRef(DEFAULT_STATE)
  const [state, setState] = useState<LensState>(DEFAULT_STATE)
  const [showHelp, setShowHelp] = useState(false)
  const [showCalibratorControls, setShowCalibratorControls] = useState(false)
  const [clientScreenOpen, setClientScreenOpen] = useState(false)
  const initialPrescription = initialContext.session.prescription_snapshot as TowerPrescriptionSnapshot | null
  const [realPrescription, setRealPrescription] = useState<TowerPrescriptionSnapshot | null>(initialPrescription)
  const [realCustomer, setRealCustomer] = useState<CustomerOption | null>(initialContext.customer)
  const [showRealModal, setShowRealModal] = useState(false)
  const [customerQuery, setCustomerQuery] = useState('')
  const [customerResults, setCustomerResults] = useState<CustomerOption[]>([])
  const [modalCustomer, setModalCustomer] = useState<CustomerOption | null>(initialContext.customer)
  const [modalPrescription, setModalPrescription] = useState<TowerPrescriptionSnapshot>(initialPrescription ?? { od: { sphere: 0, cylinder: 0, axis: 0 }, oe: { sphere: 0, cylinder: 0, axis: 0 }, addition: 0 })
  const [modalFrameId, setModalFrameId] = useState(frameTemplates[0]?.id ?? '')
  const [modalMessage, setModalMessage] = useState('')
  const [savingReal, setSavingReal] = useState(false)

  useEffect(() => {
    stateRef.current = state
    if (!clientMode) channelRef.current?.postMessage({ type: 'lens-state', state } satisfies LensMessage)
  }, [clientMode, state])

  useEffect(() => {
    const channel = new BroadcastChannel(channelName)
    channelRef.current = channel
    channel.onmessage = (event: MessageEvent<LensMessage>) => {
      const message = event.data
      if (!message || typeof message !== 'object') return
      if (clientMode && message.type === 'lens-state') setState(message.state)
      if (!clientMode && message.type === 'lens-client-ready') channel.postMessage({ type: 'lens-state', state: stateRef.current } satisfies LensMessage)
    }
    if (clientMode) channel.postMessage({ type: 'lens-client-ready' } satisfies LensMessage)
    return () => {
      channel.close()
      channelRef.current = null
    }
  }, [channelName, clientMode])

  function patch(patchState: Partial<LensState>) {
    setState((current) => ({ ...current, ...patchState }))
  }

  function selectTemplate(template: DidacticTemplateId) {
    patch({ template, ...TEMPLATES[template] })
  }

  function applyRealPrescription(prescription: TowerPrescriptionSnapshot, eye: Eye = 'od') {
    const degree = prescription[eye]
    patch({ template: 'real', eye, sphere: degree.sphere, cylinder: degree.cylinder, axis: degree.axis })
  }

  function selectRealLens() {
    setShowRealModal(true)
  }

  async function searchCustomers() {
    if (customerQuery.trim().length < 2) return
    const result = await searchCustomersByName(customerQuery, storeId)
    setCustomerResults((result.success ? result.data : []) as CustomerOption[])
    setModalMessage(result.success ? '' : result.message || 'Nao foi possivel buscar clientes.')
  }

  async function saveRealLens() {
    if (!modalCustomer) {
      setModalMessage('Selecione o cliente antes de continuar.')
      return
    }
    setSavingReal(true)
    const saved = await saveTowerSessionPrescription({ storeId, sessionId, customerId: modalCustomer.id, prescription: modalPrescription })
    setSavingReal(false)
    if (!saved.success) {
      setModalMessage(saved.message)
      return
    }
    setRealCustomer(modalCustomer)
    setRealPrescription(modalPrescription)
    setShowRealModal(false)
    const selectedFrame = frameTemplates.find((template) => template.id === modalFrameId)
    const geometry = selectedFrame ? frameGeometryFromTemplate(selectedFrame) : null
    const degree = modalPrescription.od
    patch({
      template: 'real',
      eye: 'od',
      sphere: degree.sphere,
      cylinder: degree.cylinder,
      axis: degree.axis,
      frameTemplateId: selectedFrame?.id ?? null,
      frameName: selectedFrame?.name ?? 'Oval de referência',
      frameWidthMm: geometry?.width ?? 52,
      frameHeightMm: geometry?.height ?? 38,
      frameContour: geometry?.contour ?? null,
      mount: selectedFrame?.construction === 'rimless' ? 'parafusado' : selectedFrame?.construction === 'semi-rimless' ? 'fio' : 'aro',
    })
  }

  function toggleClientScreen() {
    if (clientScreenOpen) {
      closeTowerClientScreen()
      setClientScreenOpen(false)
      return
    }
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    url.searchParams.set('client', '1')
    const clientWindow = openTowerClientScreen(url.toString())
    if (clientWindow) setClientScreenOpen(true)
  }

  if (clientMode) return <ClientLensScreen state={state} />

  return (
    <main className="min-h-[100dvh] bg-slate-950 px-5 py-5 text-slate-100 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-6xl">
        <div className="rounded-3xl border border-cyan-300/20 bg-gradient-to-br from-cyan-400/15 via-slate-900 to-slate-950 p-6 shadow-2xl shadow-black/30 sm:p-9">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1"><div className="flex items-center gap-3"><Link href={`/torre/${storeId}?menu=informacoes&session=${sessionId}`} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white" aria-label="Voltar para Informações Úteis"><ArrowLeft size={19} /></Link><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-300 text-slate-950"><Ruler size={25} strokeWidth={2.4} /></div></div><p className="mt-6 text-xs font-black uppercase tracking-[.2em] text-cyan-300">Informações úteis</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">Espessura das lentes</h1><p className="mt-3 max-w-2xl text-slate-300">Conduza a conversa com os controles que fizerem sentido para a dúvida do cliente. <button type="button" onClick={() => setShowHelp(true)} className="inline-flex h-6 w-6 translate-y-1 items-center justify-center rounded-full border border-cyan-300/35 bg-cyan-400/10 text-cyan-100 transition hover:bg-cyan-400/20" aria-label="Como usar na conversa" title="Como usar na conversa"><HelpCircle size={14} /></button></p></div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setShowCalibratorControls(true)} className={`flex items-center justify-center gap-2 rounded-2xl border px-4 py-4 text-sm font-bold transition ${state.showCalibrator ? 'border-amber-200/50 bg-amber-300/15 text-amber-100' : 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'}`} title="Calibrar tamanho real"><SlidersHorizontal size={18} /> Calibrar</button>
              <button type="button" onClick={() => patch({ displayScale: state.displayScale === 1 ? 1.8 : 1 })} className={`flex items-center justify-center gap-2 rounded-2xl border px-4 py-4 text-sm font-bold transition ${state.displayScale === 1 ? 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10' : 'border-cyan-300/50 bg-cyan-400/15 text-cyan-100'}`} title={state.displayScale === 1 ? 'Ampliar a demonstração para conversa à distância' : 'Voltar ao tamanho real calibrado'}>{state.displayScale === 1 ? <Maximize2 size={18} /> : <Minimize2 size={18} />}{state.displayScale === 1 ? 'Ampliar' : 'Tamanho real'}</button>
              <button type="button" onClick={toggleClientScreen} className="flex items-center justify-center gap-2 rounded-2xl bg-cyan-300 px-5 py-4 text-sm font-bold text-slate-950 transition hover:bg-cyan-200"><MonitorUp size={20} /> {clientScreenOpen ? 'Fechar tela cliente' : 'Abrir tela cliente'}</button>
            </div>
          </div>

          <section className="mt-8 grid gap-5">
            <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-5">
              <div className="flex items-center justify-between gap-3"><p className="text-xs font-black uppercase tracking-[.16em] text-slate-400">Grau de demonstração</p><button type="button" onClick={() => setState(DEFAULT_STATE)} className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-400 transition hover:bg-white/5 hover:text-white"><RotateCcw size={14} /> Restaurar</button></div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{(Object.keys(TEMPLATES) as DidacticTemplateId[]).map((template) => <button key={template} type="button" onClick={() => selectTemplate(template)} className={`rounded-xl border p-3 text-left transition ${state.template === template ? 'border-cyan-300/55 bg-cyan-400/15 text-cyan-100' : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'}`}><span className="block text-sm font-bold">{TEMPLATES[template].label}</span><span className="mt-1 block text-xs opacity-75">{formatDegree(TEMPLATES[template].sphere)} / {formatDegree(TEMPLATES[template].cylinder)} × {TEMPLATES[template].axis}°</span></button>)}<button type="button" onClick={selectRealLens} className={`rounded-xl border p-3 text-left transition ${state.template === 'real' ? 'border-amber-300/60 bg-amber-300/15 text-amber-50' : 'border-amber-200/20 bg-amber-300/5 text-slate-200 hover:bg-amber-300/10'}`}><span className="flex items-center gap-2 text-sm font-bold"><UserRound size={16} /> Lente real do cliente</span><span className="mt-1 block text-xs opacity-75">{realCustomer ? `${realCustomer.full_name} · receita da sessão` : 'Identifique o cliente e informe a receita.'}</span></button></div>
              {state.template === 'real' && realPrescription && <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-amber-200/20 bg-amber-300/5 px-3 py-2 text-xs text-amber-50"><span>Receita real travada para a demonstração.</span><div className="flex gap-1"><Pill compact active={state.eye === 'od'} onClick={() => applyRealPrescription(realPrescription, 'od')}>OD</Pill><Pill compact active={state.eye === 'oe'} onClick={() => applyRealPrescription(realPrescription, 'oe')}>OE</Pill></div></div>}
              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <Control label="Índice" value={state.index.toFixed(2)}><div className="flex flex-wrap gap-2">{[1.56, 1.60, 1.67, 1.74].map((index) => <Pill key={index} active={state.index === index} onClick={() => patch({ index })}>{index.toFixed(2)}</Pill>)}</div></Control>
                <Control label="Curva base" value={state.baseCurve === 0 ? '0' : `+${state.baseCurve}`}><div className="flex flex-wrap gap-2">{[0, 2, 4, 6].map((baseCurve) => <Pill key={baseCurve} active={state.baseCurve === baseCurve} onClick={() => patch({ baseCurve })}>{baseCurve === 0 ? '0' : `+${baseCurve}`}</Pill>)}</div></Control>
                <Control label="Tipo de armação" value={MOUNTS[state.mount].label}><div className="flex flex-nowrap gap-1.5">{(Object.keys(MOUNTS) as Mount[]).map((mount) => <Pill key={mount} compact active={state.mount === mount} onClick={() => patch({ mount })}>{MOUNTS[mount].label}</Pill>)}</div></Control>
                <Range label="Tamanho da lente (A)" value={state.frameScale} min={80} max={125} suffix="%" valueLabel={`${(state.frameWidthMm * state.frameScale / 100).toFixed(1)} × ${(state.frameHeightMm * state.frameScale / 100).toFixed(1)} mm`} onChange={(frameScale) => patch({ frameScale })} />
                <Range label="Eixo do cilindro" value={state.axis} min={0} max={180} suffix="°" disabled={state.template === 'real'} onChange={(axis) => patch({ axis })} />
                <Range label="Giro da lente" value={state.rotationAngle} min={0} max={359} suffix="°" onChange={(rotationAngle) => patch({ rotationAngle })} />
                <Range label="DNP / centro óptico" value={state.focalX} min={-8} max={8} suffix=" mm" onChange={(focalX) => patch({ focalX })} />
                <Range label="Altura do centro" value={state.focalY} min={-8} max={8} suffix=" mm" onChange={(focalY) => patch({ focalY })} />
              </div>
            </div>
          </section>
        </div>
        {showHelp && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-5 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowHelp(false) }}><div role="dialog" aria-modal="true" aria-labelledby="lens-thickness-help-title" className="w-full max-w-lg rounded-3xl border border-cyan-300/25 bg-slate-900 p-6 text-slate-100 shadow-2xl shadow-black/50"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.16em] text-cyan-200">Orientação ao funcionário</p><h2 id="lens-thickness-help-title" className="mt-2 text-2xl font-bold text-white">Como usar na conversa</h2></div><button type="button" onClick={() => setShowHelp(false)} className="rounded-xl border border-white/10 p-2 text-slate-400 transition hover:bg-white/10 hover:text-white" aria-label="Fechar orientações"><X size={18} /></button></div><div className="mt-5 space-y-3 text-sm leading-relaxed text-slate-300"><p><strong className="text-white">Armação menor:</strong> aumente ou reduza o tamanho para ver a borda reagir.</p><p><strong className="text-white">Índice:</strong> alterne os índices e compare a redução calculada.</p><p><strong className="text-white">Eixo:</strong> gire o cilindro para mostrar onde a borda aparece mais.</p><p><strong className="text-white">Centro óptico:</strong> desloque DNP e altura para revelar o lado que ganha mais volume.</p></div><p className="mt-5 border-t border-cyan-300/15 pt-4 text-xs leading-5 text-cyan-100/80">Demonstração geométrica. Apoia a conversa, mas não substitui o cálculo final de laboratório.</p></div></div>}
        {showCalibratorControls && <CalibrationModal state={state} onPatch={patch} onClose={() => setShowCalibratorControls(false)} />}
        {showRealModal && <RealLensModalV2 customerQuery={customerQuery} setCustomerQuery={setCustomerQuery} customerResults={customerResults} modalCustomer={modalCustomer} setModalCustomer={setModalCustomer} prescription={modalPrescription} setPrescription={setModalPrescription} frameTemplates={frameTemplates} selectedFrameId={modalFrameId} setSelectedFrameId={setModalFrameId} focalX={state.focalX} focalY={state.focalY} message={modalMessage} saving={savingReal} onSearch={searchCustomers} onSave={saveRealLens} onClose={() => setShowRealModal(false)} />}
      </div>
    </main>
  )
}

function CalibrationModal({ state, onPatch, onClose }: { state: LensState; onPatch: (patch: Partial<LensState>) => void; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-5 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section role="dialog" aria-modal="true" aria-labelledby="calibration-title" className="w-full max-w-md rounded-3xl border border-amber-200/30 bg-slate-900 p-6 shadow-2xl shadow-black/50"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.16em] text-amber-200">Tamanho físico</p><h2 id="calibration-title" className="mt-1 text-2xl font-bold text-white">Calibrar tela do cliente</h2></div><button type="button" onClick={onClose} className="rounded-xl border border-white/10 p-2 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Fechar calibrador"><X size={18} /></button></div><p className="mt-3 text-sm leading-6 text-slate-300">Ligue a régua de 50 mm, encoste uma régua física no monitor do cliente e ajuste até as duas terem o mesmo tamanho.</p><label className="mt-5 flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-950/50 p-3 text-sm font-bold text-slate-200"><span>Mostrar régua no cliente</span><button type="button" role="switch" aria-checked={state.showCalibrator} onClick={() => onPatch({ showCalibrator: !state.showCalibrator })} className={`relative h-7 w-12 rounded-full transition ${state.showCalibrator ? 'bg-amber-300' : 'bg-slate-700'}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${state.showCalibrator ? 'left-6' : 'left-1'}`} /></button></label><label className="mt-5 block"><div className="mb-2 flex items-center justify-between gap-3"><span className="text-xs font-black uppercase tracking-[.14em] text-slate-400">Escala da tela</span><span className="text-sm font-black text-amber-100">{state.calibrationScale}%</span></div><input type="range" min={40} max={220} value={state.calibrationScale} onChange={(event) => onPatch({ calibrationScale: Number(event.target.value) })} className="w-full cursor-pointer accent-amber-300" /></label><div className="mt-6 flex justify-end"><button type="button" onClick={onClose} className="rounded-xl bg-amber-300 px-4 py-2 text-sm font-black text-slate-950">Concluir</button></div></section></div>
}

type PickerField = { eye?: Eye; field: 'sphere' | 'cylinder' | 'axis' | 'addition'; label: string }

const formatQuarter = (value: number, signed = false) => Math.abs(value) < .001 ? '0.00' : `${value > 0 && signed ? '+' : ''}${value.toFixed(2)}`
const sphereOptions = Array.from({ length: 97 }, (_, index) => formatQuarter((index - 48) * .25, true))
const cylinderOptions = Array.from({ length: 25 }, (_, index) => formatQuarter(-index * .25))
const additionOptions = Array.from({ length: 17 }, (_, index) => formatQuarter(index * .25, true))

function frameLensPreview(template: GlobalVisagismoFrameTemplate) {
  const source = template.sourcePaths as Record<string, { points?: Array<{ x?: number; y?: number }> }>
  const useRight = Array.isArray(source.innerRight?.points) && source.innerRight.points.length >= 3
  const rawPoints = useRight ? source.innerRight.points : source.innerLeft?.points
  const generatedPath = useRight ? template.generatedPaths.innerRightPath : template.generatedPaths.innerLeftPath
  const points = (rawPoints ?? [])
    .map((point) => ({ x: Number(point.x), y: Number(point.y) }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
  if (points.length >= 3 && generatedPath) {
    const minX = Math.min(...points.map((point) => point.x))
    const maxX = Math.max(...points.map((point) => point.x))
    const minY = Math.min(...points.map((point) => point.y))
    const maxY = Math.max(...points.map((point) => point.y))
    const padding = Math.max(maxX - minX, maxY - minY) * .12
    return { path: generatedPath, viewBox: `${minX - padding} ${minY - padding} ${maxX - minX + padding * 2} ${maxY - minY + padding * 2}` }
  }
  const geometry = frameGeometryFromTemplate(template)
  if (!geometry?.contour.length) return null
  const path = `M ${geometry.contour.map((point) => `${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' L ')} Z`
  return { path, viewBox: `${-geometry.width * .62} ${-geometry.height * .62} ${geometry.width * 1.24} ${geometry.height * 1.24}` }
}

function FrameLensCarousel({ templates, selectedId, onSelect }: { templates: GlobalVisagismoFrameTemplate[]; selectedId: string; onSelect: (id: string) => void }) {
  const selectedIndex = Math.max(0, templates.findIndex((template) => template.id === selectedId))
  const selected = templates[selectedIndex] ?? null
  const preview = selected ? frameLensPreview(selected) : null
  const move = (direction: number) => {
    if (!templates.length) return
    const nextIndex = (selectedIndex + direction + templates.length) % templates.length
    onSelect(templates[nextIndex].id)
  }

  if (!selected) return <div className="flex min-h-36 items-center justify-center rounded-2xl border border-dashed border-white/15 bg-slate-950/40 px-4 text-center text-sm text-slate-400">Nenhum gabarito disponível. Será usado o oval de referência.</div>

  return <div>
    <div className="mb-2 flex items-center justify-between gap-3"><p className="text-xs font-black uppercase tracking-[.14em] text-slate-400">Escolha pelo formato interno</p><span className="text-xs font-bold text-slate-500">{selectedIndex + 1} de {templates.length}</span></div>
    <div className="grid grid-cols-[44px_1fr_44px] items-center gap-2">
      <button type="button" onClick={() => move(-1)} className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-200 transition hover:border-cyan-300/40 hover:bg-cyan-400/10" aria-label="Formato anterior"><ChevronLeft size={20} /></button>
      <button type="button" onClick={() => onSelect(selected.id)} className="group min-h-36 rounded-2xl border border-cyan-300/45 bg-cyan-400/10 p-3 text-center transition hover:bg-cyan-400/15" aria-label={`Formato selecionado: ${selected.name}`}>
        {preview ? <svg viewBox={preview.viewBox} className="mx-auto h-24 w-full max-w-sm overflow-visible" role="img" aria-label={`Aro interno do gabarito ${selected.name}`}><path d={preview.path} fill="rgba(34,211,238,.08)" stroke="rgb(103 232 249)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" /></svg> : <div className="flex h-24 items-center justify-center text-sm text-slate-400">Contorno interno indisponível</div>}
        <span className="mt-1 block truncate text-sm font-bold text-cyan-50">{selected.name}</span>
      </button>
      <button type="button" onClick={() => move(1)} className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-200 transition hover:border-cyan-300/40 hover:bg-cyan-400/10" aria-label="Próximo formato"><ChevronRight size={20} /></button>
    </div>
    {templates.length > 1 && <div className="mt-2 flex justify-center gap-1.5" aria-label="Posição no carrossel">{templates.map((template, index) => <button key={template.id} type="button" onClick={() => onSelect(template.id)} className={`h-1.5 rounded-full transition-all ${index === selectedIndex ? 'w-6 bg-cyan-300' : 'w-1.5 bg-white/20 hover:bg-white/40'}`} aria-label={`Selecionar formato ${index + 1}`} />)}</div>}
  </div>
}

function RealLensModalV2({ customerQuery, setCustomerQuery, customerResults, modalCustomer, setModalCustomer, prescription, setPrescription, frameTemplates, selectedFrameId, setSelectedFrameId, focalX, focalY, message, saving, onSearch, onSave, onClose }: { customerQuery: string; setCustomerQuery: (value: string) => void; customerResults: CustomerOption[]; modalCustomer: CustomerOption | null; setModalCustomer: (customer: CustomerOption) => void; prescription: TowerPrescriptionSnapshot; setPrescription: (prescription: TowerPrescriptionSnapshot) => void; frameTemplates: GlobalVisagismoFrameTemplate[]; selectedFrameId: string; setSelectedFrameId: (id: string) => void; focalX: number; focalY: number; message: string; saving: boolean; onSearch: () => void; onSave: () => void; onClose: () => void }) {
  const [activeField, setActiveField] = useState<PickerField | null>(null)
  const selectedFrame = frameTemplates.find((template) => template.id === selectedFrameId) ?? null
  const geometry = selectedFrame ? frameGeometryFromTemplate(selectedFrame) : null
  const maximumDistance = geometry?.contour.reduce((maximum, point) => Math.max(maximum, Math.hypot(point.x - focalX, point.y - focalY)), 0) ?? Math.hypot(26 - focalX, 19 - focalY)
  const fieldValue = (field: PickerField) => field.field === 'addition' ? prescription.addition : prescription[field.eye!][field.field]
  const choose = (value: number) => {
    if (!activeField) return
    if (activeField.field === 'addition') setPrescription({ ...prescription, addition: value })
    else setPrescription({ ...prescription, [activeField.eye!]: { ...prescription[activeField.eye!], [activeField.field]: value } })
    if (activeField.field !== 'axis') setActiveField(null)
  }
  const fieldsForEye = (eye: Eye): PickerField[] => [{ eye, field: 'sphere', label: 'Esf.' }, { eye, field: 'cylinder', label: 'Cil.' }, { eye, field: 'axis', label: 'Eixo' }]

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <div role="dialog" aria-modal="true" aria-labelledby="real-lens-title" className="max-h-[94dvh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-amber-200/25 bg-slate-900 p-5 shadow-2xl shadow-black/50 sm:p-6">
      <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.16em] text-amber-200">Contexto da sessão</p><h2 id="real-lens-title" className="mt-1 text-2xl font-bold text-white">Lente real do cliente</h2><p className="mt-1 text-sm text-slate-400">Receita, centragem e armação alimentam a estimativa de borda.</p></div><button type="button" onClick={onClose} className="rounded-xl border border-white/10 p-2 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Fechar"><X size={18} /></button></div>
      <div className="mt-5"><p className="text-xs font-black uppercase tracking-[.14em] text-slate-400">Cliente</p><div className="mt-2 flex gap-2"><input value={customerQuery} onChange={(event) => setCustomerQuery(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && onSearch()} placeholder="Nome ou CPF" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-amber-200/50" /><button type="button" onClick={onSearch} className="rounded-xl bg-white/10 px-3 text-slate-100 hover:bg-white/15" aria-label="Buscar cliente"><Search size={18} /></button></div>{customerResults.length > 0 && <div className="mt-2 max-h-32 overflow-y-auto rounded-xl border border-white/10 bg-slate-950/70 p-1">{customerResults.map((customer) => <button key={customer.id} type="button" onClick={() => setModalCustomer(customer)} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${modalCustomer?.id === customer.id ? 'bg-amber-300/15 text-amber-100' : 'text-slate-300 hover:bg-white/5'}`}><span>{customer.full_name}</span><span className="text-xs opacity-60">{customer.fone_movel || 'Sem telefone'}</span></button>)}</div>}{modalCustomer && <p className="mt-2 text-sm font-semibold text-amber-100">Cliente: {modalCustomer.full_name}</p>}</div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">{(['od', 'oe'] as Eye[]).map((eye) => <div key={eye} className="rounded-2xl border border-white/10 bg-slate-950/45 p-3"><p className="text-xs font-black uppercase tracking-[.14em] text-cyan-200">{eye.toUpperCase()}</p><div className="mt-3 grid grid-cols-3 gap-2">{fieldsForEye(eye).map((field) => <DegreePicker key={field.field} field={field} value={fieldValue(field)} active={activeField?.eye === field.eye && activeField?.field === field.field} onClick={() => setActiveField(field)} />)}</div></div>)}</div>
      <div className="mt-3 max-w-[calc(50%-0.375rem)]"><DegreePicker field={{ field: 'addition', label: 'Adição' }} value={prescription.addition} active={activeField?.field === 'addition'} onClick={() => setActiveField({ field: 'addition', label: 'Adição' })} /></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-[1.35fr_.65fr]"><FrameLensCarousel templates={frameTemplates} selectedId={selectedFrameId} onSelect={setSelectedFrameId} /><div className="self-stretch rounded-xl border border-cyan-300/15 bg-cyan-400/5 p-3 text-xs text-slate-300"><p className="font-black uppercase tracking-[.12em] text-cyan-200">Medidas calculadas</p><p className="mt-3">A × B: <strong className="block text-base text-white">{geometry ? `${geometry.width.toFixed(1)} × ${geometry.height.toFixed(1)} mm` : '52.0 × 38.0 mm'}</strong></p><p className="mt-3">Centro óptico → borda: <strong className="block text-base text-white">{maximumDistance.toFixed(1)} mm</strong></p><p className="mt-3 text-slate-400">{selectedFrame?.construction === 'rimless' ? 'Parafusada' : selectedFrame?.construction === 'semi-rimless' ? 'Fio de nylon' : 'Aro fechado'}</p></div></div>
      {message && <p className="mt-3 text-sm text-rose-200">{message}</p>}
      <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-bold text-slate-300 hover:bg-white/5">Cancelar</button><button type="button" disabled={saving} onClick={onSave} className="rounded-xl bg-amber-300 px-4 py-2 text-sm font-black text-slate-950 disabled:opacity-60">{saving ? 'Salvando…' : 'Usar receita e armação'}</button></div>
      {activeField && <PrescriptionPicker field={activeField} value={fieldValue(activeField)} onChoose={choose} onClose={() => setActiveField(null)} />}
    </div>
  </div>
}

// Mantido temporariamente durante a transição do modal de receita para receita + armação.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function RealLensModal({ customerQuery, setCustomerQuery, customerResults, modalCustomer, setModalCustomer, prescription, setPrescription, message, saving, onSearch, onSave, onClose }: { customerQuery: string; setCustomerQuery: (value: string) => void; customerResults: CustomerOption[]; modalCustomer: CustomerOption | null; setModalCustomer: (customer: CustomerOption) => void; prescription: TowerPrescriptionSnapshot; setPrescription: (prescription: TowerPrescriptionSnapshot) => void; message: string; saving: boolean; onSearch: () => void; onSave: () => void; onClose: () => void }) {
  const [activeField, setActiveField] = useState<PickerField | null>(null)
  const fieldValue = (field: PickerField) => field.field === 'addition' ? prescription.addition : prescription[field.eye!][field.field]
  const choose = (value: number) => {
    if (!activeField) return
    if (activeField.field === 'addition') setPrescription({ ...prescription, addition: value })
    else setPrescription({ ...prescription, [activeField.eye!]: { ...prescription[activeField.eye!], [activeField.field]: value } })
    if (activeField.field !== 'axis') setActiveField(null)
  }
  const fieldsForEye = (eye: Eye): PickerField[] => [{ eye, field: 'sphere', label: 'Esf.' }, { eye, field: 'cylinder', label: 'Cil.' }, { eye, field: 'axis', label: 'Eixo' }]
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><div role="dialog" aria-modal="true" aria-labelledby="real-lens-title" className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-amber-200/25 bg-slate-900 p-5 shadow-2xl shadow-black/50 sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.16em] text-amber-200">Contexto da sessão</p><h2 id="real-lens-title" className="mt-1 text-2xl font-bold text-white">Lente real do cliente</h2><p className="mt-1 text-sm text-slate-400">A receita ficará disponível para as próximas experiências desta sessão.</p></div><button type="button" onClick={onClose} className="rounded-xl border border-white/10 p-2 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Fechar"><X size={18} /></button></div><div className="mt-5"><p className="text-xs font-black uppercase tracking-[.14em] text-slate-400">Cliente</p><div className="mt-2 flex gap-2"><input value={customerQuery} onChange={(event) => setCustomerQuery(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && onSearch()} placeholder="Nome ou CPF" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-amber-200/50" /><button type="button" onClick={onSearch} className="rounded-xl bg-white/10 px-3 text-slate-100 hover:bg-white/15" aria-label="Buscar cliente"><Search size={18} /></button></div>{customerResults.length > 0 && <div className="mt-2 max-h-32 overflow-y-auto rounded-xl border border-white/10 bg-slate-950/70 p-1">{customerResults.map((customer) => <button key={customer.id} type="button" onClick={() => setModalCustomer(customer)} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${modalCustomer?.id === customer.id ? 'bg-amber-300/15 text-amber-100' : 'text-slate-300 hover:bg-white/5'}`}><span>{customer.full_name}</span><span className="text-xs opacity-60">{customer.fone_movel || 'Sem telefone'}</span></button>)}</div>}{modalCustomer && <p className="mt-2 text-sm font-semibold text-amber-100">Cliente: {modalCustomer.full_name}</p>}</div><div className="mt-5 grid gap-3 sm:grid-cols-2">{(['od', 'oe'] as Eye[]).map((eye) => <div key={eye} className="rounded-2xl border border-white/10 bg-slate-950/45 p-3"><p className="text-xs font-black uppercase tracking-[.14em] text-cyan-200">{eye.toUpperCase()}</p><div className="mt-3 grid grid-cols-3 gap-2">{fieldsForEye(eye).map((field) => <DegreePicker key={field.field} field={field} value={fieldValue(field)} active={activeField?.eye === field.eye && activeField?.field === field.field} onClick={() => setActiveField(field)} />)}</div></div>)}</div><div className="mt-3 max-w-[calc(50%-0.375rem)]"><DegreePicker field={{ field: 'addition', label: 'Adição' }} value={prescription.addition} active={activeField?.field === 'addition'} onClick={() => setActiveField({ field: 'addition', label: 'Adição' })} /></div>{message && <p className="mt-3 text-sm text-rose-200">{message}</p>}<div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-bold text-slate-300 hover:bg-white/5">Cancelar</button><button type="button" disabled={saving} onClick={onSave} className="rounded-xl bg-amber-300 px-4 py-2 text-sm font-black text-slate-950 disabled:opacity-60">{saving ? 'Salvando…' : 'Usar receita real'}</button></div>{activeField && <PrescriptionPicker field={activeField} value={fieldValue(activeField)} onChoose={choose} onClose={() => setActiveField(null)} />}</div></div>
}

function DegreePicker({ field, value, active, onClick }: { field: PickerField; value: number; active: boolean; onClick: () => void }) { return <div className="text-xs font-bold text-slate-400"><span>{field.label}</span><button type="button" onClick={onClick} className={`mt-1 flex min-h-10 w-full items-center justify-between rounded-lg border px-2 text-sm font-black ${active ? 'border-cyan-300 bg-cyan-400/10 text-cyan-100' : 'border-white/10 bg-slate-900 text-white hover:border-cyan-300/50'}`}><span>{field.field === 'axis' ? `${String(Math.round(value)).padStart(3, '0')}°` : formatQuarter(value, field.field !== 'cylinder')}</span><ChevronDown size={14} /></button></div> }

function PrescriptionPicker({ field, value, onChoose, onClose }: { field: PickerField; value: number; onChoose: (value: number) => void; onClose: () => void }) { const values = field.field === 'sphere' ? sphereOptions : field.field === 'cylinder' ? cylinderOptions : additionOptions; return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"><button type="button" className="absolute inset-0" onClick={onClose} aria-label="Fechar seletor" /><section className={`relative z-10 w-full rounded-3xl border border-white/15 bg-slate-900 p-4 shadow-2xl ${field.field === 'axis' ? 'max-w-xl' : 'max-w-xs'}`}><div className="mb-3 flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-[.2em] text-cyan-200">Receita</p><h3 className="mt-1 text-lg font-black text-white">{field.label}</h3></div><button type="button" onClick={onClose} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-black text-slate-300">Fechar</button></div>{field.field === 'axis' ? <AxisPicker value={value} onChoose={onChoose} /> : <DegreeWheel values={values} selectedValue={formatQuarter(value, field.field !== 'cylinder')} onChoose={(next) => onChoose(Number(next))} />}</section></div> }

function DegreeWheel({ values, selectedValue, onChoose }: { values: string[]; selectedValue: string; onChoose: (value: string) => void }) { const selectedRef = useRef<HTMLButtonElement | null>(null); useEffect(() => { selectedRef.current?.scrollIntoView({ block: 'center' }) }, [selectedValue]); return <div className="max-h-64 snap-y overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/80 p-2">{values.map((value) => <button key={value} ref={value === selectedValue ? selectedRef : null} type="button" onClick={() => onChoose(value)} className={`flex min-h-11 w-full snap-center items-center justify-center rounded-xl text-lg font-black ${value === selectedValue ? 'bg-cyan-400 text-slate-950' : 'text-slate-200 hover:bg-white/10'}`}>{value}</button>)}</div> }

function AxisPicker({ value, onChoose }: { value: number; onChoose: (value: number) => void }) { const current = Math.min(180, Math.max(0, Math.round(value))); const centerX = 150; const centerY = 145; const radius = 112; const point = (angle: number, length: number) => ({ x: centerX + Math.cos(angle * Math.PI / 180) * length, y: centerY - Math.sin(angle * Math.PI / 180) * length }); const selected = point(current, radius - 16); const choose = (event: React.PointerEvent<SVGSVGElement>) => { const rect = event.currentTarget.getBoundingClientRect(); const x = ((event.clientX - rect.left) / rect.width) * 300; const y = ((event.clientY - rect.top) / rect.height) * 180; const angle = Math.atan2(centerY - Math.min(y, centerY), x - centerX) * 180 / Math.PI; onChoose(Math.max(0, Math.min(180, Math.round(angle)))) }; return <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-3"><div className="mb-1 flex items-center justify-between text-xs font-bold text-slate-300"><span>Arraste pelo transferidor.</span><span className="rounded-lg bg-cyan-400 px-2 py-1 text-sm font-black text-slate-950">{String(current).padStart(3, '0')}°</span></div><svg viewBox="0 0 300 180" onPointerDown={choose} onPointerMove={(event) => event.buttons === 1 && choose(event)} className="h-auto w-full touch-none"><path d="M 38 145 A 112 112 0 0 1 262 145" fill="none" stroke="rgba(148,163,184,.45)" strokeWidth="2" />{Array.from({ length: 19 }, (_, index) => index * 10).map((angle) => { const outer = point(angle, radius); const inner = point(angle, radius - (angle % 30 === 0 ? 14 : 8)); return <line key={angle} x1={outer.x} y1={outer.y} x2={inner.x} y2={inner.y} stroke="rgba(226,232,240,.8)" strokeWidth={angle % 30 === 0 ? 2 : 1} /> })}<line x1={centerX} y1={centerY} x2={selected.x} y2={selected.y} stroke="#22d3ee" strokeWidth="4" strokeLinecap="round" /><circle cx={centerX} cy={centerY} r="7" fill="#22d3ee" /><circle cx={selected.x} cy={selected.y} r="7" fill="#f8fafc" stroke="#22d3ee" strokeWidth="4" /></svg></div> }

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function LegacyClientLensScreen({ state }: { state: LensState }) {
  const result = useMemo(() => calculate(state), [state])
  const displayPxPerMm = 4.1 * state.calibrationScale / 100
  const PX_PER_MM = displayPxPerMm
  const path = framePath(result.contour, displayPxPerMm)
  const progressColor = (thickness: number) => {
    const progress = (thickness - result.minimum.thickness) / Math.max(.05, result.maximum.thickness - result.minimum.thickness)
    return `hsl(${205 - progress * 190} 88% ${43 + progress * 14}%)`
  }
  const edgeProfile = (edge: typeof result.topEdge) => {
    // O mapa frontal ocupa uma coluna maior que os cartões laterais. Sem esta
    // compensação, o mesmo A em milímetros é desenhado menor no perfil, apesar
    // de os dois usarem a mesma geometria da lente.
    const profilePxPerMm = displayPxPerMm * 1.5
    return edge.map((sample) => {
      const x = 180 + sample.x * profilePxPerMm
      const front = 60 + sample.displayFrontSag * profilePxPerMm
      return { x, front, back: front + sample.thickness * profilePxPerMm }
    })
  }
  const edgePath = (edge: ReturnType<typeof edgeProfile>) => edge.length ? `M ${edge[0].x} ${edge[0].front} ${edge.slice(1).map((point) => `L ${point.x} ${point.front}`).join(' ')} ${edge.slice().reverse().map((point) => `L ${point.x} ${point.back}`).join(' ')} Z` : ''
  const topEdgePath = edgePath(edgeProfile(result.topEdge))
  const bottomEdgePath = edgePath(edgeProfile(result.bottomEdge))
  // Mantemos os nomes abaixo apenas para os dois slots visuais existentes.
  // Eles agora recebem perfis da lateral externa, e nao cortes internos.
  const maxCutPath = topEdgePath
  const minCutPath = bottomEdgePath

  const cellWidth = result.width / 30 * displayPxPerMm
  const cellHeight = result.height / 30 * displayPxPerMm
  const cellOverlap = .75
  const rimSegments = result.rim.map((sample, index) => {
    const next = result.rim[(index + 1) % result.rim.length]
    return <line key={index} x1={180 + sample.x * PX_PER_MM} y1={112 + sample.y * PX_PER_MM} x2={180 + next.x * PX_PER_MM} y2={112 + next.y * PX_PER_MM} stroke={progressColor(sample.thickness)} strokeWidth="6" strokeLinecap="round" opacity=".96" />
  })
  return <main className="h-[100dvh] overflow-hidden bg-slate-950 p-7 text-white sm:p-10"><div className="flex h-full flex-col"><header className="flex items-start justify-between gap-6"><div><p className="text-xs font-black uppercase tracking-[.22em] text-cyan-300">Espessura das lentes</p><h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-5xl">Onde a lente ganha mais volume?</h1></div><div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-right text-sm"><p className="font-bold text-cyan-100">{formatDegree(state.sphere)} / {formatDegree(state.cylinder)} × {Math.round(state.axis)}°</p><p className="mt-1 text-slate-400">Índice {state.index.toFixed(2)} · {MOUNTS[state.mount].label}</p></div></header><section className="mt-7 grid min-h-0 flex-1 gap-5 lg:grid-cols-[1.35fr_.85fr]"><div className="rounded-3xl border border-cyan-300/25 bg-cyan-400/5 p-5"><p className="text-xs font-black uppercase tracking-[.16em] text-cyan-200">Mapa frontal de espessura</p><svg viewBox="0 0 360 224" className="mt-3 h-[min(54vh,520px)] w-full" role="img" aria-label="Mapa frontal da lente"><defs><clipPath id="tower-lens-frame"><path d={path} /></clipPath></defs><path d={path} fill="rgba(15,23,42,.8)" stroke="rgba(103,232,249,.85)" strokeWidth="2" /> <g clipPath="url(#tower-lens-frame)">{result.samples.map((sample, index) => <rect key={index} x={180 + sample.x * PX_PER_MM - cellWidth / 2 - cellOverlap / 2} y={112 + sample.y * PX_PER_MM - cellHeight / 2 - cellOverlap / 2} width={cellWidth + cellOverlap} height={cellHeight + cellOverlap} fill={progressColor(sample.thickness)} opacity=".9" className="transition-all duration-300" />)}</g><circle cx={180 + state.focalX * PX_PER_MM} cy={112 + state.focalY * PX_PER_MM} r="4.5" fill="white" stroke="#0891b2" strokeWidth="2" /><path d={path} fill="none" stroke="rgba(255,255,255,.7)" strokeWidth="1" />{rimSegments}{state.showCalibrator && <g transform="translate(155 205)"><line x1="0" y1="0" x2={50 * PX_PER_MM} y2="0" stroke="#fcd34d" strokeWidth="3" /><line x1="0" y1="-7" x2="0" y2="7" stroke="#fcd34d" strokeWidth="3" /><line x1={50 * PX_PER_MM} y1="-7" x2={50 * PX_PER_MM} y2="7" stroke="#fcd34d" strokeWidth="3" /><text x={25 * PX_PER_MM} y="-10" textAnchor="middle" fill="#fde68a" fontSize="11" fontWeight="800">50 mm · calibre com régua</text></g>}</svg></div><div className="grid min-h-0 gap-5"><div className="rounded-3xl border border-white/10 bg-slate-900/75 p-5"><p className="text-xs font-black uppercase tracking-[.16em] text-slate-400">Corte pela borda mais espessa</p><svg viewBox="0 0 360 120" className="mt-3 h-[min(22vh,210px)] w-full"><path d={maxCutPath} fill="rgba(34,211,238,.62)" stroke="rgba(165,243,252,.95)" strokeWidth="2" /></svg><p className="text-sm text-slate-300">Perfil radial que cruza o centro e alcança o ponto mais espesso do anel.</p></div><div className="rounded-3xl border border-white/10 bg-slate-900/75 p-5"><p className="text-xs font-black uppercase tracking-[.16em] text-slate-400">Corte pela borda mais fina</p><svg viewBox="0 0 360 224" className="mt-3 h-[min(25vh,240px)] w-full"><path d={minCutPath} fill="rgba(34,211,238,.62)" stroke="rgba(165,243,252,.95)" strokeWidth="2" /></svg><p className="text-sm text-slate-300">{result.negative ? 'Em miopia, a maior espessura tende a aparecer nas bordas.' : 'Em hipermetropia, o volume tende a se concentrar no centro.'}</p></div></div></section></div></main>
}

function ClientLensScreen({ state }: { state: LensState }) {
  const result = useMemo(() => calculate(state), [state])
  const presentationScale = state.displayScale
  const pxPerMm = 4.1 * state.calibrationScale / 100
  const frontCanvasWidth = 480
  const frontCanvasHeight = 340
  const frontCenterX = frontCanvasWidth / 2
  const frontCenterY = frontCanvasHeight / 2
  const frontCanvasStyle = { width: `${frontCanvasWidth * presentationScale}px`, height: `${frontCanvasHeight * presentationScale}px` }
  const edgePhysicalStyle = { width: `${360 * presentationScale}px`, height: `${142 * presentationScale}px` }
  const edgeProfileStyle = { width: `${360 * presentationScale}px`, height: `${110 * presentationScale}px` }
  const path = framePath(result.contour, pxPerMm, frontCenterX, frontCenterY)
  const colorFor = (thickness: number) => {
    const progress = (thickness - result.minimum.thickness) / Math.max(.05, result.maximum.thickness - result.minimum.thickness)
    return `hsl(${205 - progress * 190} 88% ${43 + progress * 14}%)`
  }
  const profilePxPerMm = pxPerMm
  const profile = result.topEdge.map((sample) => ({
    x: 180 + sample.x * profilePxPerMm,
    front: 58 + sample.displayFrontSag * profilePxPerMm,
    back: 58 + (sample.displayFrontSag + sample.thickness) * profilePxPerMm,
  }))
  const profilePath = profile.length
    ? (() => {
      const first = profile[0]
      const last = profile[profile.length - 1]
      const back = profile.slice().reverse()
      return `M ${first.x} ${first.front} ${profile.slice(1).map((point) => `L ${point.x} ${point.front}`).join(' ')} L ${last.x} ${last.back} ${back.slice(1).map((point) => `L ${point.x} ${point.back}`).join(' ')} L ${first.x} ${first.front} Z`
    })()
    : ''
  const rimMinimum = result.rim.reduce((minimum, sample) => Math.min(minimum, sample.thickness), Number.POSITIVE_INFINITY)
  const rimMaximum = result.rim.reduce((maximum, sample) => Math.max(maximum, sample.thickness), 0)
  const cellWidth = result.width / 30 * pxPerMm
  const cellHeight = result.height / 30 * pxPerMm
  const observationY = frontCenterY + state.focalY * pxPerMm
  const rulerStart = frontCenterX - 25 * pxPerMm

  return <main className="h-[100dvh] overflow-hidden bg-slate-950 p-7 text-white sm:p-10">
    <div className="flex h-full flex-col">
      <header className="flex items-start justify-between gap-6">
        <div><p className="text-xs font-black uppercase tracking-[.22em] text-cyan-300">Espessura das lentes</p><h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-5xl">A borda muda conforme a lente gira</h1><p className="mt-2 text-sm text-slate-400">{state.frameName} · giro {Math.round(state.rotationAngle)}°</p></div>
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-right text-sm"><p className="font-bold text-cyan-100">{formatDegree(state.sphere)} / {formatDegree(state.cylinder)} × {Math.round(state.axis)}°</p><p className="mt-1 text-slate-400">Índice {state.index.toFixed(2)} · curva base {state.baseCurve === 0 ? '0' : `+${state.baseCurve}`}</p></div>
      </header>
      <section className="mt-7 grid min-h-0 flex-1 gap-5 lg:grid-cols-[1.25fr_.95fr]">
        <div className="flex min-h-0 flex-col rounded-3xl border border-cyan-300/25 bg-cyan-400/5 p-5">
          <div className="flex items-center justify-between gap-4"><p className="text-xs font-black uppercase tracking-[.16em] text-cyan-200">Lente vista de frente</p><span className="text-xs font-bold text-slate-400">linha de observação fixa</span></div>
          <div className="flex min-h-0 flex-1 items-center justify-center">
          <svg viewBox={`0 0 ${frontCanvasWidth} ${frontCanvasHeight}`} style={frontCanvasStyle} className="block" role="img" aria-label={`Lente girada em ${Math.round(state.rotationAngle)} graus com espessura calculada ao longo da borda`}>
            <defs><clipPath id="tower-lens-rotation-frame"><path d={path} /></clipPath></defs>
            <path d={path} fill="rgba(15,23,42,.8)" stroke="rgba(103,232,249,.85)" strokeWidth="2" />
            <g clipPath="url(#tower-lens-rotation-frame)">{result.samples.map((sample, index) => <rect key={index} x={frontCenterX + sample.x * pxPerMm - cellWidth / 2 - 1} y={frontCenterY + sample.y * pxPerMm - cellHeight / 2 - 1} width={cellWidth + 2} height={cellHeight + 2} fill={colorFor(sample.thickness)} opacity=".9" />)}</g>
            {result.rim.map((sample, index) => { const next = result.rim[(index + 1) % result.rim.length]; return <line key={index} x1={frontCenterX + sample.x * pxPerMm} y1={frontCenterY + sample.y * pxPerMm} x2={frontCenterX + next.x * pxPerMm} y2={frontCenterY + next.y * pxPerMm} stroke={colorFor(sample.thickness)} strokeWidth="6" strokeLinecap="round" /> })}
            <line x1="45" y1={observationY} x2={frontCanvasWidth - 45} y2={observationY} stroke="rgba(253,224,71,.8)" strokeWidth="1.5" strokeDasharray="6 5" />
            <circle cx={frontCenterX + state.focalX * pxPerMm} cy={observationY} r="5" fill="white" stroke="#0891b2" strokeWidth="2" />
            <path d={path} fill="none" stroke="rgba(255,255,255,.72)" strokeWidth="1" />
            {state.showCalibrator && presentationScale === 1 && <g transform={`translate(${rulerStart} ${frontCanvasHeight - 19})`}><line x1="0" y1="0" x2={50 * pxPerMm} y2="0" stroke="#fcd34d" strokeWidth="3" /><line x1="0" y1="-7" x2="0" y2="7" stroke="#fcd34d" strokeWidth="3" /><line x1={50 * pxPerMm} y1="-7" x2={50 * pxPerMm} y2="7" stroke="#fcd34d" strokeWidth="3" /><text x={25 * pxPerMm} y="-10" textAnchor="middle" fill="#fde68a" fontSize="11" fontWeight="800">50 mm · calibre com régua</text></g>}
          </svg>
          </div>
        </div>
        <div className="grid min-h-0 gap-5 grid-rows-[1fr_auto]">
          <div className="rounded-3xl border border-white/10 bg-slate-900/75 p-5"><div className="flex items-center justify-between gap-4"><p className="text-xs font-black uppercase tracking-[.16em] text-slate-400">Borda externa na direção observada</p><span className="text-sm font-black text-cyan-100">{Math.round(state.rotationAngle)}°</span></div><div className="mt-3"><p className="mb-1 text-[10px] font-black uppercase tracking-[.14em] text-cyan-200">Vista física</p><div style={edgePhysicalStyle} className="mx-auto"><LensPhysicalView rim={result.rim} samples={result.samples} widthMm={result.width} heightMm={result.height} focalX={state.focalX} focalY={state.focalY} index={state.index} calibrationScale={state.calibrationScale * presentationScale} showCalibrator={false} view="edge" /></div></div><div className="mt-3"><p className="mb-1 text-[10px] font-black uppercase tracking-[.14em] text-slate-500">Perfil calculado</p><svg viewBox="0 0 360 110" style={edgeProfileStyle} className="mx-auto block" role="img" aria-label="Perfil calculado e espelhado da borda no ângulo selecionado"><path d={profilePath} transform="translate(360 0) scale(-1 1)" fill="rgba(34,211,238,.62)" stroke="rgba(165,243,252,.95)" strokeWidth=".6" /></svg></div><p className="mt-2 text-sm leading-6 text-slate-300">{presentationScale === 1 ? 'Escala física calibrada.' : 'Representação ampliada para conversa à distância.'}</p></div>
          <div className="grid grid-cols-2 gap-3"><div className="rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-xs font-black uppercase tracking-[.14em] text-slate-500">Borda mais fina</p><p className="mt-2 text-2xl font-black text-cyan-100">{rimMinimum.toFixed(2)} mm</p></div><div className="rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-xs font-black uppercase tracking-[.14em] text-slate-500">Borda mais grossa</p><p className="mt-2 text-2xl font-black text-amber-200">{rimMaximum.toFixed(2)} mm</p></div></div>
        </div>
      </section>
    </div>
  </main>
}

function Control({ label, value, children }: { label: string; value: string; children: React.ReactNode }) { return <div><div className="mb-2 flex items-center justify-between gap-3"><p className="text-xs font-black uppercase tracking-[.14em] text-slate-500">{label}</p><span className="text-xs font-bold text-cyan-100">{value}</span></div>{children}</div> }
function Pill({ active, compact = false, onClick, children }: { active: boolean; compact?: boolean; onClick: () => void; children: React.ReactNode }) { return <button type="button" onClick={onClick} className={`${compact ? 'whitespace-nowrap px-2 py-1.5 text-[11px]' : 'px-3 py-2 text-xs'} rounded-lg border font-bold transition ${active ? 'border-cyan-300/45 bg-cyan-400/15 text-cyan-100' : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'}`}>{children}</button> }
function Range({ label, value, min, max, suffix, valueLabel, disabled = false, onChange }: { label: string; value: number; min: number; max: number; suffix: string; valueLabel?: string; disabled?: boolean; onChange: (value: number) => void }) { return <label className={`block ${disabled ? 'opacity-55' : ''}`}><div className="mb-2 flex items-center justify-between gap-3"><span className="text-xs font-black uppercase tracking-[.14em] text-slate-500">{label}</span><span className="text-xs font-bold text-cyan-100">{valueLabel ?? `${Math.round(value)}${suffix}`}{disabled ? ' · receita' : ''}</span></div><input type="range" min={min} max={max} value={value} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} className="w-full cursor-pointer accent-cyan-300 disabled:cursor-not-allowed" /></label> }
function formatDegree(value: number) { return `${value >= 0 ? '+' : ''}${value.toFixed(2)}` }
