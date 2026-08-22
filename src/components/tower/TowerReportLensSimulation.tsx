'use client'

import { useMemo, useState } from 'react'
import { LensPhysicalView, type LensPhysicalPoint } from './LensPhysicalView'

export type TowerReportLensGeometry = {
  contour?: Array<{ x: number; y: number }>
  rim: Array<{ x: number; y: number; thickness: number; displayFrontSag: number }>
}

type Props = {
  minimumThicknessMm: number
  maximumThicknessMm: number
  geometry?: TowerReportLensGeometry | null
  widthMm?: number
  heightMm?: number
  focalX?: number
  focalY?: number
  savedRotation?: number
  index?: number
}

function finiteOr(value: number | undefined, fallback: number) {
  return Number.isFinite(value) ? Number(value) : fallback
}

/**
 * Relatório público: usa a mesma malha física (vista de borda) que o
 * relatório da loja. Não redesenha uma aproximação frontal da lente.
 */
export function TowerReportLensSimulation({
  minimumThicknessMm,
  maximumThicknessMm,
  geometry,
  widthMm,
  heightMm,
  focalX,
  focalY,
  savedRotation,
  index,
}: Props) {
  const [rotation, setRotation] = useState(0)
  const rim = geometry?.rim ?? []
  const hasGeometry = rim.length >= 3

  const physical = useMemo(() => {
    if (!hasGeometry) return null
    const minX = Math.min(...rim.map((point) => point.x))
    const maxX = Math.max(...rim.map((point) => point.x))
    const minY = Math.min(...rim.map((point) => point.y))
    const maxY = Math.max(...rim.map((point) => point.y))
    const centerX = finiteOr(focalX, (minX + maxX) / 2)
    const centerY = finiteOr(focalY, (minY + maxY) / 2)
    const originalRotation = finiteOr(savedRotation, 0)
    const delta = ((rotation - originalRotation) * Math.PI) / 180
    const cos = Math.cos(delta)
    const sin = Math.sin(delta)

    const rotatedRim: LensPhysicalPoint[] = rim.map((point) => ({
      ...point,
      x: centerX + (point.x - centerX) * cos - (point.y - centerY) * sin,
      y: centerY + (point.x - centerX) * sin + (point.y - centerY) * cos,
      withinLens: true,
    }))

    return {
      rim: rotatedRim,
      widthMm: finiteOr(widthMm, Math.max(maxX - minX, 1)),
      heightMm: finiteOr(heightMm, Math.max(maxY - minY, 1)),
      focalX: centerX,
      focalY: centerY,
      index: finiteOr(index, 1.5),
    }
  }, [focalX, focalY, hasGeometry, heightMm, index, rim, rotation, savedRotation, widthMm])

  return (
    <div className="mt-4 rounded-2xl border border-violet-100 bg-violet-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-violet-700">
            {physical ? 'Perfil lateral da lente' : 'Geometria da borda indisponível'}
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            {physical
              ? 'A mesma representação física usada pela ótica. O giro percorre a borda calculada.'
              : 'Este atendimento não guardou os pontos necessários para mostrar a borda em perfil.'}
          </p>
        </div>
        {physical && <button type="button" onClick={() => setRotation(0)} className="rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-black text-violet-800">0°</button>}
      </div>

      {physical && <div className="mt-3 h-56 min-h-56 overflow-hidden rounded-xl bg-slate-950">
        <LensPhysicalView
          rim={physical.rim}
          samples={physical.rim}
          widthMm={physical.widthMm}
          heightMm={physical.heightMm}
          focalX={physical.focalX}
          focalY={physical.focalY}
          index={physical.index}
          calibrationScale={100}
          showCalibrator={false}
          view="edge"
        />
      </div>}

      <p className="mt-3 text-center text-sm font-bold text-violet-800">Borda: {minimumThicknessMm.toFixed(2)} a {maximumThicknessMm.toFixed(2)} mm</p>
      {physical && <label className="mt-3 block text-xs font-bold text-slate-600">Girar a borda: {rotation}°
        <input aria-label="Girar borda calculada da lente" className="mt-2 block w-full accent-violet-700" type="range" min="0" max="360" value={rotation} onChange={(event) => setRotation(Number(event.target.value))} />
      </label>}
      <p className="mt-3 text-xs leading-5 text-slate-500">Representação calculada a partir da receita, índice, armação e centro óptico registrados. A espessura final pode variar na fabricação.</p>
    </div>
  )
}
