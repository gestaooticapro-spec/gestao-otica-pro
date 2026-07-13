'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDownUp, ArrowLeft, GitCompareArrows, MonitorUp } from 'lucide-react'
import type { LensGeometry } from '@/lib/actions/lens-geometry.actions'
import {
  drawVisualizerLens,
  getLensVisualizerFallbackRim,
  LENS_VISUALIZER_PHOTOS,
} from '@/components/catalog/LensVisualizerView'
import { closeTowerClientScreen, openTowerClientScreen } from '@/lib/tower/client-screen'

type ComparisonState = { topId: string; bottomId: string; photoIndex: number }
type ComparisonMessage =
  | { type: 'field-comparison-state'; state: ComparisonState }
  | { type: 'field-comparison-client-ready' }

type GeometryOrder = 'alphabetical-asc' | 'field-asc' | 'field-desc' | 'alphabetical-desc'

const GEOMETRY_ORDER_CYCLE: GeometryOrder[] = ['alphabetical-asc', 'field-asc', 'field-desc', 'alphabetical-desc']
const GEOMETRY_ORDER_LABEL: Record<GeometryOrder, string> = {
  'alphabetical-asc': 'A–Z',
  'field-asc': 'Campo ↑',
  'field-desc': 'Campo ↓',
  'alphabetical-desc': 'Z–A',
}

function isInsidePolygon(point: { x: number; y: number }, polygon: Array<{ x: number; y: number }>) {
  let inside = false
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current, current += 1) {
    const a = polygon[current]
    const b = polygon[previous]
    const intersects = (a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x
    if (intersects) inside = !inside
  }
  return inside
}

function getFieldAreaScore(geometry: LensGeometry): number | null {
  const zones = [geometry.pins?.distance ?? [], geometry.pins?.corridor ?? [], geometry.pins?.near ?? []].filter((zone) => zone.length >= 3)
  if (zones.length) {
    // Mede a união das áreas calibradas no mesmo recorte usado pelo visualizador.
    let covered = 0
    const steps = 44
    for (let row = 0; row < steps; row += 1) {
      for (let column = 0; column < steps; column += 1) {
        const point = { x: .24 + (column + .5) / steps * .52, y: .22 + (row + .5) / steps * .46 }
        if (zones.some((zone) => isInsidePolygon(point, zone))) covered += 1
      }
    }
    return covered
  }

  const declaredWidths = [geometry.distance_width, geometry.intermediate_width ?? geometry.corridor_opening, geometry.near_width]
    .filter((value): value is number => typeof value === 'number')
  return declaredWidths.length ? declaredWidths.reduce((total, width) => total + width, 0) : null
}

function LensSimulation({ geometry, geometries, photoIndex, compact = false }: {
  geometry: LensGeometry | null
  geometries: LensGeometry[]
  photoIndex: number
  compact?: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const [loadedPhoto, setLoadedPhoto] = useState(-1)
  const fallbackRim = useMemo(() => getLensVisualizerFallbackRim(geometries), [geometries])
  const photo = LENS_VISUALIZER_PHOTOS[photoIndex] ?? LENS_VISUALIZER_PHOTOS[0]

  useEffect(() => {
    const image = new Image()
    image.onload = () => { imageRef.current = image; setLoadedPhoto(photoIndex) }
    image.onerror = () => { imageRef.current = null; setLoadedPhoto(photoIndex) }
    image.src = photo.src
  }, [photo.src, photoIndex])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return
    if (!geometry) {
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.fillStyle = '#0f172a'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.fillStyle = '#94a3b8'
      context.font = 'bold 28px system-ui'
      context.textAlign = 'center'
      context.fillText('Selecione uma lente', canvas.width / 2, canvas.height / 2)
      return
    }
    drawVisualizerLens(canvas, geometry, imageRef.current, photo.sharpZones, true, null, null, {}, fallbackRim)
  }, [fallbackRim, geometry, loadedPhoto, photo.sharpZones])

  return <div className={`overflow-hidden rounded-2xl border border-white/10 bg-slate-950 ${compact ? 'flex justify-center p-1.5' : 'flex min-h-0 items-center justify-center p-2'}`}>
    <canvas ref={canvasRef} width={960} height={540} className={compact ? 'h-36 w-auto max-w-full' : 'aspect-video max-h-full max-w-full'} />
  </div>
}

function GeometryPicker({ label, selectedId, geometries, photoIndex, onChange }: {
  label: string
  selectedId: string
  geometries: LensGeometry[]
  photoIndex: number
  onChange: (id: string) => void
}) {
  const selected = geometries.find((geometry) => geometry.id === selectedId) ?? null
  return <section className="rounded-2xl border border-white/10 bg-slate-950/45 p-3"><div className="flex items-center justify-between gap-3"><p className="text-xs font-black uppercase tracking-[.16em] text-emerald-200">{label}</p><span className="text-xs text-slate-500">{selected?.visual_design_type || 'Geometria'}</span></div><div className="relative mt-2"><LensSimulation geometry={selected} geometries={geometries} photoIndex={photoIndex} compact /><select value={selectedId} onChange={(event) => onChange(event.target.value)} className="absolute inset-x-2 top-2 z-10 h-10 rounded-xl border border-white/15 bg-slate-950/75 px-3 text-sm font-bold text-white shadow-lg shadow-black/30 outline-none backdrop-blur-md transition focus:border-emerald-300/60"><option value="">Selecione uma lente</option>{geometries.map((geometry) => <option key={geometry.id} value={geometry.id}>{geometry.family_name}</option>)}</select></div></section>
}

export default function TowerLensFieldComparison({ storeId, geometries, clientMode = false }: { storeId: number; geometries: LensGeometry[]; clientMode?: boolean }) {
  const defaults = useMemo<ComparisonState>(() => ({ topId: geometries[0]?.id ?? '', bottomId: geometries[1]?.id ?? geometries[0]?.id ?? '', photoIndex: 0 }), [geometries])
  const [state, setState] = useState<ComparisonState>(defaults)
  const [clientOpen, setClientOpen] = useState(false)
  const [geometryOrder, setGeometryOrder] = useState<GeometryOrder>('alphabetical-asc')
  const channelRef = useRef<BroadcastChannel | null>(null)
  const stateRef = useRef(state)
  const channelName = `tower-lens-field-comparison-${storeId}`
  const top = geometries.find((geometry) => geometry.id === state.topId) ?? null
  const bottom = geometries.find((geometry) => geometry.id === state.bottomId) ?? null
  const orderedGeometries = useMemo(() => [...geometries].sort((first, second) => {
    const alphabeticalDirection = geometryOrder === 'alphabetical-desc' ? -1 : 1
    if (geometryOrder === 'alphabetical-asc' || geometryOrder === 'alphabetical-desc') {
      return first.family_name.localeCompare(second.family_name, 'pt-BR') * alphabeticalDirection
    }
    const firstScore = getFieldAreaScore(first)
    const secondScore = getFieldAreaScore(second)
    if (firstScore === null && secondScore === null) return first.family_name.localeCompare(second.family_name, 'pt-BR')
    if (firstScore === null) return 1
    if (secondScore === null) return -1
    const fieldDirection = geometryOrder === 'field-desc' ? -1 : 1
    return (firstScore - secondScore) * fieldDirection || first.family_name.localeCompare(second.family_name, 'pt-BR') * fieldDirection
  }), [geometries, geometryOrder])

  useEffect(() => { setState(defaults) }, [defaults])
  useEffect(() => {
    stateRef.current = state
    if (!clientMode) channelRef.current?.postMessage({ type: 'field-comparison-state', state } satisfies ComparisonMessage)
  }, [clientMode, state])
  useEffect(() => {
    const channel = new BroadcastChannel(channelName)
    channelRef.current = channel
    channel.onmessage = (event: MessageEvent<ComparisonMessage>) => {
      const message = event.data
      if (!message || typeof message !== 'object') return
      if (clientMode && message.type === 'field-comparison-state') setState(message.state)
      if (!clientMode && message.type === 'field-comparison-client-ready') channel.postMessage({ type: 'field-comparison-state', state: stateRef.current } satisfies ComparisonMessage)
    }
    if (clientMode) channel.postMessage({ type: 'field-comparison-client-ready' } satisfies ComparisonMessage)
    return () => { channel.close(); channelRef.current = null }
  }, [channelName, clientMode])

  function toggleClient() {
    if (clientOpen) { closeTowerClientScreen(); setClientOpen(false); return }
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    url.searchParams.set('client', '1')
    if (openTowerClientScreen(url.toString())) setClientOpen(true)
  }

  if (clientMode) return <ClientComparison top={top} bottom={bottom} geometries={geometries} photoIndex={state.photoIndex} />

  return (
    <main className="min-h-[100dvh] bg-slate-950 px-5 py-5 text-slate-100 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-6xl">
        <div className="rounded-3xl border border-emerald-300/20 bg-gradient-to-br from-emerald-400/15 via-slate-900 to-slate-950 p-6 shadow-2xl shadow-black/30 sm:p-7">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3">
                <Link href={`/torre/${storeId}?menu=informacoes`} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white" aria-label="Voltar para Informações Úteis"><ArrowLeft size={19} /></Link>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-300 text-slate-950"><GitCompareArrows size={24} strokeWidth={2.4} /></div>
              </div>
              <p className="mt-5 text-xs font-black uppercase tracking-[.2em] text-emerald-300">Informações úteis</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">Comparativo de campos das lentes</h1>
            </div>
            <button type="button" onClick={toggleClient} className="flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-emerald-300 px-5 py-4 text-sm font-bold text-slate-950 transition hover:bg-emerald-200"><MonitorUp size={20} /> {clientOpen ? 'Fechar tela cliente' : 'Abrir tela cliente'}</button>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-nowrap gap-2">
              {LENS_VISUALIZER_PHOTOS.map((photo, index) => <button key={photo.label} type="button" onClick={() => setState((current) => ({ ...current, photoIndex: index }))} className={`shrink-0 rounded-xl px-3 py-2 text-left transition ${state.photoIndex === index ? 'bg-emerald-300 text-slate-950' : 'bg-slate-900 text-slate-300 hover:bg-slate-800'}`}><span className="mr-2 text-base">{photo.icon}</span><span className="text-xs font-black">{photo.label}</span></button>)}
            </div>
            <button type="button" onClick={() => setGeometryOrder((current) => GEOMETRY_ORDER_CYCLE[(GEOMETRY_ORDER_CYCLE.indexOf(current) + 1) % GEOMETRY_ORDER_CYCLE.length])} className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs font-black text-slate-300 transition hover:bg-slate-800 hover:text-white" title="Alterar ordem das lentes"><ArrowDownUp size={15} /> {GEOMETRY_ORDER_LABEL[geometryOrder]}</button>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            <GeometryPicker label="Lente de cima" selectedId={state.topId} geometries={orderedGeometries} photoIndex={state.photoIndex} onChange={(topId) => setState((current) => ({ ...current, topId }))} />
            <GeometryPicker label="Lente de baixo" selectedId={state.bottomId} geometries={orderedGeometries} photoIndex={state.photoIndex} onChange={(bottomId) => setState((current) => ({ ...current, bottomId }))} />
          </div>
          {!geometries.length && <p className="mt-5 rounded-xl border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">Nenhuma geometria global foi cadastrada ainda.</p>}
        </div>
      </div>
    </main>
  )
}

function ClientComparison({ top, bottom, geometries, photoIndex }: { top: LensGeometry | null; bottom: LensGeometry | null; geometries: LensGeometry[]; photoIndex: number }) {
  const panels = [{ position: 'Lente de cima', geometry: top }, { position: 'Lente de baixo', geometry: bottom }]
  return <main className="h-[100dvh] overflow-hidden bg-slate-950 p-6 text-white sm:p-9"><div className="flex h-full flex-col"><header className="flex items-start justify-between gap-6"><div><p className="text-xs font-black uppercase tracking-[.22em] text-emerald-300">Comparativo de campos</p><h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-5xl">Como os campos mudam?</h1></div><GitCompareArrows className="text-emerald-300" size={32} /></header><section className="mt-5 grid min-h-0 flex-1 gap-4 md:grid-rows-2">{panels.map(({ position, geometry }) => <article key={position} className="grid min-h-0 grid-cols-[minmax(0,.9fr)_minmax(0,1.3fr)] items-center gap-5 rounded-3xl border border-white/10 bg-white/[.035] p-4 sm:p-5"><div><p className="text-xs font-black uppercase tracking-[.16em] text-emerald-200">{position}</p><h2 className="mt-2 text-xl font-bold text-white sm:text-3xl">{geometry?.family_name || 'Escolha uma lente'}</h2><p className="mt-2 text-sm text-slate-400">{geometry?.visual_design_type || 'A seleção do funcionário aparecerá aqui.'}</p></div><LensSimulation geometry={geometry} geometries={geometries} photoIndex={photoIndex} /></article>)}</section></div></main>
}
