'use client'

import { useState } from 'react'
import { AlertTriangle, Loader2, RotateCcw, ShieldCheck, X } from 'lucide-react'
import { toast } from 'sonner'
import EmployeeAuthModal from '@/components/modals/EmployeeAuthModal'
import { reverseInstallmentReceipt } from '@/lib/actions/parcelas.actions'

export type ReversibleReceiptOperation = {
  kind: 'tracked' | 'legacy_exact'
  id?: number
  legacy_installment_id?: number
  received_amount: number
  interest_amount?: number | null
  payment_method: string
  received_on: string
  affected_installment_count?: number | null
}

type Props = {
  storeId: number
  installmentNumber: number
  operation: ReversibleReceiptOperation
  onClose: () => void
  onReversed: () => void | Promise<void>
}

const money = (value: number) => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
}).format(Number(value || 0))

const date = (value: string) => {
  const [year, month, day] = String(value || '').split('T')[0].split('-')
  return year && month && day ? `${day}/${month}/${year}` : '-'
}

export default function ReverseInstallmentReceiptModal({
  storeId,
  installmentNumber,
  operation,
  onClose,
  onReversed,
}: Props) {
  const [reason, setReason] = useState('')
  const [authOpen, setAuthOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const affectedInstallments = Number(operation.affected_installment_count || 1)

  const requestAuthorization = () => {
    if (reason.trim().length < 5) {
      toast.error('Informe o motivo da reversao com pelo menos 5 caracteres.')
      return
    }
    setAuthOpen(true)
  }

  const handleManagerAuthorized = async (employee: {
    role: string
    authorization_token?: string
  }) => {
    setAuthOpen(false)
    if (employee.role !== 'gerente' || !employee.authorization_token) {
      toast.error('A reversao exige o PIN de um gerente ativo.')
      return
    }

    setSubmitting(true)
    try {
      const result = await reverseInstallmentReceipt({
        operationId: operation.kind === 'tracked' ? operation.id : undefined,
        legacyInstallmentId: operation.kind === 'legacy_exact' ? operation.legacy_installment_id : undefined,
        storeId,
        reason: reason.trim(),
        authorizationToken: employee.authorization_token,
      })
      if (!result.success) {
        toast.error(result.message)
        return
      }
      toast.success(result.message)
      await onReversed()
      onClose()
    } catch (error) {
      console.error('[ReverseInstallmentReceiptModal] Falha na reversao:', error)
      toast.error('Nao foi possivel reverter a quitacao.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-md" onClick={onClose}>
        <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-rose-500/20 bg-slate-900 shadow-2xl" onClick={(event) => event.stopPropagation()}>
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-2 text-rose-400">
                <RotateCcw className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-black text-white">Reverter quitação</h2>
                <p className="text-xs font-bold text-slate-400">Parcela {installmentNumber}</p>
              </div>
            </div>
            <button type="button" onClick={onClose} disabled={submitting} className="rounded-full p-2 text-slate-400 hover:bg-white/10 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-5 p-6">
            <div className="grid grid-cols-2 gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
              <div><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Recebido</p><p className="mt-1 font-black text-white">{money(operation.received_amount)}</p></div>
              <div><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Data</p><p className="mt-1 font-bold text-slate-200">{date(operation.received_on)}</p></div>
              <div><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Forma</p><p className="mt-1 font-bold text-slate-200">{operation.payment_method}</p></div>
              <div><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Parcelas afetadas</p><p className="mt-1 font-bold text-slate-200">{Math.max(affectedInstallments, 1)}</p></div>
            </div>

            {operation.kind === 'tracked' ? (
              <div className="flex gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-xs font-semibold leading-relaxed text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>Todos os efeitos deste recebimento serão desfeitos juntos, incluindo baixas, abatimentos e pendências criadas nas parcelas seguintes.</p>
              </div>
            ) : null}

            <div>
              <label htmlFor="reversal-reason" className="mb-2 block text-[10px] font-black uppercase tracking-wider text-slate-400">Motivo da correção</label>
              <textarea
                id="reversal-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                disabled={submitting}
                rows={3}
                maxLength={500}
                placeholder="Ex.: baixa realizada na parcela errada"
                className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-rose-500/50 focus:ring-2 focus:ring-rose-500/20"
              />
            </div>

            <button
              type="button"
              onClick={requestAuthorization}
              disabled={submitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/20 py-3 text-sm font-black uppercase tracking-wider text-rose-200 transition-colors hover:bg-rose-500/30 disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              {submitting ? 'Revertendo' : 'Autorizar com PIN de gerente'}
            </button>
          </div>
        </div>
      </div>

      <EmployeeAuthModal
        storeId={storeId}
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        onSuccess={handleManagerAuthorized}
        title="Autorizar reversão"
        description="Informe o PIN de um gerente ativo da loja."
        purpose="installment_receipt_reversal"
        authorizationContext={operation.kind === 'tracked'
          ? String(operation.id)
          : `legacy:${operation.legacy_installment_id}`}
      />
    </>
  )
}
