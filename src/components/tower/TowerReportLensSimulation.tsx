'use client'

import { useState } from 'react'

export type TowerReportLensGeometry = {
  contour?: Array<{ x: number; y: number }>
  rim: Array<{ x: number; y: number; thickness: number }>
}

// O relatório do cliente não redesenha a lente pela frente. Ele usa a mesma
// distribuição de espessura persistida no atendimento e mostra, em perfil,
// qual borda está selecionada pelo giro.
export function TowerReportLensSimulation({
  minimumThicknessMm,
  maximumThicknessMm,
  geometry,
}: {
  minimumThicknessMm: number
  maximumThicknessMm: number
  geometry?: TowerReportLensGeometry | null
}) {
  const [rotation, setRotation] = useState(0)
  const rim = geometry?.rim ?? []
  const hasGeometry = rim.length >= 3
  const sampleCount = 32
  const thicknessRange = Math.max(maximumThicknessMm - minimumThicknessMm, .001)

  const edgeThicknesses = Array.from({ length: sampleCount }, (_, index) => {
    if (!hasGeometry) return minimumThicknessMm + (thicknessRange * index) / (sampleCount - 1)
    const position = ((rotation / 360) * rim.length + (index / (sampleCount - 1)) * (rim.length - 1)) % rim.length
    const lower = Math.floor(position)
    const upper = (lower + 1) % rim.length
    const fraction = position - lower
    return rim[lower].thickness + (rim[upper].thickness - rim[lower].thickness) * fraction
  })
  const thicknessPixels = edgeThicknesses.map((thickness) => 10 + ((thickness - minimumThicknessMm) / thicknessRange) * 34)
  const xFor = (index: number) => 20 + (index / (sampleCount - 1)) * 220
  const top = thicknessPixels.map((thickness, index) => `${index ? 'L' : 'M'} ${xFor(index).toFixed(1)} ${(72 - thickness / 2).toFixed(1)}`).join(' ')
  const bottom = thicknessPixels.map((_, index) => {
    const reverse = sampleCount - 1 - index
    return `L ${xFor(reverse).toFixed(1)} ${(72 + thicknessPixels[reverse] / 2).toFixed(1)}`
  }).join(' ')
  const profile = `${top} ${bottom} Z`

  return (
    <div className="mt-4 rounded-2xl border border-violet-100 bg-violet-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-violet-700">{hasGeometry ? 'Perfil lateral da lente' : 'Registro antigo · borda aproximada'}</p>
          <p className="mt-1 text-xs leading-5 text-slate-600">{hasGeometry ? 'O giro percorre as bordas calculadas para a sua lente.' : 'Este atendimento não guardou a distribuição detalhada da borda.'}</p>
        </div>
        <button type="button" onClick={() => setRotation(0)} className="rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-black text-violet-800">0°</button>
      </div>
      <svg viewBox="0 0 260 145" className="mx-auto mt-3 block w-full max-w-sm" aria-label="Perfil lateral da lente com espessura calculada">
        <defs><filter id="customer-lens-edge-glow"><feGaussianBlur stdDeviation="2" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
        <path d={profile} fill="rgba(34,211,238,.28)" stroke="#a5f3fc" strokeWidth="1.5" />
        <path d={top} fill="none" stroke="#facc15" strokeWidth="3" strokeLinecap="round" filter="url(#customer-lens-edge-glow)" />
        <path d={bottom} fill="none" stroke="#22d3ee" strokeWidth="2" strokeLinecap="round" />
        <text x="130" y="137" textAnchor="middle" fill="#5b21b6" fontSize="10">Borda: {minimumThicknessMm.toFixed(2)} a {maximumThicknessMm.toFixed(2)} mm</text>
      </svg>
      <label className="mt-2 block text-xs font-bold text-slate-600">Girar a borda: {rotation}°<input aria-label="Girar borda calculada da lente" className="mt-2 block w-full accent-violet-700" type="range" min="0" max="360" value={rotation} onChange={(event) => setRotation(Number(event.target.value))} /></label>
      <p className="mt-3 text-xs leading-5 text-slate-500">Representação calculada a partir da receita, índice, armação e centro óptico registrados. A espessura final pode variar na fabricação.</p>
    </div>
  )
}
