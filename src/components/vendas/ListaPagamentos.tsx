//============================
// ARQUIVO: src/components/vendas/ListaPagamentos.tsx
//============================

'use client'

import { useState, useTransition } from 'react'
import { deletePagamento } from '@/lib/actions/vendas.actions'
import { sendSalePaymentReceiptWhatsApp } from '@/lib/actions/manual-whatsapp.actions'
import { Database } from '@/lib/database.types'
import { Loader2, MessageCircle, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

type Pagamento = Database['public']['Tables']['pagamentos']['Row'] & {
  employee?: { full_name: string } | null
}

type ListaPagamentosProps = {
  pagamentos: Pagamento[]
  vendaId: number
  storeId: number
  onDelete: () => Promise<void>
  disabled: boolean
  whatsappReceiptEnabled?: boolean
}

const formatCurrency = (value: number | null | undefined): string => {
  return (value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

const formatDate = (dateString: string | null | undefined): string => {
  if (!dateString) return 'N/A'
  try {
    return dateString.split('T')[0].split('-').reverse().join('/')
  } catch {
    return 'Data Invalida'
  }
}

function DeleteButton({
  pagamento,
  vendaId,
  storeId,
  onDelete,
  disabled,
}: {
  pagamento: Pagamento
  vendaId: number
  storeId: number
  onDelete: () => Promise<void>
  disabled: boolean
}) {
  const [isDeleting, startDeleteTransition] = useTransition()

  const handleDelete = () => {
    if (disabled || !window.confirm(`Remover pagamento de ${formatCurrency(pagamento.valor_pago)}?`)) return

    startDeleteTransition(async () => {
      const result = await deletePagamento(pagamento.id, vendaId, storeId)
      if (result.success) {
        await onDelete()
      } else {
        alert(`Erro: ${result.message}`)
      }
    })
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isDeleting || disabled}
      className="p-1 text-rose-400 hover:text-rose-300 hover:bg-rose-500/20 rounded-md transition-colors disabled:opacity-50"
      title="Estornar / Remover"
    >
      {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
    </button>
  )
}

export default function ListaPagamentos({
  pagamentos,
  vendaId,
  storeId,
  onDelete,
  disabled,
  whatsappReceiptEnabled = false,
}: ListaPagamentosProps) {
  const [sendingReceiptPaymentId, setSendingReceiptPaymentId] = useState<number | null>(null)
  const [sentReceiptPaymentIds, setSentReceiptPaymentIds] = useState<number[]>([])

  const handleSendReceipt = async (paymentId: number) => {
    if (sendingReceiptPaymentId === paymentId) return

    setSendingReceiptPaymentId(paymentId)
    try {
      const result = await sendSalePaymentReceiptWhatsApp({
        storeId,
        paymentId,
      })

      if (!result.success) {
        toast.error(result.message)
        return
      }

      setSentReceiptPaymentIds((current) =>
        current.includes(paymentId) ? current : [...current, paymentId]
      )
      toast.success('Recibo enviado em PDF pelo WhatsApp da loja.')
    } catch (error) {
      console.error('[ListaPagamentos] Erro ao enviar recibo do pagamento:', error)
      toast.error('Nao foi possivel enviar o recibo por WhatsApp.')
    } finally {
      setSendingReceiptPaymentId(null)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <h3 className="text-lg font-bold text-gray-800 mb-3 border-b border-gray-300 pb-2 hidden">
        Historico de Pgto
      </h3>

      <div className="hidden md:flex bg-emerald-500/10 p-2 rounded-t-xl font-bold text-emerald-500 text-[10px] uppercase tracking-wider border-b border-emerald-500/20">
        <div className="w-2/12 pl-1">Data</div>
        <div className="w-3/12">Forma</div>
        <div className="w-2/12">Responsavel</div>
        <div className="w-2/12 text-right">Valor</div>
        <div className="w-1/12 text-center">Parc.</div>
        <div className="w-1/12 text-center">{whatsappReceiptEnabled ? 'WA' : ''}</div>
        <div className="w-1/12 text-right pr-2"></div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-1 bg-transparent p-0 rounded-b-xl custom-scrollbar max-h-60">
        {pagamentos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-slate-500 bg-white/5 rounded-b-xl border border-dashed border-white/10 m-0">
            <p className="text-xs font-medium">Sem pagamentos</p>
          </div>
        ) : (
          pagamentos.map((pag) => (
            <div
              key={pag.id}
              className="flex flex-col md:flex-row md:items-center p-2 rounded-lg hover:bg-white/5 border-b border-white/5 last:border-0 transition-colors group"
            >
              <div className="w-full md:w-2/12 font-medium text-slate-300 text-xs pl-1">
                {formatDate(pag.data_pagamento)}
              </div>
              <div className="w-full md:w-3/12 text-[10px] text-amber-200/80 font-semibold uppercase">
                {pag.forma_pagamento}
              </div>
              <div className="w-full md:w-2/12 text-[10px] text-slate-500 uppercase truncate" title={pag.employee?.full_name || 'N/A'}>
                {pag.employee?.full_name?.split(' ')[0] || '-'}
              </div>
              <div className="w-full md:w-2/12 md:text-right font-bold text-emerald-400 text-xs">
                {formatCurrency(pag.valor_pago)}
              </div>
              <div className="w-full md:w-1/12 md:text-center text-[10px] text-slate-400">
                {pag.parcelas}x
              </div>
              <div className="w-full md:w-1/12 flex justify-end md:justify-center pr-1 md:pr-0 mt-2 md:mt-0">
                {whatsappReceiptEnabled ? (
                  <button
                    type="button"
                    onClick={() => void handleSendReceipt(pag.id)}
                    disabled={sendingReceiptPaymentId === pag.id}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-emerald-500/20 bg-emerald-500/10 text-[10px] font-bold uppercase tracking-wide text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors"
                    title="Enviar recibo por WhatsApp"
                  >
                    {sendingReceiptPaymentId === pag.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <MessageCircle className="h-3.5 w-3.5" />
                    )}
                    {sentReceiptPaymentIds.includes(pag.id) ? 'Enviado' : 'Recibo'}
                  </button>
                ) : null}
              </div>

              <div className="w-full md:w-1/12 flex justify-end pr-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <DeleteButton
                  pagamento={pag}
                  vendaId={vendaId}
                  storeId={storeId}
                  onDelete={onDelete}
                  disabled={disabled}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
