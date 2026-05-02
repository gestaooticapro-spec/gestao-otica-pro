'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { LensGeometry, LensPins } from '@/lib/actions/lens-geometry.actions'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const VW = 960
const VH = 540
const ANIM_DURATION = 650 // ms

type BlurZone = 'distance' | 'corridor' | 'near'
type Mode = 'normal' | 'eyetrace'
type RightState = 'lens' | 'animating' | 'photo'
const LINE_ZONES = ['lineA', 'lineB'] as const
const EYETRACE_LENS_SCALE = 0.84
const EYETRACE_LENS_DRIFT_X = 22
const EYETRACE_LENS_DRIFT_Y = 10
const EYETRACE_IMAGE_DRIFT_X = 54
const EYETRACE_IMAGE_DRIFT_Y = 18

const ZONE_COLOR: Record<BlurZone, string> = {
  distance: '#60a5fa',
  corridor: '#fb923c',
  near: '#4ade80',
}
const ZONE_LABEL: Record<BlurZone, string> = {
  distance: 'LONGE',
  corridor: 'CORREDOR',
  near: 'PERTO',
}
// Direction lines travel during animation per zone
const ZONE_LINE_DIR: Record<BlurZone, { dx: number; dy: number }> = {
  distance:  { dx:  0,    dy:  1 },   // exit downward
  corridor:  { dx:  1,    dy:  0 },   // exit sideways
  near:      { dx:  0.2,  dy: -1 },   // exit upward
}

type PhotoConfig = {
  label: string; src: string; sharpZones: BlurZone[]; hint: string; icon: string
}
type LensRenderFx = {
  lensScale?: number
  lensOffsetX?: number
  lensOffsetY?: number
  imageOffsetX?: number
  imageOffsetY?: number
}
const PHOTOS: PhotoConfig[] = [
  { label: 'Praia',     src: '/lens-demo/foto1.png', sharpZones: ['distance','corridor','near'], hint: 'Todos os campos nítidos', icon: '🏖' },
  { label: 'Escritório',src: '/lens-demo/foto2.png', sharpZones: ['corridor','near'],            hint: 'Longe embaçado',          icon: '💻' },
  { label: 'Livro',     src: '/lens-demo/foto3.png', sharpZones: ['near'],                       hint: 'Só perto nítido',         icon: '📖' },
  { label: 'Cidade',    src: '/lens-demo/foto4.png', sharpZones: ['distance'],                   hint: 'Só longe nítido',         icon: '🏙' },
]

// ---------------------------------------------------------------------------
// Pin helpers
// ---------------------------------------------------------------------------
function normalizePins(p: LensPins | null | undefined): LensPins {
  return { distance: [], corridor: [], near: [], lineA: [], lineB: [], lensRim: [], fitting_height: 0.5, ...p }
}

const CUTOUT = { x: 0.24, y: 0.22, w: 0.52, h: 0.46 }
function remapPins(pins: LensPins): LensPins {
  const remap = (arr: Array<{ x: number; y: number }>) =>
    arr.map((p) => ({ x: (p.x - CUTOUT.x) / CUTOUT.w, y: (p.y - CUTOUT.y) / CUTOUT.h }))
  return {
    distance: remap(pins.distance), corridor: remap(pins.corridor), near: remap(pins.near),
    lineA: remap(pins.lineA), lineB: remap(pins.lineB), lensRim: remap(pins.lensRim),
    fitting_height: pins.fitting_height,
  }
}

// ---------------------------------------------------------------------------
// Canvas drawing primitives
// ---------------------------------------------------------------------------
function buildLensPath(W: number, H: number): Path2D {
  const p = new Path2D()
  const k = 0.55, topH = H * 0.36, botH = H * 0.64, midY = topH, hw = W * 0.5
  p.moveTo(0, midY)
  p.bezierCurveTo(0, midY - topH * k, hw - hw * k, 0, hw, 0)
  p.bezierCurveTo(hw + hw * k, 0, W, midY - topH * k, W, midY)
  p.bezierCurveTo(W, midY + botH * k, hw + hw * k, H, hw, H)
  p.bezierCurveTo(hw - hw * k, H, 0, midY + botH * k, 0, midY)
  p.closePath()
  return p
}

function buildPinPath(pins: Array<{ x: number; y: number }>, W: number, H: number): Path2D {
  const p = new Path2D()
  if (pins.length < 3) return p
  const abs = pins.map((pt) => ({ x: pt.x * W, y: pt.y * H }))
  const last = abs[abs.length - 1], first = abs[0]
  p.moveTo((last.x + first.x) / 2, (last.y + first.y) / 2)
  for (let i = 0; i < abs.length; i++) {
    const curr = abs[i], next = abs[(i + 1) % abs.length]
    p.quadraticCurveTo(curr.x, curr.y, (curr.x + next.x) / 2, (curr.y + next.y) / 2)
  }
  p.closePath()
  return p
}

function buildOpenLinePath(pins: Array<{ x: number; y: number }>, W: number, H: number): Path2D {
  const p = new Path2D()
  if (pins.length < 2) return p
  const abs = pins.map((pt) => ({ x: pt.x * W, y: pt.y * H }))
  p.moveTo(abs[0].x, abs[0].y)
  if (abs.length === 2) { p.lineTo(abs[1].x, abs[1].y) }
  else {
    p.lineTo((abs[0].x + abs[1].x) / 2, (abs[0].y + abs[1].y) / 2)
    for (let i = 1; i < abs.length - 1; i++) {
      const curr = abs[i], next = abs[i + 1]
      p.quadraticCurveTo(curr.x, curr.y, (curr.x + next.x) / 2, (curr.y + next.y) / 2)
    }
    p.lineTo(abs[abs.length - 1].x, abs[abs.length - 1].y)
  }
  return p
}

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  W: number,
  H: number,
  offsetX = 0,
  offsetY = 0,
  zoom = 1,
) {
  const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight)
  const dw = img.naturalWidth * scale * zoom, dh = img.naturalHeight * scale * zoom
  ctx.drawImage(img, (W - dw) / 2 + offsetX, (H - dh) / 2 + offsetY, dw, dh)
}

function detectZone(cx: number, cy: number, pins: LensPins, W: number, H: number): BlurZone | null {
  const offCtx = document.createElement('canvas').getContext('2d')!
  for (const zone of ['near', 'corridor', 'distance'] as BlurZone[])
    if (pins[zone].length >= 3 && offCtx.isPointInPath(buildPinPath(pins[zone], W, H), cx, cy))
      return zone
  return null
}

function screenToCanvas(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
  const rect = canvas.getBoundingClientRect()
  return { x: (clientX - rect.left) / rect.width * canvas.width, y: (clientY - rect.top) / rect.height * canvas.height }
}

// ---------------------------------------------------------------------------
// Render: 2D schematic head avatar
// rotX: pitch — positive = chin up (near zone); rotY: yaw — positive = turn right
// ---------------------------------------------------------------------------
function drawAvatar(canvas: HTMLCanvasElement, rotX: number, rotY: number) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const W = canvas.width, H = canvas.height
  ctx.clearRect(0, 0, W, H)

  const cx = W / 2
  const headCY = H * 0.36
  const R = W * 0.27

  const cosY = Math.cos(rotY)
  const sinY = Math.sin(rotY)
  const sinX = Math.sin(rotX)

  // xShift: face center slides with yaw (nose depth illusion)
  const xShift = sinY * R * 0.22
  // pitchOff: positive rotX = chin UP → features rise in oval (we see more chin area)
  // Only applied to nose/mouth; eyes stay fixed to show gaze doesn't move
  const pitchOff = -sinX * R * 0.40

  ctx.strokeStyle = '#5eead4'
  ctx.lineWidth = 1.6
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  // Shoulders (faint)
  ctx.globalAlpha = 0.28
  ctx.beginPath()
  ctx.moveTo(0, H)
  ctx.quadraticCurveTo(cx * 0.35 + xShift * 0.4, H * 0.82, cx + xShift * 0.25, H * 0.79)
  ctx.quadraticCurveTo(cx * 1.65 + xShift * 0.4, H * 0.82, W, H)
  ctx.stroke()
  ctx.globalAlpha = 1

  // Neck
  const nkW = R * 0.21 * Math.abs(cosY)
  const nkTop = headCY + R * 0.9
  const nkBot = H * 0.78
  ctx.beginPath()
  ctx.moveTo(cx + xShift - nkW, nkTop); ctx.lineTo(cx + xShift - nkW * 0.6, nkBot)
  ctx.moveTo(cx + xShift + nkW, nkTop); ctx.lineTo(cx + xShift + nkW * 0.6, nkBot)
  ctx.stroke()

  // Head oval
  ctx.beginPath()
  ctx.ellipse(cx + xShift, headCY, R * Math.abs(cosY), R * 1.13, 0, 0, Math.PI * 2)
  ctx.stroke()

  // Ear (appears on receding side when turning)
  const earVis = Math.abs(sinY)
  if (earVis > 0.07) {
    const earSide = sinY < 0 ? 1 : -1
    const earX = cx + xShift + earSide * R * Math.abs(cosY)
    ctx.beginPath()
    ctx.ellipse(earX, headCY + pitchOff * 0.25, R * 0.09 * earVis, R * 0.17, 0, 0, Math.PI * 2)
    ctx.globalAlpha = Math.min(1, earVis * 1.4)
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  // Eyes — completely fixed on screen (head moves, eyes stay = gaze always forward)
  const eyeY = headCY - R * 0.13
  const eyeSpX = R * 0.31
  const eyeRx = R * 0.13
  const eyeRy = R * 0.087
  for (const s of [-1, 1] as const) {
    const ex = cx + s * eyeSpX
    ctx.beginPath(); ctx.ellipse(ex, eyeY, eyeRx, eyeRy, 0, 0, Math.PI * 2); ctx.stroke()
    ctx.fillStyle = '#5eead4'
    ctx.beginPath(); ctx.arc(ex, eyeY, eyeRy * 0.38, 0, Math.PI * 2); ctx.fill()
  }

  // Eyebrows — move with the face (pitchOff + xShift), but not compressed
  const browY = eyeY - eyeRy * 2.6 + pitchOff * 0.5
  const browHalf = eyeRx * 1.25
  for (const s of [-1, 1] as const) {
    const bx = cx + xShift + s * eyeSpX
    ctx.beginPath()
    ctx.moveTo(bx - browHalf, browY); ctx.lineTo(bx + browHalf, browY)
    ctx.stroke()
  }

  // Nose bridge + tip — pitchOff applied here to show head angle
  const noseBotY = headCY + R * 0.2 + pitchOff
  ctx.beginPath()
  ctx.moveTo(cx + xShift, eyeY + eyeRy)
  ctx.lineTo(cx + xShift, noseBotY)
  const nw = R * 0.09 * Math.abs(cosY)
  ctx.moveTo(cx + xShift - nw, noseBotY + R * 0.04)
  ctx.quadraticCurveTo(cx + xShift, noseBotY + R * 0.07, cx + xShift + nw, noseBotY + R * 0.04)
  ctx.stroke()

  // Mouth
  const mouthY = headCY + R * 0.49 + pitchOff
  const mw = R * 0.24 * Math.abs(cosY)
  ctx.beginPath()
  ctx.moveTo(cx + xShift - mw, mouthY)
  ctx.quadraticCurveTo(cx + xShift, mouthY + R * 0.07, cx + xShift + mw, mouthY)
  ctx.stroke()
}

// ---------------------------------------------------------------------------
// Render: lens (used on left + right initial state)
// ---------------------------------------------------------------------------
function drawVisualizerLens(
  canvas: HTMLCanvasElement, g: LensGeometry, img: HTMLImageElement | null,
  sharpZones: BlurZone[], showZoneLines: boolean,
  tracePoint: { x: number; y: number } | null = null,
  traceZone: BlurZone | null = null,
  fx: LensRenderFx = {},
  fallbackLensRim: Array<{ x: number; y: number }> | null = null,
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const W = canvas.width, H = canvas.height
  ctx.clearRect(0, 0, W, H)

  const pins = remapPins(normalizePins(g.pins))
  const rimPins = pins.lensRim.length >= 3 ? pins.lensRim : (fallbackLensRim ?? [])
  const lensPath = rimPins.length >= 3 ? buildPinPath(rimPins, W, H) : buildLensPath(W, H)
  const scale = W / 560
  const lensScale = fx.lensScale ?? 1
  const lensOffsetX = fx.lensOffsetX ?? 0
  const lensOffsetY = fx.lensOffsetY ?? 0
  const imageOffsetX = fx.imageOffsetX ?? 0
  const imageOffsetY = fx.imageOffsetY ?? 0
  const cx = W / 2
  const cy = H / 2
  const imageZoom = lensScale > 0 ? (1 / lensScale) : 1

  ctx.save()
  ctx.translate(cx + lensOffsetX, cy + lensOffsetY)
  ctx.scale(lensScale, lensScale)
  ctx.translate(-cx, -cy)

  if (!img) {
    ctx.save(); ctx.clip(lensPath)
    ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = 'rgba(255,255,255,0.2)'
    ctx.font = `bold ${14 * scale}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('Foto não encontrada', W / 2, H / 2); ctx.restore()
    ctx.strokeStyle = 'rgba(100,120,180,0.4)'; ctx.lineWidth = 4; ctx.stroke(lensPath)
    ctx.restore()
    return
  }

  const blurPx = 5 + ((g.lateral_blur ?? 50) / 100) * 14
  const feather = 32

  const blurCanvas = document.createElement('canvas')
  blurCanvas.width = W; blurCanvas.height = H
  const bCtx = blurCanvas.getContext('2d')!
  bCtx.filter = `blur(${blurPx}px)`; drawCoverImage(bCtx, img, W, H, imageOffsetX, imageOffsetY, imageZoom); bCtx.filter = 'none'

  const sharpCanvas = document.createElement('canvas')
  sharpCanvas.width = W; sharpCanvas.height = H
  const sCtx = sharpCanvas.getContext('2d')!
  drawCoverImage(sCtx, img, W, H, imageOffsetX, imageOffsetY, imageZoom)

  const maskCanvas = document.createElement('canvas')
  maskCanvas.width = W; maskCanvas.height = H
  const mCtx = maskCanvas.getContext('2d')!
  mCtx.fillStyle = 'black'; mCtx.fillRect(0, 0, W, H)
  mCtx.globalCompositeOperation = 'destination-out'
  mCtx.filter = `blur(${feather}px)`
  for (const zone of sharpZones)
    if (pins[zone]?.length >= 3) mCtx.fill(buildPinPath(pins[zone], W, H))
  mCtx.filter = 'none'
  sCtx.globalCompositeOperation = 'destination-out'; sCtx.drawImage(maskCanvas, 0, 0)
  sCtx.globalCompositeOperation = 'source-over'

  ctx.save(); ctx.clip(lensPath)
  ctx.drawImage(blurCanvas, 0, 0); ctx.drawImage(sharpCanvas, 0, 0)
  ctx.restore()

  if (showZoneLines) {
    ctx.save(); ctx.clip(lensPath)
    for (const zone of LINE_ZONES) {
      const zonePins = pins[zone as keyof typeof pins] as Array<{ x: number; y: number }>
      if (zonePins?.length >= 2) {
        ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2.5 * scale
        ctx.lineJoin = 'round'; ctx.lineCap = 'round'
        ctx.stroke(buildOpenLinePath(zonePins, W, H))
      }
    }
    ctx.restore()
  }

  ctx.strokeStyle = 'rgba(120,140,200,0.45)'; ctx.lineWidth = 4 * scale; ctx.stroke(lensPath)

  if (tracePoint) {
    const { x, y } = tracePoint
    const color = traceZone ? ZONE_COLOR[traceZone] : 'rgba(255,255,255,0.6)'
    const label = traceZone ? ZONE_LABEL[traceZone] : 'FORA'
    ctx.save(); ctx.clip(lensPath)
    ctx.beginPath(); ctx.arc(x, y, 18 * scale, 0, Math.PI * 2)
    ctx.strokeStyle = color; ctx.lineWidth = 2 * scale; ctx.globalAlpha = 0.6; ctx.stroke()
    ctx.beginPath(); ctx.arc(x, y, 5 * scale, 0, Math.PI * 2)
    ctx.fillStyle = color; ctx.globalAlpha = 1; ctx.shadowColor = color; ctx.shadowBlur = 12
    ctx.fill(); ctx.shadowBlur = 0; ctx.restore()
    const fontSize = 12 * scale
    ctx.font = `bold ${fontSize}px system-ui`; ctx.textAlign = 'center'
    const textW = ctx.measureText(label).width, padX = 10 * scale, padY = 5 * scale
    const bw = textW + padX * 2, bh = fontSize + padY * 2
    const bx = Math.max(bw / 2, Math.min(W - bw / 2, x))
    const by = Math.min(H - bh - 4 * scale, y + 26 * scale)
    ctx.fillStyle = traceZone ? color + 'dd' : 'rgba(100,100,100,0.8)'
    ctx.beginPath(); ctx.roundRect(bx - bw / 2, by, bw, bh, 6 * scale); ctx.fill()
    ctx.fillStyle = traceZone ? '#000' : '#fff'; ctx.textBaseline = 'middle'
    ctx.fillText(label, bx, by + bh / 2)
  }
  ctx.restore()
}

// ---------------------------------------------------------------------------
// Render: right panel photo state (blurred or sharp)
// ---------------------------------------------------------------------------
function drawRightPanel(canvas: HTMLCanvasElement, img: HTMLImageElement | null, blurAmount: number) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const W = canvas.width, H = canvas.height
  ctx.clearRect(0, 0, W, H)
  if (!img) { ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, W, H); return }
  if (blurAmount < 0.2) { drawCoverImage(ctx, img, W, H) }
  else { ctx.filter = `blur(${blurAmount}px)`; drawCoverImage(ctx, img, W, H); ctx.filter = 'none' }
}

// ---------------------------------------------------------------------------
// Render: right panel animation frame (t = 0 → 1)
// ---------------------------------------------------------------------------
function drawRightAnimFrame(
  canvas: HTMLCanvasElement, g: LensGeometry, img: HTMLImageElement | null,
  sharpZones: BlurZone[], zone: BlurZone, t: number,
  cachedPhoto: HTMLCanvasElement | null,
  cachedFinal: HTMLCanvasElement | null,
  fallbackLensRim: Array<{ x: number; y: number }> | null = null,
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const W = canvas.width, H = canvas.height
  ctx.clearRect(0, 0, W, H)

  // ease-out cubic
  const et = 1 - Math.pow(1 - t, 3)

  const pins = remapPins(normalizePins(g.pins))
  const rimPins = pins.lensRim.length >= 3 ? pins.lensRim : (fallbackLensRim ?? [])
  const lensPath = rimPins.length >= 3 ? buildPinPath(rimPins, W, H) : buildLensPath(W, H)
  const scale = W / 560

  // ── Photo: crossfade from initial (zone-composite) → final (target blur) ──
  if (cachedFinal) {
    ctx.drawImage(cachedFinal, 0, 0)
    if (cachedPhoto && et < 1) {
      ctx.globalAlpha = 1 - et
      ctx.drawImage(cachedPhoto, 0, 0)
      ctx.globalAlpha = 1
    }
  } else if (cachedPhoto) {
    ctx.drawImage(cachedPhoto, 0, 0)
  } else if (img) { drawCoverImage(ctx, img, W, H) }

  // ── Vignette: dark mask outside lens shape, fades out with animation ──────
  const vigAlpha = Math.max(0, 1 - et * 1.3)
  if (vigAlpha > 0) {
    const vig = document.createElement('canvas')
    vig.width = W; vig.height = H
    const vCtx = vig.getContext('2d')!
    vCtx.fillStyle = '#030712'
    vCtx.fillRect(0, 0, W, H)
    vCtx.globalCompositeOperation = 'destination-out'
    vCtx.fill(lensPath)
    ctx.globalAlpha = vigAlpha
    ctx.drawImage(vig, 0, 0)
    ctx.globalAlpha = 1
  }

  // Rim fades in sync
  ctx.globalAlpha = Math.max(0, 1 - et * 1.4)
  ctx.strokeStyle = 'rgba(120,140,200,0.45)'; ctx.lineWidth = 4 * scale; ctx.stroke(lensPath)
  ctx.globalAlpha = 1

  // ── Lines: drift, thicken, fade — all simultaneous ───────────────────────
  const dir = ZONE_LINE_DIR[zone]
  const lineFade = Math.max(0, 1 - et * 1.4)
  const drift = et * H * 0.65
  const sideDrift = et * W * 0.35

  for (const lineZone of LINE_ZONES) {
    const zonePins = pins[lineZone as keyof typeof pins] as Array<{ x: number; y: number }>
    if (zonePins?.length >= 2) {
      const sideOffset = lineZone === 'lineA' ? sideDrift : -sideDrift
      ctx.save()
      ctx.globalAlpha = lineFade
      ctx.translate(sideOffset, dir.dy * drift)
      ctx.strokeStyle = '#fbbf24'
      ctx.lineWidth = (2.5 + et * 6) * scale
      ctx.lineJoin = 'round'; ctx.lineCap = 'round'
      ctx.stroke(buildOpenLinePath(zonePins, W, H))
      ctx.restore()
    }
  }
}

function getDesignLabel(g: LensGeometry): string {
  return g.visual_design_type === 'occupational' ? 'Ocupacional' :
    g.visual_design_type === 'personalized' ? 'Personalizada' :
    g.visual_design_type === 'single_vision_standard' ? 'Visão Simples' : 'Progressiva'
}

function getEyetraceFx(nx: number, ny: number): LensRenderFx {
  return {
    lensScale: EYETRACE_LENS_SCALE,
    lensOffsetX: nx * EYETRACE_LENS_DRIFT_X,
    lensOffsetY: ny * EYETRACE_LENS_DRIFT_Y,
    imageOffsetX: -nx * EYETRACE_IMAGE_DRIFT_X,
    imageOffsetY: -ny * EYETRACE_IMAGE_DRIFT_Y,
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function LensVisualizerView({
  geometry, backPath, allGeometries, storeId,
}: {
  geometry: LensGeometry; backPath: string; allGeometries: LensGeometry[]; storeId: number
}) {
  const router = useRouter()
  const [activePhoto, setActivePhoto] = useState(0)
  const [showZoneLines, setShowZoneLines] = useState(true)
  const [mode, setMode] = useState<Mode>('normal')
  const [loaded, setLoaded] = useState<boolean[]>([false, false, false, false])

  const [compareMode, setCompareMode] = useState(false)
  const [compareGeometry, setCompareGeometry] = useState<LensGeometry | null>(null)
  const [showCompareDropdown, setShowCompareDropdown] = useState(false)

  const canvasRef         = useRef<HTMLCanvasElement>(null)
  const rightCanvasRef    = useRef<HTMLCanvasElement>(null)
  const avatarCanvasRef   = useRef<HTMLCanvasElement>(null)
  const compareCanvasRef  = useRef<HTMLCanvasElement>(null)
  const lensTouchAreaRef  = useRef<HTMLDivElement>(null)
  const compareDropdownRef = useRef<HTMLDivElement>(null)
  const imgRefs           = useRef<(HTMLImageElement | null)[]>([null, null, null, null])

  // Eyetrace
  const tracePointRef  = useRef<{ x: number; y: number } | null>(null)
  const traceZoneRef   = useRef<BlurZone | null>(null)
  const rafRef         = useRef<number | null>(null)
  const leftFxRef      = useRef<LensRenderFx>(getEyetraceFx(0, 0))
  const eyetraceTouchActiveRef = useRef(false)

  // Avatar
  const avatarRotRef       = useRef({ x: 0, y: 0 })
  const avatarReturnRafRef = useRef<number | null>(null)

  // Right panel state machine
  const rightStateRef  = useRef<RightState>('lens')
  const animRafRef     = useRef<number | null>(null)
  const animStartRef   = useRef<number>(0)
  const animZoneRef    = useRef<BlurZone | null>(null)
  const animCacheRef   = useRef<HTMLCanvasElement | null>(null) // pre-rendered initial photo
  const animFinalRef   = useRef<HTMLCanvasElement | null>(null) // pre-rendered final photo
  const currentBlurRef = useRef<number>(12)
  const targetBlurRef  = useRef<number>(12)

  const modeRef = useRef(mode)
  useEffect(() => { modeRef.current = mode }, [mode])

  // Rim from whichever geometry has lensRim configured — used as fallback for all lenses
  const fallbackLensRim = (() => {
    const src = allGeometries.find((g) => g.pins?.lensRim && g.pins.lensRim.length >= 3)
    return src ? remapPins(normalizePins(src.pins)).lensRim : null
  })()

  // ── Left canvas redraw ────────────────────────────────────────────────────
  const redraw = useCallback(() => {
    if (!canvasRef.current) return
    const fx = mode === 'eyetrace' ? leftFxRef.current : {}
    drawVisualizerLens(canvasRef.current, geometry, imgRefs.current[activePhoto],
      PHOTOS[activePhoto].sharpZones, showZoneLines, null, null, fx, fallbackLensRim)
  }, [geometry, activePhoto, showZoneLines, mode, fallbackLensRim])

  // ── Load photos ───────────────────────────────────────────────────────────
  useEffect(() => {
    PHOTOS.forEach((photo, i) => {
      const img = new Image()
      img.onload = () => {
        imgRefs.current[i] = img
        setLoaded((prev) => { const n = [...prev]; n[i] = true; return n })
      }
      img.onerror = () => {
        const fallback = new Image()
        fallback.onload = () => {
          imgRefs.current[i] = fallback
          setLoaded((prev) => { const n = [...prev]; n[i] = true; return n })
        }
        fallback.src = '/lens-bg.png'
      }
      img.src = photo.src
    })
  }, [])

  useEffect(() => { redraw() }, [redraw, loaded])

  // ── Compare panel redraw ──────────────────────────────────────────────────
  const redrawCompare = useCallback(() => {
    if (!compareCanvasRef.current || !compareGeometry) return
    drawVisualizerLens(
      compareCanvasRef.current, compareGeometry,
      imgRefs.current[activePhoto],
      PHOTOS[activePhoto].sharpZones,
      showZoneLines,
      null, null, {}, fallbackLensRim,
    )
  }, [compareGeometry, activePhoto, showZoneLines, fallbackLensRim])

  useEffect(() => {
    if (!compareMode) return
    redrawCompare()
  }, [redrawCompare, compareMode, loaded])

  // ── Close compare dropdown when clicking outside ───────────────────────────
  useEffect(() => {
    if (!showCompareDropdown) return
    const handler = (e: MouseEvent) => {
      if (compareDropdownRef.current && !compareDropdownRef.current.contains(e.target as Node))
        setShowCompareDropdown(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showCompareDropdown])

  // ── Draw right lens (initial state) ───────────────────────────────────────
  const drawRightLens = useCallback(() => {
    if (!rightCanvasRef.current) return
    drawVisualizerLens(rightCanvasRef.current, geometry, imgRefs.current[activePhoto],
      PHOTOS[activePhoto].sharpZones, showZoneLines, null, null, {}, fallbackLensRim)
  }, [geometry, activePhoto, showZoneLines, fallbackLensRim])

  // ── Reset right panel when mode activates or photo changes ────────────────
  useEffect(() => {
    tracePointRef.current = null
    traceZoneRef.current = null
    leftFxRef.current = getEyetraceFx(0, 0)
    avatarRotRef.current = { x: 0, y: 0 }
    if (avatarReturnRafRef.current) { cancelAnimationFrame(avatarReturnRafRef.current); avatarReturnRafRef.current = null }
    if (avatarCanvasRef.current) drawAvatar(avatarCanvasRef.current, 0, 0)
    redraw()
    if (mode === 'eyetrace') {
      if (animRafRef.current) cancelAnimationFrame(animRafRef.current)
      rightStateRef.current = 'lens'
      animCacheRef.current = null
      drawRightLens()
    }
  }, [mode, activePhoto, redraw, drawRightLens])

  // ── Animate right panel blur (photo state) ────────────────────────────────
  const animateRightBlur = useCallback((targetBlur: number) => {
    if (rightStateRef.current !== 'photo') return
    targetBlurRef.current = targetBlur
    if (animRafRef.current) cancelAnimationFrame(animRafRef.current)
    const step = () => {
      if (rightStateRef.current !== 'photo') return
      const diff = targetBlurRef.current - currentBlurRef.current
      if (Math.abs(diff) < 0.15) {
        currentBlurRef.current = targetBlurRef.current
        if (rightCanvasRef.current)
          drawRightPanel(rightCanvasRef.current, imgRefs.current[activePhoto], currentBlurRef.current)
        return
      }
      currentBlurRef.current += diff * 0.1
      if (rightCanvasRef.current)
        drawRightPanel(rightCanvasRef.current, imgRefs.current[activePhoto], currentBlurRef.current)
      animRafRef.current = requestAnimationFrame(step)
    }
    animRafRef.current = requestAnimationFrame(step)
  }, [activePhoto])

  // ── Start zoom-out animation on zone click ────────────────────────────────
  const startZoneAnimation = useCallback((zone: BlurZone) => {
    if (rightStateRef.current === 'animating') return
    rightStateRef.current = 'animating'
    animZoneRef.current = zone
    animStartRef.current = performance.now()

    const img = imgRefs.current[activePhoto]
    const blurPx = 5 + ((geometry.lateral_blur ?? 50) / 100) * 14
    const isSharp = PHOTOS[activePhoto].sharpZones.includes(zone)
    const finalBlur = isSharp ? 0 : blurPx

    // Pre-render photo content once for animation frames
    if (img) {
      const cache = document.createElement('canvas')
      cache.width = VW; cache.height = VH
      const cCtx = cache.getContext('2d')!
      const bCanvas = document.createElement('canvas')
      bCanvas.width = VW; bCanvas.height = VH
      const bCtx = bCanvas.getContext('2d')!
      bCtx.filter = `blur(${blurPx}px)`; drawCoverImage(bCtx, img, VW, VH); bCtx.filter = 'none'
      const sCanvas = document.createElement('canvas')
      sCanvas.width = VW; sCanvas.height = VH
      const sCtx = sCanvas.getContext('2d')!
      drawCoverImage(sCtx, img, VW, VH)
      const mCanvas = document.createElement('canvas')
      mCanvas.width = VW; mCanvas.height = VH
      const mCtx = mCanvas.getContext('2d')!
      mCtx.fillStyle = 'black'; mCtx.fillRect(0, 0, VW, VH)
      mCtx.globalCompositeOperation = 'destination-out'; mCtx.filter = 'blur(32px)'
      const pins = remapPins(normalizePins(geometry.pins))
      for (const z of PHOTOS[activePhoto].sharpZones)
        if (pins[z]?.length >= 3) mCtx.fill(buildPinPath(pins[z], VW, VH))
      mCtx.filter = 'none'
      sCtx.globalCompositeOperation = 'destination-out'; sCtx.drawImage(mCanvas, 0, 0)
      sCtx.globalCompositeOperation = 'source-over'
      cCtx.drawImage(bCanvas, 0, 0); cCtx.drawImage(sCanvas, 0, 0)
      animCacheRef.current = cache
    }

    // Pre-render final state (full-frame at target blur)
    if (img) {
      const finalCache = document.createElement('canvas')
      finalCache.width = VW; finalCache.height = VH
      const fCtx = finalCache.getContext('2d')!
      if (finalBlur > 0.2) {
        fCtx.filter = `blur(${finalBlur}px)`
        drawCoverImage(fCtx, img, VW, VH)
        fCtx.filter = 'none'
      } else {
        drawCoverImage(fCtx, img, VW, VH)
      }
      animFinalRef.current = finalCache
    }

    if (animRafRef.current) cancelAnimationFrame(animRafRef.current)
    const tick = (now: number) => {
      const t = Math.min(1, (now - animStartRef.current) / ANIM_DURATION)
      if (rightCanvasRef.current)
        drawRightAnimFrame(rightCanvasRef.current, geometry, img, PHOTOS[activePhoto].sharpZones,
          zone, t, animCacheRef.current, animFinalRef.current, fallbackLensRim)
      if (t < 1) {
        animRafRef.current = requestAnimationFrame(tick)
      } else {
        rightStateRef.current = 'photo'
        currentBlurRef.current = finalBlur
        targetBlurRef.current = finalBlur
        if (rightCanvasRef.current)
          drawRightPanel(rightCanvasRef.current, img, finalBlur)
      }
    }
    animRafRef.current = requestAnimationFrame(tick)
  }, [geometry, activePhoto, fallbackLensRim])

  // ── Eyetrace pointer move ─────────────────────────────────────────────────
  const handlePointerMove = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas || modeRef.current !== 'eyetrace') return
    const { x, y } = screenToCanvas(canvas, clientX, clientY)
    const pins = remapPins(normalizePins(geometry.pins))
    const zone = detectZone(x, y, pins, VW, VH)
    const blurPx = 5 + ((geometry.lateral_blur ?? 50) / 100) * 14
    const isSharp = zone !== null && PHOTOS[activePhoto].sharpZones.includes(zone)
    tracePointRef.current = { x, y }
    traceZoneRef.current = zone
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      if (!canvas) return
      const nx = (x / VW) * 2 - 1
      const ny = (y / VH) * 2 - 1
      const fx = getEyetraceFx(nx, ny)
      leftFxRef.current = fx
      drawVisualizerLens(canvas, geometry, imgRefs.current[activePhoto],
        PHOTOS[activePhoto].sharpZones, showZoneLines, { x, y }, zone, fx, fallbackLensRim)
      // Avatar: mouse y→pitch (bottom=chin up), mouse x→yaw inverse
      if (avatarCanvasRef.current) {
        // ny: -1 = topo (longe, neutro), +1 = base (perto, queixo ergue)
        // clamp: longe → 0, perto → +0.75
        const rot = { x: Math.max(0, ny) * 0.75, y: -nx * 0.65 }
        avatarRotRef.current = rot
        drawAvatar(avatarCanvasRef.current, rot.x, rot.y)
      }
      if (rightStateRef.current === 'photo')
        animateRightBlur(isSharp ? 0 : blurPx)
    })
  }, [geometry, activePhoto, showZoneLines, animateRightBlur, fallbackLensRim])

  const handlePointerLeave = useCallback(() => {
    tracePointRef.current = null; traceZoneRef.current = null
    leftFxRef.current = getEyetraceFx(0, 0)
    const blurPx = 5 + ((geometry.lateral_blur ?? 50) / 100) * 14
    if (canvasRef.current)
      drawVisualizerLens(canvasRef.current, geometry, imgRefs.current[activePhoto],
        PHOTOS[activePhoto].sharpZones, showZoneLines, null, null, leftFxRef.current, fallbackLensRim)
    if (rightStateRef.current === 'photo') animateRightBlur(blurPx)
    // Return avatar to center
    if (avatarReturnRafRef.current) cancelAnimationFrame(avatarReturnRafRef.current)
    const returnStep = () => {
      const cur = avatarRotRef.current
      const newRot = { x: cur.x * 0.88, y: cur.y * 0.88 }
      avatarRotRef.current = newRot
      if (avatarCanvasRef.current) drawAvatar(avatarCanvasRef.current, newRot.x, newRot.y)
      if (Math.abs(newRot.x) > 0.004 || Math.abs(newRot.y) > 0.004)
        avatarReturnRafRef.current = requestAnimationFrame(returnStep)
      else avatarReturnRafRef.current = null
    }
    avatarReturnRafRef.current = requestAnimationFrame(returnStep)
  }, [geometry, activePhoto, showZoneLines, animateRightBlur, fallbackLensRim])

  // ── Zone click on left canvas → triggers animation on right ───────────────
  const handleZoneClick = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas || modeRef.current !== 'eyetrace') return
    const { x, y } = screenToCanvas(canvas, clientX, clientY)
    const pins = remapPins(normalizePins(geometry.pins))
    const zone = detectZone(x, y, pins, VW, VH)
    if (!zone) return
    startZoneAnimation(zone)
  }, [geometry, startZoneAnimation])

  useEffect(() => {
    if (mode !== 'eyetrace') return

    const area = lensTouchAreaRef.current
    if (!area) return

    const stopViewportGesture = (event: TouchEvent) => {
      if (event.cancelable) event.preventDefault()
    }

    const handleNativeTouchStart = (event: TouchEvent) => {
      eyetraceTouchActiveRef.current = true
      stopViewportGesture(event)
      const touch = event.touches[0]
      if (touch) handlePointerMove(touch.clientX, touch.clientY)
    }

    const handleNativeTouchMove = (event: TouchEvent) => {
      if (!eyetraceTouchActiveRef.current) return
      stopViewportGesture(event)
      const touch = event.touches[0]
      if (touch) handlePointerMove(touch.clientX, touch.clientY)
    }

    const handleNativeTouchEnd = (event: TouchEvent) => {
      if (!eyetraceTouchActiveRef.current) return
      stopViewportGesture(event)
      eyetraceTouchActiveRef.current = false
      const touch = event.changedTouches[0]
      if (touch) handleZoneClick(touch.clientX, touch.clientY)
    }

    const handleNativeTouchCancel = (event: TouchEvent) => {
      if (!eyetraceTouchActiveRef.current) return
      stopViewportGesture(event)
      eyetraceTouchActiveRef.current = false
      handlePointerLeave()
    }

    const previousHtmlOverscroll = document.documentElement.style.overscrollBehavior
    const previousBodyOverscroll = document.body.style.overscrollBehavior
    const previousBodyOverflow = document.body.style.overflow
    document.documentElement.style.overscrollBehavior = 'none'
    document.body.style.overscrollBehavior = 'none'
    document.body.style.overflow = 'hidden'

    const startOptions: AddEventListenerOptions = { passive: false }
    const documentOptions: AddEventListenerOptions = { passive: false, capture: true }
    area.addEventListener('touchstart', handleNativeTouchStart, startOptions)
    document.addEventListener('touchmove', handleNativeTouchMove, documentOptions)
    document.addEventListener('touchend', handleNativeTouchEnd, documentOptions)
    document.addEventListener('touchcancel', handleNativeTouchCancel, documentOptions)

    return () => {
      eyetraceTouchActiveRef.current = false
      document.documentElement.style.overscrollBehavior = previousHtmlOverscroll
      document.body.style.overscrollBehavior = previousBodyOverscroll
      document.body.style.overflow = previousBodyOverflow
      area.removeEventListener('touchstart', handleNativeTouchStart, startOptions)
      document.removeEventListener('touchmove', handleNativeTouchMove, documentOptions)
      document.removeEventListener('touchend', handleNativeTouchEnd, documentOptions)
      document.removeEventListener('touchcancel', handleNativeTouchCancel, documentOptions)
    }
  }, [mode, handlePointerMove, handlePointerLeave, handleZoneClick])

  const hasPins = !!geometry.pins && (
    geometry.pins.distance.length >= 3 ||
    geometry.pins.corridor.length >= 3 ||
    geometry.pins.near.length >= 3
  )
  const designLabel = getDesignLabel(geometry)

  const compareHasPins = !!compareGeometry?.pins && (
    compareGeometry.pins.distance.length >= 3 ||
    compareGeometry.pins.corridor.length >= 3 ||
    compareGeometry.pins.near.length >= 3
  )
  const compareDesignLabel = compareGeometry ? getDesignLabel(compareGeometry) : ''

  const otherGeometries = allGeometries.filter((g) => g.id !== geometry.id)
  const currentGeometryIndex = Math.max(0, allGeometries.findIndex((g) => g.id === geometry.id))
  const canNavigateGeometries = allGeometries.length > 1
  const previousGeometry = allGeometries[(currentGeometryIndex - 1 + allGeometries.length) % allGeometries.length]
  const nextGeometry = allGeometries[(currentGeometryIndex + 1) % allGeometries.length]
  const navigateToGeometry = useCallback((familyName: string) => {
    router.push(`/dashboard/loja/${storeId}/lentes/visualizar/${encodeURIComponent(familyName)}`)
  }, [router, storeId])


  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-white overflow-hidden select-none">

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-5 py-3 bg-slate-900 border-b border-white/10 shrink-0">
        <button onClick={() => router.push(backPath)}
          className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-sm font-bold text-slate-300 hover:bg-slate-700 transition shrink-0">
          ← Voltar
        </button>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          {mode === 'normal' && (
            <button onClick={() => setShowZoneLines((v) => !v)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition ${
                showZoneLines
                  ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40 hover:bg-amber-500/30'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
              }`}>
              <span className={`inline-block w-3 h-3 rounded-sm ${showZoneLines ? 'bg-amber-400' : 'bg-slate-600'}`} />
              {showZoneLines ? 'Ocultar linhas' : 'Mostrar linhas'}
            </button>
          )}
          {/* Compare button + dropdown */}
          <div className="relative" ref={compareDropdownRef}>
            {compareMode ? (
              <div className="flex items-center gap-1 rounded-lg bg-violet-500/20 ring-1 ring-violet-500/40 px-3 py-2">
                <span className="text-sm font-bold text-violet-300 max-w-[140px] truncate">
                  ⊞ {compareGeometry?.family_name}
                </span>
                <button
                  onClick={() => { setCompareMode(false); setCompareGeometry(null) }}
                  className="ml-1 rounded px-1 text-violet-400 hover:text-white hover:bg-violet-500/30 transition text-sm font-black leading-none">
                  ✕
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowCompareDropdown((v) => !v)}
                disabled={otherGeometries.length === 0}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition ${
                  showCompareDropdown
                    ? 'bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/40'
                    : otherGeometries.length === 0
                    ? 'bg-slate-800 text-slate-600 cursor-not-allowed opacity-50'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                }`}>
                ⊞ Comparar lentes
              </button>
            )}
            {showCompareDropdown && (
              <div className="absolute right-0 top-full mt-2 z-50 w-72 rounded-xl bg-slate-800 ring-1 ring-white/10 shadow-2xl overflow-hidden">
                <p className="px-4 pt-3 pb-2 text-[10px] uppercase tracking-widest text-slate-500 font-bold">Escolha uma lente</p>
                <div className="max-h-64 overflow-y-auto">
                  {otherGeometries.map((g) => {
                    const gHasPins = !!g.pins && (g.pins.distance.length >= 3 || g.pins.corridor.length >= 3 || g.pins.near.length >= 3)
                    return (
                      <button key={g.id}
                        onClick={() => { setCompareGeometry(g); setCompareMode(true); setMode('normal'); setShowCompareDropdown(false) }}
                        className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-slate-700 transition">
                        <div>
                          <p className="text-sm font-bold text-white leading-tight">{g.family_name}</p>
                          <p className="text-[10px] text-slate-400 uppercase tracking-wider">{getDesignLabel(g)}</p>
                        </div>
                        {!gHasPins && (
                          <span className="text-[9px] uppercase tracking-wider text-amber-500 bg-amber-500/10 rounded px-1.5 py-0.5">sem calibração</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
          <button
            onClick={() => { setMode((m) => m === 'eyetrace' ? 'normal' : 'eyetrace'); setCompareMode(false) }}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition ${
              mode === 'eyetrace'
                ? 'bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/40 hover:bg-indigo-500/30'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
            }`}>
            👁 {mode === 'eyetrace' ? 'Sair do modo olhar' : 'Como fica seu olhar'}
          </button>
        </div>
      </div>

      {/* ── Canvases ─────────────────────────────────────────────────────────── */}
      <div className={`relative flex-1 min-h-0 flex overflow-hidden ${compareMode || mode === 'eyetrace' ? 'flex-row' : 'items-center justify-center'}`}>
        {canNavigateGeometries && (
          <>
            <button
              type="button"
              aria-label="Lente anterior"
              onClick={() => navigateToGeometry(previousGeometry.family_name)}
              className="absolute left-4 bottom-4 z-30 flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-slate-900/85 text-2xl font-black text-slate-300 shadow-2xl backdrop-blur-md transition hover:border-indigo-400/50 hover:bg-indigo-500/20 hover:text-white"
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="Próxima lente"
              onClick={() => navigateToGeometry(nextGeometry.family_name)}
              className="absolute right-4 bottom-4 z-30 flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-slate-900/85 text-2xl font-black text-slate-300 shadow-2xl backdrop-blur-md transition hover:border-indigo-400/50 hover:bg-indigo-500/20 hover:text-white"
            >
              ›
            </button>
          </>
        )}

        {/* Left: lens (always) */}
        <div className={`flex flex-col overflow-hidden ${compareMode || mode === 'eyetrace' ? 'flex-1 border-r border-white/10' : 'flex-1'}`}>
          {/* Lens name — outside and above the canvas */}
          <div className="shrink-0 text-center pt-4 pb-2">
            <select
              aria-label="Escolher lente"
              value={geometry.family_name}
              onChange={(event) => navigateToGeometry(event.target.value)}
              className={`max-w-[min(92vw,620px)] appearance-none rounded-xl border border-white/10 bg-slate-900/70 px-5 py-2 text-center font-black leading-tight text-white outline-none transition hover:border-indigo-400/40 focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/20 ${
                compareMode ? 'text-xl' : 'text-3xl'
              }`}
            >
              {allGeometries.map((g) => (
                <option key={g.id} value={g.family_name} className="bg-slate-900 text-white">
                  {g.family_name}
                </option>
              ))}
            </select>
            <p className="text-xs uppercase tracking-widest text-slate-400 mt-0.5">{designLabel}</p>
          </div>
          <div
            ref={lensTouchAreaRef}
            className="relative flex-1 flex items-center justify-center overflow-hidden"
            style={mode === 'eyetrace' ? { touchAction: 'none', overscrollBehavior: 'contain' } : undefined}
          >
          {!hasPins && (
            <div className="absolute z-10">
              <div className="rounded-2xl border border-amber-500/30 bg-slate-900/95 px-6 py-4 text-center shadow-2xl">
                <p className="text-sm font-black text-amber-400">Lente sem calibração</p>
                <p className="mt-1 text-xs text-slate-400">Configure os alfinetes na tela de calibração para ver a simulação.</p>
              </div>
            </div>
          )}
{mode === 'eyetrace' && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 rounded-full bg-indigo-900/80 px-4 py-1.5 text-xs font-bold text-indigo-200 ring-1 ring-indigo-500/40 pointer-events-none">
              Toque na zona para ver a simulação
            </div>
          )}
          <canvas
            ref={canvasRef} width={VW} height={VH}
            className="aspect-video max-w-full max-h-full w-auto h-auto"
            style={{
              cursor: mode === 'eyetrace' ? 'none' : 'default',
              touchAction: mode === 'eyetrace' ? 'none' : 'auto',
              overscrollBehavior: mode === 'eyetrace' ? 'contain' : 'auto',
            }}
            onMouseMove={mode === 'eyetrace' ? (e) => handlePointerMove(e.clientX, e.clientY) : undefined}
            onMouseLeave={mode === 'eyetrace' ? handlePointerLeave : undefined}
            onClick={mode === 'eyetrace' ? (e) => handleZoneClick(e.clientX, e.clientY) : undefined}
            onTouchStart={mode === 'eyetrace' ? (e) => { e.preventDefault(); const t = e.touches[0]; handlePointerMove(t.clientX, t.clientY) } : undefined}
            onTouchMove={mode === 'eyetrace' ? (e) => { e.preventDefault(); const t = e.touches[0]; handlePointerMove(t.clientX, t.clientY) } : undefined}
            onTouchEnd={mode === 'eyetrace' ? (e) => { e.preventDefault(); const t = e.changedTouches[0]; handleZoneClick(t.clientX, t.clientY) } : undefined}
            onTouchCancel={mode === 'eyetrace' ? (e) => { e.preventDefault(); handlePointerLeave() } : undefined}
          />
          {/* {mode === 'eyetrace' && (
            <div className="absolute bottom-4 right-4 z-20 rounded-xl overflow-hidden bg-slate-900/80 ring-1 ring-teal-500/20 backdrop-blur-sm">
              <canvas ref={avatarCanvasRef} width={110} height={145} className="w-[88px] h-[116px] block" />
              <p className="text-center text-[9px] text-teal-400/50 pb-1.5 -mt-0.5 font-mono tracking-widest">POSTURA</p>
            </div>
          )} */}
          </div>
        </div>

        {/* Right: animation + photo (eyetrace mode only) */}
        {mode === 'eyetrace' && (
          <div className="relative flex-1 flex items-center justify-center overflow-hidden bg-slate-950">
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 rounded-full bg-slate-800/80 px-4 py-1.5 text-xs font-bold text-slate-400 pointer-events-none">
              Como você enxerga
            </div>
            <canvas ref={rightCanvasRef} width={VW} height={VH}
              className="aspect-video max-w-full max-h-full w-auto h-auto" />
          </div>
        )}

        {/* Right: compare panel */}
        {compareMode && compareGeometry && (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="shrink-0 text-center pt-4 pb-2 pointer-events-none">
              <p className="text-xl font-black text-white leading-tight">{compareGeometry.family_name}</p>
              <p className="text-xs uppercase tracking-widest text-slate-400 mt-0.5">{compareDesignLabel}</p>
            </div>
            <div className="relative flex-1 flex items-center justify-center overflow-hidden">
              {!compareHasPins && (
                <div className="absolute z-10">
                  <div className="rounded-2xl border border-amber-500/30 bg-slate-900/95 px-6 py-4 text-center shadow-2xl">
                    <p className="text-sm font-black text-amber-400">Lente sem calibração</p>
                    <p className="mt-1 text-xs text-slate-400">Configure os alfinetes na tela de calibração para ver a simulação.</p>
                  </div>
                </div>
              )}
              <canvas ref={compareCanvasRef} width={VW} height={VH}
                className="aspect-video max-w-full max-h-full w-auto h-auto" />
            </div>
          </div>
        )}
      </div>

      {/* ── Photo selector ───────────────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-white/10 bg-slate-900 px-4 py-2">
        <div className="flex gap-2">
          {PHOTOS.map((photo, i) => (
            <button key={i}
              onClick={() => setActivePhoto(i)}
              className={`flex flex-1 items-center gap-3 rounded-xl px-4 py-2 text-left transition ${
                activePhoto === i
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
              }`}>
              <span className="text-2xl leading-none shrink-0">{photo.icon}</span>
              <div className="min-w-0">
                <p className="text-sm font-black leading-tight">{photo.label}</p>
                <p className="text-[10px] opacity-70 leading-tight truncate">{photo.hint}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

    </div>
  )
}
