'use client'

import { useState, useTransition } from 'react'
import { deletePagamento } from '@/lib/actions/vendas.actions'
import { sendSalePaymentReceiptWhatsApp } from '@/lib/actions/manual-whatsapp.actions'
import { Database } from '@/lib/database.types'
import { Loader2, MessageCircle, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

type Pagamento = Database['public']['Tables']['pagamentos']['Row'] & { employee?: { full_name: string } | null }
type Props = { pagamentos: Pagamento[]; vendaId: number; storeId: number; onDelete: () => Promise<void>; disabled: boolean; whatsappReceiptEnabled?: boolean }
const money = (value: number | null | undefined) => (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const date = (value: string | null | undefined) => value ? value.split('T')[0].split('-').reverse().join('/') : 'N/A'

function DeleteButton({ payment, vendaId, storeId, onDelete, disabled }: { payment: Pagamento; vendaId: number; storeId: number; onDelete: () => Promise<void>; disabled: boolean }) {
  const [pending, start] = useTransition()
  return <button type="button" disabled={pending || disabled} onClick={() => { if (disabled || !window.confirm(`Remover pagamento de ${money(payment.valor_pago)}?`)) return; start(async () => { const result = await deletePagamento(payment.id, vendaId, storeId); if (result.success) await onDelete(); else alert(`Erro: ${result.message}`) }) }} className="p-1 text-rose-400 hover:text-rose-300 hover:bg-rose-500/20 rounded-md disabled:opacity-50" title="Estornar / Remover">{pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}</button>
}

export default function ListaPagamentos({ pagamentos, vendaId, storeId, onDelete, disabled, whatsappReceiptEnabled = false }: Props) {
  const [sendingId, setSendingId] = useState<number | null>(null)
  const [sentIds, setSentIds] = useState<Set<number>>(() => new Set())
  // Recebimentos do carnê pertencem ao carnê: aqui ficam somente entradas e pagamentos diretos.
  const direct = pagamentos.filter((payment) => payment.parcela_id == null)
  const sendReceipt = async (paymentId: number) => { setSendingId(paymentId); try { const result = await sendSalePaymentReceiptWhatsApp({ storeId, paymentId }); if (!result.success) toast.error(result.message); else { setSentIds((current) => new Set(current).add(paymentId)); toast.success('Recibo enviado em PDF pelo WhatsApp da loja.') } } catch { toast.error('Não foi possível enviar o recibo por WhatsApp.') } finally { setSendingId(null) } }
  return <div className="flex flex-col h-full"><div className="flex-1 overflow-y-auto space-y-1 bg-transparent p-0 rounded-b-xl custom-scrollbar max-h-60">
    {direct.length === 0 ? <div className="flex flex-col items-center justify-center py-8 text-slate-500 bg-white/5 rounded-b-xl border border-dashed border-white/10"><p className="text-xs font-medium">Sem pagamentos diretos</p></div> : direct.map((payment) => <div key={payment.id} className="flex items-center gap-2 p-2 rounded-lg border-b border-white/5 group"><div className="flex-1 min-w-0"><div className="text-xs font-medium text-slate-300">{date(payment.data_pagamento)} <span className="text-[10px] text-amber-200/80 uppercase">{payment.forma_pagamento}</span></div><div className="text-[10px] text-slate-500">Entrada / pagamento direto{payment.employee?.full_name ? ` · Responsável: ${payment.employee.full_name}` : ''}</div></div><div className="font-bold text-emerald-400 text-xs">{money(payment.valor_pago)}</div>{whatsappReceiptEnabled ? <button type="button" onClick={() => void sendReceipt(payment.id)} disabled={sendingId === payment.id} className="flex items-center gap-1 p-1 text-emerald-300 disabled:opacity-60" title={sentIds.has(payment.id) ? 'Recibo enviado' : 'Enviar recibo'}>{sendingId === payment.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />}<span className="text-[9px] font-semibold">{sentIds.has(payment.id) ? 'Enviado' : 'Enviar'}</span></button> : null}<div className="opacity-0 group-hover:opacity-100"><DeleteButton payment={payment} vendaId={vendaId} storeId={storeId} onDelete={onDelete} disabled={disabled} /></div></div>)}
  </div></div>
}
