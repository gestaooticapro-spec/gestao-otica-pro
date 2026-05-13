'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, CheckCircle2, Copy, ImageIcon, RotateCcw, Ruler, Save, ScanFace } from 'lucide-react'
import { saveMedicaoOS } from '@/lib/actions/medidas.actions'

// ─── Types ────────────────────────────────────────────────────────────────────
type Step     = 'capture' | 'calibrate' | 'measure' | 'done'
type LensType = 'surfacada' | 'bifocal' | 'pronto' | null

interface Pt { x: number; y: number }
interface Handles {
  calibA: Pt; calibB: Pt
  pupilR: Pt; pupilL: Pt
  bridgeR: Pt; bridgeL: Pt
  mountR: Pt; mountL: Pt
  lensLeft: Pt; lensRight: Pt
  lensTop: Pt; lensBottom: Pt
  diagA: Pt; diagB: Pt
  palpebraR: Pt; palpebraL: Pt   // usado apenas no modo Bifocal
}
type HKey = keyof Handles
type MPModule = typeof import('@mediapipe/tasks-vision')
type FaceLandmarkerInstance = Awaited<ReturnType<MPModule['FaceLandmarker']['createFromOptions']>>
type RawLm = { x: number; y: number; z: number }
type MediaTrackWithImageCapture = MediaStreamTrack & { getSettings?: () => MediaTrackSettings }

// ─── Grupos de medição ────────────────────────────────────────────────────────
interface MGroup { id: string; label: string; handles: HKey[]; refs?: HKey[] }

const SURFACADA_GROUPS: MGroup[] = [
  { id: 'pupils',   label: 'Pupilas / DNP', handles: ['pupilR', 'pupilL'] },
  { id: 'bridge',   label: 'Ponte',         handles: ['bridgeR', 'bridgeL'] },
  { id: 'altOD',    label: 'Altura OD',     handles: ['mountR'],  refs: ['pupilR'] },
  { id: 'altOE',    label: 'Altura OE',     handles: ['mountL'],  refs: ['pupilL'] },
  { id: 'frameA',   label: 'Horizontal A',  handles: ['lensLeft', 'lensRight'] },
  { id: 'frameB',   label: 'Vertical B',    handles: ['lensTop',  'lensBottom'] },
  { id: 'frameD',   label: 'Diagonal D',    handles: ['diagA',    'diagB'] },
]

const BIFOCAL_GROUPS: MGroup[] = [
  ...SURFACADA_GROUPS,
  { id: 'palpebra', label: 'Pálpebra',      handles: ['palpebraR', 'palpebraL'] },
]

const PRONTO_GROUPS: MGroup[] = [
  { id: 'pupils',   label: 'Pupilas / DNP', handles: ['pupilR', 'pupilL'] },
  { id: 'altOD',    label: 'Altura OD',     handles: ['mountR'],  refs: ['pupilR'] },
  { id: 'altOE',    label: 'Altura OE',     handles: ['mountL'],  refs: ['pupilL'] },
  { id: 'frameA',   label: 'Horizontal A',  handles: ['lensLeft', 'lensRight'] },
  { id: 'frameB',   label: 'Vertical B',    handles: ['lensTop',  'lensBottom'] },
  { id: 'frameD',   label: 'Diagonal D',    handles: ['diagA',    'diagB'] },
]

function getGroups(t: LensType): MGroup[] {
  if (t === 'bifocal') return BIFOCAL_GROUPS
  if (t === 'pronto')  return PRONTO_GROUPS
  return SURFACADA_GROUPS
}

// ─── Cores e labels ───────────────────────────────────────────────────────────
const COLORS: Record<HKey, string> = {
  calibA: '#e2e8f0', calibB: '#e2e8f0',
  pupilR: '#60a5fa', pupilL: '#60a5fa',
  bridgeR: '#34d399', bridgeL: '#34d399',
  mountR: '#fb923c', mountL: '#fb923c',
  lensLeft: '#f87171', lensRight: '#f87171',
  lensTop: '#c084fc', lensBottom: '#c084fc',
  diagA: '#fbbf24', diagB: '#fbbf24',
  palpebraR: '#38bdf8', palpebraL: '#38bdf8',
}
const LABELS: Record<HKey, string> = {
  calibA: 'R1',   calibB: 'R2',
  pupilR: 'OD',   pupilL: 'OE',
  bridgeR: 'P1',  bridgeL: 'P2',
  mountR: '↓OD',  mountL: '↓OE',
  lensLeft: '←A', lensRight: 'A→',
  lensTop: '↑B',  lensBottom: 'B↓',
  diagA: 'D1',    diagB: 'D2',
  palpebraR: 'PálD', palpebraL: 'PálE',
}

const LENS_TYPE_LABEL: Record<NonNullable<LensType>, string> = {
  surfacada: 'Surfaçada', bifocal: 'Bifocal', pronto: 'Pronto',
}

// ─── Constantes visuais ───────────────────────────────────────────────────────
const CC_MM   = 85.6
const B_DIST  = 90
const B_R     = 24
const A_R     = 5
const CAL_ARM = 14
const CAL_DOT = 4

// Tamanhos de blank disponíveis no mercado (mm)
const BLANKS = [60, 65, 70, 75, 80, 85]

// ─── Helpers ──────────────────────────────────────────────────────────────────
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)
const fmt  = (n: number) => n.toFixed(1)
const nextBlank = (d: number) => BLANKS.find(b => b >= d) ?? 85

function balloonOf(anchor: Pt, ib: { y: number; h: number }): Pt {
  const nearBottom = (anchor.y - ib.y) / ib.h > 0.68
  return { x: anchor.x, y: anchor.y + (nearBottom ? -B_DIST : B_DIST) }
}

function pill(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, color: string) {
  ctx.save()
  ctx.font = 'bold 12px monospace'
  const tw = ctx.measureText(text).width + 12
  ctx.fillStyle = 'rgba(0,0,0,0.84)'
  ctx.beginPath(); ctx.roundRect(cx - tw / 2, cy - 10, tw, 20, 4); ctx.fill()
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(text, cx, cy); ctx.restore()
}

// ─── Componente ───────────────────────────────────────────────────────────────
export default function FrameMeasurementTool({
  osId,
  storeId,
}: {
  osId?: number
  storeId?: number
} = {}) {
  const router = useRouter()
  const containerRef  = useRef<HTMLDivElement>(null)
  const canvasRef     = useRef<HTMLCanvasElement>(null)
  const fileRef       = useRef<HTMLInputElement>(null)
  const videoRef      = useRef<HTMLVideoElement>(null)
  const streamRef     = useRef<MediaStream | null>(null)
  const imgRef        = useRef<HTMLImageElement | null>(null)
  const landmarkerRef = useRef<FaceLandmarkerInstance | null>(null)
  const rawLmsRef     = useRef<RawLm[] | null>(null)
  const draggingRef   = useRef<HKey | null>(null)
  const dragOffsetRef = useRef<Pt>({ x: 0, y: 0 })
  const imgBoundsRef  = useRef({ x: 0, y: 0, w: 800, h: 600 })
  const activeGrpRef  = useRef<string | null>(null)
  const lensTypeRef   = useRef<LensType>(null)

  const [step,        setStep]        = useState<Step>('capture')
  const [canvasW,     setCanvasW]     = useState(800)
  const [canvasH,     setCanvasH]     = useState(600)
  const [imgBounds,   setImgBounds]   = useState({ x: 0, y: 0, w: 800, h: 600 })
  const [pts,         setPts]         = useState<Handles | null>(null)
  const [lensType,    setLensType]    = useState<LensType>(null)
  const [activeGroup, setActiveGroup] = useState<string | null>(null)
  const [dragging,    setDragging]    = useState<HKey | null>(null)
  const [autoOk,      setAutoOk]      = useState(false)
  const [mpLoading,   setMpLoading]   = useState(false)
  const [confirming,  setConfirming]  = useState(false)
  const [showDiam,    setShowDiam]    = useState(false)
  const [copied,      setCopied]      = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [saved,       setSaved]       = useState(false)
  const [cardMm,      setCardMm]      = useState(85.6)
  const [cardInput,   setCardInput]   = useState('85.6')
  const [cameraOpen,  setCameraOpen]  = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [gridDivs,    setGridDivs]    = useState(10)
  const [cameraAspect, setCameraAspect] = useState<number>(16 / 9)

  useEffect(() => { imgBoundsRef.current = imgBounds   }, [imgBounds])
  useEffect(() => { activeGrpRef.current = activeGroup }, [activeGroup])
  useEffect(() => { lensTypeRef.current  = lensType    }, [lensType])
  useEffect(() => () => stopCamera(), [])
  useEffect(() => {
    if (!cameraOpen) return
    const stream = streamRef.current
    const video = videoRef.current
    if (!stream || !video) return

    video.srcObject = stream
    video.onloadedmetadata = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        setCameraAspect(video.videoWidth / video.videoHeight)
      }
      video.play().catch(() => {})
    }
  }, [cameraOpen])

  // ── Resize ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current; if (!el) return
    const ro = new ResizeObserver(([e]) => {
      setCanvasW(e.contentRect.width); setCanvasH(e.contentRect.height)
    })
    ro.observe(el); return () => ro.disconnect()
  }, [])

  // ── MediaPipe ─────────────────────────────────────────────────────────────
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
        runningMode: 'IMAGE', numFaces: 1, minFaceDetectionConfidence: 0.3,
        outputFaceBlendshapes: false, outputFacialTransformationMatrixes: false,
      })
    } finally { setMpLoading(false) }
    return landmarkerRef.current
  }

  // ── Posições padrão ───────────────────────────────────────────────────────
  function defaultHandles(b: typeof imgBounds): Handles {
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2
    return {
      calibA:     { x: cx - b.w * 0.12,   y: b.y + b.h * 0.12 },
      calibB:     { x: cx + b.w * 0.12,   y: b.y + b.h * 0.12 },
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
      palpebraR:  { x: cx - b.w * 0.13,   y: cy + b.h * 0.04 },
      palpebraL:  { x: cx + b.w * 0.13,   y: cy + b.h * 0.04 },
    }
  }

  // ── Aplica landmarks após calibração ─────────────────────────────────────
  function applyLandmarks(lms: RawLm[], b: typeof imgBounds, cur: Handles): Handles {
    const tc = (lm: RawLm): Pt => ({ x: b.x + lm.x * b.w, y: b.y + lm.y * b.h })
    const irisR  = tc(lms[468]); const irisL  = tc(lms[473])
    const outerR = tc(lms[33]);  const botR   = tc(lms[145]); const botL = tc(lms[374])
    const noseBridge = tc(lms[6])
    const pxMm  = dist(cur.calibA, cur.calibB) / cardMm
    const bridgeCX = (irisR.x + irisL.x) / 2
    const BRIDGE_HALF = 8.5; const LENS_OUTER = 26; const LENS_TOP = 12; const MOUNT_H = 18
    const lensLeftX  = Math.min(irisR.x - LENS_OUTER * pxMm, outerR.x - 4 * pxMm)
    const lensRightX = bridgeCX - BRIDGE_HALF * pxMm
    const bridgeY    = noseBridge.y - 2 * pxMm
    return {
      ...cur,
      pupilR: irisR, pupilL: irisL,
      bridgeR:    { x: lensRightX,                  y: bridgeY },
      bridgeL:    { x: bridgeCX + BRIDGE_HALF * pxMm, y: bridgeY },
      mountR:     { x: irisR.x, y: irisR.y + MOUNT_H * pxMm },
      mountL:     { x: irisL.x, y: irisL.y + MOUNT_H * pxMm },
      lensLeft:   { x: lensLeftX,  y: irisR.y },
      lensRight:  { x: lensRightX, y: irisR.y },
      lensTop:    { x: irisR.x,    y: irisR.y - LENS_TOP * pxMm },
      lensBottom: { x: irisR.x,    y: irisR.y + MOUNT_H * pxMm },
      diagA:      { x: lensLeftX,  y: irisR.y - LENS_TOP * pxMm },
      diagB:      { x: lensRightX, y: irisR.y + MOUNT_H * pxMm },
      // pálpebra: borda inferior do olho (landmark da pálpebra inferior)
      palpebraR:  botR,
      palpebraL:  botL,
    }
  }

  // ── Detecção (canvas offscreen) ───────────────────────────────────────────
  async function runDetect(img: HTMLImageElement) {
    const lm = await ensureLandmarker().catch(() => null); if (!lm) return
    const s = Math.min(1280 / img.naturalWidth, 1280 / img.naturalHeight, 1)
    const oc = document.createElement('canvas')
    oc.width  = Math.round(img.naturalWidth * s)
    oc.height = Math.round(img.naturalHeight * s)
    oc.getContext('2d')!.drawImage(img, 0, 0, oc.width, oc.height)
    try {
      const result = (lm as any).detect(oc)
      const detected: RawLm[] | undefined = result?.faceLandmarks?.[0]
      if (!detected?.length) return
      rawLmsRef.current = detected; setAutoOk(true)
    } catch (e) { console.warn('[MediaPipe]', e) }
  }

  // ── Arquivo ───────────────────────────────────────────────────────────────
  function processFile(file: File) {
    const reader = new FileReader()
    reader.onload = ev => {
      const img = new Image()
      img.onload = () => {
        imgRef.current = img
        const cw = containerRef.current?.clientWidth  ?? window.innerWidth
        const ch = containerRef.current?.clientHeight ?? window.innerHeight
        const s  = Math.min(cw / img.naturalWidth, ch / img.naturalHeight)
        const dw = img.naturalWidth * s, dh = img.naturalHeight * s
        const b  = { x: (cw - dw) / 2, y: (ch - dh) / 2, w: dw, h: dh }
        setImgBounds(b); setPts(defaultHandles(b)); setStep('calibrate')
        ensureLandmarker().catch(() => null)
      }
      img.src = ev.target!.result as string
    }
    reader.readAsDataURL(file)
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (f) processFile(f); e.target.value = ''
  }

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera indisponivel neste navegador')
      return
    }
    setCameraError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      })
      streamRef.current = stream
      setCameraOpen(true)
    } catch {
      setCameraError('Nao foi possivel acessar a camera')
      setCameraOpen(false)
    }
  }

  function stopCamera() {
    const stream = streamRef.current
    if (stream) stream.getTracks().forEach(track => track.stop())
    streamRef.current = null
    const video = videoRef.current
    if (video) video.srcObject = null
    setCameraOpen(false)
  }

  async function takeCameraShot() {
    const stream = streamRef.current
    let file: File | null = null

    // Preferimos frame nativo da camera para evitar distorcao introduzida pelo elemento <video>.
    const track = stream?.getVideoTracks?.()[0] as MediaTrackWithImageCapture | undefined
    if (track && 'ImageCapture' in window) {
      try {
        const imageCapture = new (window as any).ImageCapture(track)
        const blob = await imageCapture.takePhoto()
        file = new File([blob], `captura-${Date.now()}.jpg`, { type: blob.type || 'image/jpeg' })
      } catch {
        file = null
      }
    }

    // Fallback: captura do frame renderizado no video.
    if (!file) {
      const video = videoRef.current
      if (!video || !video.videoWidth || !video.videoHeight) return
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

      file = await new Promise<File | null>((resolve) => {
        canvas.toBlob((blob) => {
          if (!blob) return resolve(null)
          resolve(new File([blob], `captura-${Date.now()}.jpg`, { type: 'image/jpeg' }))
        }, 'image/jpeg', 0.92)
      })
    }

    if (!file) return

    stopCamera()
    processFile(file)
  }

  // ── Confirma calibração ───────────────────────────────────────────────────
  async function confirmCalibration() {
    if (!pts) return
    setConfirming(true)
    try {
      if (!rawLmsRef.current && imgRef.current) await runDetect(imgRef.current)
      if (rawLmsRef.current)
        setPts(prev => prev ? applyLandmarks(rawLmsRef.current!, imgBounds, prev) : prev)
    } finally { setConfirming(false) }
    setActiveGroup(null); setStep('measure')
  }

  // ── Cálculo das medidas ───────────────────────────────────────────────────
  function calc(h: Handles) {
    const mmpp = cardMm / dist(h.calibA, h.calibB)
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
      // altura da pálpebra inferior em relação à base do aro (bifocal)
      palpebraOD: Math.abs(h.mountR.y - h.palpebraR.y) * mmpp,
      palpebraOE: Math.abs(h.mountL.y - h.palpebraL.y) * mmpp,
    }
  }

  // ── Cálculo do diâmetro mínimo do blank ──────────────────────────────────
  // Fórmula: Φmín = D + 2C + 2 mm (folga)
  // C = decentração total = √(dH² + dV²)
  // dH = |A/2 + Ponte/2 − DNP|   dV = |Alt − B/2|
  function calcDiam(m: ReturnType<typeof calc>) {
    const diam = (dnp: number, alt: number) => {
      const dH = Math.abs(m.horizontal / 2 + m.ponte / 2 - dnp)
      const dV = Math.abs(alt - m.vertical / 2)
      const C  = Math.hypot(dH, dV)
      const min = m.diagonal + 2 * C + 2
      return { min: Math.round(min * 10) / 10, blank: nextBlank(min), C: Math.round(C * 10) / 10, dH: Math.round(dH * 10) / 10, dV: Math.round(dV * 10) / 10 }
    }
    return { OD: diam(m.dnpOD, m.altOD), OE: diam(m.dnpOE, m.altOE) }
  }

  // ── Canvas draw ───────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas || !imgRef.current) return
    const ctx = canvas.getContext('2d')!; const ib = imgBounds
    ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, canvasW, canvasH)
    ctx.drawImage(imgRef.current, ib.x, ib.y, ib.w, ib.h)
    if (!pts) return

    const m   = calc(pts)
    const bCX = (pts.bridgeR.x + pts.bridgeL.x) / 2
    const ag  = activeGroup
    const lt  = lensType

    function seg(a: Pt, b: Pt, color: string, label: string, dim: boolean) {
      ctx.save(); ctx.globalAlpha = dim ? 0.18 : 1; ctx.strokeStyle = color
      ctx.lineWidth = 2; ctx.setLineDash([])
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
      if (!dim) {
        const ang = Math.atan2(b.y - a.y, b.x - a.x), perp = ang + Math.PI / 2, T = 5;
        [a, b].forEach(p => {
          ctx.beginPath()
          ctx.moveTo(p.x + Math.cos(perp) * T, p.y + Math.sin(perp) * T)
          ctx.lineTo(p.x - Math.cos(perp) * T, p.y - Math.sin(perp) * T); ctx.stroke()
        })
        pill(ctx, label, (a.x + b.x) / 2, (a.y + b.y) / 2 - 13, color)
      }
      ctx.restore()
    }

    function dot(pt: Pt, key: HKey, dim: boolean) {
      ctx.save(); ctx.globalAlpha = dim ? 0.28 : 0.8
      ctx.beginPath(); ctx.arc(pt.x, pt.y, A_R, 0, Math.PI * 2)
      ctx.fillStyle = COLORS[key]; ctx.fill()
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke(); ctx.restore()
    }

    function balloon(pt: Pt, key: HKey, isRef: boolean) {
      const bp = balloonOf(pt, ib); const active = draggingRef.current === key; const color = COLORS[key]
      ctx.save()
      ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3])
      ctx.beginPath(); ctx.moveTo(pt.x, pt.y); ctx.lineTo(bp.x, bp.y); ctx.stroke()
      ctx.setLineDash([])
      ctx.beginPath(); ctx.arc(pt.x, pt.y, A_R, 0, Math.PI * 2)
      ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke()
      if (!isRef) {
        ctx.beginPath(); ctx.arc(bp.x, bp.y, B_R, 0, Math.PI * 2)
        ctx.fillStyle = active ? color : color + 'cc'; ctx.fill()
        ctx.strokeStyle = '#fff'; ctx.lineWidth = active ? 2.5 : 1.5; ctx.stroke()
        ctx.fillStyle = active ? '#000' : '#fff'
        ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(LABELS[key], bp.x, bp.y)
      } else {
        ctx.fillStyle = color; ctx.font = 'bold 9px sans-serif'
        ctx.textAlign = 'center'; ctx.textBaseline = 'top'
        ctx.fillText(LABELS[key], pt.x, pt.y + A_R + 2)
      }
      ctx.restore()
    }

    function calCross(pt: Pt, key: HKey) {
      const bp = balloonOf(pt, ib); const active = draggingRef.current === key; const color = COLORS[key]
      ctx.save()
      ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3])
      ctx.beginPath(); ctx.moveTo(pt.x, pt.y); ctx.lineTo(bp.x, bp.y); ctx.stroke()
      ctx.setLineDash([])
      ctx.strokeStyle = color; ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(pt.x - CAL_ARM, pt.y); ctx.lineTo(pt.x + CAL_ARM, pt.y)
      ctx.moveTo(pt.x, pt.y - CAL_ARM); ctx.lineTo(pt.x, pt.y + CAL_ARM); ctx.stroke()
      ctx.beginPath(); ctx.arc(pt.x, pt.y, CAL_DOT, 0, Math.PI * 2)
      ctx.fillStyle = color; ctx.fill()
      ctx.beginPath(); ctx.arc(bp.x, bp.y, B_R, 0, Math.PI * 2)
      ctx.fillStyle = active ? color : color + 'cc'; ctx.fill()
      ctx.strokeStyle = '#fff'; ctx.lineWidth = active ? 2.5 : 1.5; ctx.stroke()
      ctx.fillStyle = active ? '#000' : '#fff'
      ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(LABELS[key], bp.x, bp.y); ctx.restore()
    }

    // Calibração
    if (step === 'calibrate') {
      const ok = Math.abs(m.calibMm - cardMm) < 4
      ctx.save(); ctx.strokeStyle = ok ? '#94a3b8' : '#fbbf24'
      ctx.lineWidth = 1.5; ctx.setLineDash([5, 4])
      ctx.beginPath(); ctx.moveTo(pts.calibA.x, pts.calibA.y); ctx.lineTo(pts.calibB.x, pts.calibB.y); ctx.stroke()
      ctx.restore()
      pill(ctx, `${fmt(m.calibMm)} mm`, (pts.calibA.x + pts.calibB.x) / 2, (pts.calibA.y + pts.calibB.y) / 2 - 14, ok ? '#94a3b8' : '#fbbf24')
      calCross(pts.calibA, 'calibA'); calCross(pts.calibB, 'calibB'); return
    }

    // Medição
    const showAll = ag === null
    const is  = (id: string) => ag === id
    const dim = (id: string) => !showAll && !is(id)

    if (showAll || is('pupils') || is('bridge')) {
      ctx.save(); ctx.strokeStyle = 'rgba(129,140,248,0.20)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4])
      ctx.beginPath(); ctx.moveTo(bCX, ib.y); ctx.lineTo(bCX, ib.y + ib.h); ctx.stroke(); ctx.restore()
    }

    seg({ x: bCX, y: pts.pupilR.y }, pts.pupilR, '#818cf8', `DNP-OD ${fmt(m.dnpOD)}`, dim('pupils'))
    seg({ x: bCX, y: pts.pupilL.y }, pts.pupilL, '#818cf8', `DNP-OE ${fmt(m.dnpOE)}`, dim('pupils'))
    if (lt !== 'pronto')
      seg(pts.bridgeR, pts.bridgeL, '#34d399', `Ponte ${fmt(m.ponte)}`, dim('bridge'))
    seg(pts.pupilR, { x: pts.pupilR.x, y: pts.mountR.y }, '#fb923c', `Alt-OD ${fmt(m.altOD)}`, dim('altOD'))
    seg(pts.pupilL, { x: pts.pupilL.x, y: pts.mountL.y }, '#fb923c', `Alt-OE ${fmt(m.altOE)}`, dim('altOE'))
    seg(pts.lensLeft,  pts.lensRight, '#f87171', `A ${fmt(m.horizontal)}`, dim('frameA'))
    seg(pts.lensTop,   pts.lensBottom,'#c084fc', `B ${fmt(m.vertical)}`,   dim('frameB'))
    seg(pts.diagA,     pts.diagB,     '#fbbf24', `D ${fmt(m.diagonal)}`,   dim('frameD'))
    if (lt === 'bifocal') {
      seg({ x: pts.palpebraR.x, y: pts.mountR.y }, pts.palpebraR, '#38bdf8', `PálD ${fmt(m.palpebraOD)}`, dim('palpebra'))
      seg({ x: pts.palpebraL.x, y: pts.mountL.y }, pts.palpebraL, '#38bdf8', `PálE ${fmt(m.palpebraOE)}`, dim('palpebra'))
    }

    const baseKeys: HKey[] = ['pupilR','pupilL','bridgeR','bridgeL','mountR','mountL','lensLeft','lensRight','lensTop','lensBottom','diagA','diagB']
    const allKeys: HKey[]  = lt === 'bifocal' ? [...baseKeys, 'palpebraR', 'palpebraL'] : baseKeys

    if (showAll) {
      allKeys.forEach(k => dot(pts[k], k, false))
    } else {
      const groups  = getGroups(lt)
      const grp     = groups.find(g => g.id === ag)
      const active  = new Set<HKey>(grp?.handles ?? [])
      const refs    = new Set<HKey>(grp?.refs    ?? [])
      allKeys.forEach(k => {
        if (active.has(k))    balloon(pts[k], k, false)
        else if (refs.has(k)) balloon(pts[k], k, true)
        else                  dot(pts[k], k, true)
      })
    }
  }, [pts, dragging, step, activeGroup, lensType, canvasW, canvasH, imgBounds, cardMm]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { draw() }, [draw])

  // ── Ponteiro / toque ──────────────────────────────────────────────────────
  function canvasPos(e: React.MouseEvent | React.TouchEvent): Pt {
    const canvas = canvasRef.current!; const rect = canvas.getBoundingClientRect()
    const sx = canvasW / rect.width, sy = canvasH / rect.height
    if ('touches' in e) {
      const t = (e as React.TouchEvent).touches[0] ?? (e as React.TouchEvent).changedTouches[0]
      return { x: (t.clientX - rect.left) * sx, y: (t.clientY - rect.top) * sy }
    }
    const me = e as React.MouseEvent
    return { x: (me.clientX - rect.left) * sx, y: (me.clientY - rect.top) * sy }
  }

  function nearestBalloon(pos: Pt): HKey | null {
    if (!pts) return null
    let keys: HKey[]
    if (step === 'calibrate') {
      keys = ['calibA', 'calibB']
    } else if (activeGrpRef.current) {
      const g = getGroups(lensTypeRef.current).find(g => g.id === activeGrpRef.current)
      keys = g ? g.handles : []
    } else { return null }
    let best: HKey | null = null, minD = Infinity
    for (const k of keys) {
      const bp = balloonOf(pts[k], imgBoundsRef.current); const d = dist(pos, bp)
      if (d < B_R * 2.2 && d < minD) { minD = d; best = k }
    }
    return best
  }

  function onDown(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault(); const pos = canvasPos(e); const key = nearestBalloon(pos)
    if (!key || !pts) return
    draggingRef.current = key; setDragging(key)
    const anchor = pts[key]; const bp = balloonOf(anchor, imgBoundsRef.current)
    dragOffsetRef.current = { x: bp.x - anchor.x, y: bp.y - anchor.y }
  }

  function onMove(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault(); if (!draggingRef.current || !pts) return
    const fp = canvasPos(e); const off = dragOffsetRef.current; const ib = imgBoundsRef.current
    const newAnchor: Pt = {
      x: Math.max(ib.x, Math.min(ib.x + ib.w, fp.x - off.x)),
      y: Math.max(ib.y, Math.min(ib.y + ib.h, fp.y - off.y)),
    }
    setPts(prev => prev ? { ...prev, [draggingRef.current!]: newAnchor } : prev)
  }

  function onUp(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault(); draggingRef.current = null; setDragging(null)
  }

  // ── Salvar medidas na OS (fluxo tablet) ──────────────────────────────────
  async function saveToOS() {
    if (!pts || !osId) return
    setSaving(true)
    try {
      const m = calc(pts)

      // Captura o canvas como JPEG base64
      let fotoBase64: string | undefined
      const canvas = canvasRef.current
      if (canvas) {
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82)
        fotoBase64 = dataUrl.split(',')[1]
      }

      const result = await saveMedicaoOS({
        osId,
        storeId,
        dnpOd: m.dnpOD, dnpOe: m.dnpOE,
        altOd: m.altOD,  altOe: m.altOE,
        ponte: m.ponte,
        horizontal: m.horizontal, vertical: m.vertical, diagonal: m.diagonal,
        diamOd: calcDiam(m).OD.min, diamOe: calcDiam(m).OE.min,
        palpebraOd: lensType === 'bifocal' ? m.palpebraOD : undefined,
        palpebraOe: lensType === 'bifocal' ? m.palpebraOE : undefined,
        tipoLente: lensType ?? 'surfacada',
        fotoBase64,
      })

      if (result.ok) {
        setSaved(true)
      } else {
        alert(`Erro ao salvar: ${result.error}`)
      }
    } finally {
      setSaving(false)
    }
  }

  // ── Copiar resultados ─────────────────────────────────────────────────────
  function copyResults() {
    if (!pts) return
    const m = calc(pts); const d = calcDiam(m)
    const lines = [
      `DNP OD: ${fmt(m.dnpOD)} mm`, `DNP OE: ${fmt(m.dnpOE)} mm`,
      `Altura de montagem OD: ${fmt(m.altOD)} mm`, `Altura de montagem OE: ${fmt(m.altOE)} mm`,
      lensType !== 'pronto' ? `Ponte: ${fmt(m.ponte)} mm` : '',
      `Horizontal (A): ${fmt(m.horizontal)} mm`, `Vertical (B): ${fmt(m.vertical)} mm`,
      `Diagonal (D): ${fmt(m.diagonal)} mm`,
      lensType === 'bifocal' ? `Pálpebra OD: ${fmt(m.palpebraOD)} mm` : '',
      lensType === 'bifocal' ? `Pálpebra OE: ${fmt(m.palpebraOE)} mm` : '',
      `Diâmetro mín OD: ${fmt(d.OD.min)} mm → blank ${d.OD.blank} mm`,
      `Diâmetro mín OE: ${fmt(d.OE.min)} mm → blank ${d.OE.blank} mm`,
    ].filter(Boolean)
    navigator.clipboard.writeText(lines.join('\n')).catch(() => {})
    setCopied(true); setTimeout(() => setCopied(false), 2500)
  }

  function reset() {
    setStep('capture'); setPts(null); setActiveGroup(null); setLensType(null)
    setAutoOk(false); setShowDiam(false); setSaved(false)
    rawLmsRef.current = null; imgRef.current = null
  }

  const meas  = pts ? calc(pts) : null
  const diam  = meas ? calcDiam(meas) : null
  const calOk = meas ? Math.abs(meas.calibMm - cardMm) < 4 : false

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-slate-950 text-white overflow-hidden">

      <div ref={containerRef} className="absolute inset-0">
        {step !== 'capture' && (
          <canvas ref={canvasRef} width={canvasW} height={canvasH}
            className="absolute inset-0 w-full h-full touch-none"
            style={{ cursor: dragging ? 'grabbing' : 'default' }}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
            onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp} />
        )}
      </div>

      {/* Captura */}
      {step === 'capture' && (
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <div className="text-center space-y-6 max-w-sm w-full">
            <div className="w-20 h-20 rounded-full bg-indigo-900/40 border border-indigo-700/40 flex items-center justify-center mx-auto">
              <Ruler className="w-9 h-9 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-xl font-semibold mb-2">Medidor de Armação</h1>
              <p className="text-slate-400 text-sm leading-relaxed">
                Use um objeto de medida conhecida como referência (cartão, armação, régua).
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <button onClick={() => { fileRef.current!.removeAttribute('capture'); fileRef.current!.click() }}
                className="flex items-center justify-center gap-2 w-full px-5 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium transition-colors">
                <ImageIcon className="w-4 h-4" /> Escolher da galeria
              </button>
              <button onClick={() => { fileRef.current!.setAttribute('capture', 'environment'); fileRef.current!.click() }}
                className="flex items-center justify-center gap-2 w-full px-5 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-sm font-medium transition-colors">
                <Camera className="w-4 h-4" /> Abrir câmera
              </button>
              <button onClick={startCamera}
                className="flex items-center justify-center gap-2 w-full px-5 py-3 bg-cyan-700 hover:bg-cyan-600 rounded-xl text-sm font-medium transition-colors">
                <Camera className="w-4 h-4" /> Camera com grade
              </button>
            </div>
            {cameraError && <p className="text-xs text-rose-400">{cameraError}</p>}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
          </div>
        </div>
      )}

      {step === 'capture' && cameraOpen && (
        <div className="absolute inset-0 z-30 bg-black">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative h-full max-h-full w-full max-w-full" style={{ aspectRatio: `${cameraAspect}` }}>
              <video
                ref={videoRef}
                className="absolute inset-0 h-full w-full object-contain"
                autoPlay
                playsInline
                muted
              />

              <div className="pointer-events-none absolute inset-0">
                {Array.from({ length: gridDivs - 1 }).map((_, i) => (
                  <div
                    key={`v-${i}`}
                    className="absolute bottom-0 top-0"
                    style={{
                      left: `${((i + 1) / gridDivs) * 100}%`,
                      width: '1px',
                      background: 'rgba(255,255,255,0.28)',
                    }}
                  />
                ))}
                {Array.from({ length: gridDivs - 1 }).map((_, i) => (
                  <div
                    key={`h-${i}`}
                    className="absolute left-0 right-0"
                    style={{
                      top: `${((i + 1) / gridDivs) * 100}%`,
                      height: '1px',
                      background: 'rgba(255,255,255,0.28)',
                    }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="absolute left-3 right-3 top-3 rounded-lg bg-black/45 px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="whitespace-nowrap text-xs text-slate-100">Grade</span>
              <input
                type="range"
                min={4}
                max={16}
                value={gridDivs}
                onChange={e => setGridDivs(parseInt(e.target.value, 10))}
                className="w-full"
              />
              <span className="w-12 text-right font-mono text-xs text-slate-100">{gridDivs}x{gridDivs}</span>
            </div>
          </div>

          <div className="absolute bottom-4 left-4 right-4 flex gap-2">
            <button
              onClick={stopCamera}
              className="flex-1 rounded-xl border border-white/20 bg-white/10 py-3 text-sm"
            >
              Cancelar
            </button>
            <button
              onClick={takeCameraShot}
              className="flex-1 rounded-xl bg-emerald-600 py-3 text-sm font-medium hover:bg-emerald-500"
            >
              Capturar
            </button>
          </div>
        </div>
      )}

      {/* Overlays */}
      {step !== 'capture' && (
        <>
          {/* Topo-esquerda */}
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
              <span className="text-xs px-2 py-0.5 rounded bg-black/55 backdrop-blur-sm text-slate-300 flex items-center gap-1.5">
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
                Analisando...
              </span>
            )}
          </div>

          {/* Topo-direita */}
          <div className="absolute top-3 right-3 flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-black/55 backdrop-blur-sm rounded-lg px-2.5 py-1.5">
              {(['calibrate', 'measure', 'done'] as Step[]).map((s, i) => (
                <div key={s} className="flex items-center gap-1.5">
                  {i > 0 && <div className="w-3 h-px bg-white/20" />}
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    step === s ? 'bg-indigo-600 text-white'
                    : (step === 'measure' && i === 0) || step === 'done' ? 'bg-emerald-800 text-emerald-200'
                    : 'bg-white/10 text-slate-400'
                  }`}>{i + 1}</div>
                </div>
              ))}
            </div>
            <button onClick={reset} className="w-8 h-8 rounded-lg bg-black/55 backdrop-blur-sm flex items-center justify-center hover:bg-white/15 transition-colors">
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

          {/* Painel — Calibração */}
          {step === 'calibrate' && meas && (
            <div className="absolute bottom-0 left-0 right-0 bg-black/80 backdrop-blur-md border-t border-white/10 px-5 py-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium mb-1">
                    Arraste <span className="font-mono text-slate-200">R1</span> e{' '}
                    <span className="font-mono text-slate-200">R2</span> sobre os dois pontos de referência e informe a distância entre eles
                  </p>
                  <div className="flex items-center gap-3 mt-1">
                    <div className={`text-sm flex items-center gap-2 ${calOk ? 'text-emerald-400' : 'text-amber-400'}`}>
                      <span className={`w-2 h-2 rounded-full ${calOk ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                      {fmt(meas.calibMm)} mm medidos {calOk ? '✓' : ''}
                    </div>
                    <label className="flex items-center gap-1.5 text-xs text-slate-400">
                      referência:
                      <input
                        type="text" inputMode="decimal" value={cardInput}
                        onChange={e => {
                          setCardInput(e.target.value)
                          const n = parseFloat(e.target.value.replace(',', '.'))
                          if (n > 0 && !isNaN(n)) setCardMm(n)
                        }}
                        onBlur={() => setCardInput(String(cardMm))}
                        className="w-28 bg-white/10 border border-white/20 rounded px-2.5 py-1.5 text-white text-sm text-center focus:outline-none focus:border-indigo-400"
                      />
                      mm
                    </label>
                  </div>
                </div>
                <button onClick={confirmCalibration} disabled={confirming}
                  className="shrink-0 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 rounded-xl text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-2">
                  {confirming && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin inline-block" />}
                  {confirming ? 'Posicionando...' : autoOk ? 'Calibrar e posicionar →' : 'Confirmar →'}
                </button>
              </div>
            </div>
          )}

          {/* Painel — Medição / Concluído */}
          {(step === 'measure' || step === 'done') && meas && (
            <div className="absolute bottom-0 left-0 right-0 bg-black/80 backdrop-blur-md border-t border-white/10">

              {/* Seletor de tipo de lente */}
              {!lensType ? (
                <div className="px-4 pt-3 pb-2 border-b border-white/8">
                  <p className="text-xs text-slate-400 mb-2">Tipo de lente:</p>
                  <div className="flex gap-2">
                    {(['surfacada', 'bifocal', 'pronto'] as NonNullable<LensType>[]).map(t => (
                      <button key={t} onClick={() => setLensType(t)}
                        className="flex-1 py-2 rounded-lg text-xs font-medium border border-white/15 bg-white/5 active:bg-indigo-600/60 transition-colors">
                        {LENS_TYPE_LABEL[t]}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-4 pt-2 pb-1">
                  <span className="text-xs text-slate-400">Tipo:</span>
                  <span className="text-xs font-semibold text-indigo-300">{LENS_TYPE_LABEL[lensType]}</span>
                  <button onClick={() => setLensType(null)} className="ml-auto text-xs text-slate-500 hover:text-white transition-colors">
                    Mudar
                  </button>
                </div>
              )}

              {/* Chips de grupo */}
              <div className="flex gap-2 px-3 pt-2 pb-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                <button onClick={() => { setActiveGroup(null); setStep('calibrate') }}
                  className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium border border-white/15 bg-white/5 text-slate-400 active:bg-white/10 whitespace-nowrap">
                  ← Ref.
                </button>
                <div className="w-px bg-white/10 shrink-0 my-0.5" />
                {getGroups(lensType).map(g => (
                  <button key={g.id}
                    onClick={() => setActiveGroup(prev => prev === g.id ? null : g.id)}
                    className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap border ${
                      activeGroup === g.id ? 'bg-indigo-600 border-indigo-400 text-white' : 'bg-white/5 border-white/10 text-slate-300 active:bg-white/15'
                    }`}>
                    {g.label}
                  </button>
                ))}
              </div>

              <p className="text-xs text-slate-500 px-4 pt-0.5 pb-0.5 min-h-[16px]">
                {activeGroup ? 'Arraste os balões — o ponto de medição fica visível acima' : 'Toque em uma medida para ajustar'}
              </p>

              {/* Valores */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-0 px-4 pt-1 pb-1">
                <MR label="DNP OD"    v={meas.dnpOD}      c="#818cf8" hi={activeGroup === 'pupils'} />
                {lensType !== 'pronto'
                  ? <MR label="Ponte"  v={meas.ponte}      c="#34d399" hi={activeGroup === 'bridge'} />
                  : <MR label="A horiz." v={meas.horizontal} c="#f87171" hi={activeGroup === 'frameA'} />}
                <MR label="DNP OE"    v={meas.dnpOE}      c="#818cf8" hi={activeGroup === 'pupils'} />
                {lensType !== 'pronto'
                  ? <MR label="A horiz." v={meas.horizontal} c="#f87171" hi={activeGroup === 'frameA'} />
                  : <MR label="B vert."  v={meas.vertical}   c="#c084fc" hi={activeGroup === 'frameB'} />}
                <MR label="Alt OD"    v={meas.altOD}      c="#fb923c" hi={activeGroup === 'altOD'} />
                {lensType !== 'pronto'
                  ? <MR label="B vert."  v={meas.vertical}   c="#c084fc" hi={activeGroup === 'frameB'} />
                  : <MR label="D diag."  v={meas.diagonal}   c="#fbbf24" hi={activeGroup === 'frameD'} />}
                <MR label="Alt OE"    v={meas.altOE}      c="#fb923c" hi={activeGroup === 'altOE'} />
                {lensType !== 'pronto' && <MR label="D diag." v={meas.diagonal} c="#fbbf24" hi={activeGroup === 'frameD'} />}
                {lensType === 'bifocal' && <>
                  <MR label="Pálp. OD" v={meas.palpebraOD} c="#38bdf8" hi={activeGroup === 'palpebra'} />
                  <MR label="Pálp. OE" v={meas.palpebraOE} c="#38bdf8" hi={activeGroup === 'palpebra'} />
                </>}
              </div>

              {/* Diâmetro (quando aberto) */}
              {showDiam && diam && (
                <div className="mx-4 mb-1 mt-1 rounded-lg bg-white/5 border border-white/10 px-3 py-2">
                  <p className="text-xs font-semibold text-slate-300 mb-1.5">Diâmetro mínimo do blank</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                    <span className="text-slate-400">OD mín:</span>
                    <span className="font-mono font-semibold text-white">{fmt(diam.OD.min)} mm → <span className="text-emerald-400">Ø {diam.OD.blank}</span></span>
                    <span className="text-slate-400">OE mín:</span>
                    <span className="font-mono font-semibold text-white">{fmt(diam.OE.min)} mm → <span className="text-emerald-400">Ø {diam.OE.blank}</span></span>
                    <span className="text-slate-500">Dec. OD:</span>
                    <span className="font-mono text-slate-400">{fmt(diam.OD.C)} mm (H {fmt(diam.OD.dH)} · V {fmt(diam.OD.dV)})</span>
                    <span className="text-slate-500">Dec. OE:</span>
                    <span className="font-mono text-slate-400">{fmt(diam.OE.C)} mm (H {fmt(diam.OE.dH)} · V {fmt(diam.OE.dV)})</span>
                  </div>
                </div>
              )}

              {/* Ações */}
              <div className="px-4 pb-3 pt-1 flex gap-2">
                {step === 'measure' && !activeGroup && (
                  <>
                    <button onClick={() => setShowDiam(v => !v)}
                      className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-colors ${showDiam ? 'bg-indigo-900/60 border-indigo-500 text-indigo-200' : 'bg-white/5 border-white/10 text-slate-300'}`}>
                      {showDiam ? 'Ocultar diâmetro' : 'Calcular diâmetro'}
                    </button>
                    <button onClick={() => setStep('done')}
                      className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-xs font-medium transition-colors">
                      Confirmar ✓
                    </button>
                  </>
                )}
                {step === 'measure' && activeGroup && (
                  <button onClick={() => setActiveGroup(null)}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-sm font-medium transition-colors">
                    Concluir ajuste →
                  </button>
                )}
                {step === 'done' && !saved && (
                  <>
                    <button onClick={() => setShowDiam(v => !v)}
                      className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-colors ${showDiam ? 'bg-indigo-900/60 border-indigo-500 text-indigo-200' : 'bg-white/5 border-white/10 text-slate-300'}`}>
                      {showDiam ? 'Ocultar Ø' : 'Calcular Ø'}
                    </button>
                    {osId ? (
                      <button onClick={saveToOS} disabled={saving}
                        className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition-colors">
                        {saving
                          ? <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                          : <Save className="w-3.5 h-3.5" />}
                        {saving ? 'Salvando...' : 'Salvar na OS'}
                      </button>
                    ) : (
                      <button onClick={copyResults}
                        className={`flex-1 py-2 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${copied ? 'bg-emerald-700 text-emerald-100' : 'bg-slate-700 hover:bg-slate-600'}`}>
                        <Copy className="w-3.5 h-3.5" />{copied ? 'Copiado!' : 'Copiar'}
                      </button>
                    )}
                  </>
                )}

                {step === 'done' && saved && (
                  <div className="w-full flex flex-col items-center gap-3 py-1">
                    <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
                      <CheckCircle2 className="w-5 h-5" />
                      Medidas salvas na OS!
                    </div>
                    <div className="flex gap-2 w-full">
                      <button onClick={() => storeId && router.push(`/tablet/${storeId}/os`)}
                        className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-xs font-medium transition-colors">
                        ← Voltar às OS
                      </button>
                      <button onClick={reset}
                        className="flex-1 py-2 bg-white/5 border border-white/10 rounded-xl text-xs font-medium text-slate-300 transition-colors">
                        Nova foto
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function MR({ label, v, c, hi }: { label: string; v: number; c: string; hi: boolean }) {
  return (
    <div className={`flex items-center justify-between text-xs py-0.5 transition-opacity ${hi ? '' : 'opacity-50'}`}>
      <span className="flex items-center gap-1.5 text-slate-300">
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: c }} />
        {label}
      </span>
      <span className={`font-mono font-semibold tabular-nums ${hi ? 'text-white' : 'text-slate-400'}`}>
        {v.toFixed(1)}<span className="text-slate-600 font-normal ml-0.5">mm</span>
      </span>
    </div>
  )
}
