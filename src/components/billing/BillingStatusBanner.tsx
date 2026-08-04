'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Copy, QrCode, X } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { getBillingBannerPresentation, getBillingNoticePeriod } from '@/lib/billing/billing-status-ui'
import type { BillingStoreStatus } from '@/lib/billing/integracao-asaas'

export default function BillingStatusBanner({ storeId }: { storeId: number }) {
  const pathname = usePathname()
  const [status, setStatus] = useState<BillingStoreStatus | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let active = true
    setStatus(null)

    fetch(`/api/cobranca/status?storeId=${storeId}`, { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => { if (active) setStatus(data) })
      .catch(() => { if (active) setStatus(null) })

    return () => { active = false }
  }, [pathname, storeId])

  const presentation = useMemo(() => status ? getBillingBannerPresentation(status) : null, [status])
  const noticeKey = useMemo(() => status ? `billing-notice:${storeId}:${status.status}:${getBillingNoticePeriod(status)}` : null, [status, storeId])

  useEffect(() => {
    setDismissed(Boolean(noticeKey && window.localStorage.getItem(noticeKey)))
  }, [noticeKey])

  if (!status || !presentation) return null

  const copyPaste = status.store?.payment_copy_paste
  const qrCode = status.store?.payment_qr_code
  const tone = presentation.isBlocked
    ? 'border-rose-400/40 bg-rose-500/15 text-rose-50'
    : presentation.isOverdue
      ? 'border-amber-400/40 bg-amber-500/15 text-amber-50'
      : 'border-sky-400/40 bg-sky-500/15 text-sky-50'

  const dismiss = () => {
    if (!noticeKey || presentation.isFinalGraceDay) return
    window.localStorage.setItem(noticeKey, 'dismissed')
    setDismissed(true)
  }

  const closePaymentModal = () => {
    setPaymentOpen(false)
    window.alert('Assim que o pagamento for identificado, o aviso será removido automaticamente.')
  }

  const copyPix = async () => {
    if (!copyPaste) return
    await navigator.clipboard.writeText(copyPaste)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <>
      {presentation.showBanner && !dismissed && (
        <section className={`fixed left-3 right-3 top-3 z-[100] mx-auto max-w-4xl rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur-xl ${tone}`}>
          <div className="flex items-start gap-3">
            {presentation.isBlocked || presentation.isOverdue ? <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />}
            <div className="min-w-0 flex-1"><p className="text-xs font-black uppercase tracking-[0.16em]">{presentation.title}</p><p className="mt-1 text-sm font-medium leading-relaxed text-white/90">{presentation.message}</p></div>
            <div className="flex shrink-0 items-center gap-1">
              {presentation.canPay && <button type="button" onClick={() => setPaymentOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white transition hover:bg-black"><QrCode className="h-4 w-4" /> Pagar</button>}
              {!presentation.isFinalGraceDay && <button type="button" onClick={dismiss} className="rounded-lg p-2 text-current/70 transition hover:bg-black/10 hover:text-white" aria-label="Fechar aviso de cobrança"><X className="h-4 w-4" /></button>}
            </div>
          </div>
        </section>
      )}

      {presentation.canPay && (!presentation.showBanner || dismissed) && <button type="button" onClick={() => setPaymentOpen(true)} className="fixed bottom-5 right-5 z-[100] inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-3 text-sm font-black text-white shadow-2xl transition hover:-translate-y-0.5 hover:bg-black"><QrCode className="h-4 w-4" /> Pagar</button>}

      {paymentOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Pagamento Pix</p><h2 className="mt-1 text-2xl font-black text-white">{presentation.amount}</h2></div><button type="button" onClick={closePaymentModal} className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Fechar"><X className="h-5 w-5" /></button></div>
            {qrCode && <div className="mb-4 flex justify-center rounded-xl bg-white p-4">{/* eslint-disable-next-line @next/next/no-img-element -- QR Code data URL is supplied by the billing gateway. */}<img src={qrCode} alt="QR Code Pix" className="h-56 w-56 object-contain" /></div>}
            {copyPaste && <div className="rounded-xl border border-white/10 bg-black/20 p-3"><p className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Pix copia e cola</p><div className="flex gap-2"><input readOnly value={copyPaste} onFocus={(event) => event.currentTarget.select()} className="min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-xs text-slate-300" /><button type="button" onClick={copyPix} className="rounded-lg bg-sky-500 px-3 text-white hover:bg-sky-400" aria-label="Copiar Pix"><Copy className="h-4 w-4" /></button></div>{copied && <p className="mt-2 text-xs font-bold text-emerald-400">Código Pix copiado.</p>}</div>}
          </div>
        </div>
      )}
    </>
  )
}
