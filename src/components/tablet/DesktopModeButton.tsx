'use client'

export function DesktopModeButton({ storeId }: { storeId: string }) {
  return (
    <button
      onClick={() => {
        localStorage.setItem('forceDesktop', '1')
        window.location.href = `/dashboard/loja/${storeId}`
      }}
      className="text-sm text-slate-400 hover:text-slate-200 transition-colors mt-4"
    >
      {'<-'} Versao completa (desktop)
    </button>
  )
}
