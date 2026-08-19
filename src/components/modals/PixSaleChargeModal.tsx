'use client'

import { useEffect, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { QRCodeSVG } from 'qrcode.react'
import { CheckCircle2, Clipboard, Loader2, QrCode, RefreshCw, X } from 'lucide-react'
import { toast } from 'sonner'
import EmployeeAuthModal from '@/components/modals/EmployeeAuthModal'
import {
  cancelPixSaleCharge,
  createPixSaleCharge,
  getPixSaleCharge,
  refreshPixSaleCharge,
  type PixSaleCharge,
} from '@/lib/actions/pix-sale.actions'

const money = (value: number) => value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function PixSaleChargeModal({
  isOpen,
  storeId,
  vendaId,
  amount,
  onClose,
  onPaymentAdded,
}: {
  isOpen: boolean
  storeId: number
  vendaId: number
  amount: number
  onClose: () => void
  onPaymentAdded: (charge?: PixSaleCharge) => Promise<void>
}) {
  const [mounted, setMounted] = useState(false)
  const [charge, setCharge] = useState<PixSaleCharge | null>(null)
  const [isAuthOpen, setIsAuthOpen] = useState(false)
  const [isWorking, startTransition] = useTransition()
  const [pendingOperation, setPendingOperation] = useState<'create' | 'cancel' | null>(null)

  useEffect(() => setMounted(true), [])
  useEffect(() => {
    if (!isOpen) return
    void getPixSaleCharge(storeId, vendaId).then(setCharge)
  }, [isOpen, storeId, vendaId])

  const expiresAt = charge?.expiresAt ? new Date(charge.expiresAt).toLocaleString('pt-BR') : null
  const status = charge?.status === 'PAID' && charge.settlementStatus === 'COMPLETED'
    ? 'Pago e registrado'
    : charge?.status === 'PAID' ? 'Pago — atualizando venda' : charge?.status === 'PENDING' ? 'Aguardando pagamento' : charge?.status === 'CREATING' ? 'Gerando cobrança' : charge?.status === 'CANCELLED' ? 'Cancelado' : charge?.status === 'EXPIRED' ? 'Expirado' : charge?.status === 'ERROR' ? 'Com erro' : null

  const handleAuth = (employee: { authorization_token?: string }) => {
    setIsAuthOpen(false)
    const token = employee.authorization_token
    const operation = pendingOperation
    setPendingOperation(null)
    if (!token || !operation) return toast.error('A autorização não foi emitida. Informe o PIN novamente.')
    startTransition(async () => {
      const result = operation === 'create'
        ? await createPixSaleCharge({ storeId, vendaId, amount, authorizationToken: token })
        : charge ? await cancelPixSaleCharge({ storeId, chargeId: charge.id, authorizationToken: token }) : null
      if (!result || !result.success) {
        toast.error(result?.message || 'Não foi possível concluir a operação.')
        return
      }
      setCharge(result.data)
      toast.success(operation === 'create' ? 'QR Code da venda gerado.' : 'Cobrança Pix cancelada.')
    })
  }

  const refresh = () => {
    if (!charge) return
    startTransition(async () => {
      const result = await refreshPixSaleCharge({ storeId, chargeId: charge.id })
      if (!result.success) {
        toast.error(result.message)
        return
      }
      setCharge(result.data)
      if (result.data.settlementStatus === 'COMPLETED') await onPaymentAdded(result.data)
      toast.success(result.data.settlementStatus === 'COMPLETED' ? 'Pagamento confirmado e registrado na venda.' : 'Status atualizado.')
    })
  }

  const copy = async () => {
    if (!charge?.pixCopyPaste) return
    await navigator.clipboard.writeText(charge.pixCopyPaste)
    toast.success('Pix copia e cola copiado.')
  }

  if (!mounted || !isOpen) return null
  return createPortal(
    <>
      <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/80 p-4 pt-12 backdrop-blur-sm">
        <div className="max-h-[calc(100vh-6rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-cyan-500/20 bg-slate-950 shadow-2xl">
          <header className="flex items-center justify-between border-b border-cyan-500/20 bg-cyan-950/40 px-5 py-4">
            <div className="flex items-center gap-3"><div className="rounded-lg bg-cyan-500/15 p-2 text-cyan-300"><QrCode className="h-5 w-5" /></div><div><h3 className="font-bold text-cyan-100">Pix da venda #{vendaId}</h3><p className="text-[10px] font-bold uppercase tracking-widest text-cyan-400/60">Sicredi · cobrança dinâmica</p></div></div>
            <button onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-white/5 hover:text-white"><X className="h-5 w-5" /></button>
          </header>
          <div className="space-y-5 p-5">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-center"><p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Valor da cobrança</p><p className="mt-1 text-4xl font-black text-white">R$ {money(charge?.amount ?? amount)}</p>{status && <p className="mt-3 text-xs font-bold text-amber-300">{status}</p>}{expiresAt && charge?.status === 'PENDING' && <p className="mt-1 text-[10px] text-slate-500">Válido até {expiresAt}</p>}</div>
            {charge?.pixCopyPaste ? <div className="flex justify-center rounded-xl bg-white p-4"><QRCodeSVG value={charge.pixCopyPaste} size={220} level="M" includeMargin /></div> : null}
            {charge ? <>
              <div><label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Pix copia e cola</label><div className="mt-1 rounded-lg border border-white/10 bg-black/20 p-3 font-mono text-[10px] break-all text-slate-300">{charge.pixCopyPaste || 'Código ainda não disponível.'}</div></div>
              <div className="grid grid-cols-2 gap-3"><button onClick={() => void copy()} disabled={!charge.pixCopyPaste} className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-3 py-3 text-xs font-bold text-cyan-200 disabled:opacity-50"><Clipboard className="h-4 w-4" /> Copiar código</button><button onClick={refresh} disabled={isWorking} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-xs font-bold text-slate-300 disabled:opacity-50"><RefreshCw className="h-4 w-4" /> Atualizar status</button></div>
              {charge.status === 'PENDING' && <button onClick={() => { setPendingOperation('cancel'); setIsAuthOpen(true) }} disabled={isWorking} className="w-full rounded-xl border border-rose-500/20 bg-rose-500/10 py-3 text-xs font-bold text-rose-200">Cancelar cobrança</button>}
            </> : <><p className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-400">O QR Code ainda não baixa a venda. O pagamento será registrado somente após a confirmação do Sicredi.</p><button onClick={() => { setPendingOperation('create'); setIsAuthOpen(true) }} disabled={isWorking || amount <= 0} className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 py-4 text-sm font-black uppercase tracking-wide text-cyan-950 disabled:opacity-50">{isWorking ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />} Gerar QR Code</button></>}
          </div>
        </div>
      </div>
      <EmployeeAuthModal storeId={storeId} isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} onSuccess={handleAuth} title={pendingOperation === 'cancel' ? 'Autorizar cancelamento do Pix' : 'Autorizar geração do Pix'} description="Insira seu PIN para continuar." purpose={pendingOperation === 'cancel' ? 'pix_charge_cancel' : 'pix_charge_create'} authorizationContext={pendingOperation === 'cancel' && charge ? String(charge.id) : `sale:${vendaId}:${amount.toFixed(2)}`} />
    </>,
    document.body,
  )
}
