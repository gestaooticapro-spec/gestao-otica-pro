'use client'

import { useState } from 'react'

export function TowerReportLensSimulation({
  minimumThicknessMm,
  maximumThicknessMm,
  widthMm,
  heightMm,
}: {
  minimumThicknessMm: number
  maximumThicknessMm: number
  widthMm: number
  heightMm: number
}) {
  const [rotation, setRotation] = useState(0)
  const thickness = Math.max(maximumThicknessMm - minimumThicknessMm, 0.2)
  const depth = Math.min(18, 3 + thickness * 2.1)
  return (
    <div className="mt-4 rounded-2xl border border-violet-100 bg-violet-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-violet-700">Simulação visual</p>
          <p className="mt-1 text-xs leading-5 text-slate-600">Estimativa baseada nos parâmetros salvos; não substitui a lente física.</p>
        </div>
        <button type="button" onClick={() => setRotation(0)} className="rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-black text-violet-800">0°</button>
      </div>
      <svg viewBox="0 0 260 145" className="mx-auto mt-3 block w-full max-w-sm" aria-label="Simulação da espessura da lente">
        <g transform={`rotate(${rotation} 130 73)`}>
          <ellipse cx={130 + depth} cy="73" rx={Math.max(35, widthMm * 1.05)} ry={Math.max(25, heightMm * 1.05)} fill="#7c3aed" opacity="0.18" />
          <ellipse cx="130" cy="73" rx={Math.max(35, widthMm * 1.05)} ry={Math.max(25, heightMm * 1.05)} fill="#eef2ff" stroke="#6d28d9" strokeWidth="2" />
          <path d={`M ${130 - Math.max(35, widthMm * 1.05)} 73 C 90 40, 170 40, ${130 + Math.max(35, widthMm * 1.05)} 73`} fill="none" stroke="#c4b5fd" strokeWidth="4" opacity="0.75" />
        </g>
      </svg>
      <label className="mt-2 block text-xs font-bold text-slate-600">Girar: {rotation}°<input aria-label="Girar simulação da lente" className="mt-2 block w-full accent-violet-700" type="range" min="0" max="360" value={rotation} onChange={(event) => setRotation(Number(event.target.value))} /></label>
    </div>
  )
}
