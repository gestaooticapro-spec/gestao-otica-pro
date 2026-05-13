'use client'

export function DesktopModeButton({ storeId }: { storeId: string }) {
  return (
    <button
      onClick={() => {
        // Mantem modo desktop apenas na sessao atual do navegador.
        sessionStorage.setItem('forceDesktop', '1')
        localStorage.removeItem('forceDesktop')
        window.location.href = `/dashboard/loja/${storeId}`
      }}
      className="text-sm text-slate-400 hover:text-slate-200 transition-colors mt-4"
    >
      {'<-'} Versao completa (desktop)
    </button>
  )
}
