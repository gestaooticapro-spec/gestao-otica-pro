'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, Copy, ImageIcon, RotateCcw, Ruler, ScanFace } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────
type Step = 'capture' | 'calibrate' | 'measure' | 'done'
interface Pt { x: number; y: number }
interface Handles {
  calibA: Pt; calibB: Pt
  pupilR: Pt; pupilL: Pt
  bridgeR: Pt; bridgeL: Pt
  mountR: Pt; mountL: Pt
  lensLeft: Pt; lensRight: Pt
  lensTop: Pt; lensBottom: Pt
  diagA: Pt; diagB: Pt
}
type HKey = keyof Handles
type MPModule = typeof import('@mediapipe/tasks-vision')
type FaceLandmarkerInstance = Awaited<ReturnType<MPModule['FaceLandmarker']['createFromOptions']>>
type RawLm = { x: number; y: number; z: number }

// ─── Grupos de medição ────────────────────────────────────────────────────────
interface MGroup {
  id: string
  label: string
  handles: HKey[]   // arrastáveis
  refs?: HKey[]     // visíveis como referência, não arrastáveis
}
const MEASURE_GROUPS: MGroup[] = [
  { id: 'pupils', label: 'Pupilas / DNP',  handles: ['pupilR', 'pupilL'] },
  { id: 'bridge', label: 'Ponte',          handles: ['bridgeR', 'bridgeL'] },
  { id: 'altOD',  label: 'Altura OD',      handles: ['mountR'],  refs: ['pupilR'] },
  { id: 'altOE',  label: 'Altura OE',      handles: ['mountL'],  refs: ['pupilL'] },
  { id: 'frameA', label: 'Horizontal A',   handles: ['lensLeft', 'lensRight'] },
  { id: 'frameB', label: 'Vertical B',     handles: ['lensTop',  'lensBottom'] },
  { id: 'frameD', label: 'Diagonal D',     handles: ['diagA',    'diagB'] },
]

// ─── Cores e labels ───────────────────────────────────────────────────────────
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
  lensTop: '↑B',  lensBottom: 'B↓',
  diagA: 'D1',   diagB: 'D2',
}

// ─── Constantes visuais ───────────────────────────────────────────────────────
const CC_MM    = 85.6
const B_DIST   = 90    // distância do balão ao âncora em px
const B_R      = 24    // raio do balão (área de toque)
const A_R      = 5     // raio do ponto âncora
const CAL_ARM  = 14    // braços do crosshair de calibração
const CAL_DOT  = 4     // ponto central do crosshair

// ─── Helpers ──────────────────────────────────────────────────────────────────
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)
const fmt  = (n: number) => n.toFixed(1)

/**
 * Posição do balão: ABAIXO do âncora por padrão (dedo fica abaixo, âncora visível acima).
 * Sobe apenas quando o âncora está no terço inferior da imagem (ex: cartão de crédito).
 */
function balloonOf(anchor: Pt, ib: { y: number; h: number }): Pt {
  const nearBottom = (anchor.y - ib.y) / ib.h > 0.68
  return { x: anchor.x, y: anchor.y + (nearBottom ? -B_DIST : B_DIST) }
}

function pill(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, color: string) {
  ctx.save()
  ctx.font = 'bold 12px monospace'
  const tw = ctx.measureText(text).width + 12
  ctx.fillStyle = 'rgba(0,0,0,0.84)'
  ctx.beginPath()
  ctx.roundRect(cx - tw / 2, cy - 10, tw, 20, 4)
  ctx.fill()
  ctx.fillStyle = color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, cx, cy)
  ctx.restore()
}

// ─── Componente ───────────────────────────────────────────────────────────────
export default function FrameMeasurementTool() {
  const containerRef  = useRef<HTMLDivElement>(null)
  const canvasRef     = useRef<HTMLCanvasElement>(null)
  const fileRef       = useRef<HTMLInputElement>(null)
  const imgRef        = useRef<HTMLImageElement | null>(null)
  const landmarkerRef = useRef<FaceLandmarkerInstance | null>(null)
  const rawLmsRef     = useRef<RawLm[] | null>(null)
  const draggingRef   = useRef<HKey | null>(null)
  const dragOffsetRef = useRef<Pt>({ x: 0, y: 0 })  // offset balão→âncora capturado no onDown

  const [step,        setStep]        = useState<Step>('capture')
  const [canvasW,     setCanvasW]     = useState(800)
  const [canvasH,     setCanvasH]     = useState(600)
  const [imgBounds,   setImgBounds]   = useState({ x: 0, y: 0, w: 800, h: 600 })
  const [pts,         setPts]         = useState<Handles | null>(null)
  const [activeGroup, setActiveGroup] = useState<string | null>(null)
  const [dragging,    setDragging]    = useState<HKey | null>(null)
  const [autoOk,      setAutoOk]      = useState(false)
  const [mpLoading,   setMpLoading]   = useState(false)
  const [confirming,  setConfirming]  = useState(false)
  const [copied,      setCopied]      = useState(false)

  // Refs estáveis para uso dentro de callbacks sem stale closure
  const imgBoundsRef   = useRef(imgBounds)
  const activeGroupRef = useRef(activeGroup)
  useEffect(() => { imgBoundsRef.current   = imgBounds   }, [imgBounds])
  useEffect(() => { activeGroupRef.current = activeGroup }, [activeGroup])

  // ── Resize → canvas preenche o container ─────────────────────────────────
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

  // ── MediaPipe (carga lazy) ────────────────────────────────────────────────
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
        minFaceDetectionConfidence: 0.3,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false,
      })
    } finally {
      setMpLoading(false)
    }
    return landmarkerRef.current
  }

  // ── Posições padrão (fallback sem detecção) ───────────────────────────────
  function defaultHandles(b: typeof imgBounds): Handles {
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2
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

  // ── Aplica landmarks após calibração confirmada ───────────────────────────
  // Usa a escala calibrada (px/mm) para estimativas baseadas em medidas reais,
  // não em percentuais da largura do olho (muito imprecisos).
  function applyLandmarks(lms: RawLm[], b: typeof imgBounds, cur: Handles): Handles {
    const tc = (lm: RawLm): Pt => ({ x: b.x + lm.x * b.w, y: b.y + lm.y * b.h })

    // Pupilas — precisos pelo MediaPipe
    const irisR = tc(lms[468])   // OD (imagem-esquerda)
    const irisL = tc(lms[473])   // OE (imagem-direita)

    // Canto externo dos olhos — para refinamento da borda lateral da lente
    const outerR = tc(lms[33])

    // Ponte nasal — para posição Y do apoio da ponte
    const noseBridge = tc(lms[6])

    // Escala calibrada: px por mm  (usa o cartão já posicionado pelo usuário)
    const pxMm = dist(cur.calibA, cur.calibB) / CC_MM

    // Centro horizontal da ponte (entre as duas pupilas)
    const bridgeCX = (irisR.x + irisL.x) / 2

    // ── Estimativas baseadas em medidas ópticas padrão adulto (mm) ──────
    // Estes valores são ponto de partida — usuário ajusta em seguida.
    const BRIDGE_HALF = 8.5  // meia-ponte típica: 17 mm total
    const LENS_OUTER  = 26   // borda externa da lente ao centro da pupila (~52 mm A)
    const LENS_TOP    = 12   // borda superior da lente acima da pupila
    const MOUNT_H     = 18   // altura de montagem padrão (pupila → base do aro)

    // Borda lateral: usa o mínimo entre estimativa mm e canto externo do olho + 4 mm
    const lensLeftX = Math.min(
      irisR.x - LENS_OUTER * pxMm,
      outerR.x - 4 * pxMm,
    )
    // Borda interna da lente OD = mesma posição X que bridgeR
    const lensRightX = bridgeCX - BRIDGE_HALF * pxMm
    const bridgeY    = noseBridge.y - 2 * pxMm   // ponte fica levemente acima do nariz

    return {
      ...cur,   // preserva calibA e calibB
      pupilR: irisR,
      pupilL: irisL,
      bridgeR: { x: lensRightX,   y: bridgeY },
      bridgeL: { x: bridgeCX + BRIDGE_HALF * pxMm, y: bridgeY },
      mountR:  { x: irisR.x,      y: irisR.y + MOUNT_H * pxMm },
      mountL:  { x: irisL.x,      y: irisL.y + MOUNT_H * pxMm },
      lensLeft:   { x: lensLeftX,  y: irisR.y },
      lensRight:  { x: lensRightX, y: irisR.y },
      lensTop:    { x: irisR.x,    y: irisR.y - LENS_TOP * pxMm },
      lensBottom: { x: irisR.x,    y: irisR.y + MOUNT_H * pxMm },
      diagA:      { x: lensLeftX,  y: irisR.y - LENS_TOP * pxMm },
      diagB:      { x: lensRightX, y: irisR.y + MOUNT_H * pxMm },
    }
  }

  // ── Detecção automática via canvas offscreen (mais confiável) ────────────
  async function runDetect(img: HTMLImageElement) {
    const lm = await ensureLandmarker().catch(() => null)
    if (!lm) return
    // Redimensiona para no máximo 1280px (acelera e melhora detecção)
    const maxDim = 1280
    const s   = Math.min(maxDim / img.naturalWidth, maxDim / img.naturalHeight, 1)
    const oc  = document.createElement('canvas')
    oc.width  = Math.round(img.naturalWidth  * s)
    oc.height = Math.round(img.naturalHeight * s)
    oc.getContext('2d')!.drawImage(img, 0, 0, oc.width, oc.height)
    try {
      const result = (lm as any).detect(oc)
      const detected: RawLm[] | undefined = result?.faceLandmarks?.[0]
      if (!detected?.length) return
      rawLmsRef.current = detected
      setAutoOk(true)
    } catch (e) {
      console.warn('[MediaPipe detect]', e)
    }
  }

  // ── Carrega arquivo ───────────────────────────────────────────────────────
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
        setImgBounds(b)
        setPts(defaultHandles(b))
        setStep('calibrate')
        // Pré-carrega o modelo enquanto usuário calibra o cartão (detecção roda só no confirm)
        ensureLandmarker().catch(() => null)
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

  // ── Confirma calibração → detecta rosto → aplica pontos ─────────────────
  async function confirmCalibration() {
    if (!pts) return
    setConfirming(true)
    try {
      // Roda detecção agora (modelo deve estar carregado ou carregando)
      if (!rawLmsRef.current && imgRef.current) {
        await runDetect(imgRef.current)
      }
      if (rawLmsRef.current) {
        setPts(prev => prev ? applyLandmarks(rawLmsRef.current!, imgBounds, prev) : prev)
      }
    } finally {
      setConfirming(false)
    }
    setActiveGroup(null)
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
    const ib  = imgBounds

    ctx.fillStyle = '#0f172a'
    ctx.fillRect(0, 0, canvasW, canvasH)
    ctx.drawImage(imgRef.current, ib.x, ib.y, ib.w, ib.h)
    if (!pts) return

    const m   = calc(pts)
    const bCX = (pts.bridgeR.x + pts.bridgeL.x) / 2
    const ag  = activeGroup  // capturado no closure do callback

    // ── Segmento de medição com ticks ───────────────────────────────────
    function seg(a: Pt, b: Pt, color: string, label: string, dim: boolean) {
      ctx.save()
      ctx.globalAlpha = dim ? 0.18 : 1
      ctx.strokeStyle = color
      ctx.lineWidth   = 2
      ctx.setLineDash([])
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
      if (!dim) {
        const ang = Math.atan2(b.y - a.y, b.x - a.x), perp = ang + Math.PI / 2, T = 5;
        [a, b].forEach(p => {
          ctx.beginPath()
          ctx.moveTo(p.x + Math.cos(perp) * T, p.y + Math.sin(perp) * T)
          ctx.lineTo(p.x - Math.cos(perp) * T, p.y - Math.sin(perp) * T)
          ctx.stroke()
        })
        pill(ctx, label, (a.x + b.x) / 2, (a.y + b.y) / 2 - 13, color)
      }
      ctx.restore()
    }

    // ── Ponto âncora simples (handle inativo) ───────────────────────────
    function dot(pt: Pt, key: HKey, dim: boolean) {
      ctx.save()
      ctx.globalAlpha = dim ? 0.28 : 0.8
      ctx.beginPath(); ctx.arc(pt.x, pt.y, A_R, 0, Math.PI * 2)
      ctx.fillStyle = COLORS[key]; ctx.fill()
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke()
      ctx.restore()
    }

    // ── Balão (handle arrastável) ────────────────────────────────────────
    // O âncora fica VISÍVEL; o balão fica deslocado para o dedo não cobrir.
    function balloon(pt: Pt, key: HKey, isRef: boolean) {
      const bp     = balloonOf(pt, ib)
      const active = draggingRef.current === key
      const color  = COLORS[key]
      ctx.save()
      // haste tracejada
      ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3])
      ctx.beginPath(); ctx.moveTo(pt.x, pt.y); ctx.lineTo(bp.x, bp.y); ctx.stroke()
      ctx.setLineDash([])
      // âncora
      ctx.beginPath(); ctx.arc(pt.x, pt.y, A_R, 0, Math.PI * 2)
      ctx.fillStyle = color; ctx.fill()
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke()
      if (!isRef) {
        // balão arrastável
        ctx.beginPath(); ctx.arc(bp.x, bp.y, B_R, 0, Math.PI * 2)
        ctx.fillStyle = active ? color : color + 'cc'; ctx.fill()
        ctx.strokeStyle = '#fff'; ctx.lineWidth = active ? 2.5 : 1.5; ctx.stroke()
        ctx.fillStyle = active ? '#000' : '#fff'
        ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(LABELS[key], bp.x, bp.y)
      } else {
        // referência: só âncora + label
        ctx.fillStyle = color; ctx.font = 'bold 9px sans-serif'
        ctx.textAlign = 'center'; ctx.textBaseline = 'top'
        ctx.fillText(LABELS[key], pt.x, pt.y + A_R + 2)
      }
      ctx.restore()
    }

    // ── Crosshair de calibração (CC1/CC2) ───────────────────────────────
    function calCross(pt: Pt, key: HKey) {
      const bp     = balloonOf(pt, ib)
      const active = draggingRef.current === key
      const color  = COLORS[key]
      ctx.save()
      // haste
      ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3])
      ctx.beginPath(); ctx.moveTo(pt.x, pt.y); ctx.lineTo(bp.x, bp.y); ctx.stroke()
      ctx.setLineDash([])
      // crosshair âncora
      ctx.strokeStyle = color; ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(pt.x - CAL_ARM, pt.y); ctx.lineTo(pt.x + CAL_ARM, pt.y)
      ctx.moveTo(pt.x, pt.y - CAL_ARM); ctx.lineTo(pt.x, pt.y + CAL_ARM)
      ctx.stroke()
      ctx.beginPath(); ctx.arc(pt.x, pt.y, CAL_DOT, 0, Math.PI * 2)
      ctx.fillStyle = color; ctx.fill()
      // balão
      ctx.beginPath(); ctx.arc(bp.x, bp.y, B_R, 0, Math.PI * 2)
      ctx.fillStyle = active ? color : color + 'cc'; ctx.fill()
      ctx.strokeStyle = '#fff'; ctx.lineWidth = active ? 2.5 : 1.5; ctx.stroke()
      ctx.fillStyle = active ? '#000' : '#fff'
      ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(LABELS[key], bp.x, bp.y)
      ctx.restore()
    }

    // ── ETAPA CALIBRAÇÃO ────────────────────────────────────────────────
    if (step === 'calibrate') {
      const ok = Math.abs(m.calibMm - CC_MM) < 4
      ctx.save()
      ctx.strokeStyle = ok ? '#94a3b8' : '#fbbf24'
      ctx.lineWidth = 1.5; ctx.setLineDash([5, 4])
      ctx.beginPath(); ctx.moveTo(pts.calibA.x, pts.calibA.y); ctx.lineTo(pts.calibB.x, pts.calibB.y); ctx.stroke()
      ctx.restore()
      pill(ctx, `${fmt(m.calibMm)} mm`,
        (pts.calibA.x + pts.calibB.x) / 2,
        (pts.calibA.y + pts.calibB.y) / 2 - 14,
        ok ? '#94a3b8' : '#fbbf24')
      calCross(pts.calibA, 'calibA')
      calCross(pts.calibB, 'calibB')
      return
    }

    // ── ETAPA MEDIÇÃO ───────────────────────────────────────────────────
    const showAll = ag === null
    const is = (id: string) => ag === id
    const dim = (id: string) => !showAll && !is(id)

    // guia vertical da ponte
    if (showAll || is('pupils') || is('bridge')) {
      ctx.save()
      ctx.strokeStyle = 'rgba(129,140,248,0.20)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4])
      ctx.beginPath(); ctx.moveTo(bCX, ib.y); ctx.lineTo(bCX, ib.y + ib.h); ctx.stroke()
      ctx.restore()
    }

    // linhas de medição
    seg({ x: bCX, y: pts.pupilR.y }, pts.pupilR, '#818cf8', `DNP-OD ${fmt(m.dnpOD)}`, dim('pupils'))
    seg({ x: bCX, y: pts.pupilL.y }, pts.pupilL, '#818cf8', `DNP-OE ${fmt(m.dnpOE)}`, dim('pupils'))
    seg(pts.bridgeR, pts.bridgeL,            '#34d399', `Ponte ${fmt(m.ponte)}`,     dim('bridge'))
    seg(pts.pupilR, { x: pts.pupilR.x, y: pts.mountR.y }, '#fb923c', `Alt-OD ${fmt(m.altOD)}`, dim('altOD'))
    seg(pts.pupilL, { x: pts.pupilL.x, y: pts.mountL.y }, '#fb923c', `Alt-OE ${fmt(m.altOE)}`, dim('altOE'))
    seg(pts.lensLeft,  pts.lensRight,        '#f87171', `A ${fmt(m.horizontal)}`,    dim('frameA'))
    seg(pts.lensTop,   pts.lensBottom,       '#c084fc', `B ${fmt(m.vertical)}`,      dim('frameB'))
    seg(pts.diagA,     pts.diagB,            '#fbbf24', `D ${fmt(m.diagonal)}`,      dim('frameD'))

    // handles
    const allKeys: HKey[] = [
      'pupilR', 'pupilL', 'bridgeR', 'bridgeL',
      'mountR', 'mountL', 'lensLeft', 'lensRight',
      'lensTop', 'lensBottom', 'diagA', 'diagB',
    ]

    if (showAll) {
      allKeys.forEach(k => dot(pts[k], k, false))
    } else {
      const group   = MEASURE_GROUPS.find(g => g.id === ag)
      const active  = new Set<HKey>(group?.handles ?? [])
      const refs    = new Set<HKey>(group?.refs    ?? [])
      allKeys.forEach(k => {
        if (active.has(k))     balloon(pts[k], k, false)
        else if (refs.has(k))  balloon(pts[k], k, true)
        else                   dot(pts[k], k, true)
      })
    }
  }, [pts, dragging, step, activeGroup, canvasW, canvasH, imgBounds]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { draw() }, [draw])

  // ── Eventos de ponteiro/toque ─────────────────────────────────────────────
  function canvasPos(e: React.MouseEvent | React.TouchEvent): Pt {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const sx = canvasW / rect.width, sy = canvasH / rect.height
    if ('touches' in e) {
      const t = (e as React.TouchEvent).touches[0] ?? (e as React.TouchEvent).changedTouches[0]
      return { x: (t.clientX - rect.left) * sx, y: (t.clientY - rect.top) * sy }
    }
    const me = e as React.MouseEvent
    return { x: (me.clientX - rect.left) * sx, y: (me.clientY - rect.top) * sy }
  }

  /** Encontra o balão mais próximo da posição tocada */
  function nearestBalloon(pos: Pt): HKey | null {
    if (!pts) return null
    let keys: HKey[]
    if (step === 'calibrate') {
      keys = ['calibA', 'calibB']
    } else if (activeGroupRef.current) {
      const g = MEASURE_GROUPS.find(g => g.id === activeGroupRef.current)
      keys = g ? g.handles : []
    } else {
      return null
    }
    let best: HKey | null = null, minD = Infinity
    for (const k of keys) {
      const bp = balloonOf(pts[k], imgBoundsRef.current)
      const d  = dist(pos, bp)
      if (d < B_R * 2.2 && d < minD) { minD = d; best = k }
    }
    return best
  }

  function onDown(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    const pos = canvasPos(e)
    const key = nearestBalloon(pos)
    if (!key || !pts) return
    draggingRef.current = key
    setDragging(key)
    // Captura o vetor offset (balão - âncora) no momento do toque
    const anchor = pts[key]
    const bp     = balloonOf(anchor, imgBoundsRef.current)
    dragOffsetRef.current = { x: bp.x - anchor.x, y: bp.y - anchor.y }
  }

  function onMove(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    if (!draggingRef.current || !pts) return
    const fingerPos = canvasPos(e)
    const offset    = dragOffsetRef.current
    const ib        = imgBoundsRef.current
    // âncora = posição do dedo - offset (mantém balão sob o dedo)
    const newAnchor: Pt = {
      x: Math.max(ib.x, Math.min(ib.x + ib.w, fingerPos.x - offset.x)),
      y: Math.max(ib.y, Math.min(ib.y + ib.h, fingerPos.y - offset.y)),
    }
    setPts(prev => prev ? { ...prev, [draggingRef.current!]: newAnchor } : prev)
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
    navigator.clipboard.writeText([
      `DNP OD: ${fmt(m.dnpOD)} mm`,
      `DNP OE: ${fmt(m.dnpOE)} mm`,
      `Altura de montagem OD: ${fmt(m.altOD)} mm`,
      `Altura de montagem OE: ${fmt(m.altOE)} mm`,
      `Ponte: ${fmt(m.ponte)} mm`,
      `Horizontal (A): ${fmt(m.horizontal)} mm`,
      `Vertical (B): ${fmt(m.vertical)} mm`,
      `Diagonal (D): ${fmt(m.diagonal)} mm`,
    ].join('\n')).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  function reset() {
    setStep('capture'); setPts(null); setActiveGroup(null)
    setAutoOk(false); rawLmsRef.current = null; imgRef.current = null
  }

  const meas  = pts ? calc(pts) : null
  const calOk = meas ? Math.abs(meas.calibMm - CC_MM) < 4 : false

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-slate-950 text-white overflow-hidden">

      {/* Container do canvas — sempre montado para o ResizeObserver */}
      <div ref={containerRef} className="absolute inset-0">
        {step !== 'capture' && (
          <canvas
            ref={canvasRef}
            width={canvasW} height={canvasH}
            className="absolute inset-0 w-full h-full touch-none"
            style={{ cursor: dragging ? 'grabbing' : 'default' }}
            onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
            onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
          />
        )}
      </div>

      {/* ── TELA DE CAPTURA ──────────────────────────────────────────────── */}
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

      {/* ── OVERLAYS ─────────────────────────────────────────────────────── */}
      {step !== 'capture' && (
        <>
          {/* Topo-esquerda: título + badges */}
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

          {/* Topo-direita: etapas + reset */}
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

          {/* ── PAINEL INFERIOR — CALIBRAÇÃO ───────────────────────────── */}
          {step === 'calibrate' && meas && (
            <div className="absolute bottom-0 left-0 right-0 bg-black/80 backdrop-blur-md border-t border-white/10 px-5 py-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium mb-1">
                    Arraste <span className="font-mono text-slate-200">CC1</span> e{' '}
                    <span className="font-mono text-slate-200">CC2</span> para as pontas da borda longa do cartão
                  </p>
                  <div className={`text-sm flex items-center gap-2 ${calOk ? 'text-emerald-400' : 'text-amber-400'}`}>
                    <span className={`w-2 h-2 rounded-full ${calOk ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                    {fmt(meas.calibMm)} mm — ref. 85,6 mm {calOk ? '✓' : ''}
                  </div>
                </div>
                <button
                  onClick={confirmCalibration}
                  disabled={confirming}
                  className="shrink-0 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 rounded-xl text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-2"
                >
                  {confirming && (
                    <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin inline-block" />
                  )}
                  {confirming ? 'Posicionando...' : autoOk ? 'Calibrar e posicionar →' : 'Confirmar →'}
                </button>
              </div>
            </div>
          )}

          {/* ── PAINEL INFERIOR — MEDIÇÕES ──────────────────────────────── */}
          {(step === 'measure' || step === 'done') && meas && (
            <div className="absolute bottom-0 left-0 right-0 bg-black/80 backdrop-blur-md border-t border-white/10">

              {/* Chips de grupo (seletor) */}
              <div className="flex gap-2 px-3 pt-3 pb-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                {/* Voltar para recalibrar o cartão */}
                <button
                  onClick={() => { setActiveGroup(null); setStep('calibrate') }}
                  className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap border border-white/15 bg-white/5 text-slate-400 active:bg-white/10"
                  title="Voltar e recalibrar o cartão de crédito"
                >
                  ← Cartão
                </button>
                <div className="w-px bg-white/10 shrink-0 my-0.5" />
                {MEASURE_GROUPS.map(g => (
                  <button
                    key={g.id}
                    onClick={() => setActiveGroup(prev => prev === g.id ? null : g.id)}
                    className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap border ${
                      activeGroup === g.id
                        ? 'bg-indigo-600 border-indigo-400 text-white'
                        : 'bg-white/5 border-white/10 text-slate-300 active:bg-white/15'
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>

              {/* Instrução contextual */}
              <p className="text-xs text-slate-500 px-4 pt-1 pb-0.5 min-h-[18px]">
                {activeGroup
                  ? 'Arraste os balões — o ponto de medição fica visível abaixo do dedo'
                  : 'Toque em uma medida para ajustar os marcadores'}
              </p>

              {/* Grade de valores */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 px-4 pt-1 pb-2">
                <MR label="DNP OD"    v={meas.dnpOD}      c="#818cf8" hi={activeGroup === 'pupils'} />
                <MR label="Ponte"     v={meas.ponte}      c="#34d399" hi={activeGroup === 'bridge'} />
                <MR label="DNP OE"    v={meas.dnpOE}      c="#818cf8" hi={activeGroup === 'pupils'} />
                <MR label="A horiz."  v={meas.horizontal} c="#f87171" hi={activeGroup === 'frameA'} />
                <MR label="Alt OD"    v={meas.altOD}      c="#fb923c" hi={activeGroup === 'altOD'}  />
                <MR label="B vert."   v={meas.vertical}   c="#c084fc" hi={activeGroup === 'frameB'} />
                <MR label="Alt OE"    v={meas.altOE}      c="#fb923c" hi={activeGroup === 'altOE'}  />
                <MR label="D diag."   v={meas.diagonal}   c="#fbbf24" hi={activeGroup === 'frameD'} />
              </div>

              {/* Botão de ação */}
              <div className="px-4 pb-4 pt-1">
                {step === 'measure' && !activeGroup && (
                  <button onClick={() => setStep('done')}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-sm font-medium transition-colors">
                    Confirmar medidas ✓
                  </button>
                )}
                {step === 'measure' && activeGroup && (
                  <button onClick={() => setActiveGroup(null)}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-sm font-medium transition-colors">
                    Concluir ajuste →
                  </button>
                )}
                {step === 'done' && (
                  <button onClick={copyResults}
                    className={`w-full py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-colors ${copied ? 'bg-emerald-700 text-emerald-100' : 'bg-slate-700 hover:bg-slate-600'}`}>
                    <Copy className="w-4 h-4" />
                    {copied ? 'Copiado!' : 'Copiar medidas'}
                  </button>
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
    <div className={`flex items-center justify-between text-sm py-0.5 transition-opacity ${hi ? '' : 'opacity-50'}`}>
      <span className="flex items-center gap-1.5 text-slate-300">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c }} />
        {label}
      </span>
      <span className={`font-mono font-semibold tabular-nums ${hi ? 'text-white' : 'text-slate-400'}`}>
        {v.toFixed(1)}<span className="text-slate-600 font-normal text-xs ml-0.5">mm</span>
      </span>
    </div>
  )
}
