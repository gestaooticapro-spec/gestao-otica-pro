'use client'

export function DesktopModeButton({ storeId }: { storeId: string }) {
  return (
    <button
      onClick={() => {
        localStorage.setItem('forceDesktop', '1')
        window.location.href = `/dashboard/loja/${storeId}`
      }}
      className="text-sm text-slate-500 hover:text-slate-300 transition-colors mt-4"
    >
      ← Versão completa (desktop)
    </button>
  )
}
