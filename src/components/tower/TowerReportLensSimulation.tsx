'use client'

import { useState } from 'react'

type Props = {
  frameWidthMm: number
  frameHeightMm: number
  minimumThicknessMm: number
  maximumThicknessMm: number
}

export default function TowerReportLensSimulation({ frameWidthMm, frameHeightMm, minimumThicknessMm, maximumThicknessMm }: Props) {
  const [rotation, setRotation] = useState(0)
  const width = Math.max(80, Math.min(210, frameWidthMm * 3.4))
  const height = Math.max(55, Math.min(155, frameHeightMm * 3.4))
  const thickness = minimumThicknessMm + ((Math.sin(rotation * Math.PI / 180) + 1) / 2) * (maximumThicknessMm - minimumThicknessMm)
  return <div className="mt-4 rounded-2xl border border-violet-100 bg-violet-50 p-4"><div className="flex items-center justify-between gap-3"><p className="text-xs font-black uppercase tracking-wide text-violet-800">Simulação da lente</p><span className="text-xs font-bold text-violet-700">Giro {rotation}°</span></div><svg viewBox="0 0 260 180" className="mx-auto h-40 w-full max-w-[260px]" aria-label="Simulação da lente"><g transform={`rotate(${rotation} 130 85)`}><ellipse cx="130" cy="85" rx={width / 2} ry={height / 2} fill="rgba(124,58,237,.20)" stroke="#7c3aed" strokeWidth="3" /><ellipse cx="130" cy="85" rx={Math.max(8, width / 2 - thickness * 4)} ry={Math.max(8, height / 2 - thickness * 3)} fill="rgba(255,255,255,.88)" /></g><text x="130" y="170" textAnchor="middle" fill="#5b21b6" fontSize="12">Espessura simulada: {thickness.toFixed(2)} mm</text></svg><div className="mt-2 flex items-center gap-3"><input aria-label="Girar lente" type="range" min="0" max="360" value={rotation} onChange={(event) => setRotation(Number(event.target.value))} className="flex-1 accent-violet-700" /><button type="button" onClick={() => setRotation(0)} className="rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-xs font-black text-violet-800">0°</button></div><p className="mt-2 text-xs leading-5 text-violet-900">Simulação calculada a partir dos dados informados. A espessura final pode variar na fabricação.</p></div>
}
