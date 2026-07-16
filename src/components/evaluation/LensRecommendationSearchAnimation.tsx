'use client'

import { useEffect, useId, useMemo, useState } from 'react'
import { Sparkles } from 'lucide-react'
import type { LensGeometry } from '@/lib/actions/lens-geometry.actions'

type Point = { x: number; y: number }
type SearchField = { familyName: string; lineA: Point[]; lineB: Point[] }

const SEARCH_STEPS = [
  'Lendo seu padrão visual',
  'Comparando campos de visão',
  'Cruzando sua rotina e sua receita',
  'Preparando as melhores opções',
]

const SEARCH_TERMS = ['CAMPO AMPLO', 'CONFORTO', 'ADAPTAÇÃO', 'PRECISÃO', 'LEITURA', 'PROTEÇÃO']

const DEFAULT_RIM: Point[] = [
  { x: 0.06, y: 0.42 }, { x: 0.11, y: 0.18 }, { x: 0.30, y: 0.06 },
  { x: 0.58, y: 0.05 }, { x: 0.82, y: 0.16 }, { x: 0.95, y: 0.40 },
  { x: 0.90, y: 0.70 }, { x: 0.65, y: 0.88 }, { x: 0.33, y: 0.88 },
  { x: 0.12, y: 0.70 },
]

const FALLBACK_FIELDS: SearchField[] = [
  {
    familyName: 'Campo amplo',
    lineA: [{ x: 0.34, y: 0.04 }, { x: 0.45, y: 0.35 }, { x: 0.34, y: 0.94 }],
    lineB: [{ x: 0.66, y: 0.04 }, { x: 0.55, y: 0.35 }, { x: 0.66, y: 0.94 }],
  },
  {
    familyName: 'Campo equilibrado',
    lineA: [{ x: 0.42, y: 0.04 }, { x: 0.48, y: 0.44 }, { x: 0.40, y: 0.94 }],
    lineB: [{ x: 0.58, y: 0.04 }, { x: 0.52, y: 0.44 }, { x: 0.60, y: 0.94 }],
  },
]

function smoothClosedPath(points: Point[], width: number, height: number) {
  if (points.length < 3) return ''
  const absolute = points.map((point) => ({ x: point.x * width, y: point.y * height }))
  const last = absolute[absolute.length - 1]
  const first = absolute[0]
  const commands = [`M ${(last.x + first.x) / 2} ${(last.y + first.y) / 2}`]
  absolute.forEach((current, index) => {
    const next = absolute[(index + 1) % absolute.length]
    commands.push(`Q ${current.x} ${current.y} ${(current.x + next.x) / 2} ${(current.y + next.y) / 2}`)
  })
  commands.push('Z')
  return commands.join(' ')
}

function openPath(points: Point[], width: number, height: number) {
  if (points.length < 2) return ''
  const absolute = points.map((point) => ({ x: point.x * width, y: point.y * height }))
  const commands = [`M ${absolute[0].x} ${absolute[0].y}`]

  if (absolute.length === 2) {
    commands.push(`L ${absolute[1].x} ${absolute[1].y}`)
    return commands.join(' ')
  }

  commands.push(`L ${(absolute[0].x + absolute[1].x) / 2} ${(absolute[0].y + absolute[1].y) / 2}`)
  for (let index = 1; index < absolute.length - 1; index += 1) {
    const current = absolute[index]
    const next = absolute[index + 1]
    commands.push(`Q ${current.x} ${current.y} ${(current.x + next.x) / 2} ${(current.y + next.y) / 2}`)
  }
  commands.push(`L ${absolute[absolute.length - 1].x} ${absolute[absolute.length - 1].y}`)
  return commands.join(' ')
}

function fieldPath(lineA: Point[], lineB: Point[], width: number, height: number) {
  if (lineA.length < 2 || lineB.length < 2) return ''
  const points = [...lineA, ...[...lineB].reverse()]
  return `${openPath(points, width, height)} Z`
}

function normalizeRim(points: Point[] | undefined) {
  if (!points || points.length < 3) return DEFAULT_RIM
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const width = maxX - minX || 1
  const height = maxY - minY || 1
  return points.map((point) => ({
    x: 0.04 + ((point.x - minX) / width) * 0.92,
    y: 0.06 + ((point.y - minY) / height) * 0.88,
  }))
}

function normalizeLine(points: Point[] | undefined) {
  if (!points || points.length < 2) return []
  return points.map((point) => ({
    x: Math.max(0, Math.min(1, (point.x - 0.24) / 0.52)),
    y: Math.max(0, Math.min(1, (point.y - 0.22) / 0.46)),
  }))
}

export default function LensRecommendationSearchAnimation({ geometries = [] }: { geometries?: LensGeometry[] }) {
  const [activeStep, setActiveStep] = useState(0)
  const [activeFieldIndex, setActiveFieldIndex] = useState(0)
  const id = useId().replace(/:/g, '')

  const rim = useMemo(() => {
    const preferred = geometries.find((item) => item.family_name === 'Kodak Network UHD')
      ?? geometries.find((item) => item.pins?.lensRim && item.pins.lensRim.length >= 3)
    return normalizeRim(preferred?.pins?.lensRim)
  }, [geometries])

  const fields = useMemo(() => {
    const fromCatalog = geometries
      .filter((item) => item.pins?.lineA && item.pins.lineA.length >= 2 && item.pins?.lineB && item.pins.lineB.length >= 2)
      .map((item) => ({
        familyName: item.family_name,
        lineA: normalizeLine(item.pins?.lineA),
        lineB: normalizeLine(item.pins?.lineB),
      }))
    return fromCatalog.length > 0 ? fromCatalog : FALLBACK_FIELDS
  }, [geometries])

  useEffect(() => {
    const stepTimer = window.setInterval(() => {
      setActiveStep((current) => Math.min(current + 1, SEARCH_STEPS.length - 1))
    }, 2400)
    const fieldTimer = window.setInterval(() => {
      setActiveFieldIndex((current) => (current + 1) % Math.max(fields.length, 1))
    }, 150)
    return () => {
      window.clearInterval(stepTimer)
      window.clearInterval(fieldTimer)
    }
  }, [fields.length])

  const lensPath = smoothClosedPath(rim, 120, 78)
  const activeField = fields[activeFieldIndex % Math.max(fields.length, 1)]
  const activeLineA = openPath(activeField?.lineA ?? [], 120, 78)
  const activeLineB = openPath(activeField?.lineB ?? [], 120, 78)
  const activeArea = fieldPath(activeField?.lineA ?? [], activeField?.lineB ?? [], 120, 78)

  return (
    <div className="recommendation-search-screen fixed inset-0 z-[90] flex items-center justify-center overflow-hidden bg-slate-950 bg-[radial-gradient(circle_at_50%_18%,_rgba(34,211,238,0.20),_rgba(15,23,42,0.97)_48%,_rgba(2,6,23,1))] p-6 text-white">
      <div className="pointer-events-none absolute -left-24 top-10 h-80 w-80 rounded-full bg-cyan-300/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-10 h-96 w-96 rounded-full bg-fuchsia-400/10 blur-3xl" />
      <div className="relative w-full max-w-5xl rounded-[44px] border border-cyan-200/20 bg-slate-900/62 p-6 shadow-[0_40px_130px_rgba(2,6,23,0.75)] backdrop-blur-xl sm:p-10">
        <div className="text-center">
          <p className="text-[11px] font-black uppercase tracking-[0.34em] text-cyan-200">Buscando suas melhores lentes</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">Estamos cruzando seu jeito de olhar com a sua rotina.</h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-300 sm:text-xl">Aguarde enquanto comparamos campos de visão, conforto e adaptação.</p>
        </div>

        <div className="mt-8 grid gap-7 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-center">
          <div className="relative h-[310px] overflow-hidden rounded-[34px] border border-white/10 bg-slate-950/55 sm:h-[390px]">
            <svg className="absolute inset-0 h-full w-full drop-shadow-[0_0_28px_rgba(34,211,238,0.18)]" viewBox="0 0 300 130" aria-hidden="true">
              <defs>
                <clipPath id={`${id}-right`}><path d={lensPath} /></clipPath>
                <clipPath id={`${id}-left`}><path d={lensPath} transform="translate(120 0) scale(-1 1)" /></clipPath>
                <linearGradient id={`${id}-glass`} x1="0" x2="1" y1="0" y2="1">
                  <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.30" />
                  <stop offset="48%" stopColor="#d946ef" stopOpacity="0.14" />
                  <stop offset="100%" stopColor="#020617" stopOpacity="0.92" />
                </linearGradient>
              </defs>
              {[25, 155].map((offset, eyeIndex) => (
                <g key={offset} transform={`translate(${offset} 26)`}>
                  <path className="search-lens" d={lensPath} transform={eyeIndex === 1 ? 'translate(120 0) scale(-1 1)' : undefined} fill={`url(#${id}-glass)`} />
                  <g clipPath={`url(#${id}-${eyeIndex === 0 ? 'right' : 'left'})`}>
                    <rect className="search-grid" width="120" height="78" />
                    <line className="search-line search-line-a" x1="-18" y1="20" x2="138" y2="20" />
                    <line className="search-line search-line-b" x1="-18" y1="55" x2="138" y2="55" />
                    <line className="search-axis" x1="60" y1="-16" x2="60" y2="96" />
                    <g key={`${eyeIndex}-${activeFieldIndex}`} className="search-field" transform={eyeIndex === 1 ? 'translate(120 0) scale(-1 1)' : undefined}>
                      <path d={activeArea} className="search-field-area" />
                      <path d={activeLineA} className="search-field-line" />
                      <path d={activeLineB} className="search-field-line" />
                    </g>
                  </g>
                  <path className="search-edge" d={lensPath} transform={eyeIndex === 1 ? 'translate(120 0) scale(-1 1)' : undefined} />
                </g>
              ))}
              <g transform="translate(0 108)">
                {SEARCH_TERMS.map((term, index) => <text key={term} className="search-term" x="150" y="7" style={{ animationDelay: `${index * 0.42}s` }}>{term}</text>)}
              </g>
            </svg>
          </div>

          <div className="rounded-[30px] border border-fuchsia-300/15 bg-slate-950/48 p-6">
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-fuchsia-200"><Sparkles className="h-4 w-4" /> Análise em andamento</p>
            <div className="mt-6 space-y-5">
              {SEARCH_STEPS.map((step, index) => (
                <div key={step} className={`flex items-center gap-3 text-base font-bold transition-colors ${index < activeStep ? 'text-cyan-200' : index === activeStep ? 'text-white' : 'text-slate-500'}`}>
                  <span className={`h-3 w-3 shrink-0 rounded-full ${index < activeStep ? 'bg-cyan-300 shadow-[0_0_14px_rgba(34,211,238,0.75)]' : index === activeStep ? 'animate-pulse bg-fuchsia-300 shadow-[0_0_18px_rgba(217,70,239,0.9)]' : 'bg-slate-700'}`} />
                  {step}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .recommendation-search-screen { animation: recommendation-screen-in 720ms cubic-bezier(.16,1,.3,1) both; }
        .search-edge { fill: none; stroke: rgba(125,211,252,.68); stroke-width: 1.8; vector-effect: non-scaling-stroke; filter: drop-shadow(0 0 8px rgba(34,211,238,.52)); }
        .search-grid { fill: rgba(15,23,42,.25); stroke: rgba(34,211,238,.18); stroke-width: 8; stroke-dasharray: 1 10; animation: grid-rush .55s linear infinite; }
        .search-line { stroke: rgba(34,211,238,.92); stroke-width: 1.4; filter: drop-shadow(0 0 5px rgba(34,211,238,.85)); transform-box: fill-box; transform-origin: center; }
        .search-line-a { animation: scan-fast .62s ease-in-out infinite; }
        .search-line-b { animation: scan-fast .48s ease-in-out infinite reverse; }
        .search-axis { stroke: rgba(217,70,239,.92); stroke-width: 1.35; filter: drop-shadow(0 0 5px rgba(217,70,239,.85)); transform-box: fill-box; transform-origin: center; animation: axis-sweep .86s ease-in-out infinite; }
        .search-field { animation: field-read 150ms ease-out; }
        .search-field-area { fill: rgba(34,211,238,.10); stroke: rgba(251,191,36,.28); stroke-width: .8; }
        .search-field-line { fill: none; stroke: rgba(251,191,36,.88); stroke-width: 1.45; stroke-linecap: round; stroke-linejoin: round; filter: drop-shadow(0 0 5px rgba(251,191,36,.7)); }
        .search-term { fill: rgba(226,232,240,.88); font-size: 9px; font-weight: 900; letter-spacing: .16em; text-anchor: middle; dominant-baseline: middle; opacity: 0; transform-box: fill-box; transform-origin: center; animation: term-turn 2.52s linear infinite; }
        @keyframes grid-rush { to { stroke-dashoffset: 22; } }
        @keyframes scan-fast { 0% { transform: translateY(-32px) rotate(-10deg); opacity: 0; } 20% { opacity: 1; } 100% { transform: translateY(42px) rotate(13deg); opacity: 0; } }
        @keyframes axis-sweep { 0%,100% { transform: rotate(-52deg); opacity: .15; } 45% { transform: rotate(6deg); opacity: 1; } 70% { transform: rotate(58deg); opacity: .65; } }
        @keyframes field-read { from { opacity: .1; transform: scale(.985); } to { opacity: 1; transform: scale(1); } }
        @keyframes term-turn { 0% { opacity: 0; transform: translateY(12px) scaleY(.55); } 17% { opacity: 1; transform: translateY(0) scaleY(1); } 38%,100% { opacity: 0; transform: translateY(-12px) scaleY(.55); } }
        @keyframes recommendation-screen-in {
          from { opacity: 0; transform: scale(1.025); filter: blur(10px); }
          to { opacity: 1; transform: scale(1); filter: blur(0); }
        }
        @media (prefers-reduced-motion: reduce) { .search-grid,.search-line,.search-axis,.search-field,.search-term { animation-duration: 2.4s; } }
      `}</style>
    </div>
  )
}
