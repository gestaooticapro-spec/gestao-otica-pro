import { MonitorCheck } from 'lucide-react'

export default function TowerCustomerDisplayDiagnosticPage() {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center overflow-hidden bg-slate-950 p-8 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(34,211,238,.18),transparent_38%),radial-gradient(circle_at_bottom,rgba(168,85,247,.14),transparent_42%)]" />
      <section className="relative w-full max-w-xl text-center">
        <div className="mx-auto grid h-24 w-24 place-items-center rounded-[2rem] border border-cyan-300/25 bg-cyan-300/10 text-cyan-200"><MonitorCheck className="h-12 w-12" /></div>
        <p className="mt-10 text-xs font-black uppercase tracking-[0.3em] text-cyan-300">Gestão Ótica · Torre</p>
        <h1 className="mt-4 text-5xl font-black leading-tight">Tela do cliente conectada</h1>
        <p className="mx-auto mt-6 max-w-md text-lg leading-8 text-slate-300">Esta tela deve estar em orientação retrato e visível para o cliente, sem menus administrativos.</p>
        <div className="mx-auto mt-10 grid max-w-sm grid-cols-3 gap-3"><div className="h-28 rounded-2xl bg-cyan-300" /><div className="h-28 rounded-2xl bg-violet-400" /><div className="h-28 rounded-2xl bg-amber-300" /></div>
        <p className="mt-8 text-sm font-bold text-slate-500">Confirme cores, enquadramento, orientação e ausência de cortes.</p>
      </section>
    </main>
  )
}
