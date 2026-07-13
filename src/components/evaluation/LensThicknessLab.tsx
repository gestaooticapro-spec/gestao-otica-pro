'use client'

import { useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'

type Eye = 'od' | 'oe'
type FrameShape = 'arredondada' | 'quadrada'
type MountType = 'aro' | 'fio' | 'parafusado'

type Props = {
  od: { sphere: string; cylinder: string; axis: string; dnp: string }
  oe: { sphere: string; cylinder: string; axis: string; dnp: string }
}

type Sample = { x: number; y: number; thickness: number; frontSag: number; backSag: number; displayFrontSag: number }

// Unidade visual fixa: 1 mm calculado sempre ocupa a mesma distância na tela.
// Assim, aumentar a armação acrescenta borda em vez de esticar o perfil existente.
const DISPLAY_PX_PER_MM = 4.1

const MOUNT_PROFILES: Record<MountType, { label: string; edgeFloor: number; centerFloor: number; description: string }> = {
  aro: { label: 'Aro fechado', edgeFloor: 1.1, centerFloor: 1.2, description: 'Perfil visual padrão' },
  fio: { label: 'Fio de nylon', edgeFloor: 1.8, centerFloor: 1.2, description: 'Borda protegida para o canal' },
  parafusado: { label: 'Parafusado', edgeFloor: 1.5, centerFloor: 1.8, description: 'Perfil estrutural de demonstração' },
}

const parseNumber = (value: string) => {
  const parsed = Number(value.replace(',', '.').replace('+', '').trim())
  return Number.isFinite(parsed) ? parsed : null
}

function localPower(sphere: number, cylinder: number, axis: number, angle: number) {
  const axisRadians = (axis * Math.PI) / 180
  return sphere + cylinder * Math.sin(angle - axisRadians) ** 2
}

function signedSag(power: number, radius: number, index: number) {
  if (Math.abs(power) < 0.01) return 0
  const curveRadius = ((index - 1) * 1000) / power
  const absoluteRadius = Math.abs(curveRadius)
  if (radius >= absoluteRadius) return 0
  return curveRadius - Math.sign(curveRadius) * Math.sqrt(absoluteRadius ** 2 - radius ** 2)
}

function isInsideFrame(x: number, y: number, width: number, height: number, shape: FrameShape) {
  const normalizedX = Math.abs(x) / (width / 2)
  const normalizedY = Math.abs(y) / (height / 2)
  const exponent = shape === 'quadrada' ? 7 : 2.7
  return normalizedX ** exponent + normalizedY ** exponent <= 1
}

function calculateLens({
  sphere,
  cylinder,
  axis,
  index,
  width,
  height,
  shape,
  focalY,
  focalX,
  externalSide,
  edgeFloor,
  centerFloor,
}: {
  sphere: number
  cylinder: number
  axis: number
  index: number
  width: number
  height: number
  shape: FrameShape
  focalY: number
  focalX: number
  externalSide: 1 | -1
  edgeFloor: number
  centerFloor: number
}) {
  const samples: Sample[] = []
  const steps = 34
  const frontBase = 4

  for (let row = 0; row < steps; row += 1) {
    for (let column = 0; column < steps; column += 1) {
      const x = ((column + 0.5) / steps - 0.5) * width
      const y = ((row + 0.5) / steps - 0.5) * height
      if (!isInsideFrame(x, y, width, height, shape)) continue

      const opticalX = x - focalX
      const opticalY = y - focalY
      const radius = Math.hypot(opticalX, opticalY)
      const angle = Math.atan2(opticalY, opticalX)
      const power = localPower(sphere, cylinder, axis, angle)
      // A potência traseira é algébrica. Somar as duas sagitas preserva a orientação
      // física das superfícies e evita inflar artificialmente lentes positivas baixas.
      const frontSag = signedSag(frontBase, radius, index)
      const backSag = signedSag(power - frontBase, radius, index)
      // Referência visual comum aos dois olhos: a face frontal não salta ao alternar OD/OE.
      const displayFrontSag = signedSag(frontBase, Math.hypot(x, y), index)
      const surfaceDifference = frontSag + backSag
      samples.push({ x, y, thickness: surfaceDifference, frontSag, backSag, displayFrontSag })
    }
  }

  const equivalentPower = sphere + cylinder / 2
  const isNegative = equivalentPower < 0
  const maxDifference = Math.max(...samples.map((sample) => sample.thickness))
  const minDifference = Math.min(...samples.map((sample) => sample.thickness))
  const normalized = samples.map((sample) => ({
    ...sample,
    thickness: isNegative
      ? centerFloor - sample.thickness
      : edgeFloor + maxDifference - sample.thickness,
  }))
  const maximum = normalized.reduce((current, sample) => sample.thickness > current.thickness ? sample : current)
  const minimum = normalized.reduce((current, sample) => sample.thickness < current.thickness ? sample : current)
  const upperEdgeProfile = normalized
    .filter((sample) => Math.abs(sample.y + height * 0.29) < height / steps)
    .sort((a, b) => a.x - b.x)
  // Corte vertical perto da borda temporal: revela o volume externo da lente.
  const verticalProfile = normalized
    .filter((sample) => Math.abs(sample.x - externalSide * width * 0.31) < width / steps)
    .sort((a, b) => a.y - b.y)

  return { samples: normalized, maximum, minimum, upperEdgeProfile, verticalProfile, isNegative, focalY, focalX, range: Math.max(0.1, maxDifference - minDifference) }
}

function framePath(width: number, height: number, shape: FrameShape) {
  const exponent = shape === 'quadrada' ? 7 : 2.7
  const points = Array.from({ length: 96 }, (_, step) => {
    const angle = (step / 96) * Math.PI * 2
    const cosine = Math.cos(angle)
    const sine = Math.sin(angle)
    const radius = (Math.abs(cosine) ** exponent + Math.abs(sine) ** exponent) ** (-1 / exponent)
    return {
      x: 160 + cosine * radius * (width / 2) * DISPLAY_PX_PER_MM,
      y: 100 + sine * radius * (height / 2) * DISPLAY_PX_PER_MM,
    }
  })
  return `M ${points.map((point) => `${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' L ')} Z`
}

export default function LensThicknessLab({ od, oe }: Props) {
  const [eye, setEye] = useState<Eye>('od')
  const [index, setIndex] = useState(1.67)
  const [frameScale, setFrameScale] = useState(100)
  const [focalY, setFocalY] = useState(0)
  const [bridge, setBridge] = useState(18)
  const [mount, setMount] = useState<MountType>('aro')
  const [shape, setShape] = useState<FrameShape>('arredondada')
  const [isDemoExpanded, setIsDemoExpanded] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isPhysicalScale, setIsPhysicalScale] = useState(false)
  const [calibrationPxPerMm, setCalibrationPxPerMm] = useState(() => {
    if (typeof window === 'undefined') return 4
    const stored = Number(window.localStorage.getItem('lens-thickness-calibration-px-per-mm'))
    return Number.isFinite(stored) && stored >= 2 && stored <= 8 ? stored : 4
  })
  const selected = eye === 'od' ? od : oe
  const sphere = parseNumber(selected.sphere)
  const cylinder = parseNumber(selected.cylinder) ?? 0
  const axis = parseNumber(selected.axis) ?? 0
  const dnp = parseNumber(selected.dnp)
  const hasPrescription = sphere !== null
  const width = 52 * frameScale / 100
  const height = 38 * frameScale / 100
  const mountProfile = MOUNT_PROFILES[mount]
  const frameHalfPd = width / 2 + bridge / 2
  const dnpOffset = dnp === null ? 0 : Math.max(-12, Math.min(12, dnp - frameHalfPd))
  const focalX = eye === 'od' ? dnpOffset : -dnpOffset
  const externalSide: 1 | -1 = eye === 'od' ? 1 : -1
  const result = useMemo(() => hasPrescription ? calculateLens({ sphere: sphere!, cylinder, axis, index, width, height, shape, focalY, focalX, externalSide, edgeFloor: mountProfile.edgeFloor, centerFloor: mountProfile.centerFloor }) : null, [axis, cylinder, externalSide, focalX, focalY, hasPrescription, height, index, mountProfile.centerFloor, mountProfile.edgeFloor, shape, sphere, width])
  const reference156 = useMemo(() => hasPrescription ? calculateLens({ sphere: sphere!, cylinder, axis, index: 1.56, width, height, shape, focalY, focalX, externalSide, edgeFloor: mountProfile.edgeFloor, centerFloor: mountProfile.centerFloor }) : null, [axis, cylinder, externalSide, focalX, focalY, hasPrescription, height, mountProfile.centerFloor, mountProfile.edgeFloor, shape, sphere, width])
  const visualReduction = result && reference156
    ? Math.max(0, Math.round((1 - result.maximum.thickness / reference156.maximum.thickness) * 100))
    : 0
  const path = framePath(width, height, shape)
  const baselinePath = framePath(52, 38, shape)
  const physicalSvgStyle = isPhysicalScale ? { width: `${(320 / DISPLAY_PX_PER_MM) * calibrationPxPerMm}px`, maxWidth: 'none' } : undefined
  const updateCalibration = (value: number) => {
    setCalibrationPxPerMm(value)
    window.localStorage.setItem('lens-thickness-calibration-px-per-mm', String(value))
  }
  const colorFor = (thickness: number) => {
    if (!result) return 'transparent'
    const progress = (thickness - result.minimum.thickness) / Math.max(0.05, result.maximum.thickness - result.minimum.thickness)
    return `hsl(${204 - progress * 196} 88% ${42 + progress * 16}%)`
  }
  const topProfile = result?.upperEdgeProfile.map((sample, position) => {
    const x = sample.x * DISPLAY_PX_PER_MM + 160
    const front = 50 + sample.displayFrontSag * DISPLAY_PX_PER_MM
    return { x, front, back: front + sample.thickness * DISPLAY_PX_PER_MM }
  })
  const topLensPath = topProfile && topProfile.length > 0
    ? [
        `M ${topProfile[0].x.toFixed(1)} ${topProfile[0].front.toFixed(1)}`,
        ...topProfile.slice(1).map((point) => `L ${point.x.toFixed(1)} ${point.front.toFixed(1)}`),
        ...topProfile.slice().reverse().map((point) => `L ${point.x.toFixed(1)} ${point.back.toFixed(1)}`),
        'Z',
      ].join(' ')
    : ''
  const topSurfacePath = topProfile && topProfile.length > 0
    ? `M ${topProfile.map((point) => `${point.x.toFixed(1)} ${point.front.toFixed(1)}`).join(' L ')}`
    : ''
  const topBackSurfacePath = topProfile && topProfile.length > 0
    ? `M ${topProfile.map((point) => `${point.x.toFixed(1)} ${point.back.toFixed(1)}`).join(' L ')}`
    : ''
  const externalProfile = result?.verticalProfile.map((sample, position) => {
    const y = sample.y * DISPLAY_PX_PER_MM + 100
    const front = 160 + sample.displayFrontSag * DISPLAY_PX_PER_MM
    return { y, front, back: front + sample.thickness * DISPLAY_PX_PER_MM }
  })
  const externalLensPath = externalProfile && externalProfile.length > 0
    ? [
        `M ${externalProfile[0].front.toFixed(1)} ${externalProfile[0].y.toFixed(1)}`,
        ...externalProfile.slice(1).map((point) => `L ${point.front.toFixed(1)} ${point.y.toFixed(1)}`),
        ...externalProfile.slice().reverse().map((point) => `L ${point.back.toFixed(1)} ${point.y.toFixed(1)}`),
        'Z',
      ].join(' ')
    : ''
  const externalFrontSurfacePath = externalProfile && externalProfile.length > 0
    ? `M ${externalProfile.map((point) => `${point.front.toFixed(1)} ${point.y.toFixed(1)}`).join(' L ')}`
    : ''
  const externalBackSurfacePath = externalProfile && externalProfile.length > 0
    ? `M ${externalProfile.map((point) => `${point.back.toFixed(1)} ${point.y.toFixed(1)}`).join(' L ')}`
    : ''

  return (
    <section className={`rounded-2xl border border-cyan-400/25 bg-cyan-500/5 p-5 shadow-[0_0_32px_rgba(34,211,238,0.07)] ${isDemoExpanded ? 'fixed inset-0 z-[80] overflow-y-auto rounded-none bg-slate-950 p-6 md:p-10' : ''}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-200">Laboratório de espessura · teste desktop</p>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Estimativa geométrica baseada na receita acima, no índice e em um contorno de armação de teste. Não é gravada e não substitui o cálculo do laboratório.</p>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setIsDemoExpanded((current) => !current)} className="rounded-xl border border-cyan-300/35 bg-cyan-400/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-100 transition-colors hover:bg-cyan-400/20">
            {isDemoExpanded ? 'Fechar demonstração' : 'Ampliar comparação'}
          </button>
          <div className="flex rounded-xl border border-white/10 bg-black/20 p-1 text-xs font-black uppercase tracking-wider">
            {(['od', 'oe'] as Eye[]).map((option) => <button key={option} type="button" onClick={() => setEye(option)} className={`rounded-lg px-4 py-2 transition-colors ${eye === option ? 'bg-cyan-400/20 text-cyan-100' : 'text-slate-400 hover:text-white'}`}>{option.toUpperCase()}</button>)}
          </div>
          <button type="button" onClick={() => setIsCollapsed((current) => !current)} aria-label={isCollapsed ? 'Expandir laboratório' : 'Recolher laboratório'} title={isCollapsed ? 'Expandir laboratório' : 'Recolher laboratório'} className="inline-flex h-10 w-8 items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-white/5 hover:text-white">
            <ChevronDown className={`h-5 w-5 transition-transform duration-200 ${isCollapsed ? '' : 'rotate-180'}`} />
          </button>
        </div>
      </div>

      {!isCollapsed && <>

      <div className="mt-4 rounded-xl border border-fuchsia-300/25 bg-fuchsia-400/5 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-fuchsia-200">Escala física do tablet</p>
            <p className="mt-1 text-xs leading-5 text-slate-300">Calibre antes da demonstração para manter índice, montagem e armação na mesma escala real.</p>
          </div>
          <button type="button" onClick={() => setIsPhysicalScale((current) => !current)} className={`rounded-xl border px-4 py-2 text-[10px] font-black uppercase tracking-[0.14em] transition-colors ${isPhysicalScale ? 'border-fuchsia-300/45 bg-fuchsia-400/20 text-fuchsia-100' : 'border-white/15 bg-white/5 text-slate-200 hover:bg-white/10'}`}>
            {isPhysicalScale ? 'Usar visual comum' : 'Calibrar escala real'}
          </button>
        </div>
        {isPhysicalScale && (
          <div className="mt-4 grid gap-4 border-t border-fuchsia-300/15 pt-4 md:grid-cols-[1fr_auto] md:items-end">
            <RangeControl label="Régua de calibração" value={calibrationPxPerMm} min={2} max={8} step={0.05} onChange={updateCalibration} valueLabel="50 mm" hint="Encoste uma régua nesta barra e ajuste até ela medir exatamente 50 mm. A calibração fica salva neste tablet." />
            <div className="overflow-x-auto pb-2">
              <div className="relative h-9 border-b-2 border-fuchsia-200" style={{ width: `${50 * calibrationPxPerMm}px` }}>
                <span className="absolute left-0 top-0 h-3 border-l border-fuchsia-100" />
                <span className="absolute right-0 top-0 h-3 border-r border-fuchsia-100" />
                <span className="absolute left-1/2 top-0 h-2 border-l border-fuchsia-100" />
                <span className="absolute left-1/2 top-4 -translate-x-1/2 whitespace-nowrap text-[10px] font-black text-fuchsia-100">50 mm</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {!hasPrescription ? (
        <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm text-amber-100">Preencha ao menos a esfera de {eye.toUpperCase()} para iniciar a simulação.</div>
      ) : (
        <>
          <div className="mt-5 space-y-4">
            <div className={`grid gap-4 lg:grid-cols-3 ${isDemoExpanded ? 'mx-auto w-full max-w-[1800px]' : ''}`}>
            <div className="rounded-xl border border-white/10 bg-slate-950/30 p-3">
              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Vista frontal · mapa de espessura</p>
              <div className={isPhysicalScale ? 'overflow-x-auto' : ''}>
              <svg viewBox="0 0 320 200" style={physicalSvgStyle} className={`w-full transition-all duration-300 ${isDemoExpanded && !isPhysicalScale ? 'min-h-[300px]' : ''}`} role="img" aria-label="Mapa estimado de espessura da lente">
                <defs><clipPath id="lens-thickness-frame"><path d={path} /></clipPath></defs>
                {frameScale !== 100 && <path d={baselinePath} fill="none" stroke="rgba(148,163,184,.65)" strokeWidth="1.3" strokeDasharray="5 4" />}
                <path d={path} fill="rgba(15,23,42,.8)" stroke="rgba(103,232,249,.75)" strokeWidth="2" className="transition-all duration-300" />
                <g clipPath="url(#lens-thickness-frame)">{result!.samples.map((sample, position) => <rect key={position} x={160 - sample.x * DISPLAY_PX_PER_MM - width / 34 * DISPLAY_PX_PER_MM / 2} y={100 + sample.y * DISPLAY_PX_PER_MM - height / 34 * DISPLAY_PX_PER_MM / 2} width={width / 34 * DISPLAY_PX_PER_MM} height={height / 34 * DISPLAY_PX_PER_MM} fill={colorFor(sample.thickness)} opacity=".88" className="transition-all duration-300" />)}</g>
                <circle cx={160 - result!.focalX * DISPLAY_PX_PER_MM} cy={100 + result!.focalY * DISPLAY_PX_PER_MM} r="4" fill="white" stroke="#0891b2" strokeWidth="2" />
                <path d={path} fill="none" stroke="rgba(255,255,255,.72)" strokeWidth="1" />
                <line x1={160 - width / 2 * DISPLAY_PX_PER_MM} x2={160 + width / 2 * DISPLAY_PX_PER_MM} y1={100 + result!.focalY * DISPLAY_PX_PER_MM} y2={100 + result!.focalY * DISPLAY_PX_PER_MM} stroke="rgba(255,255,255,.6)" strokeDasharray="4 4" />
              </svg>
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-950/30 p-3">
              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Borda superior · espessura horizontal</p>
              <div className={isPhysicalScale ? 'overflow-x-auto' : ''}>
              <svg viewBox="0 0 320 100" style={physicalSvgStyle} className={`w-full transition-all duration-300 ${isDemoExpanded && !isPhysicalScale ? 'min-h-[190px]' : ''}`} role="img" aria-label="Representação superior preenchida da lente">
                <defs>
                  <linearGradient id="lens-side-volume" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#a5f3fc" stopOpacity=".92" />
                    <stop offset=".46" stopColor="#22d3ee" stopOpacity=".42" />
                    <stop offset="1" stopColor="#0e7490" stopOpacity=".88" />
                  </linearGradient>
                </defs>
                <line x1="18" x2="302" y1="50" y2="50" stroke="rgba(148,163,184,.35)" strokeDasharray="4 4" />
                <path d={topLensPath} fill="url(#lens-side-volume)" stroke="rgba(103,232,249,.95)" strokeWidth="2" />
                <path d={topSurfacePath} fill="none" stroke="rgba(255,255,255,.95)" strokeWidth="1.4" />
                <path d={topBackSurfacePath} fill="none" stroke="rgba(8,145,178,.95)" strokeWidth="1.2" />
                {topProfile && <>
                  <line x1={topProfile[0].x} x2={topProfile[0].x} y1={topProfile[0].front} y2={topProfile[0].back} stroke="rgba(255,255,255,.75)" strokeWidth="1.4" />
                  <line x1={topProfile[topProfile.length - 1].x} x2={topProfile[topProfile.length - 1].x} y1={topProfile[topProfile.length - 1].front} y2={topProfile[topProfile.length - 1].back} stroke="rgba(255,255,255,.75)" strokeWidth="1.4" />
                </>}
              </svg>
              </div>
              <p className="mt-2 text-xs text-slate-400">Corte próximo à borda superior. Linha clara: face frontal; linha azul: face traseira.</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-950/30 p-3">
              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Lateral externa · corte vertical</p>
              <div className={isPhysicalScale ? 'overflow-x-auto' : ''}>
              <svg viewBox="0 0 320 200" style={physicalSvgStyle} className={`mx-auto w-full transition-all duration-300 ${isPhysicalScale ? 'h-auto' : isDemoExpanded ? 'h-[280px]' : 'h-[154px]'}`} role="img" aria-label="Representação vertical da lateral externa da lente">
                <defs>
                  <linearGradient id="lens-external-volume" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stopColor="#0e7490" stopOpacity=".88" />
                    <stop offset=".5" stopColor="#22d3ee" stopOpacity=".42" />
                    <stop offset="1" stopColor="#a5f3fc" stopOpacity=".92" />
                  </linearGradient>
                </defs>
                <line x1="160" x2="160" y1="12" y2="188" stroke="rgba(148,163,184,.35)" strokeDasharray="4 4" />
                <path d={externalLensPath} fill="url(#lens-external-volume)" stroke="rgba(103,232,249,.95)" strokeWidth="2" />
                <path d={externalFrontSurfacePath} fill="none" stroke="rgba(255,255,255,.95)" strokeWidth="1.4" />
                <path d={externalBackSurfacePath} fill="none" stroke="rgba(8,145,178,.95)" strokeWidth="1.2" />
                {externalProfile && <>
                  <line x1={externalProfile[0].front} x2={externalProfile[0].back} y1={externalProfile[0].y} y2={externalProfile[0].y} stroke="rgba(255,255,255,.75)" strokeWidth="1.4" />
                  <line x1={externalProfile[externalProfile.length - 1].front} x2={externalProfile[externalProfile.length - 1].back} y1={externalProfile[externalProfile.length - 1].y} y2={externalProfile[externalProfile.length - 1].y} stroke="rgba(255,255,255,.75)" strokeWidth="1.4" />
                </>}
              </svg>
              </div>
              <p className="mt-2 text-xs text-slate-400">Corte vertical na lateral externa. Linha clara: face frontal; linha azul: face traseira.</p>
            </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-3 rounded-xl border border-white/10 bg-black/20 p-4 text-sm">
              <Metric label="Índice em teste" value={index.toFixed(2)} />
              <Metric label="Comparado ao 1.56" value={visualReduction === 0 ? 'Perfil de referência' : `${visualReduction}% menos volume`} />
              <Metric label="Maior volume" value={result!.isNegative ? 'Nas bordas' : 'No centro'} />
              <Metric label="Leitura" value="Comparativo visual" />
            </div>
            <div className="grid gap-3 rounded-xl border border-amber-300/20 bg-amber-300/5 p-4 text-sm">
              <Metric label="Tamanho simulado" value={`${width.toFixed(1)} × ${height.toFixed(1)} mm`} />
              <Metric label="Montagem" value={mountProfile.label} />
              <Metric label="DNP aplicada" value={dnp === null ? 'Não informada' : `${dnp.toFixed(1)} mm`} />
              <Metric label="Descentração" value={dnp === null ? 'Centralizada' : `${Math.abs(result!.focalX).toFixed(1)} mm`} />
              <p className="text-xs leading-5 text-amber-100/80">{mountProfile.description}. A DNP é comparada com A e ponte para deslocar o centro óptico.</p>
            </div>
            </div>
          </div>

          <div className="mt-4 grid gap-5 border-t border-white/10 pt-4 lg:grid-cols-4">
            <Control label="Índice" options={[1.56, 1.60, 1.67, 1.74]} value={index} onChange={setIndex} formatter={(value) => value.toFixed(2)} />
            <RangeControl label="Tamanho da armação" value={frameScale} min={80} max={125} onChange={setFrameScale} valueLabel={`${width.toFixed(0)} × ${height.toFixed(0)} mm`} hint="Menor deixa a borda mais próxima do ponto focal; maior amplia a espessura." />
            <RangeControl label="Ponte / DBL" value={bridge} min={14} max={24} onChange={setBridge} valueLabel={`${bridge.toFixed(0)} mm`} hint="Com A e DNP, define a descentração do centro óptico." />
            <RangeControl label="Ponto focal vertical" value={focalY} min={-8} max={8} step={0.5} onChange={setFocalY} valueLabel={focalY === 0 ? 'Centralizado' : focalY < 0 ? 'Mais alto' : 'Mais baixo'} hint="Desloque para ver como a borda superior e inferior passam a ter volumes diferentes." />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-300"><span className="mr-1 uppercase tracking-wider text-slate-500">Montagem</span>{(Object.keys(MOUNT_PROFILES) as MountType[]).map((option) => <button key={option} type="button" onClick={() => setMount(option)} className={`rounded-lg border px-3 py-2 transition-colors ${mount === option ? 'border-cyan-300/40 bg-cyan-400/15 text-cyan-100' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}>{MOUNT_PROFILES[option].label}</button>)}<span className="ml-3 mr-1 uppercase tracking-wider text-slate-500">Formato</span>{(['arredondada', 'quadrada'] as FrameShape[]).map((option) => <button key={option} type="button" onClick={() => setShape(option)} className={`rounded-lg border px-3 py-2 transition-colors ${shape === option ? 'border-cyan-300/40 bg-cyan-400/15 text-cyan-100' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}>{option === 'arredondada' ? 'Arredondada' : 'Quadrada'}</button>)}</div>
        </>
      )}
      </>}
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</p><p className="mt-1 font-black text-cyan-100">{value}</p></div>
}

function Control({ label, options, value, onChange, formatter }: { label: string; options: number[]; value: number; onChange: (value: number) => void; formatter: (value: number) => string }) {
  return <div><p className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</p><div className="flex flex-wrap gap-1.5">{options.map((option) => <button key={option} type="button" onClick={() => onChange(option)} className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-colors ${value === option ? 'border-cyan-300/40 bg-cyan-400/15 text-cyan-100' : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'}`}>{formatter(option)}</button>)}</div></div>
}

function RangeControl({ label, value, min, max, step = 1, onChange, valueLabel, hint }: { label: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void; valueLabel: string; hint: string }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</p>
        <span className="text-xs font-black text-cyan-100">{valueLabel}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-2 w-full cursor-pointer accent-cyan-300"
      />
      <p className="mt-2 text-xs leading-5 text-slate-400">{hint}</p>
    </div>
  )
}
