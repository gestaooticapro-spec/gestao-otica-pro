'use client'

import { useState } from 'react'
import { X } from 'lucide-react'

export function LabPhotoViewer({ url }: { url: string }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="block w-full rounded-2xl overflow-hidden border border-white/10 bg-black"
        aria-label="Ampliar foto"
      >
        <img src={url} alt="Foto das medidas" className="w-full h-auto" />
      </button>
      <p className="text-center text-xs text-slate-500 mt-2">Toque na foto para ampliar</p>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black flex items-center justify-center"
          onClick={() => setOpen(false)}
        >
          <button
            onClick={() => setOpen(false)}
            className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 text-white"
            aria-label="Fechar"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={url}
            alt="Foto das medidas"
            className="w-full h-full object-contain"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}
