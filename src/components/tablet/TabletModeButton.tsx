'use client'

export function TabletModeButton({ storeId }: { storeId: number }) {
  const show =
    typeof window !== 'undefined' &&
    localStorage.getItem('forceDesktop') === '1' &&
    navigator.maxTouchPoints > 1 &&
    window.screen.width <= 1366

  if (!show) return null

  return (
    <button
      onClick={() => {
        localStorage.removeItem('forceDesktop')
        window.location.href = `/tablet/${storeId}`
      }}
      className="fixed bottom-4 right-4 z-[60] rounded-xl border border-cyan-300/40 bg-slate-900/85 px-4 py-2 text-xs font-bold uppercase tracking-wider text-cyan-100 shadow-xl backdrop-blur-md hover:bg-slate-800/90 transition-colors"
    >
      Voltar para menu tablet
    </button>
  )
}
