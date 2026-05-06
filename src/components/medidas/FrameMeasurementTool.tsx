'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, Copy, ImageIcon, RotateCcw, Ruler, ScanFace } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────
type Step = 'capture' | 'calibrate' | 'measure' | 'done'
interface Pt { x: number; y: number }

interface Handles {
  calibA: Pt; calibB: Pt        // borda longa do cartão = 85,6 mm
  pupilR: Pt; pupilL: Pt        // pupilas (R=imagem-esq=OD, L=imagem-dir=OE)
  bridgeR: Pt; bridgeL: Pt      // bordas internas das lentes na ponte
  mountR: Pt; mountL: Pt        // base da lente abaixo de cada pupila
  lensLeft: Pt; lensRight: Pt   // span horizontal (A) — lente OD
  lensTop: Pt; lensBottom: Pt   // span vertical   (B) — lente OD
  diagA: Pt; diagB: Pt          // diagonal        (D) — lente OD
}
type HKey = keyof Handles

type MPModule = typeof import('@mediapipe/tasks-vision')
type FaceLandmarkerInstance = Awaited<ReturnType<MPModule['FaceLandmarker']['createFromOptions']>>
type RawLandmark = { x: number; y: number; z: number }

// ─── Constants ────────────────────────────────────────────────────────────────
const CC_MM   = 85.6   // comprimento padrão ISO do cartão de crédito
const HR      = 15     // raio dos handles de medição
const HR_CAL  = 4      // raio do ponto de calibração (pequeno para precisão)
const CAL_ARM = 12     // comprimento dos braços do crosshair de calibração
const HIT_R   = 28     // raio de toque para handles de calibração

const COLORS: Record<HKey, string> = {
  calibA: '#e2e8f0', calibB: '#e2e8f0',
  pupilR: '#60a5fa', pupilL: '#60a5fa',
  bridgeR: '#34d399', bridgeL: '#34d399',
  mountR: '#fb923c', mountL: '#fb923c',
  lensLeft: '#f87171', lensRight: '#f87171',
  lensTop: '#c084fc', lensBottom: '#c084fc',
  diagA: '#fbbf24', diagB: '#fbbf24',
}

const LABELS: Record<HKey, string> = {
  calibA: 'CC1', calibB: 'CC2',
  pupilR: 'OD',  pupilL: 'OE',
  bridgeR: 'P1', bridgeL: 'P2',
  mountR: '↓OD', mountL: '↓OE',
  lensLeft: '←A', lensRight: 'A→',
  lensTop: 'B↑',  lensBottom: 'B↓',
  diagA: 'D1',   diagB: 'D2',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function dist(a: Pt, b: Pt) { return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2) }
function fmt(n: number) { return n.toFixed(1) }

function pill(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, color: string) {
  ctx.save()
  ctx.font = 'bold 11px monospace'
  const tw = ctx.measureText(text).width + 10
  ctx.fillStyle = 'rgba(0,0,0,0.82)'
  ctx.beginPath()
  ctx.roundRect(cx - tw / 2, cy - 9, tw, 18, 3)
  ctx.fill()
  ctx.fillStyle = color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, cx, cy)
  ctx.restore()
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function FrameMeasurementTool() {
  const containerRef   = useRef<HTMLDivElement>(null)
  const canvasRef      = useRef<HTMLCanvasElement>(null)
  const fileRef        = useRef<HTMLInputElement>(null)
  const imgRef         = useRef<HTMLImageElement | null>(null)
  const landmarkerRef  = useRef<FaceLandmarkerInstance | null>(null)
  const rawLmsRef      = useRef<RawLandmark[] | null>(null)   // landmarks brutos para aplicar pós-calibração
  const draggingRef    = useRef<HKey | null>(null)

  const [step, setStep]         = useState<Step>('capture')
  const [canvasW, setCanvasW]   = useState(800)
  const [canvasH, setCanvasH]   = useState(600)
  const [imgBounds, setImgBounds] = useState({ x: 0, y: 0, w: 800, h: 600 })
  const [pts, setPts]           = useState<Handles | null>(null)
  const [dragging, setDragging] = useState<HKey | null>(null)
  const [autoOk, setAutoOk]     = useState(false)
  const [mpLoading, setMpLoading] = useState(false)
  const [copied, setCopied]     = useState(false)

  // ── Resize → canvas sempre preenche o container ───────────────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      setCanvasW(e.contentRect.width)
      setCanvasH(e.contentRect.height)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ── MediaPipe (carrega sob demanda) ───────────────────────────────────────
  async function ensureLandmarker() {
    if (landmarkerRef.current) return landmarkerRef.current
    setMpLoading(true)
    try {
      const vision = (await import('@mediapipe/tasks-vision')) as MPModule
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
        minFaceDetectionConfidence: 0.35,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false,
      })
    } finally {
      setMpLoading(false)
    }
    return landmarkerRef.current
  }

  // ── Posições padrão antes da detecção ────────────────────────────────────
  function defaultHandles(b: typeof imgBounds): Handles {
    const cx = b.x + b.w / 2
    const cy = b.y + b.h / 2
    return {
      calibA:     { x: b.x + b.w * 0.05,  y: b.y + b.h * 0.88 },
      calibB:     { x: b.x + b.w * 0.28,  y: b.y + b.h * 0.88 },
      pupilR:     { x: cx - b.w * 0.13,   y: cy - b.h * 0.05 },
      pupilL:     { x: cx + b.w * 0.13,   y: cy - b.h * 0.05 },
      bridgeR:    { x: cx - b.w * 0.05,   y: cy + b.h * 0.03 },
      bridgeL:    { x: cx + b.w * 0.05,   y: cy + b.h * 0.03 },
      mountR:     { x: cx - b.w * 0.13,   y: cy + b.h * 0.20 },
      mountL:     { x: cx + b.w * 0.13,   y: cy + b.h * 0.20 },
      lensLeft:   { x: cx - b.w * 0.24,   y: cy },
      lensRight:  { x: cx - b.w * 0.02,   y: cy },
      lensTop:    { x: cx - b.w * 0.13,   y: cy - b.h * 0.16 },
      lensBottom: { x: cx - b.w * 0.13,   y: cy + b.h * 0.16 },
      diagA:      { x: cx - b.w * 0.24,   y: cy - b.h * 0.16 },
      diagB:      { x: cx - b.w * 0.02,   y: cy + b.h * 0.16 },
    }
  }

  // ── Aplica os landmarks do MediaPipe a todos os handles ──────────────────
  // Chamado APÓS a calibração ser confirmada para preservar a escala correta.
  function applyLandmarks(lms: RawLandmark[], b: typeof imgBounds, cur: Handles): Handles {
    const tc = (lm: RawLandmark): Pt => ({ x: b.x + lm.x * b.w, y: b.y + lm.y * b.h })

    // Iris (landmarks 468=OD, 473=OE — em foto normal, imagem-esq=OD)
    const irisR  = tc(lms[468])
    const irisL  = tc(lms[473])
    // Cantos dos olhos
    const outerR = tc(lms[33])    // externo OD
    const innerR = tc(lms[133])   // interno OD
    const topR   = tc(lms[159])   // superior OD
    const botR   = tc(lms[145])   // inferior OD
    const outerL = tc(lms[263])   // externo OE
    const innerL = tc(lms[362])   // interno OE
    const botL   = tc(lms[374])   // inferior OE

    // Margem estimada do aro (~35% da largura do olho)
    const eyeW      = Math.abs(outerR.x - innerR.x)
    const fOuter    = eyeW * 0.40   // aro se estende além do canto externo
    const fVert     = eyeW * 0.30   // aro se estende além do canto sup/inf
    const bridgeGap = (innerL.x - innerR.x) * 0.08  // folga interna da ponte

    const brR: Pt = { x: innerR.x + bridgeGap, y: (irisR.y + topR.y) / 2 }
    const brL: Pt = { x: innerL.x - bridgeGap, y: (irisL.y + tc(lms[386]).y) / 2 }

    return {
      ...cur,           // mantém calibA e calibB intactos
      pupilR:     irisR,
      pupilL:     irisL,
      bridgeR:    brR,
      bridgeL:    brL,
      mountR:     { x: irisR.x, y: botR.y + fVert },
      mountL:     { x: irisL.x, y: botL.y + Math.abs(outerL.x - innerL.x) * 0.30 },
      lensLeft:   { x: outerR.x - fOuter, y: irisR.y },
      lensRight:  { x: innerR.x + bridgeGap, y: irisR.y },
      lensTop:    { x: irisR.x, y: topR.y - fVert },
      lensBottom: { x: irisR.x, y: botR.y + fVert },
      diagA:      { x: outerR.x - fOuter,        y: topR.y - fVert },
      diagB:      { x: innerR.x + bridgeGap,     y: botR.y + fVert },
    }
  }

  // ── Roda a detecção (só armazena, não aplica ainda) ──────────────────────
  async function runDetect(img: HTMLImageElement) {
    const lm = await ensureLandmarker().catch(() => null)
    if (!lm) return
    try {
      const result = (lm as any).detect(img)
      const lms: RawLandmark[] | undefined = result?.faceLandmarks?.[0]
      if (!lms?.length) return
      rawLmsRef.current = lms
      setAutoOk(true)
    } catch { /* usuário refina manualmente */ }
  }

  // ── Processa o arquivo de imagem ─────────────────────────────────────────
  function processFile(file: File) {
    const reader = new FileReader()
    reader.onload = ev => {
      const img = new Image()
      img.onload = () => {
        imgRef.current = img
        const cw = containerRef.current?.clientWidth  ?? window.innerWidth
        const ch = containerRef.current?.clientHeight ?? window.innerHeight
        const scale = Math.min(cw / img.naturalWidth, ch / img.naturalHeight)
        const dw = img.naturalWidth  * scale
        const dh = img.naturalHeight * scale
        const b = { x: (cw - dw) / 2, y: (ch - dh) / 2, w: dw, h: dh }
        setImgBounds(b)
        setPts(defaultHandles(b))
        setStep('calibrate')
        runDetect(img)
      }
      img.src = ev.target!.result as string
    }
    reader.readAsDataURL(file)
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) processFile(f)
    e.target.value = ''
  }

  // ── Confirma calibração e aplica landmarks a todos os handles ────────────
  function confirmCalibration() {
    if (rawLmsRef.current && pts) {
      setPts(prev => prev ? applyLandmarks(rawLmsRef.current!, imgBounds, prev) : prev)
    }
    setStep('measure')
  }

  // ── Cálculo das medidas ───────────────────────────────────────────────────
  function calc(h: Handles) {
    const mmpp = CC_MM / dist(h.calibA, h.calibB)
    const bCX  = (h.bridgeR.x + h.bridgeL.x) / 2
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

  // ── Desenho do canvas ─────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !imgRef.current) return
    const ctx = canvas.getContext('2d')!

    ctx.fillStyle = '#0f172a'
    ctx.fillRect(0, 0, canvasW, canvasH)
    ctx.drawImage(imgRef.current, imgBounds.x, imgBounds.y, imgBounds.w, imgBounds.h)
    if (!pts) return

    const m   = calc(pts)
    const bCX = (pts.bridgeR.x + pts.bridgeL.x) / 2

    // Segmento com ticks + label
    function seg(a: Pt, b: Pt, color: string, label: string) {
      ctx.save()
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.setLineDash([])
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
      const angle = Math.atan2(b.y - a.y, b.x - a.x)
      const perp  = angle + Math.PI / 2
      const T = 5;
      [a, b].forEach(p => {
        ctx.beginPath()
        ctx.moveTo(p.x + Math.cos(perp) * T, p.y + Math.sin(perp) * T)
        ctx.lineTo(p.x - Math.cos(perp) * T, p.y - Math.sin(perp) * T)
        ctx.stroke()
      })
      pill(ctx, label, (a.x + b.x) / 2, (a.y + b.y) / 2 - 12, color)
      ctx.restore()
    }

    // Handle circular (medições)
    function handle(pt: Pt, key: HKey) {
      const active = draggingRef.current === key
      const color  = COLORS[key]
      ctx.save()
      ctx.beginPath()
      ctx.arc(pt.x, pt.y, HR, 0, Math.PI * 2)
      ctx.fillStyle = active ? color : color + 'bb'
      ctx.fill()
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = active ? 2.5 : 1.5
      ctx.stroke()
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 9px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(LABELS[key], pt.x, pt.y)
      ctx.restore()
    }

    // Handle de calibração — crosshair pequeno para precisão
    function calHandle(pt: Pt, key: HKey) {
      const active = draggingRef.current === key
      const color  = COLORS[key]
      ctx.save()
      ctx.strokeStyle = active ? '#fff' : color
      ctx.lineWidth = active ? 2 : 1.5
      ctx.setLineDash([])
      // crosshair
      ctx.beginPath()
      ctx.moveTo(pt.x - CAL_ARM, pt.y)
      ctx.lineTo(pt.x + CAL_ARM, pt.y)
      ctx.moveTo(pt.x, pt.y - CAL_ARM)
      ctx.lineTo(pt.x, pt.y + CAL_ARM)
      ctx.stroke()
      // ponto central pequeno
      ctx.beginPath()
      ctx.arc(pt.x, pt.y, HR_CAL, 0, Math.PI * 2)
      ctx.fillStyle = active ? '#fff' : color
      ctx.fill()
      // label abaixo
      ctx.fillStyle = color
      ctx.font = 'bold 10px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(LABELS[key], pt.x, pt.y + HR_CAL + 3)
      ctx.restore()
    }

    // ── Linha de calibração ─────────────────────────────────────────────
    const calOk = Math.abs(m.calibMm - CC_MM) < 4
    ctx.save()
    ctx.strokeStyle = calOk ? '#94a3b8' : '#fbbf24'
    ctx.lineWidth = 1.5
    ctx.setLineDash([5, 4])
    ctx.beginPath()
    ctx.moveTo(pts.calibA.x, pts.calibA.y)
    ctx.lineTo(pts.calibB.x, pts.calibB.y)
    ctx.stroke()
    ctx.restore()
    pill(ctx,
      `${fmt(m.calibMm)} mm`,
      (pts.calibA.x + pts.calibB.x) / 2,
      (pts.calibA.y + pts.calibB.y) / 2 - 14,
      calOk ? '#94a3b8' : '#fbbf24',
    )
    calHandle(pts.calibA, 'calibA')
    calHandle(pts.calibB, 'calibB')

    // ── Linhas de medição (só na etapa measure/done) ────────────────────
    if (step === 'measure' || step === 'done') {
      // guia vertical da ponte
      ctx.save()
      ctx.strokeStyle = 'rgba(129,140,248,0.22)'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(bCX, imgBounds.y)
      ctx.lineTo(bCX, imgBounds.y + imgBounds.h)
      ctx.stroke()
      ctx.restore()

      seg({ x: bCX, y: pts.pupilR.y }, pts.pupilR, '#818cf8', `DNP-OD ${fmt(m.dnpOD)}`)
      seg({ x: bCX, y: pts.pupilL.y }, pts.pupilL, '#818cf8', `DNP-OE ${fmt(m.dnpOE)}`)
      seg(pts.bridgeR, pts.bridgeL, '#34d399', `Ponte ${fmt(m.ponte)}`)
      seg(pts.pupilR, { x: pts.pupilR.x, y: pts.mountR.y }, '#fb923c', `Alt-OD ${fmt(m.altOD)}`)
      seg(pts.pupilL, { x: pts.pupilL.x, y: pts.mountL.y }, '#fb923c', `Alt-OE ${fmt(m.altOE)}`)
      seg(pts.lensLeft, pts.lensRight, '#f87171', `A ${fmt(m.horizontal)}`)
      seg(pts.lensTop, pts.lensBottom, '#c084fc', `B ${fmt(m.vertical)}`)
      seg(pts.diagA, pts.diagB, '#fbbf24', `D ${fmt(m.diagonal)}`)

      const mKeys: HKey[] = [
        'pupilR', 'pupilL', 'bridgeR', 'bridgeL',
        'mountR', 'mountL', 'lensLeft', 'lensRight',
        'lensTop', 'lensBottom', 'diagA', 'diagB',
      ]
      mKeys.forEach(k => handle(pts[k], k))
    }
  }, [pts, dragging, step, canvasW, canvasH, imgBounds]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { draw() }, [draw])

  // ── Eventos de ponteiro/toque ─────────────────────────────────────────────
  function canvasPos(e: React.MouseEvent | React.TouchEvent): Pt {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const sx = canvasW / rect.width
    const sy = canvasH / rect.height
    if ('touches' in e) {
      const t = (e as React.TouchEvent).touches[0] ?? (e as React.TouchEvent).changedTouches[0]
      return { x: (t.clientX - rect.left) * sx, y: (t.clientY - rect.top) * sy }
    }
    const me = e as React.MouseEvent
    return { x: (me.clientX - rect.left) * sx, y: (me.clientY - rect.top) * sy }
  }

  function nearestHandle(pos: Pt): HKey | null {
    if (!pts) return null
    const calOnly = step === 'calibrate'
    const keys: HKey[] = calOnly ? ['calibA', 'calibB'] : (Object.keys(pts) as HKey[])
    let best: HKey | null = null
    let minD = Infinity
    for (const k of keys) {
      const isCalKey = k === 'calibA' || k === 'calibB'
      const threshold = isCalKey ? HIT_R : HR * 2.5
      const d = dist(pos, pts[k])
      if (d < threshold && d < minD) { minD = d; best = k }
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
    const p: Pt = {
      x: Math.max(bx, Math.min(bx + bw, pos.x)),
      y: Math.max(by, Math.min(by + bh, pos.y)),
    }
    setPts(prev => prev ? { ...prev, [draggingRef.current!]: p } : prev)
  }

  function onUp(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    draggingRef.current = null
    setDragging(null)
  }

  // ── Copiar resultados ─────────────────────────────────────────────────────
  function copyResults() {
    if (!pts) return
    const m = calc(pts)
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
    rawLmsRef.current = null
    imgRef.current = null
  }

  const meas   = pts ? calc(pts) : null
  const calOk  = meas ? Math.abs(meas.calibMm - CC_MM) < 4 : false

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    // Container fixo tela-cheia
    <div className="fixed inset-0 bg-slate-950 text-white overflow-hidden">

      {/* Canvas sempre montado (para o ResizeObserver funcionar imediatamente) */}
      <div ref={containerRef} className="absolute inset-0">
        {step !== 'capture' && (
          <canvas
            ref={canvasRef}
            width={canvasW}
            height={canvasH}
            className="absolute inset-0 w-full h-full touch-none"
            style={{ cursor: dragging ? 'grabbing' : 'default' }}
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

      {/* ── TELA DE CAPTURA ────────────────────────────────────────────── */}
      {step === 'capture' && (
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <div className="text-center space-y-6 max-w-sm w-full">
            <div className="w-20 h-20 rounded-full bg-indigo-900/40 border border-indigo-700/40 flex items-center justify-center mx-auto">
              <Ruler className="w-9 h-9 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-xl font-semibold mb-2">Medidor de Armação</h1>
              <p className="text-slate-400 text-sm leading-relaxed">
                Coloque um <strong className="text-white">cartão de crédito</strong> ao lado
                da armação e fotografe de frente com boa iluminação.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => { fileRef.current!.removeAttribute('capture'); fileRef.current!.click() }}
                className="flex items-center justify-center gap-2 w-full px-5 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium transition-colors"
              >
                <ImageIcon className="w-4 h-4" /> Escolher da galeria
              </button>
              <button
                onClick={() => { fileRef.current!.setAttribute('capture', 'environment'); fileRef.current!.click() }}
                className="flex items-center justify-center gap-2 w-full px-5 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-sm font-medium transition-colors"
              >
                <Camera className="w-4 h-4" /> Abrir câmera
              </button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
          </div>
        </div>
      )}

      {/* ── OVERLAYS SOBRE O CANVAS ────────────────────────────────────── */}
      {step !== 'capture' && (
        <>
          {/* Topo-esquerda: título + status IA */}
          <div className="absolute top-3 left-3 flex items-center gap-2 pointer-events-none">
            <div className="w-7 h-7 rounded-lg bg-indigo-600/90 backdrop-blur-sm flex items-center justify-center">
              <Ruler className="w-3.5 h-3.5" />
            </div>
            <span className="text-sm font-semibold drop-shadow-lg">Medidor de Armação</span>
            {autoOk && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-800/80 backdrop-blur-sm text-emerald-300 border border-emerald-700/40 flex items-center gap-1">
                <ScanFace className="w-3 h-3" /> IA detectou
              </span>
            )}
            {mpLoading && (
              <span className="text-xs px-2 py-0.5 rounded bg-black/50 backdrop-blur-sm text-slate-300 flex items-center gap-1.5">
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
                Analisando...
              </span>
            )}
          </div>

          {/* Topo-direita: etapas + reset */}
          <div className="absolute top-3 right-3 flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-black/55 backdrop-blur-sm rounded-lg px-2.5 py-1.5">
              {(['calibrate', 'measure', 'done'] as Step[]).map((s, i) => (
                <div key={s} className="flex items-center gap-1.5">
                  {i > 0 && <div className="w-3 h-px bg-white/20" />}
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    step === s
                      ? 'bg-indigo-600 text-white'
                      : (step === 'measure' && i === 0) || step === 'done'
                        ? 'bg-emerald-800 text-emerald-200'
                        : 'bg-white/10 text-slate-400'
                  }`}>{i + 1}</div>
                </div>
              ))}
            </div>
            <button
              onClick={reset}
              className="w-8 h-8 rounded-lg bg-black/55 backdrop-blur-sm flex items-center justify-center hover:bg-white/15 transition-colors"
              title="Nova foto"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

          {/* ── PAINEL INFERIOR — CALIBRAÇÃO ───────────────────────────── */}
          {step === 'calibrate' && meas && (
            <div className="absolute bottom-0 left-0 right-0 bg-black/75 backdrop-blur-md border-t border-white/10 px-5 py-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-white mb-1">
                    Posicione <span className="font-mono text-slate-200">CC1</span> e{' '}
                    <span className="font-mono text-slate-200">CC2</span> nas pontas do cartão de crédito
                  </p>
                  <div className={`text-sm flex items-center gap-2 ${calOk ? 'text-emerald-400' : 'text-amber-400'}`}>
                    <span className={`w-2 h-2 rounded-full ${calOk ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                    {fmt(meas.calibMm)} mm medidos
                    {calOk ? ' ✓' : ' — referência 85,6 mm'}
                  </div>
                </div>
                <button
                  onClick={confirmCalibration}
                  className="shrink-0 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-sm font-medium transition-colors whitespace-nowrap"
                >
                  {autoOk ? 'Calibrar e posicionar →' : 'Confirmar →'}
                </button>
              </div>
            </div>
          )}

          {/* ── PAINEL INFERIOR — MEDIÇÕES ──────────────────────────────── */}
          {(step === 'measure' || step === 'done') && meas && (
            <div className="absolute bottom-0 left-0 right-0 bg-black/78 backdrop-blur-md border-t border-white/10 px-4 pt-3 pb-4">
              {/* status calibração */}
              <div className="flex items-center gap-2 mb-2.5">
                <span className={`text-xs px-2 py-0.5 rounded-full border ${calOk ? 'border-emerald-700/50 bg-emerald-900/30 text-emerald-400' : 'border-amber-600/50 bg-amber-900/30 text-amber-400'}`}>
                  Cal: {fmt(meas.calibMm)} mm {calOk ? '✓' : '⚠'}
                </span>
              </div>

              {/* grade 2×4 */}
              <div className="grid grid-cols-2 gap-x-8 gap-y-0.5 mb-3">
                <MR label="DNP OD"   v={meas.dnpOD}      c="#818cf8" />
                <MR label="Ponte"    v={meas.ponte}      c="#34d399" />
                <MR label="DNP OE"   v={meas.dnpOE}      c="#818cf8" />
                <MR label="A horiz." v={meas.horizontal} c="#f87171" />
                <MR label="Alt OD"   v={meas.altOD}      c="#fb923c" />
                <MR label="B vert."  v={meas.vertical}   c="#c084fc" />
                <MR label="Alt OE"   v={meas.altOE}      c="#fb923c" />
                <MR label="D diag."  v={meas.diagonal}   c="#fbbf24" />
              </div>

              {step === 'measure' && (
                <button
                  onClick={() => setStep('done')}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-sm font-medium transition-colors"
                >
                  Confirmar medidas ✓
                </button>
              )}
              {step === 'done' && (
                <button
                  onClick={copyResults}
                  className={`w-full py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-colors ${copied ? 'bg-emerald-700 text-emerald-100' : 'bg-slate-700 hover:bg-slate-600'}`}
                >
                  <Copy className="w-4 h-4" />
                  {copied ? 'Copiado!' : 'Copiar medidas'}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function MR({ label, v, c }: { label: string; v: number; c: string }) {
  return (
    <div className="flex items-center justify-between text-sm py-0.5">
      <span className="flex items-center gap-1.5 text-slate-300">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c }} />
        {label}
      </span>
      <span className="font-mono font-semibold tabular-nums">
        {v.toFixed(1)}<span className="text-slate-500 font-normal text-xs ml-0.5">mm</span>
      </span>
    </div>
  )
}
