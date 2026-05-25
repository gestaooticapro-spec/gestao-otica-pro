'use client'

import Link from 'next/link'
import { useMemo, useRef, useState, useTransition } from 'react'
import {
  ArrowLeft,
  FolderOpen,
  Download,
  ImagePlus,
  MousePointer2,
  RotateCcw,
  Ruler,
  Save,
  Undo2,
} from 'lucide-react'
import {
  saveGlobalVisagismoFrameTemplate,
  type GlobalVisagismoFrameTemplate,
} from '@/lib/actions/visagismo.actions'

type DrawLayer = 'outerRight' | 'innerRight' | 'outerLeft' | 'innerLeft' | 'bridge'

interface Point {
  x: number
  y: number
}

interface ImageState {
  src: string
  aspect: number
}

const VIEW_BOX = { width: 140, height: 60 }
const LAYERS: Array<{ id: DrawLayer; label: string }> = [
  { id: 'outerRight', label: 'Externo direito + meia ponte' },
  { id: 'innerRight', label: 'Aro dir. interno' },
  { id: 'innerLeft', label: 'Aro esq. interno' },
]

interface FrameTemplateEditorProps {
  storeId: number
  globalTemplates: GlobalVisagismoFrameTemplate[]
}

export default function FrameTemplateEditor({ storeId, globalTemplates }: FrameTemplateEditorProps) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const draggingPointRef = useRef<{ layer: DrawLayer; index: number } | null>(null)
  const [isSaving, startSaveTransition] = useTransition()
  const [saveResult, setSaveResult] = useState<{ success: boolean; message: string } | null>(null)
  const [selectedTemplateId, setSelectedTemplateId] = useState(globalTemplates[0]?.id ?? '')
  const [image, setImage] = useState<ImageState | null>(null)
  const [name, setName] = useState('Novo formato')
  const [realWidthMm, setRealWidthMm] = useState(132)
  const [imageScale, setImageScale] = useState(1)
  const [imageX, setImageX] = useState(0)
  const [imageY, setImageY] = useState(0)
  const [imageRotation, setImageRotation] = useState(0)
  const [imageOpacity, setImageOpacity] = useState(0.45)
  const [mode, setMode] = useState<'calibrate-left' | 'calibrate-right' | 'draw'>('draw')
  const [activeLayer, setActiveLayer] = useState<DrawLayer>('outerRight')
  const [leftEdge, setLeftEdge] = useState<Point>({ x: 4, y: 30 })
  const [rightEdge, setRightEdge] = useState<Point>({ x: 136, y: 30 })
  const [paths, setPaths] = useState<Record<DrawLayer, Point[]>>({
    outerRight: [],
    innerRight: [],
    outerLeft: [],
    innerLeft: [],
    bridge: [],
  })

  const imageFrame = useMemo(() => {
    if (!image) return null
    const baseWidth = 128
    const width = baseWidth * imageScale
    const height = width / image.aspect
    const cx = VIEW_BOX.width / 2 + imageX
    const cy = VIEW_BOX.height / 2 + imageY
    return {
      x: cx - width / 2,
      y: cy - height / 2,
      width,
      height,
      cx,
      cy,
    }
  }, [image, imageScale, imageX, imageY])

  const calibrationDistance = distance(leftEdge, rightEdge)
  const unitToMm = realWidthMm / Math.max(calibrationDistance, 0.0001)
  const symmetryAxisX = (leftEdge.x + rightEdge.x) / 2
  const outerFullPoints = makeMirroredFullPathPoints(paths.outerRight, symmetryAxisX)
  const generatedInnerLeft = paths.innerLeft.length > 0
    ? paths.innerLeft
    : mirrorPoints(paths.innerRight, symmetryAxisX)
  const exportJson = useMemo(() => {
    return {
      name,
      viewBox: VIEW_BOX,
      realWidthMm,
      calibration: {
        leftEdge,
        rightEdge,
        unitToMm: Number(unitToMm.toFixed(4)),
        symmetryAxisX: Number(symmetryAxisX.toFixed(2)),
      },
      paths: Object.fromEntries(
        Object.entries(paths).map(([key, points]) => [
          key,
          {
            points: points.map((point) => ({
              x: Number(point.x.toFixed(2)),
              y: Number(point.y.toFixed(2)),
            })),
            path: pointsToSmoothPath(points, key !== 'bridge'),
          },
        ]),
      ),
      generated: {
        outerFullPath: pointsToSmoothPath(outerFullPoints, false),
        innerRightPath: pointsToSmoothPath(paths.innerRight, true),
        innerLeftPath: pointsToSmoothPath(generatedInnerLeft, true),
      },
    }
  }, [generatedInnerLeft, leftEdge, name, outerFullPoints, paths, realWidthMm, rightEdge, symmetryAxisX, unitToMm])

  function handleFile(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        setImage({ src: String(reader.result), aspect: img.width / Math.max(img.height, 1) })
        setImageScale(1)
        setImageX(0)
        setImageY(0)
        setImageRotation(0)
      }
      img.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  }

  function svgPoint(event: React.MouseEvent<SVGSVGElement>): Point | null {
    const svg = svgRef.current
    if (!svg) return null
    const rect = svg.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / rect.width) * VIEW_BOX.width,
      y: ((event.clientY - rect.top) / rect.height) * VIEW_BOX.height,
    }
  }

  function handleCanvasClick(event: React.MouseEvent<SVGSVGElement>) {
    if (draggingPointRef.current) return
    const point = svgPoint(event)
    if (!point) return

    if (mode === 'calibrate-left') {
      setLeftEdge(point)
      setMode('calibrate-right')
      return
    }

    if (mode === 'calibrate-right') {
      setRightEdge(point)
      setMode('draw')
      return
    }

    setPaths((current) => ({
      ...current,
      [activeLayer]: [...current[activeLayer], point],
    }))
  }

  function undoPoint() {
    setPaths((current) => ({
      ...current,
      [activeLayer]: current[activeLayer].slice(0, -1),
    }))
  }

  function clearLayer() {
    setPaths((current) => ({
      ...current,
      [activeLayer]: [],
    }))
  }

  function mirrorLayer(source: DrawLayer, target: DrawLayer) {
    setPaths((current) => ({
      ...current,
      [target]: mirrorPoints(current[source], symmetryAxisX),
    }))
    setActiveLayer(target)
    setMode('draw')
  }

  function startPointDrag(layer: DrawLayer, index: number) {
    draggingPointRef.current = { layer, index }
  }

  function moveDraggedPoint(event: React.MouseEvent<SVGSVGElement>) {
    const draggingPoint = draggingPointRef.current
    if (!draggingPoint) return

    const point = svgPoint(event)
    if (!point) return

    setPaths((current) => ({
      ...current,
      [draggingPoint.layer]: current[draggingPoint.layer].map((item, index) =>
        index === draggingPoint.index ? point : item,
      ),
    }))
  }

  function stopPointDrag() {
    draggingPointRef.current = null
  }

  function resetImage() {
    setImageScale(1)
    setImageX(0)
    setImageY(0)
    setImageRotation(0)
    setImageOpacity(0.45)
  }

  function downloadJson() {
    const blob = new Blob([JSON.stringify(exportJson, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${slugify(name)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function saveToDatabase() {
    setSaveResult(null)
    startSaveTransition(async () => {
      const result = await saveGlobalVisagismoFrameTemplate(storeId, exportJson)
      setSaveResult({ success: result.success, message: result.message })
    })
  }

  function loadSelectedTemplate() {
    const template = globalTemplates.find((item) => item.id === selectedTemplateId)
    if (!template) return

    const importedPaths = normalizeImportedPaths(template.sourcePaths)
    const calibration = template.calibration

    setName(template.name)
    setRealWidthMm(template.realWidthMm ?? 132)
    if (isPoint(calibration.leftEdge)) setLeftEdge(calibration.leftEdge)
    if (isPoint(calibration.rightEdge)) setRightEdge(calibration.rightEdge)
    setPaths(importedPaths)
    setMode('draw')
    setActiveLayer('outerRight')
    setSaveResult({ success: true, message: `${template.name} carregado para edicao.` })
  }

  return (
    <div className="min-h-[calc(100vh-64px)] bg-slate-950 text-slate-100">
      <div className="border-b border-white/10 bg-slate-950/95">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href={`/dashboard/loja/${storeId}/visagismo`}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
              title="Voltar"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">
                <Ruler className="h-3.5 w-3.5" />
                Gabarito
              </div>
              <h1 className="mt-1 text-xl font-black tracking-tight text-white">Editor de formato</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={downloadJson}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-black uppercase text-slate-200 transition-colors hover:bg-white/10"
            >
              <Download className="h-4 w-4" />
              Exportar
            </button>
            <button
              type="button"
              onClick={saveToDatabase}
              disabled={isSaving}
              className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-3 py-2 text-xs font-black uppercase text-slate-950 transition-colors hover:bg-cyan-400 disabled:cursor-wait disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {isSaving ? 'Salvando' : 'Salvar'}
            </button>
          </div>
        </div>
        {saveResult && (
          <div className={`border-t px-4 py-2 text-center text-xs font-black uppercase tracking-[0.14em] sm:px-6 ${
            saveResult.success
              ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200'
              : 'border-rose-400/20 bg-rose-500/10 text-rose-200'
          }`}>
            {saveResult.message}
          </div>
        )}
      </div>

      <main className="mx-auto grid max-w-7xl gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[360px_1fr]">
        <aside className="space-y-3">
          <Panel title="Imagem">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) handleFile(file)
                event.target.value = ''
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-xs font-bold text-slate-200 transition-colors hover:bg-white/10"
            >
              <ImagePlus className="h-4 w-4" />
              Carregar PNG/foto
            </button>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <NumberInput label="Largura real" value={realWidthMm} min={90} max={180} step={1} onChange={setRealWidthMm} suffix="mm" />
              <NumberInput label="Opacidade" value={imageOpacity} min={0.05} max={1} step={0.05} onChange={setImageOpacity} />
              <NumberInput label="Zoom" value={imageScale} min={0.2} max={3} step={0.02} onChange={setImageScale} />
              <NumberInput label="Rotacao" value={imageRotation} min={-25} max={25} step={0.5} onChange={setImageRotation} />
              <NumberInput label="Mover X" value={imageX} min={-40} max={40} step={0.5} onChange={setImageX} />
              <NumberInput label="Mover Y" value={imageY} min={-25} max={25} step={0.5} onChange={setImageY} />
            </div>
            <button
              type="button"
              onClick={resetImage}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-bold text-slate-300 transition-colors hover:bg-white/10"
            >
              <RotateCcw className="h-4 w-4" />
              Resetar imagem
            </button>
          </Panel>

          <Panel title="Gabaritos salvos">
            {globalTemplates.length > 0 ? (
              <div className="space-y-2">
                <select
                  value={selectedTemplateId}
                  onChange={(event) => setSelectedTemplateId(event.target.value)}
                  className="h-10 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-xs font-bold text-slate-100 outline-none focus:border-cyan-400/60"
                >
                  {globalTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={loadSelectedTemplate}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-xs font-bold text-slate-200 transition-colors hover:bg-white/10"
                >
                  <FolderOpen className="h-4 w-4" />
                  Carregar para edicao
                </button>
              </div>
            ) : (
              <p className="text-xs leading-5 text-slate-500">
                Nenhum gabarito salvo no banco ainda.
              </p>
            )}
          </Panel>

          <Panel title="Calibracao">
            <button
              type="button"
              onClick={() => setMode('calibrate-left')}
              className={`flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-black uppercase transition-colors ${
                mode.startsWith('calibrate')
                  ? 'border-cyan-400/60 bg-cyan-400/10 text-cyan-200'
                  : 'border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/10'
              }`}
            >
              <MousePointer2 className="h-4 w-4" />
              Marcar extremidades
            </button>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
              <Metric label="Distancia" value={`${calibrationDistance.toFixed(1)} u`} />
              <Metric label="Escala" value={`${unitToMm.toFixed(2)} mm/u`} />
            </div>
          </Panel>

          <Panel title="Desenho">
            <label className="block text-[10px] font-black uppercase text-slate-500">Nome</label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm font-bold text-slate-100 outline-none focus:border-cyan-400/60"
            />
            <div className="mt-3 grid grid-cols-1 gap-2">
              {LAYERS.map((layer) => (
                <button
                  key={layer.id}
                  type="button"
                  onClick={() => {
                    setMode('draw')
                    setActiveLayer(layer.id)
                  }}
                  className={`rounded-lg border px-3 py-2 text-left text-xs font-bold transition-colors ${
                    activeLayer === layer.id && mode === 'draw'
                      ? 'border-cyan-400/60 bg-cyan-400/10 text-cyan-100'
                      : 'border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/10'
                  }`}
                >
                  {layer.label}
                  <span className="float-right font-mono text-slate-500">{paths[layer.id].length}</span>
                </button>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={undoPoint}
                className="flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-bold text-slate-300 transition-colors hover:bg-white/10"
              >
                <Undo2 className="mr-1 inline h-3.5 w-3.5" />
                Desfazer
              </button>
              <button
                type="button"
                onClick={clearLayer}
                className="flex-1 rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-200 transition-colors hover:bg-rose-500/20"
              >
                Limpar
              </button>
            </div>
            <div className="mt-3">
              <button
                type="button"
                onClick={() => mirrorLayer('innerRight', 'innerLeft')}
                disabled={paths.innerRight.length === 0}
                className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-bold text-slate-300 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Espelhar interno
              </button>
            </div>
          </Panel>
        </aside>

        <section className="min-w-0 rounded-lg border border-white/10 bg-white/[0.03] p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-300">
                {mode === 'calibrate-left'
                  ? 'Clique na extremidade esquerda'
                  : mode === 'calibrate-right'
                    ? 'Clique na extremidade direita'
                    : `Desenhando: ${LAYERS.find((layer) => layer.id === activeLayer)?.label}`}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Desenhe o externo direito ate o eixo central. O lado esquerdo e gerado por simetria.
              </p>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg bg-slate-100 p-3">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${VIEW_BOX.width} ${VIEW_BOX.height}`}
              className="aspect-[7/3] w-full cursor-crosshair bg-white"
              onClick={handleCanvasClick}
              onMouseMove={moveDraggedPoint}
              onMouseUp={stopPointDrag}
              onMouseLeave={stopPointDrag}
            >
              <Grid />
              <line x1={4} y1={30} x2={136} y2={30} stroke="#94a3b8" strokeWidth="0.35" strokeDasharray="2 2" />
              <line x1={70} y1={4} x2={70} y2={56} stroke="#94a3b8" strokeWidth="0.35" strokeDasharray="2 2" />
              {image && imageFrame && (
                <image
                  href={image.src}
                  x={imageFrame.x}
                  y={imageFrame.y}
                  width={imageFrame.width}
                  height={imageFrame.height}
                  opacity={imageOpacity}
                  preserveAspectRatio="xMidYMid meet"
                  transform={`rotate(${imageRotation} ${imageFrame.cx} ${imageFrame.cy})`}
                />
              )}
              <line x1={leftEdge.x} y1={leftEdge.y} x2={rightEdge.x} y2={rightEdge.y} stroke="#0891b2" strokeWidth="0.8" />
              <GuidePoint point={leftEdge} label="E" />
              <GuidePoint point={rightEdge} label="D" />
              {outerFullPoints.length > 0 && (
                <PreviewPath points={outerFullPoints} />
              )}
              <Polyline
                layer="outerRight"
                points={paths.outerRight}
                active={activeLayer === 'outerRight'}
                closed={false}
                onPointDragStart={startPointDrag}
              />
              <Polyline
                layer="innerRight"
                points={paths.innerRight}
                active={activeLayer === 'innerRight'}
                closed
                onPointDragStart={startPointDrag}
              />
              <Polyline
                layer="innerLeft"
                points={generatedInnerLeft}
                active={activeLayer === 'innerLeft'}
                closed
                onPointDragStart={startPointDrag}
              />
            </svg>
          </div>

          <div className="mt-3 rounded-lg border border-white/10 bg-slate-950/50 p-3">
            <pre className="max-h-56 overflow-auto text-xs leading-5 text-slate-300">
              {JSON.stringify(exportJson, null, 2)}
            </pre>
          </div>
        </section>
      </main>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
      <h2 className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{title}</h2>
      {children}
    </div>
  )
}

function NumberInput({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  suffix?: string
  onChange: (value: number) => void
}) {
  return (
    <label className="block rounded-lg border border-white/10 bg-black/20 p-2">
      <span className="block text-[9px] font-black uppercase text-slate-500">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1 h-7 w-full bg-transparent font-mono text-xs font-bold text-slate-100 outline-none"
      />
      {suffix && <span className="text-[10px] font-bold text-slate-500">{suffix}</span>}
    </label>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 px-2 py-1.5">
      <p className="text-[9px] font-black uppercase text-slate-500">{label}</p>
      <p className="font-mono text-xs font-bold text-slate-200">{value}</p>
    </div>
  )
}

function Grid() {
  const vertical = Array.from({ length: 15 }, (_, index) => index * 10)
  const horizontal = Array.from({ length: 7 }, (_, index) => index * 10)

  return (
    <g opacity="0.42">
      {vertical.map((x) => (
        <line key={`v-${x}`} x1={x} y1={0} x2={x} y2={VIEW_BOX.height} stroke="#cbd5e1" strokeWidth="0.22" />
      ))}
      {horizontal.map((y) => (
        <line key={`h-${y}`} x1={0} y1={y} x2={VIEW_BOX.width} y2={y} stroke="#cbd5e1" strokeWidth="0.22" />
      ))}
    </g>
  )
}

function GuidePoint({ point, label }: { point: Point; label: string }) {
  return (
    <g>
      <circle cx={point.x} cy={point.y} r="1.6" fill="#06b6d4" stroke="#0f172a" strokeWidth="0.4" />
      <text x={point.x} y={point.y - 2.4} textAnchor="middle" fontSize="3" fontWeight="700" fill="#0f172a">
        {label}
      </text>
    </g>
  )
}

function PreviewPath({ points }: { points: Point[] }) {
  return (
    <path
      d={pointsToSmoothPath(points, false)}
      fill="none"
      stroke="#111827"
      strokeWidth="0.78"
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity="0.42"
    />
  )
}

function Polyline({
  layer,
  points,
  active,
  closed,
  onPointDragStart,
}: {
  layer: DrawLayer
  points: Point[]
  active: boolean
  closed: boolean
  onPointDragStart: (layer: DrawLayer, index: number) => void
}) {
  if (points.length === 0) return null

  const d = pointsToSmoothPath(points, closed)

  return (
    <g>
      <path
        d={d}
        fill="none"
        stroke={active ? '#0891b2' : '#111827'}
        strokeWidth={active ? 0.95 : 0.66}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {points.map((point, index) => (
        <circle
          key={`${point.x}-${point.y}-${index}`}
          cx={point.x}
          cy={point.y}
          r={active ? 1.05 : 0.75}
          fill={active ? '#06b6d4' : '#111827'}
          className="cursor-grab"
          onMouseDown={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onPointDragStart(layer, index)
          }}
        />
      ))}
    </g>
  )
}

function pointsToSmoothPath(points: Point[], closed: boolean) {
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`

  if (!closed) return pointsToSmoothOpenPath(points)
  if (points.length < 3) return pointsToLinePath(points, false)

  const first = points[0]
  const last = points[points.length - 1]
  const commands = [`M ${midpoint(last, first).x.toFixed(2)} ${midpoint(last, first).y.toFixed(2)}`]

  points.forEach((current, index) => {
    const next = points[(index + 1) % points.length]
    const mid = midpoint(current, next)
    commands.push(`Q ${current.x.toFixed(2)} ${current.y.toFixed(2)} ${mid.x.toFixed(2)} ${mid.y.toFixed(2)}`)
  })

  commands.push('Z')
  return commands.join(' ')
}

function pointsToSmoothOpenPath(points: Point[]) {
  if (points.length < 3) return pointsToLinePath(points, false)

  const commands = [`M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`]
  commands.push(`L ${midpoint(points[0], points[1]).x.toFixed(2)} ${midpoint(points[0], points[1]).y.toFixed(2)}`)

  for (let index = 1; index < points.length - 1; index += 1) {
    const current = points[index]
    const next = points[index + 1]
    const mid = midpoint(current, next)
    commands.push(`Q ${current.x.toFixed(2)} ${current.y.toFixed(2)} ${mid.x.toFixed(2)} ${mid.y.toFixed(2)}`)
  }

  const last = points[points.length - 1]
  commands.push(`L ${last.x.toFixed(2)} ${last.y.toFixed(2)}`)
  return commands.join(' ')
}

function pointsToLinePath(points: Point[], closed: boolean) {
  const body = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ')
  return closed && points.length > 2 ? `${body} Z` : body
}

function midpoint(a: Point, b: Point): Point {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  }
}

function mirrorPoints(points: Point[], axisX: number) {
  return points.map((point) => ({
    x: axisX * 2 - point.x,
    y: point.y,
  }))
}

function makeMirroredFullPathPoints(points: Point[], axisX: number) {
  if (points.length === 0) return []
  if (points.length === 1) return points

  const firstDistanceToAxis = Math.abs(points[0].x - axisX)
  const lastDistanceToAxis = Math.abs(points[points.length - 1].x - axisX)
  const rightHalf = firstDistanceToAxis < lastDistanceToAxis ? [...points].reverse() : points
  const mirroredLeftHalf = mirrorPoints(rightHalf, axisX).reverse()

  return [...rightHalf, ...mirroredLeftHalf.slice(1)]
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function isPoint(value: unknown): value is Point {
  return (
    typeof value === 'object' &&
    value !== null &&
    Number.isFinite((value as Point).x) &&
    Number.isFinite((value as Point).y)
  )
}

function normalizeImportedPaths(value: unknown): Record<DrawLayer, Point[]> {
  const source = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}

  return {
    outerRight: normalizeImportedLayer(source.outerRight),
    innerRight: normalizeImportedLayer(source.innerRight),
    outerLeft: normalizeImportedLayer(source.outerLeft),
    innerLeft: normalizeImportedLayer(source.innerLeft),
    bridge: normalizeImportedLayer(source.bridge),
  }
}

function normalizeImportedLayer(value: unknown): Point[] {
  const candidate = Array.isArray(value)
    ? value
    : typeof value === 'object' && value !== null && Array.isArray((value as { points?: unknown }).points)
      ? (value as { points: unknown[] }).points
      : []

  return candidate
    .filter(isPoint)
    .map((point) => ({ x: point.x, y: point.y }))
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'gabarito'
}
