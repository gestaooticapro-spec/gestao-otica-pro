'use client'

import { useEffect, useState } from 'react'
import { Maximize2, Minimize2 } from 'lucide-react'

type FullscreenToggleButtonProps = {
  className?: string
  variant?: 'floating' | 'inline'
}

export default function FullscreenToggleButton({
  className = '',
  variant = 'floating',
}: FullscreenToggleButtonProps) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [mounted, setMounted] = useState(false)

  const customClass = className.trim()
  const isSupported =
    typeof document !== 'undefined' &&
    typeof document.documentElement.requestFullscreen === 'function'

  useEffect(() => {
    setMounted(true)
    if (!isSupported) return

    setIsFullscreen(Boolean(document.fullscreenElement))

    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
  }, [isSupported])

  if (!mounted || !isSupported) return null

  const baseClass =
    'p-2 flex items-center justify-center rounded-full bg-black/20 hover:bg-black/40 text-white/50 hover:text-white border border-white/5 hover:border-white/20 transition-all backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/70'
  const variantClass =
    variant === 'inline'
      ? customClass || 'relative z-10 flex-shrink-0'
      : `fixed ${customClass || 'right-4 top-4'} z-[80]`

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
      className={`${baseClass} ${variantClass}`}
    >
      {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
    </button>
  )
}
