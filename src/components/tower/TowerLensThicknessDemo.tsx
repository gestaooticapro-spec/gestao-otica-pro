'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, MonitorUp, RotateCcw, Ruler } from 'lucide-react'
import { closeTowerClientScreen, openTowerClientScreen } from '@/lib/tower/client-screen'

type Mount = 'aro' | 'fio' | 'parafusado'
type Shape = 'arredondada' | 'quadrada'
type TemplateId = 'miopia' | 'miopiaAlta' | 'astigmatismo' | 'hipermetropia'

type LensState = {
  template: TemplateId
  sphere: number
  cylinder: number
  axis: number
  index: number
  frameScale: number
  mount: Mount
  shape: Shape
  focalX: number
  focalY: number
}

type LensMessage =
  | { type: 'lens-state'; state: LensState }
  | { type: 'lens-client-ready' }

type Sample = { x: number; y: number; thickness: number; displayFrontSag: number; withinLens: boolean }

const PX_PER_MM = 4.1
// Referência gráfica fixa: a face frontal permanece ancorada na base +4.
// O índice continua participando do cálculo de espessura, mas não faz a lente
// inteira "respirar" quando o cliente está comparando materiais.
const DISPLAY_BASE_INDEX = 1.67
const MOUNTS: Record<Mount, { label: string; edge: number; center: number }> = {
  aro: { label: 'Aro fechado', edge: 1.1, center: 1.2 },
  fio: { label: 'Fio de nylon', edge: 1.8, center: 1.2 },
  parafusado: { label: 'Parafusada', edge: 1.5, center: 1.8 },
}

const TEMPLATES: Record<TemplateId, { label: string; sphere: number; cylinder: number; axis: number }> = {
  miopia: { label: 'Miopia com astigmatismo', sphere: -3, cylinder: -2, axis: 90 },
  miopiaAlta: { label: 'Miopia alta', sphere: -6, cylinder: -2.5, axis: 90 },
  astigmatismo: { label: 'Astigmatismo forte', sphere: 0, cylinder: -4, axis: 90 },
  hipermetropia: { label: 'Hipermetropia com astigmatismo', sphere: 3.5, cylinder: -2, axis: 90 },
}

const DEFAULT_STATE: LensState = {
  template: 'miopia',
  ...TEMPLATES.miopia,
  index: 1.67,
  frameScale: 100,
  mount: 'aro',
  shape: 'arredondada',
  focalX: 0,
  focalY: 0,
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

function inside(x: number, y: number, width: number, height: number, shape: Shape) {
  const exponent = shape === 'quadrada' ? 7 : 2.7
  return (Math.abs(x) / (width / 2)) ** exponent + (Math.abs(y) / (height / 2)) ** exponent <= 1
}

function framePath(width: number, height: number, shape: Shape) {
  const exponent = shape === 'quadrada' ? 7 : 2.7
  const points = Array.from({ length: 96 }, (_, index) => {
    const angle = index / 96 * Math.PI * 2
    const cosine = Math.cos(angle)
    const sine = Math.sin(angle)
    const radius = (Math.abs(cosine) ** exponent + Math.abs(sine) ** exponent) ** (-1 / exponent)
    return { x: 180 + cosine * radius * width / 2 * PX_PER_MM, y: 112 + sine * radius * height / 2 * PX_PER_MM }
  })
  return `M ${points.map((point) => `${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' L ')} Z`
}

function calculate(state: LensState) {
  const width = 52 * state.frameScale / 100
  const height = 38 * state.frameScale / 100
  const mount = MOUNTS[state.mount]
  const raw: Array<Sample & { raw: number }> = []
  const steps = 30
  const frontBase = 4

  for (let row = 0; row < steps; row += 1) {
    for (let column = 0; column < steps; column += 1) {
      const x = ((column + .5) / steps - .5) * width
      const y = ((row + .5) / steps - .5) * height
      const opticalX = x - state.focalX
      const opticalY = y - state.focalY
      const radius = Math.hypot(opticalX, opticalY)
      const power = localPower(state.sphere, state.cylinder, state.axis, Math.atan2(opticalY, opticalX))
      const frontSag = signedSag(frontBase, radius, state.index)
      const backSag = signedSag(power - frontBase, radius, state.index)
      raw.push({ x, y, raw: frontSag + backSag, thickness: 0, withinLens: inside(x, y, width, height, state.shape), displayFrontSag: signedSag(frontBase, Math.hypot(x, y), DISPLAY_BASE_INDEX) })
    }
  }

  const maxRaw = Math.max(...raw.map((item) => item.raw))
  const equivalent = state.sphere + state.cylinder / 2
  const negative = equivalent < 0
  const samples = raw.map(({ raw, ...sample }) => ({
    ...sample,
    thickness: negative ? mount.center - raw : mount.edge + maxRaw - raw,
  }))
  // Os cálculos de espessura e os extremos usam somente a área real da lente.
  // Mantemos também as células vizinhas para que o clipPath preencha o contorno
  // inteiro, sem as pequenas falhas entre o mapa e a borda.
  const lensSamples = samples.filter((sample) => sample.withinLens)
  const maximum = lensSamples.reduce((result, sample) => sample.thickness > result.thickness ? sample : result)
  const minimum = lensSamples.reduce((result, sample) => sample.thickness < result.thickness ? sample : result)
  const top = lensSamples.filter((sample) => Math.abs(sample.y) < height / steps).sort((a, b) => a.x - b.x)
  const side = lensSamples.filter((sample) => Math.abs(sample.x) < width / steps).sort((a, b) => a.y - b.y)
  return { width, height, samples, maximum, minimum, top, side, negative }
}

export default function TowerLensThicknessDemo({ storeId, clientMode = false }: { storeId: number; clientMode?: boolean }) {
  const channelName = `tower-lens-thickness-${storeId}`
  const channelRef = useRef<BroadcastChannel | null>(null)
  const stateRef = useRef(DEFAULT_STATE)
  const [state, setState] = useState<LensState>(DEFAULT_STATE)

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

  function selectTemplate(template: TemplateId) {
    patch({ template, ...TEMPLATES[template] })
  }

  function openClient() {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    url.searchParams.set('client', '1')
    openTowerClientScreen(url.toString())
  }

  if (clientMode) return <ClientLensScreen state={state} />

  return (
    <main className="min-h-[100dvh] bg-slate-950 px-5 py-5 text-slate-100 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-6xl">
        <Link href={`/torre/${storeId}?menu=informacoes`} className="mb-6 flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white" aria-label="Voltar para Informações Úteis"><ArrowLeft size={19} /></Link>
        <div className="rounded-3xl border border-cyan-300/20 bg-gradient-to-br from-cyan-400/15 via-slate-900 to-slate-950 p-6 shadow-2xl shadow-black/30 sm:p-9">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-300 text-slate-950"><Ruler size={25} strokeWidth={2.4} /></div><p className="mt-6 text-xs font-black uppercase tracking-[.2em] text-cyan-300">Informações úteis</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">Espessura das lentes</h1><p className="mt-3 max-w-2xl text-slate-300">Conduza a conversa com os controles que fizerem sentido para a dúvida do cliente.</p></div>
            <button type="button" onClick={openClient} className="flex items-center justify-center gap-2 rounded-2xl bg-cyan-300 px-5 py-4 text-sm font-bold text-slate-950 transition hover:bg-cyan-200"><MonitorUp size={20} /> Abrir tela cliente</button>
          </div>

          <section className="mt-8 grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
            <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-5">
              <p className="text-xs font-black uppercase tracking-[.16em] text-slate-400">Grau de demonstração</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">{(Object.keys(TEMPLATES) as TemplateId[]).map((template) => <button key={template} type="button" onClick={() => selectTemplate(template)} className={`rounded-xl border p-3 text-left transition ${state.template === template ? 'border-cyan-300/55 bg-cyan-400/15 text-cyan-100' : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'}`}><span className="block text-sm font-bold">{TEMPLATES[template].label}</span><span className="mt-1 block text-xs opacity-75">{formatDegree(TEMPLATES[template].sphere)} / {formatDegree(TEMPLATES[template].cylinder)} × {TEMPLATES[template].axis}°</span></button>)}</div>
              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <Control label="Índice" value={state.index.toFixed(2)}><div className="flex flex-wrap gap-2">{[1.56, 1.60, 1.67, 1.74].map((index) => <Pill key={index} active={state.index === index} onClick={() => patch({ index })}>{index.toFixed(2)}</Pill>)}</div></Control>
                <Control label="Tipo de armação" value={MOUNTS[state.mount].label}><div className="flex flex-wrap gap-2">{(Object.keys(MOUNTS) as Mount[]).map((mount) => <Pill key={mount} active={state.mount === mount} onClick={() => patch({ mount })}>{MOUNTS[mount].label}</Pill>)}</div></Control>
                <Range label="Tamanho da lente" value={state.frameScale} min={80} max={125} suffix="%" onChange={(frameScale) => patch({ frameScale })} />
                <Range label="Eixo do cilindro" value={state.axis} min={0} max={180} suffix="°" onChange={(axis) => patch({ axis })} />
                <Range label="DNP / centro óptico" value={state.focalX} min={-8} max={8} suffix=" mm" onChange={(focalX) => patch({ focalX })} />
                <Range label="Altura do centro" value={state.focalY} min={-8} max={8} suffix=" mm" onChange={(focalY) => patch({ focalY })} />
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-white/10 pt-4"><span className="mr-1 text-xs font-bold uppercase tracking-wider text-slate-500">Formato</span>{(['arredondada', 'quadrada'] as Shape[]).map((shape) => <Pill key={shape} active={state.shape === shape} onClick={() => patch({ shape })}>{shape === 'arredondada' ? 'Arredondada' : 'Quadrada'}</Pill>)}<button type="button" onClick={() => setState(DEFAULT_STATE)} className="ml-auto flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-400 transition hover:bg-white/5 hover:text-white"><RotateCcw size={14} /> Restaurar</button></div>
            </div>
            <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/5 p-5"><p className="text-xs font-black uppercase tracking-[.16em] text-cyan-200">Como usar na conversa</p><div className="mt-4 space-y-3 text-sm leading-relaxed text-slate-300"><p><strong className="text-white">Armação menor:</strong> aumente ou reduza o tamanho para ver a borda reagir.</p><p><strong className="text-white">Índice:</strong> alterne os índices e compare a redução calculada.</p><p><strong className="text-white">Eixo:</strong> gire o cilindro para mostrar onde a borda aparece mais.</p><p><strong className="text-white">Centro óptico:</strong> desloque DNP e altura para revelar o lado que ganha mais volume.</p></div><p className="mt-5 border-t border-cyan-300/15 pt-4 text-xs leading-5 text-cyan-100/80">Demonstração geométrica. Apoia a conversa, mas não substitui o cálculo final de laboratório.</p></div>
          </section>
        </div>
        <button type="button" onClick={closeTowerClientScreen} className="mt-4 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-slate-800">Fechar tela do cliente</button>
      </div>
    </main>
  )
}

function ClientLensScreen({ state }: { state: LensState }) {
  const result = useMemo(() => calculate(state), [state])
  const path = framePath(result.width, result.height, state.shape)
  const progressColor = (thickness: number) => {
    const progress = (thickness - result.minimum.thickness) / Math.max(.05, result.maximum.thickness - result.minimum.thickness)
    return `hsl(${205 - progress * 190} 88% ${43 + progress * 14}%)`
  }
  const top = result.top.map((sample) => {
    const x = 180 + sample.x * PX_PER_MM
    const front = 60 + sample.displayFrontSag * PX_PER_MM
    return { x, front, back: front + sample.thickness * PX_PER_MM }
  })
  const topPath = top.length ? `M ${top[0].x} ${top[0].front} ${top.slice(1).map((point) => `L ${point.x} ${point.front}`).join(' ')} ${top.slice().reverse().map((point) => `L ${point.x} ${point.back}`).join(' ')} Z` : ''
  const side = result.side.map((sample) => {
    const y = 112 + sample.y * PX_PER_MM
    const front = 180 + sample.displayFrontSag * PX_PER_MM
    return { y, front, back: front + sample.thickness * PX_PER_MM }
  })
  const sidePath = side.length ? `M ${side[0].front} ${side[0].y} ${side.slice(1).map((point) => `L ${point.front} ${point.y}`).join(' ')} ${side.slice().reverse().map((point) => `L ${point.back} ${point.y}`).join(' ')} Z` : ''

  const cellWidth = result.width / 30 * PX_PER_MM
  const cellHeight = result.height / 30 * PX_PER_MM
  const cellOverlap = .75
  return <main className="h-[100dvh] overflow-hidden bg-slate-950 p-7 text-white sm:p-10"><div className="flex h-full flex-col"><header className="flex items-start justify-between gap-6"><div><p className="text-xs font-black uppercase tracking-[.22em] text-cyan-300">Espessura das lentes</p><h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-5xl">Onde a lente ganha mais volume?</h1></div><div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-right text-sm"><p className="font-bold text-cyan-100">{formatDegree(state.sphere)} / {formatDegree(state.cylinder)} × {Math.round(state.axis)}°</p><p className="mt-1 text-slate-400">Índice {state.index.toFixed(2)} · {MOUNTS[state.mount].label}</p></div></header><section className="mt-7 grid min-h-0 flex-1 gap-5 lg:grid-cols-[1.35fr_.85fr]"><div className="rounded-3xl border border-cyan-300/25 bg-cyan-400/5 p-5"><p className="text-xs font-black uppercase tracking-[.16em] text-cyan-200">Mapa frontal de espessura</p><svg viewBox="0 0 360 224" className="mt-3 h-[min(54vh,520px)] w-full" role="img" aria-label="Mapa frontal da lente"><defs><clipPath id="tower-lens-frame"><path d={path} /></clipPath></defs><path d={path} fill="rgba(15,23,42,.8)" stroke="rgba(103,232,249,.85)" strokeWidth="2" /> <g clipPath="url(#tower-lens-frame)">{result.samples.map((sample, index) => <rect key={index} x={180 + sample.x * PX_PER_MM - cellWidth / 2 - cellOverlap / 2} y={112 + sample.y * PX_PER_MM - cellHeight / 2 - cellOverlap / 2} width={cellWidth + cellOverlap} height={cellHeight + cellOverlap} fill={progressColor(sample.thickness)} opacity=".9" className="transition-all duration-300" />)}</g><circle cx={180 + state.focalX * PX_PER_MM} cy={112 + state.focalY * PX_PER_MM} r="4.5" fill="white" stroke="#0891b2" strokeWidth="2" /><path d={path} fill="none" stroke="rgba(255,255,255,.7)" strokeWidth="1" /></svg></div><div className="grid min-h-0 gap-5"><div className="rounded-3xl border border-white/10 bg-slate-900/75 p-5"><p className="text-xs font-black uppercase tracking-[.16em] text-slate-400">Borda superior</p><svg viewBox="0 0 360 120" className="mt-3 h-[min(22vh,210px)] w-full"><path d={topPath} fill="rgba(34,211,238,.62)" stroke="rgba(165,243,252,.95)" strokeWidth="2" /></svg><p className="text-sm text-slate-300">A borda muda com tamanho, índice, eixo e centro óptico.</p></div><div className="rounded-3xl border border-white/10 bg-slate-900/75 p-5"><p className="text-xs font-black uppercase tracking-[.16em] text-slate-400">Corte lateral externo</p><svg viewBox="0 0 360 224" className="mt-3 h-[min(25vh,240px)] w-full"><path d={sidePath} fill="rgba(34,211,238,.62)" stroke="rgba(165,243,252,.95)" strokeWidth="2" /></svg><p className="text-sm text-slate-300">{result.negative ? 'Em miopia, a maior espessura tende a aparecer nas bordas.' : 'Em hipermetropia, o volume tende a se concentrar no centro.'}</p></div></div></section></div></main>
}

function Control({ label, value, children }: { label: string; value: string; children: React.ReactNode }) { return <div><div className="mb-2 flex items-center justify-between gap-3"><p className="text-xs font-black uppercase tracking-[.14em] text-slate-500">{label}</p><span className="text-xs font-bold text-cyan-100">{value}</span></div>{children}</div> }
function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) { return <button type="button" onClick={onClick} className={`rounded-lg border px-3 py-2 text-xs font-bold transition ${active ? 'border-cyan-300/45 bg-cyan-400/15 text-cyan-100' : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'}`}>{children}</button> }
function Range({ label, value, min, max, suffix, onChange }: { label: string; value: number; min: number; max: number; suffix: string; onChange: (value: number) => void }) { return <label className="block"><div className="mb-2 flex items-center justify-between gap-3"><span className="text-xs font-black uppercase tracking-[.14em] text-slate-500">{label}</span><span className="text-xs font-bold text-cyan-100">{Math.round(value)}{suffix}</span></div><input type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} className="w-full cursor-pointer accent-cyan-300" /></label> }
function formatDegree(value: number) { return `${value >= 0 ? '+' : ''}${value.toFixed(2)}` }
