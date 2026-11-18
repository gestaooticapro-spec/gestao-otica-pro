'use client'

import { useEffect, useState } from 'react'
import { Download, Share2 } from 'lucide-react'

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
}

export default function InstallAppButton() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null)
  const [isAppleMobile, setIsAppleMobile] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)
  const [showInstructions, setShowInstructions] = useState(false)

  useEffect(() => {
    const displayModes = ['standalone', 'fullscreen', 'minimal-ui'].map(mode =>
      window.matchMedia(`(display-mode: ${mode})`)
    )
    const updateInstalled = () => {
      const appleNavigator = navigator as Navigator & { standalone?: boolean }
      setIsInstalled(appleNavigator.standalone === true || displayModes.some(mode => mode.matches))
    }
    const handlePrompt = (event: Event) => {
      event.preventDefault()
      setPrompt(event as InstallPromptEvent)
    }
    const handleInstalled = () => {
      setPrompt(null)
      setIsInstalled(true)
      setShowInstructions(false)
    }

    setIsAppleMobile(/iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))
    updateInstalled()
    displayModes.forEach(mode => mode.addEventListener('change', updateInstalled))
    window.addEventListener('beforeinstallprompt', handlePrompt)
    window.addEventListener('appinstalled', handleInstalled)
    return () => {
      displayModes.forEach(mode => mode.removeEventListener('change', updateInstalled))
      window.removeEventListener('beforeinstallprompt', handlePrompt)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  if (isInstalled || (!prompt && !isAppleMobile && !showInstructions)) return null

  const handleInstall = async () => {
    if (!prompt) {
      setShowInstructions(visible => !visible)
      return
    }
    const currentPrompt = prompt
    setPrompt(null)
    try {
      await currentPrompt.prompt()
    } catch {
      setShowInstructions(true)
    }
  }

  return (
    <div className="mt-5 text-center">
      <button
        type="button"
        onClick={handleInstall}
        aria-expanded={showInstructions}
        className="inline-flex items-center justify-center gap-2 rounded-lg border border-cyan-300/30 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-100 transition-colors hover:border-cyan-300/60 hover:bg-cyan-500/20 focus:outline-none focus:ring-2 focus:ring-cyan-400"
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        Instalar MB Optical
      </button>
      {showInstructions && (
        <p role="status" className="mx-auto mt-3 max-w-xs text-xs leading-relaxed text-gray-200">
          {isAppleMobile ? (
            <>No navegador, toque em <Share2 className="inline h-4 w-4 align-text-bottom" aria-label="Compartilhar" /> <strong>Compartilhar</strong> e depois em <strong>Adicionar à Tela de Início</strong>.</>
          ) : (
            <>Use a opção de instalar aplicativo no menu ou na barra de endereço do navegador.</>
          )}
        </p>
      )}
    </div>
  )
}
