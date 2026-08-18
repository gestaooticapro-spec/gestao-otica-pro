'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { QRCodeSVG } from 'qrcode.react'
import { AlertTriangle, CheckCircle2, Clipboard, Loader2, MessageCircle, QrCode, RefreshCw, X } from 'lucide-react'
import EmployeeAuthModal from '@/components/modals/EmployeeAuthModal'
import {
  cancelPixInstallmentCharge,
  createPixInstallmentCharge,
  refreshPixInstallmentCharge,
  sendPixInstallmentChargeWhatsApp,
  type PixInstallmentCharge,
} from '@/lib/actions/pix-installment.actions'
import { getInstallmentOutstanding } from '@/lib/installment-balance'
import { toast } from 'sonner'

type Installment = {
  id: number
  numero_parcela: number
  data_vencimento: string
  valor_parcela: number
  valor_pago?: number | null
  valor_transferido_entrada?: number | null
  valor_transferido_saida?: number | null
  valor_renegociado_saida?: number | null
}

type PendingOperation = 'create' | 'cancel' | null

const money = (value: number) => value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const parseMoney = (value: string) => Number(value.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '')) || 0
const createAuthorizationContext = (installmentId: number, amount: number, interestAmount: number, strategy: 'quitacao_total' | 'baixa_parcial' | 'somar_proxima') => (
  `${installmentId}:${amount.toFixed(2)}:${interestAmount.toFixed(2)}:${strategy}`
)

function statusLabel(status: PixInstallmentCharge['status']) {
  return ({ CREATING: 'Gerando cobrança', PENDING: 'Aguardando pagamento', PAID: 'Pago — aguardando baixa', EXPIRED: 'Expirado', CANCELLED: 'Cancelado', DIVERGENT: 'Divergente', ERROR: 'Com erro' } as const)[status]
}

export default function PixInstallmentChargeModal({
  isOpen,
  storeId,
  installment,
  hasNextInstallment,
  initialCharge,
  onClose,
  onChargeChanged,
}: {
  isOpen: boolean
  storeId: number
  installment: Installment
  hasNextInstallment: boolean
  initialCharge?: PixInstallmentCharge
  onClose: () => void
  onChargeChanged: (charge: PixInstallmentCharge | null) => void
}) {
  const outstanding = getInstallmentOutstanding(installment)
  const [mounted, setMounted] = useState(false)
  const [charge, setCharge] = useState<PixInstallmentCharge | null>(initialCharge || null)
  const [amountText, setAmountText] = useState(money(outstanding))
  const [interestText, setInterestText] = useState('0,00')
  const [strategy, setStrategy] = useState<'quitacao_total' | 'baixa_parcial' | 'somar_proxima'>('quitacao_total')
  const [pendingOperation, setPendingOperation] = useState<PendingOperation>(null)
  const [isAuthOpen, setIsAuthOpen] = useState(false)
  const [isWorking, startTransition] = useTransition()
  const [isSending, setIsSending] = useState(false)

  useEffect(() => setMounted(true), [])
  useEffect(() => {
    if (!isOpen) return
    setCharge(initialCharge || null)
    setAmountText(money(outstanding))
    setInterestText('0,00')
    setStrategy('quitacao_total')
    setPendingOperation(null)
  }, [isOpen, initialCharge?.id, outstanding])

  const amount = parseMoney(amountText)
  const interest = parseMoney(interestText)
  const principal = amount - interest
  const difference = outstanding - principal
  const isPartial = difference > 0.01
  const isOverpayment = difference < -0.01
  const canGenerate = amount > 0 && principal > 0 && (!isPartial || strategy !== 'quitacao_total')

  const expiresAt = useMemo(() => charge?.expiresAt ? new Date(charge.expiresAt).toLocaleString('pt-BR') : null, [charge?.expiresAt])

  const updateCharge = (next: PixInstallmentCharge | null) => {
    setCharge(next)
    onChargeChanged(next)
  }

  const resetChargeForm = () => {
    updateCharge(null)
    setAmountText(money(outstanding))
    setInterestText('0,00')
    setStrategy('quitacao_total')
  }

  const requestAuthorization = (operation: Exclude<PendingOperation, null>) => {
    if (operation === 'create' && !canGenerate) {
      toast.error('Revise o valor e a estratégia antes de gerar o Pix.')
      return
    }
    setPendingOperation(operation)
    setIsAuthOpen(true)
  }

  const handleAuthorized = (employee: { id: number; authorization_token?: string }) => {
    setIsAuthOpen(false)
    const operation = pendingOperation
    setPendingOperation(null)
    if (!operation) return
    const authorizationToken = employee.authorization_token
    if (!authorizationToken) {
      toast.error('A autorizacao do funcionario nao foi emitida. Informe o PIN novamente.')
      return
    }

    startTransition(async () => {
      if (operation === 'create') {
        const result = await createPixInstallmentCharge({
          storeId,
          installmentId: installment.id,
          amount,
          interestAmount: interest,
          strategy: isPartial ? strategy : 'quitacao_total',
          authorizationToken,
        })
        if (!result.success) {
          toast.error(result.message)
          return
        }
        updateCharge(result.data)
        toast.success('Cobrança Pix criada. A parcela continua em aberto até a confirmação.')
        return
      }

      if (!charge) return
      const result = await cancelPixInstallmentCharge({ storeId, chargeId: charge.id, authorizationToken })
      if (!result.success) {
        toast.error(result.message)
        return
      }
      resetChargeForm()
      toast.success('Cobrança Pix cancelada. Você já pode gerar outro QR Code.')
    })
  }

  const copyCode = async () => {
    if (!charge?.pixCopyPaste) return
    try {
      await navigator.clipboard.writeText(charge.pixCopyPaste)
      toast.success('Código Pix copiado.')
    } catch {
      toast.error('Não foi possível copiar o código Pix.')
    }
  }

  const refreshStatus = () => {
    if (!charge) return
    startTransition(async () => {
      const result = await refreshPixInstallmentCharge({ storeId, chargeId: charge.id })
      if (!result.success) {
        toast.error(result.message)
        return
      }
      updateCharge(result.data)
      toast.success(`Status atualizado: ${statusLabel(result.data.status)}.`)
    })
  }

  const reconcileBeforeNewCharge = () => {
    if (!charge) return resetChargeForm()
    startTransition(async () => {
      const result = await refreshPixInstallmentCharge({ storeId, chargeId: charge.id })
      if (!result.success) {
        toast.error('Não foi possível confirmar o status no Sicredi. Não gere outro QR Code ainda.')
        return
      }
      updateCharge(result.data)
      if (result.data.status === 'PENDING') {
        toast.error('Esta cobrança ainda está ativa no Sicredi. Use o QR existente ou cancele-a antes de gerar outro.')
        return
      }
      if (result.data.status === 'PAID') {
        toast.error('Esta cobrança foi paga. Faça a baixa manual antes de gerar outro QR Code.')
        return
      }
      resetChargeForm()
    })
  }

  const sendWhatsApp = async () => {
    if (!charge || isSending) return
    setIsSending(true)
    try {
      const result = await sendPixInstallmentChargeWhatsApp({ storeId, chargeId: charge.id })
      if (!result.success) return toast.error(result.message)
      if (result.data.shouldOpenExternal && result.data.externalUrl) window.open(result.data.externalUrl, '_blank', 'noopener,noreferrer')
      toast.success(result.data.shouldOpenExternal ? 'Mensagem preparada no WhatsApp externo.' : 'Cobrança enviada pelo WhatsApp da loja.')
    } finally {
      setIsSending(false)
    }
  }

  if (!mounted || !isOpen) return null

  return createPortal(
    <>
      <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/80 p-4 pt-12 backdrop-blur-sm">
        <div className="max-h-[calc(100vh-6rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-cyan-500/20 bg-slate-950 shadow-2xl">
          <header className="sticky top-0 z-10 flex items-center justify-between border-b border-cyan-500/20 bg-cyan-950/40 px-5 py-4 backdrop-blur">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-cyan-500/15 p-2 text-cyan-300"><QrCode className="h-5 w-5" /></div>
              <div><h3 className="font-bold text-cyan-100">Pix da parcela {installment.numero_parcela}</h3><p className="text-[10px] font-bold uppercase tracking-widest text-cyan-400/60">Sicredi · cobrança dinâmica</p></div>
            </div>
            <button onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-white/5 hover:text-white"><X className="h-5 w-5" /></button>
          </header>

          <div className="space-y-5 p-5">
            {charge ? (
              <>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Valor da cobrança</p>
                  <p className="mt-1 text-4xl font-black text-white">R$ {money(charge.amount)}</p>
                  <p className={`mt-3 text-xs font-bold ${charge.status === 'PENDING' ? 'text-amber-300' : charge.status === 'PAID' ? 'text-emerald-300' : 'text-slate-400'}`}>{statusLabel(charge.status)}</p>
                  {expiresAt && charge.status === 'PENDING' ? <p className="mt-1 text-[10px] text-slate-500">Válido até {expiresAt}</p> : null}
                </div>

                {charge.pixCopyPaste ? <div className="flex justify-center rounded-xl bg-white p-4"><QRCodeSVG value={charge.pixCopyPaste} size={210} level="M" includeMargin /></div> : null}

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Pix copia e cola</label>
                  <div className="mt-1 rounded-lg border border-white/10 bg-black/20 p-3 font-mono text-[10px] break-all text-slate-300">{charge.pixCopyPaste || 'Código não retornado pelo Sicredi.'}</div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button onClick={copyCode} disabled={!charge.pixCopyPaste} className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-3 py-3 text-xs font-bold text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-50"><Clipboard className="h-4 w-4" /> Copiar código</button>
                  <button onClick={() => void sendWhatsApp()} disabled={isSending || charge.status !== 'PENDING'} className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-3 text-xs font-bold text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50">{isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />} Enviar WhatsApp</button>
                </div>

                {charge.status === 'CREATING' ? <p className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-3 text-xs text-cyan-100">A cobrança está sendo gerada. Aguarde e atualize a tela antes de tentar novamente.</p> : <button onClick={refreshStatus} disabled={isWorking} className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 py-3 text-xs font-bold text-slate-300 hover:bg-white/10 disabled:opacity-50">{isWorking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Atualizar status no Sicredi</button>}

                {charge.status === 'PENDING' ? <button onClick={() => requestAuthorization('cancel')} disabled={isWorking} className="w-full rounded-xl border border-rose-500/20 bg-rose-500/10 py-3 text-xs font-bold text-rose-200 hover:bg-rose-500/20 disabled:opacity-50">Cancelar / alterar valor</button> : null}
                {charge.status === 'EXPIRED' || charge.status === 'CANCELLED' ? <button onClick={reconcileBeforeNewCharge} disabled={isWorking} className="w-full rounded-xl border border-cyan-500/20 bg-cyan-500/10 py-3 text-xs font-bold text-cyan-100 hover:bg-cyan-500/20 disabled:opacity-50">Confirmar e gerar novo QR Code</button> : null}
                {charge.status === 'PAID' ? <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">O pagamento foi confirmado no Sicredi. A baixa automática será incluída na próxima etapa; por enquanto, use a baixa manual conferindo o valor.</p> : null}
              </>
            ) : (
              <>
                <div className="text-center"><p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Saldo atual da parcela</p><p className="mt-1 text-4xl font-black text-white">R$ {money(outstanding)}</p></div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-xs font-bold text-slate-300">Valor a cobrar<input value={amountText} onChange={(event) => setAmountText(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-right text-lg font-bold text-emerald-300 outline-none focus:border-emerald-500/50" /></label>
                  <label className="block text-xs font-bold text-slate-300">Juros / multa<input value={interestText} onChange={(event) => setInterestText(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-right text-lg font-bold text-amber-300 outline-none focus:border-amber-500/50" /></label>
                </div>

                {isPartial ? <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4"><div className="flex items-center gap-2 text-sm font-bold text-amber-200"><AlertTriangle className="h-4 w-4" /> Restarão R$ {money(difference)} da dívida</div><label className="mt-3 flex gap-2 text-xs text-slate-300"><input type="radio" checked={strategy === 'baixa_parcial'} onChange={() => setStrategy('baixa_parcial')} /> Manter o restante nesta parcela</label><label className={`mt-2 flex gap-2 text-xs ${hasNextInstallment ? 'text-slate-300' : 'text-slate-600'}`}><input type="radio" disabled={!hasNextInstallment} checked={strategy === 'somar_proxima'} onChange={() => setStrategy('somar_proxima')} /> Transferir o restante para a próxima parcela</label></div> : null}
                {isOverpayment ? <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-4 text-xs text-blue-200">Há R$ {money(Math.abs(difference))} excedentes. Nesta versão, a baixa é manual: confira e registre o tratamento do excedente antes de quitar a parcela.</div> : null}
                <p className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-400">Gerar o QR Code não baixa a parcela. A cobrança ficará pendente até a confirmação do Sicredi.</p>
                <button onClick={() => requestAuthorization('create')} disabled={isWorking || !canGenerate} className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 py-4 text-sm font-black uppercase tracking-wide text-cyan-950 hover:bg-cyan-400 disabled:opacity-50">{isWorking ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />} Gerar QR Code</button>
              </>
            )}
          </div>
        </div>
      </div>
      <EmployeeAuthModal
        storeId={storeId}
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onSuccess={handleAuthorized}
        title={pendingOperation === 'cancel' ? 'Autorizar cancelamento do Pix' : 'Autorizar geração do Pix'}
        description="Insira seu PIN para continuar."
        purpose={pendingOperation === 'cancel' ? 'pix_charge_cancel' : 'pix_charge_create'}
        authorizationContext={pendingOperation === 'cancel' && charge
          ? String(charge.id)
          : createAuthorizationContext(installment.id, amount, interest, isPartial ? strategy : 'quitacao_total')}
      />
    </>,
    document.body,
  )
}
