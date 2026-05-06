'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, Copy, ImageIcon, RotateCcw, Ruler, ScanFace } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────
type Step = 'capture' | 'calibrate' | 'measure' | 'done'
interface Pt { x: number; y: number }

interface Handles {
  calibA: Pt; calibB: Pt        // crédito: extremidades da borda longa = 85,6 mm
  pupilR: Pt; pupilL: Pt        // pupilas (R = imagem-esquerda = OD do paciente)
  bridgeR: Pt; bridgeL: Pt      // bordas internas das lentes na ponte
  mountR: Pt; mountL: Pt        // base da armação abaixo de cada pupila
  lensLeft: Pt; lensRight: Pt   // span horizontal da lente OD (medida A)
  lensTop: Pt; lensBottom: Pt   // span vertical da lente OD (medida B)
  diagA: Pt; diagB: Pt          // diagonal da lente OD (medida D)
}
type HKey = keyof Handles

type MediaPipeModule = typeof import('@mediapipe/tasks-vision')
type FaceLandmarkerInstance = Awaited<
  ReturnType<MediaPipeModule['FaceLandmarker']['createFromOptions']>
>

// ─── Constants ────────────────────────────────────────────────────────────────
const CC_MM = 85.6   // comprimento padrão ISO do cartão de crédito
const HR = 22        // raio dos handles em px (toque generoso no tablet)
const CANVAS_H = 610

const COLORS: Record<HKey, string> = {
  calibA: '#94a3b8', calibB: '#94a3b8',
  pupilR: '#60a5fa', pupilL: '#60a5fa',
  bridgeR: '#34d399', bridgeL: '#34d399',
  mountR: '#fb923c', mountL: '#fb923c',
  lensLeft: '#f87171', lensRight: '#f87171',
  lensTop: '#c084fc', lensBottom: '#c084fc',
  diagA: '#fbbf24', diagB: '#fbbf24',
}

const LABELS: Record<HKey, string> = {
  calibA: 'CC1', calibB: 'CC2',
  pupilR: 'OD', pupilL: 'OE',
  bridgeR: 'P1', bridgeL: 'P2',
  mountR: '▼OD', mountL: '▼OE',
  lensLeft: '◀A', lensRight: 'A▶',
  lensTop: '▲B', lensBottom: 'B▼',
  diagA: 'D1', diagB: 'D2',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function dist(a: Pt, b: Pt) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
}

function fmt(n: number) { return n.toFixed(1) }

function drawPill(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  color: string,
) {
  ctx.save()
  ctx.font = 'bold 11px monospace'
  const w = ctx.measureText(text).width + 10
  const h = 18
  ctx.fillStyle = 'rgba(0,0,0,0.75)'
  ctx.beginPath()
  ctx.roundRect(cx - w / 2, cy - h / 2, w, h, 4)
  ctx.fill()
  ctx.fillStyle = color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, cx, cy)
  ctx.restore()
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function FrameMeasurementTool() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const landmarkerRef = useRef<FaceLandmarkerInstance | null>(null)
  const draggingRef = useRef<HKey | null>(null)   // ref to avoid stale closure in draw

  const [step, setStep] = useState<Step>('capture')
  const [canvasW, setCanvasW] = useState(900)
  const [imgBounds, setImgBounds] = useState({ x: 0, y: 0, w: 900, h: CANVAS_H })
  const [pts, setPts] = useState<Handles | null>(null)
  const [dragging, setDragging] = useState<HKey | null>(null)
  const [autoOk, setAutoOk] = useState(false)
  const [mpLoading, setMpLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  // ── Resize observer ──────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setCanvasW(Math.max(400, entry.contentRect.width))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ── MediaPipe (lazy) ─────────────────────────────────────────────────────
  async function ensureLandmarker() {
    if (landmarkerRef.current) return landmarkerRef.current
    setMpLoading(true)
    try {
      const vision = (await import('@mediapipe/tasks-vision')) as MediaPipeModule
      const wasm = await vision.FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm',
      )
      landmarkerRef.current = await vision.FaceLandmarker.createFromOptions(wasm, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
        },
        runningMode: 'IMAGE',
        numFaces: 1,
        minFaceDetectionConfidence: 0.4,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false,
      })
    } finally {
      setMpLoading(false)
    }
    return landmarkerRef.current
  }

  // ── Default handle positions based on image bounds ───────────────────────
  function defaultHandles(b: typeof imgBounds): Handles {
    const cx = b.x + b.w / 2
    const cy = b.y + b.h / 2
    return {
      calibA:     { x: b.x + b.w * 0.05,  y: b.y + b.h * 0.88 },
      calibB:     { x: b.x + b.w * 0.28,  y: b.y + b.h * 0.88 },
      pupilR:     { x: cx - b.w * 0.13,   y: cy - b.h * 0.05 },
      pupilL:     { x: cx + b.w * 0.13,   y: cy - b.h * 0.05 },
      bridgeR:    { x: cx - b.w * 0.05,   y: cy + b.h * 0.06 },
      bridgeL:    { x: cx + b.w * 0.05,   y: cy + b.h * 0.06 },
      mountR:     { x: cx - b.w * 0.13,   y: cy + b.h * 0.22 },
      mountL:     { x: cx + b.w * 0.13,   y: cy + b.h * 0.22 },
      lensLeft:   { x: cx - b.w * 0.24,   y: cy },
      lensRight:  { x: cx - b.w * 0.02,   y: cy },
      lensTop:    { x: cx - b.w * 0.13,   y: cy - b.h * 0.17 },
      lensBottom: { x: cx - b.w * 0.13,   y: cy + b.h * 0.17 },
      diagA:      { x: cx - b.w * 0.24,   y: cy - b.h * 0.17 },
      diagB:      { x: cx - b.w * 0.02,   y: cy + b.h * 0.17 },
    }
  }

  // ── Auto-detect pupils with MediaPipe ────────────────────────────────────
  async function autoDetectPupils(
    img: HTMLImageElement,
    bounds: typeof imgBounds,
  ) {
    const lm = await ensureLandmarker().catch(() => null)
    if (!lm) return
    try {
      // MediaPipe IMAGE mode — coords are normalized 0-1 relative to image
      const result = (lm as any).detect(img)
      const landmarks = result?.faceLandmarks?.[0]
      if (!landmarks?.length) return
      // leftIris=468 (camera-left = patient OD), rightIris=473 (camera-right = OE)
      const ri = landmarks[468] as Pt | undefined
      const li = landmarks[473] as Pt | undefined
      if (!ri || !li) return
      const toCanvas = (lmPt: { x: number; y: number }): Pt => ({
        x: bounds.x + lmPt.x * bounds.w,
        y: bounds.y + lmPt.y * bounds.h,
      })
      setPts(prev => {
        if (!prev) return prev
        const pupilR = toCanvas(ri)
        const pupilL = toCanvas(li)
        return {
          ...prev,
          pupilR,
          pupilL,
          mountR: { x: pupilR.x, y: bounds.y + bounds.h * 0.72 },
          mountL: { x: pupilL.x, y: bounds.y + bounds.h * 0.72 },
        }
      })
      setAutoOk(true)
    } catch {
      // silently ignore — user refines manually
    }
  }

  // ── Load image from file input ───────────────────────────────────────────
  function processFile(file: File) {
    const reader = new FileReader()
    reader.onload = ev => {
      const dataUrl = ev.target!.result as string
      const img = new Image()
      img.onload = () => {
        imgRef.current = img
        const scale = Math.min(canvasW / img.naturalWidth, CANVAS_H / img.naturalHeight)
        const dw = img.naturalWidth * scale
        const dh = img.naturalHeight * scale
        const bounds = {
          x: (canvasW - dw) / 2,
          y: (CANVAS_H - dh) / 2,
          w: dw,
          h: dh,
        }
        setImgBounds(bounds)
        setPts(defaultHandles(bounds))
        setStep('calibrate')
        autoDetectPupils(img, bounds)
      }
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) processFile(file)
    e.target.value = ''
  }

  // ── Measurements ─────────────────────────────────────────────────────────
  function calcMeasurements(h: Handles) {
    const mmpp = CC_MM / dist(h.calibA, h.calibB)
    const bCX = (h.bridgeR.x + h.bridgeL.x) / 2
    return {
      mmpp,
      calibMm:    dist(h.calibA, h.calibB) * mmpp,
      dnpOD:      Math.abs(h.pupilR.x - bCX) * mmpp,
      dnpOE:      Math.abs(h.pupilL.x - bCX) * mmpp,
      altOD:      Math.abs(h.mountR.y - h.pupilR.y) * mmpp,
      altOE:      Math.abs(h.mountL.y - h.pupilL.y) * mmpp,
      ponte:      dist(h.bridgeR, h.bridgeL) * mmpp,
      horizontal: dist(h.lensLeft, h.lensRight) * mmpp,
      vertical:   dist(h.lensTop, h.lensBottom) * mmpp,
      diagonal:   dist(h.diagA, h.diagB) * mmpp,
    }
  }

  // ── Canvas draw ──────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !imgRef.current) return
    const ctx = canvas.getContext('2d')!

    ctx.fillStyle = '#0f172a'
    ctx.fillRect(0, 0, canvasW, CANVAS_H)
    ctx.drawImage(imgRef.current, imgBounds.x, imgBounds.y, imgBounds.w, imgBounds.h)

    if (!pts) return

    const m = calcMeasurements(pts)
    const bCX = (pts.bridgeR.x + pts.bridgeL.x) / 2

    // Helper: draw a segment with a mm label
    function seg(a: Pt, b: Pt, color: string, label: string) {
      ctx.save()
      ctx.strokeStyle = color
      ctx.lineWidth = 2.5
      ctx.setLineDash([])
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
      // tick marks at endpoints
      const angle = Math.atan2(b.y - a.y, b.x - a.x)
      const perp = angle + Math.PI / 2
      const TICK = 6;
      [a, b].forEach(pt => {
        ctx.beginPath()
        ctx.moveTo(pt.x + Math.cos(perp) * TICK, pt.y + Math.sin(perp) * TICK)
        ctx.lineTo(pt.x - Math.cos(perp) * TICK, pt.y - Math.sin(perp) * TICK)
        ctx.stroke()
      })
      drawPill(ctx, label, (a.x + b.x) / 2, (a.y + b.y) / 2 - 14, color)
      ctx.restore()
    }

    // Helper: draw handle
    function handle(pt: Pt, key: HKey) {
      const active = draggingRef.current === key
      const color = COLORS[key]
      ctx.save()
      ctx.beginPath()
      ctx.arc(pt.x, pt.y, HR, 0, Math.PI * 2)
      ctx.fillStyle = active ? color : color + 'aa'
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = active ? 2.5 : 1.5
      ctx.stroke()
      ctx.fillStyle = '#fff'
      ctx.font = `bold ${HR < 20 ? 9 : 10}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(LABELS[key], pt.x, pt.y)
      ctx.restore()
    }

    // ── Calibration ───────────────────────────────────────────────────────
    const calibOk = Math.abs(m.calibMm - CC_MM) < 5
    ctx.save()
    ctx.strokeStyle = calibOk ? '#94a3b8' : '#fbbf24'
    ctx.lineWidth = 2
    ctx.setLineDash([6, 4])
    ctx.beginPath()
    ctx.moveTo(pts.calibA.x, pts.calibA.y)
    ctx.lineTo(pts.calibB.x, pts.calibB.y)
    ctx.stroke()
    ctx.restore()
    drawPill(ctx, `Cal: ${fmt(m.calibMm)} mm`, (pts.calibA.x + pts.calibB.x) / 2, (pts.calibA.y + pts.calibB.y) / 2 - 14, calibOk ? '#94a3b8' : '#fbbf24')
    handle(pts.calibA, 'calibA')
    handle(pts.calibB, 'calibB')

    // ── Measurement lines (only after calibration step) ───────────────────
    if (step === 'measure' || step === 'done') {
      // Bridge center guide
      ctx.save()
      ctx.strokeStyle = 'rgba(129,140,248,0.25)'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(bCX, imgBounds.y)
      ctx.lineTo(bCX, imgBounds.y + imgBounds.h)
      ctx.stroke()
      ctx.restore()

      // DNP — horizontal from bridge center to each pupil
      seg({ x: bCX, y: pts.pupilR.y }, pts.pupilR, '#818cf8', `DNP-OD ${fmt(m.dnpOD)}`)
      seg({ x: bCX, y: pts.pupilL.y }, pts.pupilL, '#818cf8', `DNP-OE ${fmt(m.dnpOE)}`)

      // Ponte
      seg(pts.bridgeR, pts.bridgeL, '#34d399', `Ponte ${fmt(m.ponte)}`)

      // Mounting heights — vertical from pupil to mount point
      seg(pts.pupilR, { x: pts.pupilR.x, y: pts.mountR.y }, '#fb923c', `Alt-OD ${fmt(m.altOD)}`)
      seg(pts.pupilL, { x: pts.pupilL.x, y: pts.mountL.y }, '#fb923c', `Alt-OE ${fmt(m.altOE)}`)

      // Frame dimensions
      seg(pts.lensLeft, pts.lensRight, '#f87171', `A ${fmt(m.horizontal)}`)
      seg(pts.lensTop, pts.lensBottom, '#c084fc', `B ${fmt(m.vertical)}`)
      seg(pts.diagA, pts.diagB, '#fbbf24', `D ${fmt(m.diagonal)}`)

      // All handles
      const measureKeys: HKey[] = [
        'pupilR', 'pupilL',
        'bridgeR', 'bridgeL',
        'mountR', 'mountL',
        'lensLeft', 'lensRight',
        'lensTop', 'lensBottom',
        'diagA', 'diagB',
      ]
      measureKeys.forEach(k => handle(pts[k], k))
    }
  }, [pts, dragging, step, canvasW, imgBounds]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { draw() }, [draw])

  // ── Pointer events ───────────────────────────────────────────────────────
  function canvasPos(e: React.MouseEvent | React.TouchEvent): Pt {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const sx = canvasW / rect.width
    const sy = CANVAS_H / rect.height
    if ('touches' in e) {
      const t = (e as React.TouchEvent).touches[0] ?? (e as React.TouchEvent).changedTouches[0]
      return { x: (t.clientX - rect.left) * sx, y: (t.clientY - rect.top) * sy }
    }
    const me = e as React.MouseEvent
    return { x: (me.clientX - rect.left) * sx, y: (me.clientY - rect.top) * sy }
  }

  function nearestHandle(pos: Pt): HKey | null {
    if (!pts) return null
    const active: HKey[] =
      step === 'calibrate'
        ? ['calibA', 'calibB']
        : (Object.keys(pts) as HKey[])
    let best: HKey | null = null
    let minD = HR * 2.5
    for (const k of active) {
      const d = dist(pos, pts[k])
      if (d < minD) { minD = d; best = k }
    }
    return best
  }

  function onDown(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    const key = nearestHandle(canvasPos(e))
    draggingRef.current = key
    setDragging(key)
  }

  function onMove(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    if (!draggingRef.current || !pts) return
    const pos = canvasPos(e)
    const { x: bx, y: by, w: bw, h: bh } = imgBounds
    const clamped: Pt = {
      x: Math.max(bx, Math.min(bx + bw, pos.x)),
      y: Math.max(by, Math.min(by + bh, pos.y)),
    }
    setPts(prev => prev ? { ...prev, [draggingRef.current!]: clamped } : prev)
  }

  function onUp(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    draggingRef.current = null
    setDragging(null)
  }

  // ── Copy results ─────────────────────────────────────────────────────────
  function copyResults() {
    if (!pts) return
    const m = calcMeasurements(pts)
    const text = [
      `DNP OD: ${fmt(m.dnpOD)} mm`,
      `DNP OE: ${fmt(m.dnpOE)} mm`,
      `Altura de montagem OD: ${fmt(m.altOD)} mm`,
      `Altura de montagem OE: ${fmt(m.altOE)} mm`,
      `Ponte: ${fmt(m.ponte)} mm`,
      `Horizontal (A): ${fmt(m.horizontal)} mm`,
      `Vertical (B): ${fmt(m.vertical)} mm`,
      `Diagonal (D): ${fmt(m.diagonal)} mm`,
    ].join('\n')
    navigator.clipboard.writeText(text).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  function reset() {
    setStep('capture')
    setPts(null)
    setAutoOk(false)
    imgRef.current = null
  }

  // ── Derived ──────────────────────────────────────────────────────────────
  const meas = pts ? calcMeasurements(pts) : null

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col select-none">

      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 border-b border-white/10 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
          <Ruler className="w-4 h-4" />
        </div>
        <h1 className="font-semibold text-lg">Medidor de Armação</h1>
        {autoOk && step !== 'capture' && (
          <span className="ml-auto text-xs px-2 py-1 rounded-md bg-emerald-900/50 text-emerald-400 border border-emerald-700/40 flex items-center gap-1">
            <ScanFace className="w-3 h-3" /> Pupilas detectadas
          </span>
        )}
        {mpLoading && (
          <span className="ml-auto text-xs text-slate-400 flex items-center gap-1.5">
            <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
            Carregando IA...
          </span>
        )}
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">

        {/* Canvas / Capture */}
        <div ref={containerRef} className="flex-1 min-w-0 overflow-hidden">
          {step === 'capture' ? (
            <div className="flex items-center justify-center h-full min-h-[420px] p-8">
              <div className="text-center space-y-6 max-w-sm w-full">
                <div className="w-20 h-20 rounded-full bg-indigo-900/40 border border-indigo-700/40 flex items-center justify-center mx-auto">
                  <Camera className="w-9 h-9 text-indigo-400" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold mb-2">Foto da armação no rosto</h2>
                  <p className="text-slate-400 text-sm leading-relaxed">
                    Coloque um <strong className="text-white">cartão de crédito</strong> ao lado
                    da armação e fotografe de frente, com boa iluminação.
                  </p>
                </div>
                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => {
                      const el = fileRef.current!
                      el.removeAttribute('capture')
                      el.click()
                    }}
                    className="flex items-center justify-center gap-2 w-full px-5 py-3 bg-white/5 hover:bg-white/10 rounded-xl text-sm font-medium border border-white/10 transition-colors"
                  >
                    <ImageIcon className="w-4 h-4" /> Escolher da galeria
                  </button>
                  <button
                    onClick={() => {
                      const el = fileRef.current!
                      el.setAttribute('capture', 'environment')
                      el.click()
                    }}
                    className="flex items-center justify-center gap-2 w-full px-5 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-sm font-medium transition-colors"
                  >
                    <Camera className="w-4 h-4" /> Abrir câmera
                  </button>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={onFileChange}
                />
              </div>
            </div>
          ) : (
            <canvas
              ref={canvasRef}
              width={canvasW}
              height={CANVAS_H}
              className="w-full touch-none block"
              style={{ height: CANVAS_H, cursor: dragging ? 'grabbing' : 'default' }}
              onMouseDown={onDown}
              onMouseMove={onMove}
              onMouseUp={onUp}
              onMouseLeave={onUp}
              onTouchStart={onDown}
              onTouchMove={onMove}
              onTouchEnd={onUp}
            />
          )}
        </div>

        {/* Right panel */}
        {step !== 'capture' && (
          <aside className="w-64 xl:w-72 shrink-0 flex flex-col border-l border-white/10 bg-slate-900/60">

            {/* Step indicator */}
            <div className="p-4 border-b border-white/10">
              <div className="flex items-center gap-2 mb-3">
                {(['calibrate', 'measure', 'done'] as Step[]).map((s, i) => (
                  <div key={s} className="flex items-center gap-2">
                    {i > 0 && <div className="h-px flex-1 w-6 bg-white/15" />}
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border ${
                      step === s
                        ? 'bg-indigo-600 border-indigo-400'
                        : (i === 0 && step !== 'calibrate') || step === 'done'
                          ? 'bg-emerald-800/60 border-emerald-600 text-emerald-300'
                          : 'bg-white/5 border-white/10 text-slate-400'
                    }`}>
                      {i + 1}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                {step === 'calibrate' && 'Arraste CC1 e CC2 para as extremidades da borda longa do cartão de crédito (85,6 mm).'}
                {step === 'measure' && 'Ajuste os marcadores sobre a armação. As medidas atualizam ao vivo.'}
                {step === 'done' && 'Medidas confirmadas. Copie ou reinicie.'}
              </p>
            </div>

            {/* Measurements */}
            {meas && (
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Medidas</p>

                <div className={`text-xs px-3 py-2 rounded-lg border ${
                  Math.abs(meas.calibMm - CC_MM) < 4
                    ? 'border-emerald-700/50 bg-emerald-900/20 text-emerald-400'
                    : 'border-amber-600/50 bg-amber-900/20 text-amber-400'
                }`}>
                  Calibração: {fmt(meas.calibMm)} mm
                  <span className="text-slate-500 ml-1">(ref 85,6)</span>
                </div>

                {(step === 'measure' || step === 'done') && (
                  <div className="space-y-1.5 pt-1">
                    <Row label="DNP OD"       value={meas.dnpOD}      color="#818cf8" />
                    <Row label="DNP OE"       value={meas.dnpOE}      color="#818cf8" />
                    <div className="h-px bg-white/5 my-1" />
                    <Row label="Altura OD"    value={meas.altOD}      color="#fb923c" />
                    <Row label="Altura OE"    value={meas.altOE}      color="#fb923c" />
                    <div className="h-px bg-white/5 my-1" />
                    <Row label="Ponte"        value={meas.ponte}      color="#34d399" />
                    <Row label="Horizontal A" value={meas.horizontal} color="#f87171" />
                    <Row label="Vertical B"   value={meas.vertical}   color="#c084fc" />
                    <Row label="Diagonal D"   value={meas.diagonal}   color="#fbbf24" />
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="p-4 border-t border-white/10 space-y-2 shrink-0">
              {step === 'calibrate' && (
                <button
                  onClick={() => setStep('measure')}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium transition-colors"
                >
                  Confirmar calibração →
                </button>
              )}
              {step === 'measure' && (
                <button
                  onClick={() => setStep('done')}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-medium transition-colors"
                >
                  Confirmar medidas ✓
                </button>
              )}
              {step === 'done' && (
                <button
                  onClick={copyResults}
                  className={`w-full py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                    copied ? 'bg-emerald-700 text-emerald-100' : 'bg-slate-700 hover:bg-slate-600'
                  }`}
                >
                  <Copy className="w-4 h-4" />
                  {copied ? 'Copiado!' : 'Copiar medidas'}
                </button>
              )}
              <button
                onClick={reset}
                className="w-full py-2 text-xs text-slate-500 hover:text-slate-200 transition-colors flex items-center justify-center gap-1.5"
              >
                <RotateCcw className="w-3 h-3" /> Nova foto
              </button>
            </div>
          </aside>
        )}
      </div>

      {/* Legend bar */}
      {(step === 'measure' || step === 'done') && (
        <footer className="px-4 py-2 border-t border-white/10 flex flex-wrap gap-x-4 gap-y-1 shrink-0">
          {[
            { color: '#94a3b8', label: 'Cartão' },
            { color: '#60a5fa', label: 'Pupilas' },
            { color: '#818cf8', label: 'DNP' },
            { color: '#34d399', label: 'Ponte' },
            { color: '#fb923c', label: 'Altura mont.' },
            { color: '#f87171', label: 'A horizontal' },
            { color: '#c084fc', label: 'B vertical' },
            { color: '#fbbf24', label: 'D diagonal' },
          ].map(({ color, label }) => (
            <span key={label} className="flex items-center gap-1 text-xs text-slate-400">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
              {label}
            </span>
          ))}
        </footer>
      )}
    </div>
  )
}

function Row({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-300 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
        {label}
      </span>
      <span className="font-mono font-semibold tabular-nums text-white">
        {value.toFixed(1)} <span className="text-slate-500 font-normal text-xs">mm</span>
      </span>
    </div>
  )
}
