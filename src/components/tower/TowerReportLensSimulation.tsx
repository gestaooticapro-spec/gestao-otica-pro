'use client'

import { useState } from 'react'

export type TowerReportLensGeometry = {
  contour: Array<{ x: number; y: number }>
  rim: Array<{ x: number; y: number; thickness: number }>
}

export function TowerReportLensSimulation({
  minimumThicknessMm,
  maximumThicknessMm,
  widthMm,
  heightMm,
  geometry,
}: {
  minimumThicknessMm: number
  maximumThicknessMm: number
  widthMm: number
  heightMm: number
  geometry?: TowerReportLensGeometry | null
}) {
  const [rotation, setRotation] = useState(0)
  const points = geometry?.contour ?? []
  const rim = geometry?.rim ?? []
  const hasGeometry = points.length >= 3 && rim.length >= 3
  const minX = hasGeometry ? Math.min(...points.map((point) => point.x)) : -widthMm / 2
  const maxX = hasGeometry ? Math.max(...points.map((point) => point.x)) : widthMm / 2
  const minY = hasGeometry ? Math.min(...points.map((point) => point.y)) : -heightMm / 2
  const maxY = hasGeometry ? Math.max(...points.map((point) => point.y)) : heightMm / 2
  const scale = Math.min(220 / Math.max(maxX - minX, 1), 115 / Math.max(maxY - minY, 1))
  const toCanvas = (point: { x: number; y: number }) => ({
    x: 130 + (point.x - (minX + maxX) / 2) * scale,
    y: 72 + (point.y - (minY + maxY) / 2) * scale,
  })
  const path = hasGeometry
    ? `${points.map((point, index) => `${index ? 'L' : 'M'} ${toCanvas(point).x.toFixed(1)} ${toCanvas(point).y.toFixed(1)}`).join(' ')} Z`
    : ''
  const color = (thickness: number) => {
    const ratio = Math.max(0, Math.min(1, (thickness - minimumThicknessMm) / Math.max(maximumThicknessMm - minimumThicknessMm, .001)))
    return `hsl(${190 - ratio * 155} 90% 50%)`
  }
  return (
    <div className="mt-4 rounded-2xl border border-violet-100 bg-violet-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-violet-700">{hasGeometry ? 'Lente calculada' : 'Registro antigo · contorno aproximado'}</p>
          <p className="mt-1 text-xs leading-5 text-slate-600">{hasGeometry ? 'A forma e as cores representam o contorno escolhido e a variação da borda.' : 'Este atendimento não guardou a distribuição detalhada da borda.'}</p>
        </div>
        <button type="button" onClick={() => setRotation(0)} className="rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-black text-violet-800">0°</button>
      </div>
      <svg viewBox="0 0 260 145" className="mx-auto mt-3 block w-full max-w-sm" aria-label="Espessura calculada da lente">
        <g transform={`rotate(${rotation} 130 72)`}>
          {hasGeometry ? <><path d={path} fill="#ede9fe" stroke="#6d28d9" strokeWidth="1.5" />{rim.map((point, index) => { const next = rim[(index + 1) % rim.length]; const start = toCanvas(point); const end = toCanvas(next); return <line key={index} x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke={color(point.thickness)} strokeWidth={Math.max(2.5, point.thickness * 2.2)} strokeLinecap="round" /> })}</> : <ellipse cx="130" cy="72" rx={Math.max(35, widthMm * 1.05)} ry={Math.max(25, heightMm * 1.05)} fill="#eef2ff" stroke="#6d28d9" strokeWidth="2" />}
        </g>
        <text x="130" y="137" textAnchor="middle" fill="#5b21b6" fontSize="10">Borda: {minimumThicknessMm.toFixed(2)} a {maximumThicknessMm.toFixed(2)} mm</text>
      </svg>
      <label className="mt-2 block text-xs font-bold text-slate-600">Girar: {rotation}°<input aria-label="Girar simulação da lente" className="mt-2 block w-full accent-violet-700" type="range" min="0" max="360" value={rotation} onChange={(event) => setRotation(Number(event.target.value))} /></label>
      <p className="mt-3 text-xs leading-5 text-slate-500">Representação calculada para apoio ao atendimento; a espessura final pode variar na fabricação.</p>
    </div>
  )
}
