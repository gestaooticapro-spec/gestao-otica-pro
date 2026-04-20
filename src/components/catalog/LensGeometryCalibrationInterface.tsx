'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { upsertLensGeometry, deleteLensGeometry, type LensGeometry } from '@/lib/actions/lens-geometry.actions'
import { normalizeLensName } from '@/lib/utils/lens'

// ---------------------------------------------------------------------------
// Canvas dimensions
// ---------------------------------------------------------------------------
const CW = 560
const CH = 340
const RESULT_SCALE = 2

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type ImgTransform = { x: number; y: number; scale: number }
type CompareMode = 'overlay' | 'split'

type HandleDef = {
  id: string
  x: number
  y: number
  field: keyof LensGeometry
  axis: 'x' | 'y'
  rate: number          // param units per canvas pixel (can be negative)
  color: string
}

type HandleDragState = {
  active: boolean
  field: keyof LensGeometry
  axis: 'x' | 'y'
  rate: number
  startCanvas: number   // canvas-relative start coordinate (x or y)
  startValue: number
}

function getFieldMax(field: keyof LensGeometry): number {
  return field === 'corridor_opening' ? 300 : 100
}

type DragTarget = 'lens' | 'reference'

type TransformDragState = {
  active: boolean
  startX: number
  startY: number
  ox: number
  oy: number
}

// ---------------------------------------------------------------------------
// Image draw with pan/zoom
// ---------------------------------------------------------------------------
function drawImageSection(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  W: number, H: number,
  t: ImgTransform,
) {
  const cropStartY = img.naturalHeight * 0.15
  const cropH      = img.naturalHeight * 0.85
  const cropW      = cropH * (W / H)
  const cropX      = (img.naturalWidth - cropW) / 2
  const drawW = W * t.scale
  const drawH = H * t.scale
  const drawX = (W - drawW) / 2 + t.x
  const drawY = (H - drawH) / 2 + t.y
  ctx.drawImage(img, cropX, cropStartY, cropW, cropH, drawX, drawY, drawW, drawH)
}

function drawContainImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  W: number,
  H: number,
  t: ImgTransform = { x: 0, y: 0, scale: 1 },
) {
  const baseScale = Math.min(W / img.naturalWidth, H / img.naturalHeight)
  const scale = baseScale * t.scale
  const drawW = img.naturalWidth * scale
  const drawH = img.naturalHeight * scale
  const drawX = (W - drawW) / 2 + t.x
  const drawY = (H - drawH) / 2 + t.y
  ctx.drawImage(img, drawX, drawY, drawW, drawH)
}

// ---------------------------------------------------------------------------
// Lens shape
// ---------------------------------------------------------------------------
function buildLensPath(W: number, H: number): Path2D {
  const p = new Path2D()
  const rx = W * 0.12
  const ry = H * 0.22
  p.moveTo(rx, 0)
  p.lineTo(W - rx, 0)
  p.quadraticCurveTo(W, 0, W, ry)
  p.lineTo(W, H - ry)
  p.quadraticCurveTo(W, H, W - rx, H)
  p.lineTo(rx, H)
  p.quadraticCurveTo(0, H, 0, H - ry)
  p.lineTo(0, ry)
  p.quadraticCurveTo(0, 0, rx, 0)
  p.closePath()
  return p
}

function buildCutoutRect(W: number, H: number) {
  const rectW = W * 0.52
  const rectH = H * 0.46
  const rectX = (W - rectW) / 2
  const rectY = H * 0.22
  return { x: rectX, y: rectY, w: rectW, h: rectH }
}

// ---------------------------------------------------------------------------
// Zone geometry
// ---------------------------------------------------------------------------
function buildZoneData(g: LensGeometry, W: number, H: number) {
  const distH   = g.distance_reference_height ?? 50
  const nearH   = g.near_reference_height     ?? 50
  const corrLen = g.corridor_length           ?? 50
  const corridorOpening = g.corridor_opening ?? g.intermediate_width ?? 50
  const ins     = g.inset                     ?? 50
  const cX      = W / 2
  const insetShift = ((ins - 50) / 50) * W * 0.05

  const distCY = H * (0.04 + (1 - distH / 100) * 0.25)
  const nearCY = H * (0.56 + (1 - nearH / 100) * 0.22)

  const maxRX  = W * 0.46
  const distRX = g.distance_present     ? maxRX * ((g.distance_width     ?? 50) / 100) : 0
  const distRY = H * 0.16
  const nearRX = g.near_present         ? maxRX * ((g.near_width         ?? 50) / 100) : 0
  const nearRY = H * 0.13
  const intRX  = g.intermediate_present
    ? maxRX * (corridorOpening / 300) * 0.55
    : 0

  const distBottomY  = distCY + distRY
  const minGap       = H * 0.04
  const maxGap       = H * 0.40
  const corridorGap  = minGap + (corrLen / 100) * (maxGap - minGap)
  const nearCYfinal  = Math.max(nearCY, distBottomY + corridorGap + nearRY)
  const nearTopY     = nearCYfinal - nearRY

  return {
    cX, insetShift, maxRX,
    distCY, distRX, distRY,
    nearCY: nearCYfinal, nearRX, nearRY,
    intRX, distBottomY, nearTopY,
  }
}

// ---------------------------------------------------------------------------
// Handles: positions + interaction metadata
// ---------------------------------------------------------------------------
function computeHandles(g: LensGeometry, W: number, H: number): HandleDef[] {
  const zd = buildZoneData(g, W, H)
  const midCorrY  = (zd.distBottomY + zd.nearTopY) / 2
  const corrHW    = Math.max(zd.distRX * 0.28, zd.intRX)

  // Fitting height position (0=bottom, 100=top of lens)
  const fh   = g.fitting_height ?? 50
  const fitY = H * 0.93 - (fh / 100) * H * 0.86

  return [
    // Distance zone
    {
      id: 'dist_height', x: zd.cX, y: zd.distCY - zd.distRY,
      field: 'distance_reference_height', axis: 'y',
      rate: -100 / (H * 0.28),   // drag up → higher value
      color: '#60a5fa',
    },
    {
      id: 'dist_width', x: zd.cX + zd.distRX, y: zd.distCY,
      field: 'distance_width', axis: 'x',
      rate: 100 / zd.maxRX,      // drag right → wider
      color: '#34d399',
    },
    // Corridor / intermediate
    {
      id: 'corr_length', x: zd.cX, y: zd.nearTopY,
      field: 'corridor_length', axis: 'y',
      rate: 100 / (H * 0.26),    // drag down → longer
      color: '#a78bfa',
    },
    {
      id: 'corr_width', x: zd.cX - corrHW, y: midCorrY,
      field: 'corridor_opening', axis: 'x',
      rate: -400 / zd.maxRX,     // drag left → wider
      color: '#34d399',
    },
    // Near zone
    {
      id: 'near_width', x: zd.cX + zd.insetShift + zd.nearRX, y: zd.nearCY,
      field: 'near_width', axis: 'x',
      rate: 100 / zd.maxRX,
      color: '#34d399',
    },
    {
      id: 'near_inset', x: zd.cX + zd.insetShift, y: zd.nearCY + zd.nearRY,
      field: 'inset', axis: 'x',
      rate: 1000 / W,             // drag right → more nasal
      color: '#fbbf24',
    },
    // Fitting height
    {
      id: 'fit_height', x: W * 0.08, y: fitY,
      field: 'fitting_height', axis: 'y',
      rate: -100 / (H * 0.86),   // drag up → higher
      color: '#f97316',
    },
  ]
}

// ---------------------------------------------------------------------------
// Draw lens
// ---------------------------------------------------------------------------
function drawLens(
  canvas: HTMLCanvasElement,
  g: LensGeometry,
  img: HTMLImageElement | null,
  referenceImg: HTMLImageElement | null,
  t: ImgTransform = { x: 0, y: 0, scale: 1 },
  referenceTransform: ImgTransform = { x: 0, y: 0, scale: 1 },
  showOverlay = true,
  showBackground = true,
  compareMode: CompareMode = 'overlay',
  referenceOpacity = 0.55,
  splitPosition = 0.5,
  cropReferenceToCutout = false,
  cropBackgroundToCutout = false,
  showCutoutGuide = true,
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const W = canvas.width
  const H = canvas.height
  ctx.clearRect(0, 0, W, H)

  const lensPath = buildLensPath(W, H)
  const cutoutRect = buildCutoutRect(W, H)
  const blurPx   = 1.5 + ((g.lateral_blur ?? 50) / 100) * 11
  const feather  = 18
  const zd       = buildZoneData(g, W, H)

  // ── 1: sharp base ─────────────────────────────────────────────────────────
  ctx.save()
  ctx.clip(lensPath)
  if (referenceImg && compareMode === 'split') {
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, W * splitPosition, H)
    ctx.clip()
    if (cropReferenceToCutout) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(cutoutRect.x, cutoutRect.y, cutoutRect.w, cutoutRect.h)
      ctx.clip()
      drawContainImage(ctx, referenceImg, W, H, referenceTransform)
      ctx.restore()
    } else {
      drawContainImage(ctx, referenceImg, W, H, referenceTransform)
    }
    ctx.restore()

    if (img && showBackground) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(W * splitPosition, 0, W * (1 - splitPosition), H)
      ctx.clip()
      if (cropBackgroundToCutout) {
        ctx.save()
        ctx.beginPath()
        ctx.rect(cutoutRect.x, cutoutRect.y, cutoutRect.w, cutoutRect.h)
        ctx.clip()
        drawImageSection(ctx, img, W, H, t)
        ctx.restore()
      } else {
        drawImageSection(ctx, img, W, H, t)
      }
      ctx.restore()
    } else {
      ctx.save()
      ctx.beginPath()
      ctx.rect(W * splitPosition, 0, W * (1 - splitPosition), H)
      ctx.clip()
      ctx.fillStyle = '#1e293b'
      ctx.fillRect(0, 0, W, H)
      ctx.restore()
    }
  } else {
    if (referenceImg) {
      ctx.save()
      ctx.globalAlpha = referenceOpacity
      if (cropReferenceToCutout) {
        ctx.beginPath()
        ctx.rect(cutoutRect.x, cutoutRect.y, cutoutRect.w, cutoutRect.h)
        ctx.clip()
      }
      drawContainImage(ctx, referenceImg, W, H, referenceTransform)
      ctx.restore()
    }
    if (img && showBackground) {
      if (cropBackgroundToCutout) {
        ctx.save()
        ctx.beginPath()
        ctx.rect(cutoutRect.x, cutoutRect.y, cutoutRect.w, cutoutRect.h)
        ctx.clip()
        drawImageSection(ctx, img, W, H, t)
        ctx.restore()
      } else {
        drawImageSection(ctx, img, W, H, t)
      }
    }
    else if (!referenceImg) {
      ctx.fillStyle = '#1e293b'
      ctx.fillRect(0, 0, W, H)
    }
  }
  ctx.restore()

  if (referenceImg && compareMode === 'split') {
    const dividerX = W * splitPosition
    ctx.save()
    ctx.clip(lensPath)
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'
    ctx.setLineDash([4, 4])
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.moveTo(dividerX, 0)
    ctx.lineTo(dividerX, H)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = 'rgba(255,255,255,0.8)'
    ctx.font = 'bold 9px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText('GABARITO', dividerX * 0.5, 14)
    ctx.fillText('CALIBRACAO', dividerX + (W - dividerX) * 0.5, 14)
    ctx.restore()
  }

  if (showCutoutGuide) {
    ctx.save()
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'
    ctx.fillStyle = 'rgba(255,255,255,0.03)'
    ctx.lineWidth = 1.4
    ctx.setLineDash([3, 4])
    ctx.beginPath()
    ctx.rect(cutoutRect.x, cutoutRect.y, cutoutRect.w, cutoutRect.h)
    ctx.fill()
    ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.font = 'bold 9px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText('RECORTE FINAL', W / 2, cutoutRect.y + 12)
    ctx.restore()
  }

  // ── 2: blurred peripheral overlay ────────────────────────────────────────
  const blurCanvas = document.createElement('canvas')
  blurCanvas.width = W; blurCanvas.height = H
  const bCtx = blurCanvas.getContext('2d')!
  if (img && showBackground) {
    bCtx.filter = `blur(${blurPx}px)`
    if (cropBackgroundToCutout) {
      bCtx.save()
      bCtx.beginPath()
      bCtx.rect(cutoutRect.x, cutoutRect.y, cutoutRect.w, cutoutRect.h)
      bCtx.clip()
      drawImageSection(bCtx, img, W, H, t)
      bCtx.restore()
    } else {
      drawImageSection(bCtx, img, W, H, t)
    }
    bCtx.filter = 'none'
  }

  const maskCanvas = document.createElement('canvas')
  maskCanvas.width = W; maskCanvas.height = H
  const mCtx = maskCanvas.getContext('2d')!
  mCtx.fillStyle = 'black'
  mCtx.fillRect(0, 0, W, H)
  // Expand zones in the mask beyond lens edges so feathering doesn't bleed
  // inside the lens at zone boundaries. The blurCanvas is still clipped to
  // lensPath, so nothing visible actually extends outside the lens.
  const EXP = feather * 3

  mCtx.globalCompositeOperation = 'destination-out'
  mCtx.filter = `blur(${feather}px)`
  mCtx.fillStyle = 'black'

  if (g.distance_present && zd.distRX > 0) {
    mCtx.beginPath()
    mCtx.ellipse(zd.cX, zd.distCY, zd.distRX + EXP, zd.distRY + EXP, 0, 0, Math.PI * 2)
    mCtx.fill()
  }
  if (g.intermediate_present && zd.nearTopY > zd.distBottomY) {
    const topHW  = Math.max(zd.distRX * 0.28, zd.intRX) + EXP * 0.4
    const botHW  = Math.max(zd.nearRX * 0.28, zd.intRX) + EXP * 0.4
    const cxCorr = zd.cX + zd.insetShift * 0.5
    mCtx.beginPath()
    mCtx.moveTo(zd.cX - topHW, zd.distBottomY - EXP * 0.3)
    mCtx.lineTo(zd.cX + topHW, zd.distBottomY - EXP * 0.3)
    mCtx.lineTo(cxCorr + botHW, zd.nearTopY + EXP * 0.3)
    mCtx.lineTo(cxCorr - botHW, zd.nearTopY + EXP * 0.3)
    mCtx.closePath()
    mCtx.fill()
  }
  if (g.near_present && zd.nearRX > 0) {
    mCtx.beginPath()
    mCtx.ellipse(zd.cX + zd.insetShift, zd.nearCY, zd.nearRX + EXP, zd.nearRY + EXP, 0, 0, Math.PI * 2)
    mCtx.fill()
  }

  mCtx.filter = 'none'
  mCtx.globalCompositeOperation = 'source-over'
  bCtx.globalCompositeOperation = 'destination-in'
  bCtx.drawImage(maskCanvas, 0, 0)
  bCtx.globalCompositeOperation = 'source-over'

  ctx.save()
  ctx.clip(lensPath)
  ctx.drawImage(blurCanvas, 0, 0)
  ctx.restore()

  // ── 3: zone outlines (dashed) ────────────────────────────────────────────
  if (showOverlay) {
    ctx.save()
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 4])

    if (g.distance_present && zd.distRX > 0) {
      ctx.beginPath()
      ctx.ellipse(zd.cX, zd.distCY, zd.distRX, zd.distRY, 0, 0, Math.PI * 2)
      ctx.stroke()
    }
    if (g.intermediate_present && zd.nearTopY > zd.distBottomY) {
      const topHW  = Math.max(zd.distRX * 0.28, zd.intRX)
      const botHW  = Math.max(zd.nearRX * 0.28, zd.intRX)
      const cxCorr = zd.cX + zd.insetShift * 0.5
      ctx.beginPath()
      ctx.moveTo(zd.cX - topHW, zd.distBottomY)
      ctx.lineTo(zd.cX + topHW, zd.distBottomY)
      ctx.lineTo(cxCorr + botHW, zd.nearTopY)
      ctx.lineTo(cxCorr - botHW, zd.nearTopY)
      ctx.closePath()
      ctx.stroke()
    }
    if (g.near_present && zd.nearRX > 0) {
      ctx.beginPath()
      ctx.ellipse(zd.cX + zd.insetShift, zd.nearCY, zd.nearRX, zd.nearRY, 0, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.setLineDash([])
    ctx.restore()
  }

  // ── 4: fitting height marker ──────────────────────────────────────────────
  const fh   = g.fitting_height ?? 50
  const fitY = H * 0.93 - (fh / 100) * H * 0.86

  ctx.save()
  // horizontal dashed line
  ctx.strokeStyle = 'rgba(251,146,60,0.8)'
  ctx.lineWidth = 1.2
  ctx.setLineDash([3, 5])
  ctx.beginPath()
  ctx.moveTo(W * 0.04, fitY)
  ctx.lineTo(W * 0.96, fitY)
  ctx.stroke()
  ctx.setLineDash([])
  // cross at center
  ctx.strokeStyle = '#f97316'
  ctx.lineWidth = 2
  const ms = 6
  ctx.beginPath()
  ctx.moveTo(W / 2 - ms, fitY); ctx.lineTo(W / 2 + ms, fitY)
  ctx.moveTo(W / 2, fitY - ms); ctx.lineTo(W / 2, fitY + ms)
  ctx.stroke()
  // PM label
  ctx.fillStyle = '#f97316'
  ctx.font = 'bold 9px system-ui'
  ctx.textAlign = 'left'
  ctx.fillText('PM', W * 0.04 + 4, fitY - 4)
  ctx.restore()

  // ── 5: drag handles ───────────────────────────────────────────────────────
  if (showOverlay) {
    const handles = computeHandles(g, W, H)
    ctx.save()
    for (const h of handles) {
      ctx.beginPath()
      ctx.arc(h.x, h.y, 5, 0, Math.PI * 2)
      ctx.fillStyle = h.color
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
    ctx.restore()
  }

  // ── 6: lens rim ───────────────────────────────────────────────────────────
  ctx.save()
  ctx.strokeStyle = 'rgba(60,80,120,0.8)'
  ctx.lineWidth = 3
  ctx.stroke(lensPath)
  ctx.restore()

  // ── 7: type label ─────────────────────────────────────────────────────────
  ctx.save()
  ctx.font = 'bold 10px system-ui, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.textAlign = 'center'
  const label =
    g.visual_design_type === 'occupational'             ? 'OCUPACIONAL'
    : g.visual_design_type === 'personalized'           ? 'PERSONALIZADA'
    : g.visual_design_type === 'single_vision_standard' ? 'VISÃO SIMPLES'
    : 'PROGRESSIVA'
  ctx.fillText(label, W / 2, H - 7)
  ctx.restore()
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SliderRow({ label, value, onChange, disabled = false, max = 100 }: {
  label: string; value: number | null; onChange: (v: number) => void; disabled?: boolean; max?: number
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-44 shrink-0 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </span>
      <input type="range" min={0} max={max} step={5}
        value={value ?? 50}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className="h-1.5 w-full cursor-pointer accent-indigo-500 disabled:opacity-30"
      />
      <span className="w-8 shrink-0 text-center text-[12px] font-black text-slate-200">
        {value ?? '–'}
      </span>
    </div>
  )
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-44 shrink-0 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </span>
      <button onClick={() => onChange(!value)}
        className={`rounded-full px-3 py-0.5 text-[11px] font-bold transition ${value ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-400'}`}>
        {value ? 'Presente' : 'Ausente'}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------
const HANDLE_LEGEND = [
  { color: '#60a5fa', label: 'Altura do campo' },
  { color: '#34d399', label: 'Largura do campo' },
  { color: '#a78bfa', label: 'Comprimento corredor' },
  { color: '#fbbf24', label: 'Inset nasal' },
  { color: '#f97316', label: 'Ponto de montagem (PM)' },
]

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
const DESIGN_TYPES = ['progressive', 'occupational', 'personalized', 'single_vision_standard']
const DESIGN_LABELS: Record<string, string> = {
  progressive: 'Progressiva', occupational: 'Ocupacional',
  personalized: 'Personalizada', single_vision_standard: 'Visão Simples',
}

function blankGeometry(name: string): LensGeometry {
  return {
    id: `new-${Date.now()}`,
    family_name: name,
    visual_design_type: 'progressive',
    distance_present: true,   distance_width: 50,
    intermediate_present: true, intermediate_width: 50,
    corridor_opening: 50,
    near_present: true,       near_width: 50,
    corridor_length: 50,
    lateral_blur: 50,
    inset: 50,
    distance_reference_height: 50,
    near_reference_height: 50,
    fitting_height: 50,
  }
}

export default function LensGeometryCalibrationInterface({
  geometries,
  catalogFamilyNames,
}: {
  geometries: LensGeometry[]
  catalogFamilyNames: string[]
}) {
  const [localGeometries, setLocalGeometries] = useState<LensGeometry[]>(geometries)
  const [selected, setSelected]      = useState<LensGeometry>(geometries[0])
  const [draft, setDraft]            = useState<LensGeometry>(geometries[0])
  const [isDirty, setIsDirty]        = useState(false)
  const [isPending, startTransition] = useTransition()
  const [savedMsg, setSavedMsg]      = useState(false)
  const [showOverlay, setShowOverlay]     = useState(true)
  const [showBackground, setShowBackground] = useState(true)
  const [compareMode, setCompareMode] = useState<CompareMode>('overlay')
  const [referenceOpacity, setReferenceOpacity] = useState(55)
  const [splitPosition, setSplitPosition] = useState(50)
  const [referenceName, setReferenceName] = useState<string | null>(null)
  const [activeTarget, setActiveTarget] = useState<DragTarget>('reference')
  const [referenceZoom, setReferenceZoom] = useState(100)
  const [cropReferenceToCutout, setCropReferenceToCutout] = useState(false)
  const [cropBackgroundToCutout, setCropBackgroundToCutout] = useState(false)

  const canvasRef      = useRef<HTMLCanvasElement>(null)
  const resultCanvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef         = useRef<HTMLImageElement | null>(null)
  const referenceRef   = useRef<HTMLImageElement | null>(null)
  const transformRef   = useRef<ImgTransform>({ x: 0, y: 0, scale: 1 })
  const referenceTransformRef = useRef<ImgTransform>({ x: 0, y: 0, scale: 1 })
  const imgDragRef     = useRef<TransformDragState>({ active: false, startX: 0, startY: 0, ox: 0, oy: 0 })
  const referenceDragRef = useRef<TransformDragState>({ active: false, startX: 0, startY: 0, ox: 0, oy: 0 })
  const handleDragRef  = useRef<HandleDragState>({
    active: false, field: 'distance_width', axis: 'x', rate: 1, startCanvas: 0, startValue: 50,
  })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const referenceUrlRef = useRef<string | null>(null)

  // Keep a ref to draft for use in mouse handlers (avoid stale closure)
  const draftRef = useRef(draft)
  useEffect(() => { draftRef.current = draft }, [draft])

  const showOverlayRef    = useRef(showOverlay)
  useEffect(() => { showOverlayRef.current = showOverlay }, [showOverlay])

  const showBackgroundRef = useRef(showBackground)
  useEffect(() => { showBackgroundRef.current = showBackground }, [showBackground])

  const compareModeRef = useRef(compareMode)
  useEffect(() => { compareModeRef.current = compareMode }, [compareMode])

  const cropReferenceToCutoutRef = useRef(cropReferenceToCutout)
  useEffect(() => { cropReferenceToCutoutRef.current = cropReferenceToCutout }, [cropReferenceToCutout])

  const cropBackgroundToCutoutRef = useRef(cropBackgroundToCutout)
  useEffect(() => { cropBackgroundToCutoutRef.current = cropBackgroundToCutout }, [cropBackgroundToCutout])

  const referenceOpacityRef = useRef(referenceOpacity)
  useEffect(() => { referenceOpacityRef.current = referenceOpacity / 100 }, [referenceOpacity])

  const splitPositionRef = useRef(splitPosition / 100)
  useEffect(() => { splitPositionRef.current = splitPosition / 100 }, [splitPosition])

  const activeTargetRef = useRef(activeTarget)
  useEffect(() => { activeTargetRef.current = activeTarget }, [activeTarget])

  useEffect(() => {
    referenceTransformRef.current = {
      ...referenceTransformRef.current,
      scale: referenceZoom / 100,
    }
  }, [referenceZoom])

  const redraw = useCallback(() => {
    if (canvasRef.current)
      drawLens(
        canvasRef.current,
        draftRef.current,
        imgRef.current,
        referenceRef.current,
        transformRef.current,
        referenceTransformRef.current,
        showOverlayRef.current,
        showBackgroundRef.current,
        compareModeRef.current,
        referenceOpacityRef.current,
        splitPositionRef.current,
        cropReferenceToCutoutRef.current,
        cropBackgroundToCutoutRef.current,
      )
    if (resultCanvasRef.current) {
      const sourceCanvas = document.createElement('canvas')
      sourceCanvas.width = CW * RESULT_SCALE
      sourceCanvas.height = CH * RESULT_SCALE
      drawLens(
        sourceCanvas,
        draftRef.current,
        imgRef.current,
        null,
        transformRef.current,
        referenceTransformRef.current,
        false,
        showBackgroundRef.current,
        'overlay',
        0,
        0.5,
        false,
        false,
        false,
      )

      const resultCtx = resultCanvasRef.current.getContext('2d')
      if (resultCtx) {
        const W = resultCanvasRef.current.width
        const H = resultCanvasRef.current.height
        const cutoutRect = buildCutoutRect(sourceCanvas.width, sourceCanvas.height)
        resultCtx.clearRect(0, 0, W, H)
        resultCtx.drawImage(
          sourceCanvas,
          cutoutRect.x, cutoutRect.y, cutoutRect.w, cutoutRect.h,
          0, 0, W, H,
        )
      }
    }
  }, [])

  useEffect(() => {
    const img = new Image()
    img.src = '/lens-bg.png'
    img.onload = () => { imgRef.current = img; redraw() }
  }, [redraw])

  useEffect(() => {
    return () => {
      if (referenceUrlRef.current) URL.revokeObjectURL(referenceUrlRef.current)
    }
  }, [])

  useEffect(() => { redraw() }, [draft, showOverlay, showBackground, compareMode, referenceOpacity, splitPosition, referenceZoom, activeTarget, cropReferenceToCutout, cropBackgroundToCutout, redraw])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const deltaScale = e.deltaY > 0 ? 0.9 : 1.1
      if (activeTargetRef.current === 'reference' && referenceRef.current) {
        const next = Math.min(4, Math.max(0.4, referenceTransformRef.current.scale * (e.deltaY > 0 ? 0.98 : 1.02)))
        referenceTransformRef.current = { ...referenceTransformRef.current, scale: next }
        setReferenceZoom(Math.round(next * 200) / 2)
      } else {
        const next = Math.min(4, Math.max(0.4, transformRef.current.scale * deltaScale))
        transformRef.current = { ...transformRef.current, scale: next }
      }
      redraw()
    }
    canvas.addEventListener('wheel', handler, { passive: false })
    return () => canvas.removeEventListener('wheel', handler)
  }, [redraw])

  const selectFamily = (name: string) => {
    const found = localGeometries.find((g) => g.family_name === name)
    if (!found) return
    setSelected(found); setDraft(found); setIsDirty(false)
  }

  const addFromCatalog = (family_name: string) => {
    if (!family_name) return
    const blank = blankGeometry(family_name)
    setLocalGeometries((prev) => [...prev, blank])
    setSelected(blank); setDraft(blank); setIsDirty(true)
  }

  const update = useCallback((field: keyof LensGeometry, value: unknown) => {
    setDraft((prev) => {
      const next = { ...prev, [field]: value } as LensGeometry
      if (field === 'corridor_opening') next.intermediate_width = value as number
      if (field === 'intermediate_width') next.corridor_opening = value as number
      return next
    })
    setIsDirty(true)
  }, [])

  // Convert client coords → canvas coords
  const toCanvas = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return {
      cx: (e.clientX - rect.left) * (CW / rect.width),
      cy: (e.clientY - rect.top)  * (CH / rect.height),
    }
  }

  const onMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const { cx, cy } = toCanvas(e)
    const handles = computeHandles(draftRef.current, CW, CH)
    const HIT = 12

    for (const h of handles) {
      if ((cx - h.x) ** 2 + (cy - h.y) ** 2 < HIT ** 2) {
        handleDragRef.current = {
          active: true,
          field: h.field,
          axis: h.axis,
          rate: h.rate,
          startCanvas: h.axis === 'x' ? cx : cy,
          startValue: Math.min(getFieldMax(h.field), Math.max(0, (draftRef.current[h.field] as number) ?? 50)),
        }
        return
      }
    }

    const dragTarget = activeTargetRef.current
    const refLoaded = !!referenceRef.current

    if (dragTarget === 'reference' && refLoaded) {
      referenceDragRef.current = {
        active: true,
        startX: e.clientX,
        startY: e.clientY,
        ox: referenceTransformRef.current.x,
        oy: referenceTransformRef.current.y,
      }
      return
    }

    // No handle hit → lens image drag
    imgDragRef.current = { active: true, startX: e.clientX, startY: e.clientY, ox: transformRef.current.x, oy: transformRef.current.y }
  }, [])

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const hd = handleDragRef.current
    if (hd.active) {
      const { cx, cy } = toCanvas(e)
      const canvasCoord = hd.axis === 'x' ? cx : cy
      const delta = canvasCoord - hd.startCanvas
      const newVal = Math.round(Math.min(getFieldMax(hd.field), Math.max(0, hd.startValue + delta * hd.rate)))
      update(hd.field, newVal)
      return
    }

    const d = imgDragRef.current
    if (!d.active) {
      const refDrag = referenceDragRef.current
      if (!refDrag.active) return
      referenceTransformRef.current = {
        ...referenceTransformRef.current,
        x: refDrag.ox + (e.clientX - refDrag.startX),
        y: refDrag.oy + (e.clientY - refDrag.startY),
      }
      redraw()
      return
    }
    transformRef.current = {
      ...transformRef.current,
      x: d.ox + (e.clientX - d.startX),
      y: d.oy + (e.clientY - d.startY),
    }
    redraw()
  }, [update, redraw])

  const onMouseUp   = useCallback(() => {
    handleDragRef.current.active = false
    imgDragRef.current.active    = false
    referenceDragRef.current.active = false
  }, [])

  const resetTransform = useCallback(() => {
    transformRef.current = { x: 0, y: 0, scale: 1 }
    redraw()
  }, [redraw])

  const resetReferenceTransform = useCallback(() => {
    referenceTransformRef.current = { x: 0, y: 0, scale: 1 }
    setReferenceZoom(100)
    redraw()
  }, [redraw])

  const nudgeReferenceTransform = useCallback((dx: number, dy: number) => {
    referenceTransformRef.current = {
      ...referenceTransformRef.current,
      x: referenceTransformRef.current.x + dx,
      y: referenceTransformRef.current.y + dy,
    }
    setActiveTarget('reference')
    redraw()
  }, [redraw])

  const zoomReferenceTransform = useCallback((direction: 1 | -1) => {
    const next = Math.min(4, Math.max(0.4, referenceTransformRef.current.scale * (direction > 0 ? 1.02 : 0.98)))
    referenceTransformRef.current = { ...referenceTransformRef.current, scale: next }
    setReferenceZoom(Math.round(next * 200) / 2)
    setActiveTarget('reference')
    redraw()
  }, [redraw])

  const clearReference = useCallback(() => {
    if (referenceUrlRef.current) {
      URL.revokeObjectURL(referenceUrlRef.current)
      referenceUrlRef.current = null
    }
    referenceRef.current = null
    setReferenceName(null)
    setActiveTarget('lens')
    setCropReferenceToCutout(false)
    setCropBackgroundToCutout(false)
    resetReferenceTransform()
    redraw()
  }, [redraw, resetReferenceTransform])

  const loadReference = useCallback((file: File | null) => {
    if (!file) return
    if (referenceUrlRef.current) URL.revokeObjectURL(referenceUrlRef.current)

    const url = URL.createObjectURL(file)
    referenceUrlRef.current = url
    setReferenceName(file.name)
    setCropReferenceToCutout(false)
    setCropBackgroundToCutout(false)

    const refImg = new Image()
    refImg.onload = () => {
      referenceRef.current = refImg
      setShowBackground(false)
      setActiveTarget('reference')
      resetReferenceTransform()
      redraw()
    }
    refImg.src = url
  }, [redraw, resetReferenceTransform])

  const handleSave = () => {
    startTransition(async () => {
      const { id, ...rest } = draft
      void id
      const corridorOpening = rest.corridor_opening ?? rest.intermediate_width ?? 50
      const saved = await upsertLensGeometry({
        ...rest,
        corridor_opening: corridorOpening,
        intermediate_width: rest.intermediate_width ?? corridorOpening,
      })
      setLocalGeometries((prev) => {
        const exists = prev.some((g) => g.family_name === saved.family_name)
        return exists
          ? prev.map((g) => g.family_name === saved.family_name ? saved : g)
          : [...prev, saved]
      })
      setSelected(saved); setDraft(saved)
      setSavedMsg(true); setIsDirty(false)
      setTimeout(() => setSavedMsg(false), 2500)
    })
  }

  const handleDelete = () => {
    if (!window.confirm(`Remover "${draft.family_name}" da calibração?`)) return
    const isNew = draft.id.startsWith('new-')
    const next = localGeometries.filter((g) => g.family_name !== draft.family_name)
    setLocalGeometries(next)
    const fallback = next[0]
    if (fallback) { setSelected(fallback); setDraft(fallback) }
    setIsDirty(false)
    if (!isNew) {
      startTransition(async () => { await deleteLensGeometry(draft.id) })
    }
  }

  const isPersonalized = draft?.visual_design_type === 'personalized'

  return (
    <div className="min-h-screen bg-slate-950 p-6 text-white">
      <h1 className="mb-1 text-xl font-black uppercase tracking-tight">Calibração de Geometria de Lentes</h1>
      <p className="mb-6 text-sm text-slate-400">Selecione uma família, ajuste os parâmetros e salve.</p>

      {/* Family selector — grouped by visual_design_type */}
      {(() => {
        const calibratedNormalized = new Set(localGeometries.map((g) => normalizeLensName(g.family_name)))
        const availableToAdd = catalogFamilyNames.filter((n) => !calibratedNormalized.has(normalizeLensName(n)))
        return (
          <div className="mb-6 space-y-4">
            {DESIGN_TYPES.map((type) => {
              const chips = localGeometries.filter((g) => g.visual_design_type === type)
              if (!chips.length) return null
              return (
                <div key={type} className="space-y-1.5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    {DESIGN_LABELS[type]}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {chips.map((g) => (
                      <button key={g.family_name} onClick={() => selectFamily(g.family_name)}
                        className={`rounded-full border px-3 py-1 text-[11px] font-bold transition ${
                          selected.family_name === g.family_name
                            ? 'border-indigo-500 bg-indigo-600 text-white'
                            : 'border-white/10 bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}>
                        {g.family_name}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}

            {availableToAdd.length > 0 && (
              <select
                value=""
                onChange={(e) => addFromCatalog(e.target.value)}
                className="rounded-full border border-dashed border-white/20 bg-slate-800 px-3 py-1 text-[11px] font-bold text-slate-500 outline-none hover:border-indigo-400 hover:text-slate-300 transition cursor-pointer">
                <option value="">+ Nova família do catálogo…</option>
                {availableToAdd.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            )}
          </div>
        )
      })()}

      {!draft && (
        <p className="mt-8 text-center text-sm text-slate-500">
          Nenhuma geometria calibrada ainda. Adicione uma família acima para começar.
        </p>
      )}
      {draft && <><div className="grid gap-8 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] xl:items-start">
        {/* Canvas */}
        <div className="ml-auto flex w-full max-w-[1040px] flex-col items-start gap-3">
          <canvas
            ref={canvasRef} width={CW} height={CH}
            className="w-full rounded-2xl shadow-2xl cursor-grab active:cursor-grabbing"
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => loadReference(e.target.files?.[0] ?? null)}
          />

          {/* Info row */}
          <div className="flex w-full items-center justify-between px-1">
            <div className="flex flex-col">
              <p className="text-[11px] font-bold text-slate-400">{draft.family_name}</p>
              <p className="text-[10px] text-slate-500">
                {referenceName ? `Gabarito: ${referenceName}` : 'Nenhum gabarito carregado'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowBackground((v) => !v)}
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold transition ${
                  showBackground ? 'bg-slate-700 text-slate-200 hover:bg-slate-600' : 'bg-slate-800 text-slate-500 hover:bg-slate-700'
                }`}>
                {showBackground ? 'Ocultar fundo' : 'Mostrar fundo'}
              </button>
              <button onClick={() => setShowOverlay((v) => !v)}
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold transition ${
                  showOverlay ? 'bg-indigo-700 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}>
                {showOverlay ? 'Ocultar guias' : 'Mostrar guias'}
              </button>
              <button onClick={resetTransform}
                className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-400 hover:bg-slate-700 transition">
                Resetar imagem
              </button>
              <button onClick={() => fileInputRef.current?.click()}
                className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-emerald-500 transition">
                Carregar gabarito
              </button>
              {referenceName && (
                <button onClick={clearReference}
                  className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-400 hover:bg-slate-700 transition">
                  Limpar gabarito
                </button>
              )}
              {referenceName && (
                <button
                  onClick={() => setCropReferenceToCutout((v) => !v)}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold transition ${
                    cropReferenceToCutout
                      ? 'bg-amber-600 text-white hover:bg-amber-500'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  {cropReferenceToCutout ? 'Desfazer corte' : 'Cortar gabarito'}
                </button>
              )}
              <button
                onClick={() => setCropBackgroundToCutout((v) => !v)}
                disabled={!showBackground}
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  cropBackgroundToCutout
                    ? 'bg-amber-600 text-white hover:bg-amber-500'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                {cropBackgroundToCutout ? 'Soltar fundo' : 'Cortar fundo'}
              </button>
            </div>
          </div>

          <div className="flex w-full flex-wrap items-center gap-2 px-1">
            <button
              onClick={() => setCompareMode('overlay')}
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold transition ${
                compareMode === 'overlay' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              Sobrepor
            </button>
            <button
              onClick={() => setCompareMode('split')}
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold transition ${
                compareMode === 'split' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              Dividir
            </button>
            <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500">
              <span>Opacidade</span>
              <input
                type="range"
                min={10}
                max={100}
                step={5}
                value={referenceOpacity}
                onChange={(e) => setReferenceOpacity(Number(e.target.value))}
                className="h-1.5 w-28 cursor-pointer accent-emerald-500"
              />
              <span className="w-8 text-slate-300">{referenceOpacity}%</span>
            </div>
            {compareMode === 'split' && (
              <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500">
                <span>Divisor</span>
                <input
                  type="range"
                  min={10}
                  max={90}
                  step={1}
                  value={splitPosition}
                  onChange={(e) => setSplitPosition(Number(e.target.value))}
                  className="h-1.5 w-28 cursor-pointer accent-indigo-500"
                />
                <span className="w-8 text-slate-300">{splitPosition}%</span>
              </div>
            )}
          </div>

          <div className="flex w-full flex-wrap items-center gap-2 px-1">
            <button
              onClick={() => setActiveTarget('reference')}
              disabled={!referenceName}
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                activeTarget === 'reference'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              Editar gabarito
            </button>
            <button
              onClick={() => setActiveTarget('lens')}
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold transition ${
                activeTarget === 'lens'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              Editar lente
            </button>
            <button
              onClick={resetReferenceTransform}
              disabled={!referenceName}
              className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-400 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Reset gabarito
            </button>
            <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500">
              <span>Zoom gabarito</span>
              <input
                type="range"
                min={40}
                max={250}
                step={0.5}
                value={referenceZoom}
                onChange={(e) => setReferenceZoom(Number(e.target.value))}
                disabled={!referenceName}
                className="h-1.5 w-28 cursor-pointer accent-emerald-500 disabled:opacity-40"
              />
              <span className="w-8 text-slate-300">{referenceZoom.toFixed(1)}%</span>
              <button
                onClick={() => zoomReferenceTransform(-1)}
                disabled={!referenceName}
                className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-400 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                -
              </button>
              <button
                onClick={() => zoomReferenceTransform(1)}
                disabled={!referenceName}
                className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-400 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                +
              </button>
            </div>
            <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500">
              <span className="mr-1">Nudge</span>
              <button
                onClick={() => nudgeReferenceTransform(-1, 0)}
                disabled={!referenceName}
                className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-400 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                ←
              </button>
              <button
                onClick={() => nudgeReferenceTransform(1, 0)}
                disabled={!referenceName}
                className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-400 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                →
              </button>
              <button
                onClick={() => nudgeReferenceTransform(0, -1)}
                disabled={!referenceName}
                className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-400 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                ↑
              </button>
              <button
                onClick={() => nudgeReferenceTransform(0, 1)}
                disabled={!referenceName}
                className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-400 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                ↓
              </button>
            </div>
          </div>

          {/* Handle legend */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 px-1">
            {HANDLE_LEGEND.map((l) => (
              <div key={l.label} className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full border border-white/50" style={{ background: l.color }} />
                <span className="text-[10px] text-slate-400">{l.label}</span>
              </div>
            ))}
          </div>

          {/* design type */}
          <div className="flex flex-wrap gap-2 px-1">
            {DESIGN_TYPES.map((t) => (
              <button key={t} onClick={() => update('visual_design_type', t)}
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold transition ${
                  draft.visual_design_type === t ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}>
                {DESIGN_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900 p-4 shadow-2xl">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex flex-col">
              <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Resultado final</p>
              <p className="text-[10px] text-slate-500">Render sem guias, para validar o blur e a leitura óptica.</p>
            </div>
            <button
              onClick={() => setShowBackground((v) => !v)}
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold transition ${
                showBackground ? 'bg-slate-700 text-slate-200 hover:bg-slate-600' : 'bg-slate-800 text-slate-500 hover:bg-slate-700'
              }`}
            >
              {showBackground ? 'Ocultar fundo' : 'Mostrar fundo'}
            </button>
          </div>
          <canvas
            ref={resultCanvasRef}
            width={CW * RESULT_SCALE}
            height={CH * RESULT_SCALE}
            className="w-full rounded-2xl shadow-inner h-auto"
          />
        </div>

        {/* Sliders */}
        <div className="xl:col-span-2 w-full rounded-2xl border border-white/10 bg-slate-900 p-5">
          {isPersonalized ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              Lente personalizada — sem parâmetros fixos de geometria.
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Zona de Longe</p>
                <ToggleRow label="Presente" value={draft.distance_present} onChange={(v) => update('distance_present', v)} />
                <SliderRow label="Largura" value={draft.distance_width} onChange={(v) => update('distance_width', v)} disabled={!draft.distance_present} />
                <SliderRow label="Altura na lente" value={draft.distance_reference_height} onChange={(v) => update('distance_reference_height', v)} disabled={!draft.distance_present} />
              </div>
              <hr className="border-white/10" />
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Corredor / Intermediário</p>
                <ToggleRow label="Presente" value={draft.intermediate_present} onChange={(v) => update('intermediate_present', v)} />
                <SliderRow label="Abertura do corredor" value={draft.corridor_opening ?? draft.intermediate_width} onChange={(v) => update('corridor_opening', v)} disabled={!draft.intermediate_present} max={300} />
                <SliderRow label="Comprimento" value={draft.corridor_length} onChange={(v) => update('corridor_length', v)} />
                <p className="pl-44 text-[10px] text-slate-500">
                  Escala universal: 0 = sem corredor, 300 = abertura máxima comparável entre famílias.
                </p>
              </div>
              <hr className="border-white/10" />
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Zona de Perto</p>
                <ToggleRow label="Presente" value={draft.near_present} onChange={(v) => update('near_present', v)} />
                <SliderRow label="Largura" value={draft.near_width} onChange={(v) => update('near_width', v)} disabled={!draft.near_present} />
                <SliderRow label="Altura na lente" value={draft.near_reference_height} onChange={(v) => update('near_reference_height', v)} disabled={!draft.near_present} />
                <SliderRow label="Inset nasal" value={draft.inset} onChange={(v) => update('inset', v)} disabled={!draft.near_present} />
              </div>
              <hr className="border-white/10" />
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Geral</p>
                <SliderRow label="Distorção lateral" value={draft.lateral_blur} onChange={(v) => update('lateral_blur', v)} />
                <SliderRow label="Ponto de montagem" value={draft.fitting_height} onChange={(v) => update('fitting_height', v)} />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 flex items-center gap-4">
        <button onClick={handleSave} disabled={!isDirty || isPending}
          className="rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-black text-white transition hover:bg-indigo-500 disabled:opacity-40">
          {isPending ? 'Salvando…' : 'Salvar'}
        </button>
        <button onClick={handleDelete} disabled={isPending}
          className="rounded-xl border border-red-500/30 bg-transparent px-4 py-2.5 text-sm font-bold text-red-400 transition hover:bg-red-500/10 disabled:opacity-40">
          Remover
        </button>
        {savedMsg && <span className="text-sm font-bold text-emerald-400">Salvo com sucesso.</span>}
        {isDirty && !savedMsg && <span className="text-sm text-slate-500">Alterações não salvas</span>}
      </div>
      </>}
    </div>
  )
}
