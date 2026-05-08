'use client'

import { useState, useRef, useEffect } from 'react'
import { clearFotoMedicao } from '@/lib/actions/medidas.actions'

export function OSPhotoViewer({ url, osId, onDelete }: { url: string; osId?: number; onDelete?: () => void }) {
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      setScale(prev => {
        const next = Math.min(6, Math.max(1, prev - e.deltaY * 0.003))
        if (next <= 1) setOffset({ x: 0, y: 0 })
        return next
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale <= 1) return
    e.preventDefault()
    setDragging(true)
    dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return
    setOffset({
      x: dragStart.current.ox + e.clientX - dragStart.current.x,
      y: dragStart.current.oy + e.clientY - dragStart.current.y,
    })
  }

  const reset = () => { setScale(1); setOffset({ x: 0, y: 0 }) }

  const [deleting, setDeleting] = useState(false)
  const handleDelete = async () => {
    if (!confirm('Apagar a foto de medição?')) return
    setDeleting(true)
    if (osId) await clearFotoMedicao(osId)
    onDelete?.()
    setDeleting(false)
  }

  return (
    <div
      ref={containerRef}
      className="relative col-span-2 rounded overflow-hidden border border-white/10 bg-black select-none"
      style={{ height: '22rem' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={() => setDragging(false)}
      onMouseLeave={() => setDragging(false)}
      onDoubleClick={reset}
    >
      <img
        src={url}
        alt="Foto medição"
        draggable={false}
        className="w-full h-full object-contain pointer-events-none"
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          transformOrigin: 'center',
          cursor: dragging ? 'grabbing' : scale > 1 ? 'grab' : 'zoom-in',
        }}
      />
      <div className="absolute top-2 right-2 flex gap-1">
        {scale > 1 && (
          <button
            type="button"
            onClick={reset}
            className="text-[10px] bg-black/70 text-white px-2 py-1 rounded-lg border border-white/20 hover:bg-white/20 transition-colors"
          >
            Resetar
          </button>
        )}
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="text-[10px] bg-red-900/80 text-red-300 px-2 py-1 rounded-lg border border-red-500/30 hover:bg-red-800/80 transition-colors disabled:opacity-50"
        >
          {deleting ? 'Apagando...' : 'Apagar'}
        </button>
      </div>
      <p className="absolute bottom-2 left-0 right-0 text-center text-[10px] text-slate-600 pointer-events-none">
        Roda do mouse para ampliar · duplo clique para resetar
      </p>
    </div>
  )
}
