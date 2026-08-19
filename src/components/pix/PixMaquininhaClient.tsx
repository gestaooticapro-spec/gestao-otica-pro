'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'
import { ArrowLeft, CheckCircle2, Clock3, Maximize2, QrCode, Smartphone } from 'lucide-react'

type DisplayCharge = {
  kind: 'sale' | 'installment'
  id: number
  vendaId: number | null
  installmentId: number | null
  amount: number
  pixCopyPaste: string | null
  status: string
  expiresAt: string | null
}

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function PixMaquininhaClient({ storeId, storeName }: { storeId: number; storeName: string }) {
  const router = useRouter()
  const [charge, setCharge] = useState<DisplayCharge | null>(null)
  const [lastChargeKey, setLastChargeKey] = useState<string | null>(null)
  const [paidNotice, setPaidNotice] = useState(false)

  useEffect(() => {
    let active = true
    const read = async () => {
      try {
        const response = await fetch(`/api/store/${storeId}/pix-display`, { cache: 'no-store' })
        if (!response.ok) return
        const body = await response.json() as { charge: DisplayCharge | null }
        if (!active) return
        const next = body.charge
        if (next) {
          const key = `${next.kind}:${next.id}`
          if (lastChargeKey && key === lastChargeKey && charge && !next.pixCopyPaste && charge.pixCopyPaste) next.pixCopyPaste = charge.pixCopyPaste
          setLastChargeKey(key)
          setCharge(next)
          setPaidNotice(false)
        } else if (charge) {
          setCharge(null)
          setPaidNotice(true)
          window.setTimeout(() => { if (active) setPaidNotice(false) }, 5000)
        }
      } catch {
        // A tela de atendimento continua aguardando e tenta novamente no proximo ciclo.
      }
    }
    void read()
    const timer = window.setInterval(() => void read(), 2000)
    return () => { active = false; window.clearInterval(timer) }
  }, [storeId, lastChargeKey, charge])

  const enterFullscreen = () => void document.documentElement.requestFullscreen?.()

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-6 text-white sm:px-10">
      <header className="mx-auto flex max-w-3xl items-center justify-between gap-4">
        <div className="flex items-center gap-3"><div className="rounded-xl bg-cyan-500/15 p-3 text-cyan-300"><Smartphone className="h-6 w-6" /></div><div><p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-400">Modo Maquininha Pix</p><h1 className="text-xl font-black">{storeName}</h1></div></div>
        <button type="button" onClick={enterFullscreen} className="rounded-xl border border-white/10 bg-white/5 p-3 text-slate-300 hover:bg-white/10" title="Tela cheia"><Maximize2 className="h-5 w-5" /></button>
      </header>
      <section className="mx-auto flex min-h-[calc(100vh-10rem)] max-w-3xl items-center justify-center py-8">
        {charge?.pixCopyPaste ? <div className="w-full max-w-md rounded-[2rem] border border-cyan-400/25 bg-slate-900 p-6 text-center shadow-[0_0_80px_rgba(34,211,238,0.14)]"><div className="mb-5 flex items-center justify-center gap-2 text-cyan-300"><QrCode className="h-5 w-5" /><span className="text-xs font-black uppercase tracking-[0.18em]">Aponte a câmera do celular</span></div><div className="rounded-2xl bg-white p-5"><QRCodeSVG value={charge.pixCopyPaste} className="mx-auto h-auto w-full" size={320} level="M" includeMargin /></div><p className="mt-5 text-4xl font-black">{money(charge.amount)}</p><p className="mt-2 text-sm font-bold text-amber-300">Aguardando pagamento</p><p className="mt-3 text-xs text-slate-500">O atendimento continua no computador.</p></div> : paidNotice ? <div className="text-center"><CheckCircle2 className="mx-auto h-20 w-20 text-emerald-400" /><h2 className="mt-5 text-3xl font-black text-emerald-300">Pagamento confirmado</h2><p className="mt-2 text-slate-400">Pronto para o próximo atendimento.</p></div> : <div className="text-center"><Clock3 className="mx-auto h-20 w-20 text-slate-600" /><h2 className="mt-5 text-3xl font-black text-slate-300">Aguardando Pix</h2><p className="mt-2 text-slate-500">O próximo QR Code aparecerá aqui automaticamente.</p></div>}
      </section>
      <button type="button" onClick={() => router.back()} className="fixed bottom-5 right-5 z-20 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900/90 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-300 shadow-xl backdrop-blur hover:bg-slate-800 hover:text-white"><ArrowLeft className="h-4 w-4" /> Voltar</button>
    </main>
  )
}
