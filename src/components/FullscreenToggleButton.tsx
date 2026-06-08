'use client'

import { useEffect, useState } from 'react'
import { Maximize2, Minimize2 } from 'lucide-react'

type FullscreenToggleButtonProps = {
  className?: string
}

export default function FullscreenToggleButton({
  className = '',
}: FullscreenToggleButtonProps) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isSupported, setIsSupported] = useState(false)
  const positionClass = className.trim() || 'right-4 top-4'

  useEffect(() => {
    const supported =
      typeof document !== 'undefined' &&
      typeof document.documentElement.requestFullscreen === 'function'

    setIsSupported(supported)

    if (!supported) return

    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }

    handleFullscreenChange()
    document.addEventListener('fullscreenchange', handleFullscreenChange)

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
  }, [])

  if (!isSupported) return null

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
        return
      }

      await document.documentElement.requestFullscreen()
    } catch {
      // Alguns navegadores recusam fullscreen fora de um gesto valido.
    }
  }

  return (
    <button
      type="button"
      onClick={toggleFullscreen}
      aria-label={isFullscreen ? 'Sair da tela cheia' : 'Entrar em tela cheia'}
      title={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
      className={`fixed ${positionClass} z-[80] flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-slate-950/70 text-white/70 shadow-xl backdrop-blur-md transition-all hover:border-white/20 hover:bg-slate-900/85 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/70`}
    >
      {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
    </button>
  )
}
