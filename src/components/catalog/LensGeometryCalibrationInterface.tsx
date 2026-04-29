'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { upsertLensGeometry, deleteLensGeometry, type LensGeometry, type LensPins } from '@/lib/actions/lens-geometry.actions'
import { normalizeLensName } from '@/lib/utils/lens'

const CW = 560
const CH = 340
const RESULT_SCALE = 2
const PIN_HIT = 10

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type ImgTransform = { x: number; y: number; scale: number }
type CompareMode = 'overlay' | 'split'
type PinZone = 'distance' | 'corridor' | 'near' | 'lineA' | 'lineB' | 'lensRim'
type DragTarget = 'lens' | 'reference'
type TransformDragState = { active: boolean; startX: number; startY: number; ox: number; oy: number }
type PinDragState = { active: boolean; zone: PinZone; index: number }
type GuideVisibility = { zonePins: boolean; lensContour: boolean; visualLines: boolean }

const ZONE_COLOR: Record<PinZone, string> = {
  distance: '#60a5fa',
  corridor: '#fb923c',
  near: '#4ade80',
  lineA: '#fbbf24',
  lineB: '#fbbf24',
  lensRim: '#c084fc',
}
const ZONE_LABEL: Record<PinZone, string> = {
  distance: 'Longe',
  corridor: 'Corredor',
  near: 'Perto',
  lineA: 'Linha A',
  lineB: 'Linha B',
  lensRim: 'Contorno',
}
const BLUR_ZONES: PinZone[] = ['distance', 'corridor', 'near']
const LINE_ZONES: PinZone[] = ['lineA', 'lineB']
const RIM_ZONES: PinZone[] = ['lensRim']
const ALL_ZONES: PinZone[] = [...BLUR_ZONES, ...LINE_ZONES, ...RIM_ZONES]
const DEFAULT_SHARED_LENS_RIM: Array<{ x: number; y: number }> = [
  { x: 0.10, y: 0.24 }, { x: 0.18, y: 0.12 }, { x: 0.50, y: 0.07 }, { x: 0.82, y: 0.12 }, { x: 0.90, y: 0.24 },
  { x: 0.94, y: 0.50 }, { x: 0.90, y: 0.76 }, { x: 0.82, y: 0.88 }, { x: 0.50, y: 0.93 }, { x: 0.18, y: 0.88 },
  { x: 0.10, y: 0.76 }, { x: 0.06, y: 0.50 },
]

function emptyPins(): LensPins {
  return { distance: [], corridor: [], near: [], lineA: [], lineB: [], lensRim: [], fitting_height: 0.5 }
}

function normalizePins(p: LensPins | null | undefined): LensPins {
  const base = emptyPins()
  if (!p) return base
  return { ...base, ...p }
}

function clonePoints(points: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  return points.map((pt) => ({ x: pt.x, y: pt.y }))
}

function resolveSharedLensRim(geometries: LensGeometry[]): Array<{ x: number; y: number }> {
  for (const geometry of geometries) {
    const rim = normalizePins(geometry.pins).lensRim
    if (rim.length >= 3) return clonePoints(rim)
  }
  return clonePoints(DEFAULT_SHARED_LENS_RIM)
}

function withSharedLensRimFallback(geometries: LensGeometry[]): LensGeometry[] {
  const sharedLensRim = resolveSharedLensRim(geometries)
  let changed = false
  const next = geometries.map((geometry) => {
    const pins = normalizePins(geometry.pins)
    if (pins.lensRim.length >= 3) return geometry
    changed = true
    return { ...geometry, pins: { ...pins, lensRim: clonePoints(sharedLensRim) } }
  })
  return changed ? next : geometries
}

// ---------------------------------------------------------------------------
// Image draw helpers
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
  W: number, H: number,
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
  const rectW = W * 0.68
  const rectH = H * 0.62
  const rectX = (W - rectW) / 2
  const rectY = H * 0.15
  return { x: rectX, y: rectY, w: rectW, h: rectH }
}

// ---------------------------------------------------------------------------
// Pin path: smooth closed curve through points (quadratic bezier midpoints)
// ---------------------------------------------------------------------------
function buildPinPath(pins: Array<{ x: number; y: number }>, W: number, H: number): Path2D {
  const p = new Path2D()
  if (pins.length < 3) return p
  const abs = pins.map(pt => ({ x: pt.x * W, y: pt.y * H }))
  const last = abs[abs.length - 1]
  const first = abs[0]
  p.moveTo((last.x + first.x) / 2, (last.y + first.y) / 2)
  for (let i = 0; i < abs.length; i++) {
    const curr = abs[i]
    const next = abs[(i + 1) % abs.length]
    p.quadraticCurveTo(curr.x, curr.y, (curr.x + next.x) / 2, (curr.y + next.y) / 2)
  }
  p.closePath()
  return p
}

// Open smooth curve through points (for visual lines — not closed)
function buildOpenLinePath(pins: Array<{ x: number; y: number }>, W: number, H: number): Path2D {
  const p = new Path2D()
  if (pins.length < 2) return p
  const abs = pins.map(pt => ({ x: pt.x * W, y: pt.y * H }))
  p.moveTo(abs[0].x, abs[0].y)
  if (abs.length === 2) {
    p.lineTo(abs[1].x, abs[1].y)
  } else {
    p.lineTo((abs[0].x + abs[1].x) / 2, (abs[0].y + abs[1].y) / 2)
    for (let i = 1; i < abs.length - 1; i++) {
      const curr = abs[i]; const next = abs[i + 1]
      p.quadraticCurveTo(curr.x, curr.y, (curr.x + next.x) / 2, (curr.y + next.y) / 2)
    }
    p.lineTo(abs[abs.length - 1].x, abs[abs.length - 1].y)
  }
  return p
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
  activePinZone: PinZone | null = null,
  showZoneLines = false,
  guideVisibility: GuideVisibility = { zonePins: true, lensContour: true, visualLines: true },
  showReference = true,
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const W = canvas.width
  const H = canvas.height
  ctx.clearRect(0, 0, W, H)

  const pins = normalizePins(g.pins)
  const hasReference = !!referenceImg && showReference
  const lensPath = pins.lensRim.length >= 3
    ? buildPinPath(pins.lensRim, W, H)
    : buildLensPath(W, H)
  const cutoutRect = buildCutoutRect(W, H)
  const blurPx = 1.5 + ((g.lateral_blur ?? 50) / 100) * 11
  const feather = 22

  // ── 1: sharp base ─────────────────────────────────────────────────────────
  ctx.save()
  ctx.clip(lensPath)
  if (hasReference && compareMode === 'split') {
    ctx.save()
    ctx.beginPath(); ctx.rect(0, 0, W * splitPosition, H); ctx.clip()
    if (cropReferenceToCutout) {
      ctx.save(); ctx.beginPath(); ctx.rect(cutoutRect.x, cutoutRect.y, cutoutRect.w, cutoutRect.h); ctx.clip()
      drawContainImage(ctx, referenceImg, W, H, referenceTransform); ctx.restore()
    } else {
      drawContainImage(ctx, referenceImg, W, H, referenceTransform)
    }
    ctx.restore()
    if (img && showBackground) {
      ctx.save()
      ctx.beginPath(); ctx.rect(W * splitPosition, 0, W * (1 - splitPosition), H); ctx.clip()
      if (cropBackgroundToCutout) {
        ctx.save(); ctx.beginPath(); ctx.rect(cutoutRect.x, cutoutRect.y, cutoutRect.w, cutoutRect.h); ctx.clip()
        drawImageSection(ctx, img, W, H, t); ctx.restore()
      } else {
        drawImageSection(ctx, img, W, H, t)
      }
      ctx.restore()
    } else {
      ctx.save()
      ctx.beginPath(); ctx.rect(W * splitPosition, 0, W * (1 - splitPosition), H); ctx.clip()
      ctx.fillStyle = '#1e293b'; ctx.fillRect(0, 0, W, H); ctx.restore()
    }
  } else {
    if (hasReference) {
      ctx.save()
      ctx.globalAlpha = referenceOpacity
      if (cropReferenceToCutout) {
        ctx.beginPath(); ctx.rect(cutoutRect.x, cutoutRect.y, cutoutRect.w, cutoutRect.h); ctx.clip()
      }
      drawContainImage(ctx, referenceImg!, W, H, referenceTransform)
      ctx.restore()
    }
    if (img && showBackground) {
      if (cropBackgroundToCutout) {
        ctx.save(); ctx.beginPath(); ctx.rect(cutoutRect.x, cutoutRect.y, cutoutRect.w, cutoutRect.h); ctx.clip()
        drawImageSection(ctx, img, W, H, t); ctx.restore()
      } else {
        drawImageSection(ctx, img, W, H, t)
      }
    } else if (!hasReference) {
      ctx.fillStyle = '#1e293b'; ctx.fillRect(0, 0, W, H)
    }
  }
  ctx.restore()

  // ── 2: blurred peripheral overlay ─────────────────────────────────────────
  const blurCanvas = document.createElement('canvas')
  blurCanvas.width = W; blurCanvas.height = H
  const bCtx = blurCanvas.getContext('2d')!
  if (img && showBackground) {
    bCtx.filter = `blur(${blurPx}px)`
    if (cropBackgroundToCutout) {
      bCtx.save(); bCtx.beginPath(); bCtx.rect(cutoutRect.x, cutoutRect.y, cutoutRect.w, cutoutRect.h); bCtx.clip()
      drawImageSection(bCtx, img, W, H, t); bCtx.restore()
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
  mCtx.globalCompositeOperation = 'destination-out'
  mCtx.filter = `blur(${feather}px)`
  for (const zone of BLUR_ZONES) {
    if (pins[zone].length >= 3) {
      mCtx.fill(buildPinPath(pins[zone], W, H))
    }
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

  // ── 3: split divider label ─────────────────────────────────────────────────
  if (hasReference && compareMode === 'split') {
    const dividerX = W * splitPosition
    ctx.save()
    ctx.clip(lensPath)
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'
    ctx.setLineDash([4, 4]); ctx.lineWidth = 1.2
    ctx.beginPath(); ctx.moveTo(dividerX, 0); ctx.lineTo(dividerX, H); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = 'bold 9px system-ui'; ctx.textAlign = 'center'
    ctx.fillText('GABARITO', dividerX * 0.5, 14)
    ctx.fillText('CALIBRACAO', dividerX + (W - dividerX) * 0.5, 14)
    ctx.restore()
  }

  // ── 4: cutout guide ───────────────────────────────────────────────────────
  if (showCutoutGuide) {
    ctx.save()
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.fillStyle = 'rgba(255,255,255,0.03)'
    ctx.lineWidth = 1.4; ctx.setLineDash([3, 4])
    ctx.beginPath(); ctx.rect(cutoutRect.x, cutoutRect.y, cutoutRect.w, cutoutRect.h)
    ctx.fill(); ctx.stroke(); ctx.setLineDash([])
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = 'bold 9px system-ui'; ctx.textAlign = 'center'
    ctx.fillText('RECORTE FINAL', W / 2, cutoutRect.y + 12)
    ctx.restore()
  }

  // ── 5: fitting height marker ──────────────────────────────────────────────
  const fhNorm = pins.fitting_height ?? 0.5
  const fitY = H * (1 - fhNorm)
  ctx.save()
  ctx.strokeStyle = 'rgba(251,146,60,0.8)'; ctx.lineWidth = 1.2; ctx.setLineDash([3, 5])
  ctx.beginPath(); ctx.moveTo(W * 0.04, fitY); ctx.lineTo(W * 0.96, fitY); ctx.stroke()
  ctx.setLineDash([])
  ctx.strokeStyle = '#f97316'; ctx.lineWidth = 2
  const ms = 6
  ctx.beginPath()
  ctx.moveTo(W / 2 - ms, fitY); ctx.lineTo(W / 2 + ms, fitY)
  ctx.moveTo(W / 2, fitY - ms); ctx.lineTo(W / 2, fitY + ms)
  ctx.stroke()
  ctx.fillStyle = '#f97316'; ctx.font = 'bold 9px system-ui'; ctx.textAlign = 'left'
  ctx.fillText('PM', W * 0.04 + 4, fitY - 4)
  ctx.restore()

  // ── 6: visual lines (lineA / lineB) — shown in final result ──────────────
  if (showZoneLines && guideVisibility.visualLines) {
    ctx.save()
    ctx.clip(lensPath)
    for (const zone of LINE_ZONES) {
      if (pins[zone].length >= 2) {
        ctx.strokeStyle = ZONE_COLOR[zone]
        ctx.lineWidth = 2.5
        ctx.lineJoin = 'round'; ctx.lineCap = 'round'
        ctx.setLineDash([])
        ctx.stroke(buildOpenLinePath(pins[zone], W, H))
      }
    }
    ctx.restore()
  }

  // ── 7: calibration overlay (grouped by visibility) ───────────────────────
  if (showOverlay) {
    const isZoneVisible = (zone: PinZone) => {
      if (BLUR_ZONES.includes(zone)) return guideVisibility.zonePins
      if (LINE_ZONES.includes(zone)) return guideVisibility.visualLines
      if (RIM_ZONES.includes(zone)) return guideVisibility.lensContour
      return true
    }

    ctx.save()
    // Dashed outlines for blur zones
    if (guideVisibility.zonePins) for (const zone of BLUR_ZONES) {
      if (pins[zone].length >= 3) {
        ctx.strokeStyle = ZONE_COLOR[zone] + (zone === activePinZone ? 'cc' : '55')
        ctx.lineWidth = zone === activePinZone ? 2 : 1.2
        ctx.setLineDash([4, 3])
        ctx.stroke(buildPinPath(pins[zone], W, H))
        ctx.setLineDash([])
      }
    }
    // Solid preview for line zones
    if (guideVisibility.visualLines) for (const zone of LINE_ZONES) {
      if (pins[zone].length >= 2) {
        ctx.strokeStyle = ZONE_COLOR[zone] + (zone === activePinZone ? 'dd' : '66')
        ctx.lineWidth = zone === activePinZone ? 2.5 : 1.5
        ctx.lineJoin = 'round'; ctx.lineCap = 'round'
        ctx.stroke(buildOpenLinePath(pins[zone], W, H))
      }
    }
    // Pin dots + numbers for all zones
    for (const zone of ALL_ZONES) {
      if (!isZoneVisible(zone)) continue
      const isActive = zone === activePinZone
      for (let i = 0; i < pins[zone].length; i++) {
        const x = pins[zone][i].x * W
        const y = pins[zone][i].y * H
        ctx.beginPath()
        ctx.arc(x, y, isActive ? 7 : 5, 0, Math.PI * 2)
        ctx.fillStyle = ZONE_COLOR[zone]
        ctx.fill()
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.5
        ctx.stroke()
        ctx.fillStyle = 'white'
        ctx.font = `bold ${isActive ? 8 : 7}px system-ui`
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(String(i + 1), x, y)
        ctx.textBaseline = 'alphabetic'
      }
    }
    ctx.restore()
  }

  // ── 7: lens rim ───────────────────────────────────────────────────────────
  if (guideVisibility.lensContour) {
    ctx.save()
    ctx.strokeStyle = 'rgba(60,80,120,0.8)'; ctx.lineWidth = 3
    ctx.stroke(lensPath)
    ctx.restore()
  }

  // ── 8: type label ─────────────────────────────────────────────────────────
  ctx.save()
  ctx.font = 'bold 10px system-ui'; ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.textAlign = 'center'
  const label = g.visual_design_type === 'occupational' ? 'OCUPACIONAL'
    : g.visual_design_type === 'personalized' ? 'PERSONALIZADA'
    : g.visual_design_type === 'single_vision_standard' ? 'VISÃO SIMPLES'
    : 'PROGRESSIVA'
  ctx.fillText(label, W / 2, H - 7)
  ctx.restore()
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function SliderRow({ label, value, onChange, min = 0, max = 100, step = 1 }: {
  label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-44 shrink-0 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <input type="range" min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer accent-indigo-500"
      />
      <span className="w-10 shrink-0 text-center text-[12px] font-black text-slate-200">{value}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const DESIGN_TYPES = ['progressive', 'occupational', 'personalized', 'single_vision_standard']
const DESIGN_LABELS: Record<string, string> = {
  progressive: 'Progressiva', occupational: 'Ocupacional',
  personalized: 'Personalizada', single_vision_standard: 'Visão Simples',
}

function blankGeometry(name: string, sharedLensRim: Array<{ x: number; y: number }>): LensGeometry {
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
    pins: { ...emptyPins(), lensRim: clonePoints(sharedLensRim) },
  }
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function LensGeometryCalibrationInterface({
  geometries,
  catalogFamilyNames,
}: {
  geometries: LensGeometry[]
  catalogFamilyNames: string[]
}) {
  const initialGeometries = useMemo(() => withSharedLensRimFallback(geometries), [geometries])
  const [localGeometries, setLocalGeometries] = useState<LensGeometry[]>(() => initialGeometries)
  const [selected, setSelected]      = useState<LensGeometry | undefined>(() => initialGeometries[0])
  const [draft, setDraft]            = useState<LensGeometry | undefined>(() => initialGeometries[0])
  const [isDirty, setIsDirty]        = useState(false)
  const [isPending, startTransition] = useTransition()
  const [savedMsg, setSavedMsg]      = useState(false)
  const [showOverlay, setShowOverlay]           = useState(true)
  const [showBackground, setShowBackground]     = useState(true)
  const [compareMode, setCompareMode]           = useState<CompareMode>('overlay')
  const [referenceOpacity, setReferenceOpacity] = useState(55)
  const [splitPosition, setSplitPosition]       = useState(50)
  const [referenceName, setReferenceName]       = useState<string | null>(null)
  const [activeTarget, setActiveTarget]         = useState<DragTarget>('reference')
  const [referenceZoom, setReferenceZoom]       = useState(100)
  const [cropReferenceToCutout, setCropReferenceToCutout] = useState(false)
  const [cropBackgroundToCutout, setCropBackgroundToCutout] = useState(false)
  const [activePinZone, setActivePinZone]       = useState<PinZone | null>(null)
  const [showZoneLines, setShowZoneLines]       = useState(true)
  const [showReference, setShowReference]       = useState(true)
  const [guideVisibility, setGuideVisibility]   = useState<GuideVisibility>({
    zonePins: true,
    lensContour: true,
    visualLines: true,
  })

  const canvasRef           = useRef<HTMLCanvasElement>(null)
  const resultCanvasRef     = useRef<HTMLCanvasElement>(null)
  const imgRef              = useRef<HTMLImageElement | null>(null)
  const referenceRef        = useRef<HTMLImageElement | null>(null)
  const transformRef        = useRef<ImgTransform>({ x: 0, y: 0, scale: 1 })
  const referenceTransformRef = useRef<ImgTransform>({ x: 0, y: 0, scale: 1 })
  const imgDragRef          = useRef<TransformDragState>({ active: false, startX: 0, startY: 0, ox: 0, oy: 0 })
  const referenceDragRef    = useRef<TransformDragState>({ active: false, startX: 0, startY: 0, ox: 0, oy: 0 })
  const pinDragRef          = useRef<PinDragState>({ active: false, zone: 'distance', index: 0 })
  const fileInputRef        = useRef<HTMLInputElement>(null)
  const referenceUrlRef     = useRef<string | null>(null)
  const draftRef            = useRef(draft)
  const activePinZoneRef    = useRef(activePinZone)
  const activeTargetRef     = useRef(activeTarget)
  const showOverlayRef      = useRef(showOverlay)
  const showBackgroundRef   = useRef(showBackground)
  const compareModeRef      = useRef(compareMode)
  const referenceOpacityRef = useRef(referenceOpacity / 100)
  const splitPositionRef    = useRef(splitPosition / 100)
  const cropReferenceToCutoutRef  = useRef(cropReferenceToCutout)
  const cropBackgroundToCutoutRef = useRef(cropBackgroundToCutout)
  const showZoneLinesRef          = useRef(showZoneLines)
  const showReferenceRef          = useRef(showReference)
  const guideVisibilityRef        = useRef(guideVisibility)

  useEffect(() => { draftRef.current = draft }, [draft])
  useEffect(() => { activePinZoneRef.current = activePinZone }, [activePinZone])
  useEffect(() => { activeTargetRef.current = activeTarget }, [activeTarget])
  useEffect(() => { showOverlayRef.current = showOverlay }, [showOverlay])
  useEffect(() => { showBackgroundRef.current = showBackground }, [showBackground])
  useEffect(() => { compareModeRef.current = compareMode }, [compareMode])
  useEffect(() => { referenceOpacityRef.current = referenceOpacity / 100 }, [referenceOpacity])
  useEffect(() => { splitPositionRef.current = splitPosition / 100 }, [splitPosition])
  useEffect(() => { cropReferenceToCutoutRef.current = cropReferenceToCutout }, [cropReferenceToCutout])
  useEffect(() => { cropBackgroundToCutoutRef.current = cropBackgroundToCutout }, [cropBackgroundToCutout])
  useEffect(() => { showZoneLinesRef.current = showZoneLines }, [showZoneLines])
  useEffect(() => { showReferenceRef.current = showReference }, [showReference])
  useEffect(() => { guideVisibilityRef.current = guideVisibility }, [guideVisibility])
  useEffect(() => {
    referenceTransformRef.current = { ...referenceTransformRef.current, scale: referenceZoom / 100 }
  }, [referenceZoom])

  const redraw = useCallback(() => {
    const g = draftRef.current
    if (canvasRef.current)
      drawLens(
        canvasRef.current, g ?? blankGeometry('', DEFAULT_SHARED_LENS_RIM),
        imgRef.current, referenceRef.current,
        transformRef.current, referenceTransformRef.current,
        showOverlayRef.current, showBackgroundRef.current,
        compareModeRef.current, referenceOpacityRef.current,
        splitPositionRef.current, cropReferenceToCutoutRef.current,
        cropBackgroundToCutoutRef.current, true,
        activePinZoneRef.current, showZoneLinesRef.current, guideVisibilityRef.current, showReferenceRef.current,
      )
    if (resultCanvasRef.current && g) {
      const src = document.createElement('canvas')
      src.width = CW * RESULT_SCALE; src.height = CH * RESULT_SCALE
      drawLens(src, g, imgRef.current, null, transformRef.current, referenceTransformRef.current,
        false, showBackgroundRef.current, 'overlay', 0, 0.5, false, false, false, null,
        showZoneLinesRef.current, guideVisibilityRef.current, false)
      const resultCtx = resultCanvasRef.current.getContext('2d')
      if (resultCtx) {
        const W = resultCanvasRef.current.width
        const H = resultCanvasRef.current.height
        const cutoutRect = buildCutoutRect(src.width, src.height)
        resultCtx.clearRect(0, 0, W, H)
        resultCtx.drawImage(src, cutoutRect.x, cutoutRect.y, cutoutRect.w, cutoutRect.h, 0, 0, W, H)
      }
    }
  }, [])

  useEffect(() => {
    const img = new Image()
    img.src = '/lens-bg.png'
    img.onload = () => { imgRef.current = img; redraw() }
  }, [redraw])

  useEffect(() => {
    return () => { if (referenceUrlRef.current) URL.revokeObjectURL(referenceUrlRef.current) }
  }, [])

  useEffect(() => {
    redraw()
  }, [draft, showOverlay, showBackground, compareMode, referenceOpacity, splitPosition,
      referenceZoom, activeTarget, cropReferenceToCutout, cropBackgroundToCutout, activePinZone, showZoneLines, showReference, guideVisibility, redraw])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActivePinZone(null)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

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

  // ---------------------------------------------------------------------------
  // Canvas coordinate helper
  // ---------------------------------------------------------------------------
  const toCanvas = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return {
      cx: (e.clientX - rect.left) * (CW / rect.width),
      cy: (e.clientY - rect.top)  * (CH / rect.height),
    }
  }

  const hitTestPin = (
    cx: number,
    cy: number,
    onlyZone: PinZone | null = activePinZoneRef.current,
  ): { zone: PinZone; index: number } | null => {
    if (!onlyZone) return null
    const g = draftRef.current
    if (!g) return null
    const pins = normalizePins(g.pins)
    for (let i = 0; i < pins[onlyZone].length; i++) {
      const px = pins[onlyZone][i].x * CW
      const py = pins[onlyZone][i].y * CH
      if ((cx - px) ** 2 + (cy - py) ** 2 < PIN_HIT ** 2) return { zone: onlyZone, index: i }
    }
    return null
  }

  // ---------------------------------------------------------------------------
  // Mouse handlers
  // ---------------------------------------------------------------------------
  const onMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const { cx, cy } = toCanvas(e)

    // Priority 1: drag existing pin
    const hit = hitTestPin(cx, cy)
    if (hit) {
      pinDragRef.current = { active: true, ...hit }
      return
    }

    // Priority 2: add pin if a zone is active
    const zone = activePinZoneRef.current
    if (zone) {
      const newPin = { x: cx / CW, y: cy / CH }
      setDraft(prev => {
        if (!prev) return prev
        const p = normalizePins(prev.pins)
        return { ...prev, pins: { ...p, [zone]: [...p[zone], newPin] } }
      })
      setIsDirty(true)
      return
    }

    // Priority 3: pan reference image
    if (activeTargetRef.current === 'reference' && referenceRef.current) {
      referenceDragRef.current = { active: true, startX: e.clientX, startY: e.clientY, ox: referenceTransformRef.current.x, oy: referenceTransformRef.current.y }
      return
    }

    // Priority 4: pan background image
    imgDragRef.current = { active: true, startX: e.clientX, startY: e.clientY, ox: transformRef.current.x, oy: transformRef.current.y }
  }, [])

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const pd = pinDragRef.current
    if (pd.active) {
      const { cx, cy } = toCanvas(e)
      setDraft(prev => {
        if (!prev) return prev
        const p = normalizePins(prev.pins)
        const zonePins = [...p[pd.zone]]
        zonePins[pd.index] = { x: Math.max(0, Math.min(1, cx / CW)), y: Math.max(0, Math.min(1, cy / CH)) }
        return { ...prev, pins: { ...p, [pd.zone]: zonePins } }
      })
      setIsDirty(true)
      return
    }

    const rd = referenceDragRef.current
    if (rd.active) {
      referenceTransformRef.current = { ...referenceTransformRef.current, x: rd.ox + (e.clientX - rd.startX), y: rd.oy + (e.clientY - rd.startY) }
      redraw(); return
    }

    const d = imgDragRef.current
    if (d.active) {
      transformRef.current = { ...transformRef.current, x: d.ox + (e.clientX - d.startX), y: d.oy + (e.clientY - d.startY) }
      redraw()
    }
  }, [redraw])

  const onMouseUp = useCallback(() => {
    pinDragRef.current.active = false
    imgDragRef.current.active = false
    referenceDragRef.current.active = false
  }, [])

  const onDblClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const { cx, cy } = toCanvas(e)
    const hit = hitTestPin(cx, cy)
    if (!hit) return
    setDraft(prev => {
      if (!prev) return prev
      const p = normalizePins(prev.pins)
      return { ...prev, pins: { ...p, [hit.zone]: p[hit.zone].filter((_, i) => i !== hit.index) } }
    })
    setIsDirty(true)
  }, [])

  // ---------------------------------------------------------------------------
  // Family management
  // ---------------------------------------------------------------------------
  const selectFamily = (name: string) => {
    const found = localGeometries.find((g) => g.family_name === name)
    if (!found) return
    setSelected(found); setDraft(found); setIsDirty(false)
    setActivePinZone(null)
  }

  const addFromCatalog = (family_name: string) => {
    if (!family_name) return
    const sharedLensRim = resolveSharedLensRim(localGeometries)
    const blank = blankGeometry(family_name, sharedLensRim)
    setLocalGeometries((prev) => [...prev, blank])
    setSelected(blank); setDraft(blank); setIsDirty(true)
  }

  // ---------------------------------------------------------------------------
  // Reference image
  // ---------------------------------------------------------------------------
  const resetReferenceTransform = useCallback(() => {
    referenceTransformRef.current = { x: 0, y: 0, scale: 1 }
    setReferenceZoom(100); redraw()
  }, [redraw])

  const clearReference = useCallback(() => {
    if (referenceUrlRef.current) { URL.revokeObjectURL(referenceUrlRef.current); referenceUrlRef.current = null }
    referenceRef.current = null; setReferenceName(null)
    setShowReference(true)
    setActiveTarget('lens'); setCropReferenceToCutout(false); setCropBackgroundToCutout(false)
    resetReferenceTransform(); redraw()
  }, [redraw, resetReferenceTransform])

  const loadReference = useCallback((file: File | null) => {
    if (!file) return
    if (referenceUrlRef.current) URL.revokeObjectURL(referenceUrlRef.current)
    const url = URL.createObjectURL(file)
    referenceUrlRef.current = url; setReferenceName(file.name)
    setCropReferenceToCutout(false); setCropBackgroundToCutout(false)
    const refImg = new Image()
    refImg.onload = () => {
      referenceRef.current = refImg; setShowBackground(false)
      setShowReference(true)
      setActiveTarget('reference'); resetReferenceTransform(); redraw()
    }
    refImg.src = url
  }, [redraw, resetReferenceTransform])

  const nudgeReferenceTransform = useCallback((dx: number, dy: number) => {
    referenceTransformRef.current = { ...referenceTransformRef.current, x: referenceTransformRef.current.x + dx, y: referenceTransformRef.current.y + dy }
    setActiveTarget('reference'); redraw()
  }, [redraw])

  const zoomReferenceTransform = useCallback((direction: 1 | -1) => {
    const next = Math.min(4, Math.max(0.4, referenceTransformRef.current.scale * (direction > 0 ? 1.02 : 0.98)))
    referenceTransformRef.current = { ...referenceTransformRef.current, scale: next }
    setReferenceZoom(Math.round(next * 200) / 2); setActiveTarget('reference'); redraw()
  }, [redraw])

  // ---------------------------------------------------------------------------
  // Patch draft field (for visual_design_type, lateral_blur, fitting_height)
  // ---------------------------------------------------------------------------
  const updateField = useCallback((field: keyof LensGeometry, value: unknown) => {
    setDraft(prev => prev ? { ...prev, [field]: value } as LensGeometry : prev)
    setIsDirty(true)
  }, [])

  const updateFittingHeight = useCallback((norm: number) => {
    setDraft(prev => {
      if (!prev) return prev
      const p = normalizePins(prev.pins)
      return { ...prev, pins: { ...p, fitting_height: norm } }
    })
    setIsDirty(true)
  }, [])

  // ---------------------------------------------------------------------------
  // Save / Delete
  // ---------------------------------------------------------------------------
  const handleSave = () => {
    if (!draft) return
    startTransition(async () => {
      const { id, ...rest } = draft
      void id
      const saved = await upsertLensGeometry(rest)
      // Prefer the DB response but fall back to the draft pins for any fields
      // the server may not have returned (e.g. lineA/lineB on older rows).
      const mergedSaved = {
        ...saved,
        pins: { ...normalizePins(draft.pins), ...(saved.pins ?? {}) },
      }
      setLocalGeometries((prev) => {
        const exists = prev.some((g) => g.family_name === mergedSaved.family_name)
        return exists ? prev.map((g) => g.family_name === mergedSaved.family_name ? mergedSaved : g) : [...prev, mergedSaved]
      })
      setSelected(mergedSaved); setDraft(mergedSaved)
      setSavedMsg(true); setIsDirty(false)
      setTimeout(() => setSavedMsg(false), 2500)
    })
  }

  const handleDelete = () => {
    if (!draft) return
    if (!window.confirm(`Remover "${draft.family_name}" da calibração?`)) return
    const isNew = draft.id.startsWith('new-')
    const next = localGeometries.filter((g) => g.family_name !== draft.family_name)
    setLocalGeometries(next)
    const fallback = next[0]
    if (fallback) { setSelected(fallback); setDraft(fallback) }
    setIsDirty(false)
    if (!isNew) startTransition(async () => { await deleteLensGeometry(draft.id) })
  }

  const clearZone = (zone: PinZone) => {
    setDraft(prev => {
      if (!prev) return prev
      const p = normalizePins(prev.pins)
      return { ...prev, pins: { ...p, [zone]: [] } }
    })
    setIsDirty(true)
  }

  const toggleGuideGroup = (group: keyof GuideVisibility) => {
    setGuideVisibility((prev) => {
      const nextValue = !prev[group]
      if (group === 'visualLines') setShowZoneLines(nextValue)
      return { ...prev, [group]: nextValue }
    })
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const pins = normalizePins(draft?.pins)

  return (
    <div className="min-h-screen bg-slate-950 p-6 pb-28 text-white">
      <h1 className="mb-1 text-xl font-black uppercase tracking-tight">Calibração de Geometria de Lentes</h1>
      <p className="mb-6 text-sm text-slate-400">Selecione uma família, posicione os alfinetes e salve.</p>

      {/* Family selector */}
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
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{DESIGN_LABELS[type]}</p>
                  <div className="flex flex-wrap gap-2">
                    {chips.map((g) => (
                      <button key={g.family_name} onClick={() => selectFamily(g.family_name)}
                        className={`rounded-full border px-3 py-1 text-[11px] font-bold transition ${
                          selected?.family_name === g.family_name
                            ? 'border-indigo-500 bg-indigo-600 text-white'
                            : g.pins && (g.pins.distance.length >= 3 || g.pins.corridor.length >= 3 || g.pins.near.length >= 3)
                              ? 'border-emerald-500/40 bg-slate-800 text-emerald-400 hover:bg-slate-700'
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
              <select value="" onChange={(e) => addFromCatalog(e.target.value)}
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

      {draft && <>
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] xl:items-start">

          {/* Canvas column */}
          <div className="ml-auto flex w-full max-w-[1040px] flex-col items-start gap-3">
            {/* Active zone banner — ABOVE canvas so it's always visible */}
            {activePinZone ? (
              <div className="flex w-full items-center justify-between rounded-xl px-3 py-2"
                style={{ background: ZONE_COLOR[activePinZone] + '22', border: `1px solid ${ZONE_COLOR[activePinZone]}` }}>
                <span className="text-[11px] font-bold" style={{ color: ZONE_COLOR[activePinZone] }}>
                  Modo <strong>{ZONE_LABEL[activePinZone]}</strong> ativo — clique no canvas para adicionar alfinetes
                </span>
                <button
                  onClick={() => setActivePinZone(null)}
                  className="rounded-lg px-3 py-1 text-[11px] font-black text-white transition hover:opacity-80"
                  style={{ background: ZONE_COLOR[activePinZone] }}>
                  ✓ Concluir (Esc)
                </button>
              </div>
            ) : (
              <div className="flex w-full items-center rounded-xl bg-slate-800/50 px-3 py-1.5">
                <span className="text-[10px] text-slate-500">Modo pan — arraste para mover · Selecione uma zona à direita para adicionar alfinetes</span>
              </div>
            )}

            <canvas
              ref={canvasRef} width={CW} height={CH}
              className={`w-full rounded-2xl shadow-2xl ${activePinZone ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
              onDoubleClick={onDblClick}
            />
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => loadReference(e.target.files?.[0] ?? null)} />

            {/* Info row */}
            <div className="flex w-full items-center justify-between px-1">
              <div className="flex flex-col">
                <p className="text-[11px] font-bold text-slate-400">{draft.family_name}</p>
                <p className="text-[10px] text-slate-500">
                  {referenceName ? `Gabarito: ${referenceName}` : 'Nenhum gabarito carregado'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => setShowBackground((v) => !v)}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold transition ${showBackground ? 'bg-slate-700 text-slate-200' : 'bg-slate-800 text-slate-500'}`}>
                  {showBackground ? 'Ocultar fundo' : 'Mostrar fundo'}
                </button>
                <button onClick={() => setShowOverlay((v) => !v)}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold transition ${showOverlay ? 'bg-indigo-700 text-white' : 'bg-slate-800 text-slate-400'}`}>
                  {showOverlay ? 'Ocultar guias' : 'Mostrar guias'}
                </button>
                <button onClick={() => { transformRef.current = { x: 0, y: 0, scale: 1 }; redraw() }}
                  className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-400 hover:bg-slate-700 transition">
                  Resetar fundo
                </button>
                <button onClick={() => fileInputRef.current?.click()}
                  className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-emerald-500 transition">
                  Carregar gabarito
                </button>
                {referenceName && (
                  <button onClick={() => setShowReference((v) => !v)}
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold transition ${showReference ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
                    {showReference ? 'Ocultar gabarito' : 'Mostrar gabarito'}
                  </button>
                )}
                {referenceName && (
                  <button onClick={clearReference}
                    className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-400 hover:bg-slate-700 transition">
                    Limpar gabarito
                  </button>
                )}
                {referenceName && (
                  <button onClick={() => setCropReferenceToCutout((v) => !v)}
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold transition ${cropReferenceToCutout ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                    {cropReferenceToCutout ? 'Desfazer corte' : 'Cortar gabarito'}
                  </button>
                )}
                <button onClick={() => setCropBackgroundToCutout((v) => !v)} disabled={!showBackground}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold transition disabled:opacity-40 ${cropBackgroundToCutout ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                  {cropBackgroundToCutout ? 'Soltar fundo' : 'Cortar fundo'}
                </button>
              </div>
            </div>

            {/* Compare mode row */}
            <div className="flex w-full flex-wrap items-center gap-2 px-1">
              <button onClick={() => setCompareMode('overlay')}
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold transition ${compareMode === 'overlay' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                Sobrepor
              </button>
              <button onClick={() => setCompareMode('split')}
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold transition ${compareMode === 'split' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                Dividir
              </button>
              <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500">
                <span>Opacidade</span>
                <input type="range" min={10} max={100} step={5} value={referenceOpacity}
                  onChange={(e) => setReferenceOpacity(Number(e.target.value))}
                  className="h-1.5 w-28 cursor-pointer accent-emerald-500" />
                <span className="w-8 text-slate-300">{referenceOpacity}%</span>
              </div>
              {compareMode === 'split' && (
                <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500">
                  <span>Divisor</span>
                  <input type="range" min={10} max={90} step={1} value={splitPosition}
                    onChange={(e) => setSplitPosition(Number(e.target.value))}
                    className="h-1.5 w-28 cursor-pointer accent-indigo-500" />
                  <span className="w-8 text-slate-300">{splitPosition}%</span>
                </div>
              )}
            </div>

            {/* Reference controls row */}
            <div className="flex w-full flex-wrap items-center gap-2 px-1">
              <button onClick={() => setActiveTarget('reference')} disabled={!referenceName}
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold transition disabled:opacity-40 ${activeTarget === 'reference' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                Mover gabarito
              </button>
              <button onClick={() => setActiveTarget('lens')}
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold transition ${activeTarget === 'lens' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                Mover fundo
              </button>
              <button onClick={resetReferenceTransform} disabled={!referenceName}
                className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-400 transition hover:bg-slate-700 disabled:opacity-40">
                Reset gabarito
              </button>
              <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500">
                <span>Zoom</span>
                <input type="range" min={40} max={250} step={0.5} value={referenceZoom}
                  onChange={(e) => setReferenceZoom(Number(e.target.value))} disabled={!referenceName}
                  className="h-1.5 w-24 cursor-pointer accent-emerald-500 disabled:opacity-40" />
                <span className="w-10 text-slate-300">{referenceZoom.toFixed(0)}%</span>
                <button onClick={() => zoomReferenceTransform(-1)} disabled={!referenceName}
                  className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-400 hover:bg-slate-700 disabled:opacity-40">−</button>
                <button onClick={() => zoomReferenceTransform(1)} disabled={!referenceName}
                  className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-400 hover:bg-slate-700 disabled:opacity-40">+</button>
              </div>
              <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500">
                <span className="mr-1">Nudge</span>
                {([['←', -1, 0], ['→', 1, 0], ['↑', 0, -1], ['↓', 0, 1]] as [string, number, number][]).map(([arrow, dx, dy]) => (
                  <button key={arrow} onClick={() => nudgeReferenceTransform(dx, dy)} disabled={!referenceName}
                    className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-400 hover:bg-slate-700 disabled:opacity-40">
                    {arrow}
                  </button>
                ))}
              </div>
            </div>

            {/* Design type */}
            <div className="flex flex-wrap gap-2 px-1">
              {DESIGN_TYPES.map((t) => (
                <button key={t} onClick={() => updateField('visual_design_type', t)}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold transition ${draft.visual_design_type === t ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
                  {DESIGN_LABELS[t]}
                </button>
              ))}
            </div>

            <div className="w-full rounded-2xl border border-white/10 bg-slate-900 p-4">
              <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-indigo-400">Ajustes rápidos</p>
              <div className="space-y-3">
                <SliderRow label="Intensidade blur" value={draft.lateral_blur ?? 50} onChange={(v) => updateField('lateral_blur', v)} />
                <SliderRow label="Ponto de montagem" value={Math.round((pins.fitting_height ?? 0.5) * 100)} onChange={(v) => updateFittingHeight(v / 100)} />
              </div>
            </div>
          </div>

          {/* Right column */}
          <div className="flex flex-col gap-6">
            {/* Result canvas */}
            <div className="rounded-2xl border border-white/10 bg-slate-900 p-4 shadow-2xl">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Resultado final</p>
                  <p className="text-[10px] text-slate-500">Render sem guias.</p>
                </div>
                <button onClick={() => setShowBackground((v) => !v)}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold transition ${showBackground ? 'bg-slate-700 text-slate-200' : 'bg-slate-800 text-slate-500'}`}>
                  {showBackground ? 'Ocultar fundo' : 'Mostrar fundo'}
                </button>
              </div>
              <canvas ref={resultCanvasRef} width={CW * RESULT_SCALE} height={CH * RESULT_SCALE}
                className="w-full rounded-2xl shadow-inner h-auto" />
            </div>

            {/* Pin controls */}
            <div className="rounded-2xl border border-white/10 bg-slate-900 p-5">
              <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-indigo-400">Alfinetes de zona</p>
              <p className="mb-4 text-[10px] text-slate-500">
                Selecione uma zona → clique no canvas para adicionar → duplo-clique para remover.
              </p>

              <div className="mb-5 rounded-xl border border-white/10 bg-slate-950/40 p-3">
                <p className="mb-2 text-[9px] font-black uppercase tracking-widest text-slate-500">Grupos de visualização</p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => toggleGuideGroup('zonePins')}
                    className={`rounded-full px-2 py-0.5 text-[9px] font-bold transition ${guideVisibility.zonePins ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                    {guideVisibility.zonePins ? 'Grupo 1 visível' : 'Grupo 1 oculto'}
                  </button>
                  <button onClick={() => toggleGuideGroup('lensContour')}
                    className={`rounded-full px-2 py-0.5 text-[9px] font-bold transition ${guideVisibility.lensContour ? 'bg-violet-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                    {guideVisibility.lensContour ? 'Grupo 2 visível' : 'Grupo 2 oculto'}
                  </button>
                  <button onClick={() => toggleGuideGroup('visualLines')}
                    className={`rounded-full px-2 py-0.5 text-[9px] font-bold transition ${guideVisibility.visualLines ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                    {guideVisibility.visualLines ? 'Grupo 3 visível' : 'Grupo 3 oculto'}
                  </button>
                </div>
                <p className="mt-2 text-[10px] text-slate-500">
                  G1: longe/corredor/perto · G2: contorno da lente · G3: linhas visuais
                </p>
              </div>

              {/* Blur zones */}
              <p className="mb-2 text-[9px] font-black uppercase tracking-widest text-slate-500">Desfoque</p>
              <div className="mb-5 flex flex-wrap gap-2">
                {BLUR_ZONES.map((zone) => {
                  const count = pins[zone].length
                  const isActive = activePinZone === zone
                  return (
                    <div key={zone} className="min-w-[170px] rounded-xl border border-white/10 bg-slate-950/40 p-2">
                      <button
                        onClick={() => setActivePinZone(isActive ? null : zone)}
                        className={`flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-[11px] font-bold transition ${isActive ? 'ring-2 ring-offset-1 ring-offset-slate-900' : 'opacity-80 hover:opacity-100'}`}
                        style={{ background: isActive ? ZONE_COLOR[zone] + '22' : '#1e293b', border: `1px solid ${ZONE_COLOR[zone]}`, color: ZONE_COLOR[zone] }}
                      >
                        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: ZONE_COLOR[zone] }} />
                        {ZONE_LABEL[zone]}
                      </button>
                      <span className="text-[11px] text-slate-400">
                        {count} {count === 1 ? 'alfinete' : 'alfinetes'}
                        {count > 0 && count < 3 && <span className="ml-1 text-amber-400">(mín. 3)</span>}
                        {count >= 3 && <span className="ml-1 text-emerald-400">✓</span>}
                      </span>
                      {count > 0 && (
                        <button onClick={() => clearZone(zone)} className="ml-auto text-[10px] text-red-400 hover:text-red-300 transition">Limpar</button>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Rim zone */}
              <div className="border-t border-white/10 pt-4">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2">Contorno da lente</p>
                <div className="flex flex-wrap gap-2">
                  {RIM_ZONES.map((zone) => {
                    const count = pins[zone].length
                    const isActive = activePinZone === zone
                    return (
                      <div key={zone} className="flex min-w-[220px] items-center gap-3 rounded-xl border border-white/10 bg-slate-950/40 px-2 py-1.5">
                        <button
                          onClick={() => setActivePinZone(isActive ? null : zone)}
                          className={`flex items-center gap-2 rounded-xl px-3 py-2 text-[11px] font-bold transition min-w-[100px] ${isActive ? 'ring-2 ring-offset-1 ring-offset-slate-900' : 'opacity-80 hover:opacity-100'}`}
                          style={{ background: isActive ? ZONE_COLOR[zone] + '22' : '#1e293b', border: `1px solid ${ZONE_COLOR[zone]}`, color: ZONE_COLOR[zone] }}
                        >
                          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: ZONE_COLOR[zone] }} />
                          {ZONE_LABEL[zone]}
                        </button>
                        <span className="text-[11px] text-slate-400">
                          {count} {count === 1 ? 'ponto' : 'pontos'}
                          {count > 0 && count < 3 && <span className="ml-1 text-amber-400">(mín. 3)</span>}
                          {count >= 3 && <span className="ml-1 text-emerald-400">✓</span>}
                        </span>
                        {count > 0 && (
                          <button onClick={() => clearZone(zone)} className="ml-auto text-[10px] text-red-400 hover:text-red-300 transition">Limpar</button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Line zones */}
              <div className="border-t border-white/10 pt-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Linhas visuais</p>
                  <button onClick={() => toggleGuideGroup('visualLines')}
                    className={`rounded-full px-2 py-0.5 text-[9px] font-bold transition ${guideVisibility.visualLines ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                    {guideVisibility.visualLines ? 'Visíveis' : 'Ocultas'}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {LINE_ZONES.map((zone) => {
                    const count = pins[zone].length
                    const isActive = activePinZone === zone
                    return (
                      <div key={zone} className="flex min-w-[220px] items-center gap-3 rounded-xl border border-white/10 bg-slate-950/40 px-2 py-1.5">
                        <button
                          onClick={() => setActivePinZone(isActive ? null : zone)}
                          className={`flex items-center gap-2 rounded-xl px-3 py-2 text-[11px] font-bold transition min-w-[100px] ${isActive ? 'ring-2 ring-offset-1 ring-offset-slate-900' : 'opacity-80 hover:opacity-100'}`}
                          style={{ background: isActive ? ZONE_COLOR[zone] + '22' : '#1e293b', border: `1px solid ${ZONE_COLOR[zone]}`, color: ZONE_COLOR[zone] }}
                        >
                          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: ZONE_COLOR[zone] }} />
                          {ZONE_LABEL[zone]}
                        </button>
                        <span className="text-[11px] text-slate-400">
                          {count} {count === 1 ? 'ponto' : 'pontos'}
                          {count >= 2 && <span className="ml-1 text-emerald-400">✓</span>}
                        </span>
                        {count > 0 && (
                          <button onClick={() => clearZone(zone)} className="ml-auto text-[10px] text-red-400 hover:text-red-300 transition">Limpar</button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {activePinZone && (
                <p className="mt-4 rounded-xl bg-indigo-950 px-3 py-2 text-[10px] text-indigo-300">
                  Modo <strong>{ZONE_LABEL[activePinZone]}</strong> ativo — clique no canvas para adicionar. Clique no botão novamente ou pressione Esc para sair.
                </p>
              )}
            </div>
          </div>

        </div>

        <div className="fixed bottom-4 left-4 right-4 z-50 flex items-center gap-4 rounded-2xl border border-white/10 bg-slate-950/90 p-3 shadow-2xl backdrop-blur-md md:left-auto md:right-6 md:w-auto">
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
