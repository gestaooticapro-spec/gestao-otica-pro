'use client'

import { Printer } from 'lucide-react'

interface PrintProtocoloBtnProps {
  osId: number | undefined
  disabled?: boolean
}

export function PrintProtocoloButton({ osId, disabled }: PrintProtocoloBtnProps) {
  
  const handlePrint = () => {
    if (!osId) return

    // Abre a página de impressão que criamos (Passo 2) em uma nova janela popup
    const url = `/print/os/${osId}`
    const width = 900
    const height = 800
    const left = (window.screen.width - width) / 2
    const top = (window.screen.height - height) / 2

    window.open(
      url, 
      'PrintWindow', 
      `width=${width},height=${height},top=${top},left=${left},scrollbars=yes,resizable=yes`
    )
  }

  return (
    <button
      type="button"
      onClick={handlePrint}
      disabled={disabled || !osId}
      className="bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold px-3 py-1.5 rounded shadow-sm flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      title="Imprimir Protocolo"
    >
      <Printer className="h-4 w-4" /> 
      <span className="hidden sm:inline">IMPRIMIR</span>
    </button>
  )
}