'use client'

import { useEffect } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { payBill } from '@/lib/actions/payable.actions'
import { X, CheckCircle2, Loader2, AlertTriangle, Wallet, Landmark } from 'lucide-react'
import { Database } from '@/lib/database.types'

type Bill = Database['public']['Tables']['accounts_payable']['Row']

// --- DESIGN SYSTEM ---
const labelStyle = "block text-[10px] font-bold text-slate-600 uppercase mb-1 tracking-wider"
const inputStyle = "block w-full rounded-lg border border-slate-300 bg-white shadow-sm text-slate-900 h-10 text-sm px-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-bold transition-all"

function SubmitPayButton() {
    const { pending } = useFormStatus()
    return (
        <button disabled={pending} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-200 disabled:opacity-50 transition-transform active:scale-95">
            {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
            CONFIRMAR PAGAMENTO
        </button>
    )
}

export default function PayBillModal({ bill, onClose }: { bill: Bill, onClose: () => void }) {
    const [state, dispatch] = useFormState(payBill, { success: false, message: '' })

    useEffect(() => {
        if (state.success) onClose()
        else if (state.message) alert(state.message)
    }, [state, onClose])

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden flex flex-col">
                
                {/* Header Gradiente Verde (Sucesso/Baixa) */}
                <div className="bg-gradient-to-r from-emerald-500 to-teal-600 px-6 py-4 border-b border-emerald-700 flex justify-between items-center">
                    <h3 className="font-bold text-white flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5" /> Baixar Conta
                    </h3>
                    <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-full text-white transition-colors"><X className="h-5 w-5"/></button>
                </div>

                <form action={dispatch} className="p-6 space-y-5 bg-slate-50">
                    <input type="hidden" name="bill_id" value={bill.id} />
                    
                    <div className="text-center mb-4">
                        <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Pagando</p>
                        <p className="text-lg font-bold text-slate-800 line-clamp-1">{bill.description}</p>
                        <p className="text-3xl font-black text-emerald-600 mt-1 tracking-tight">
                            {bill.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </p>
                    </div>

                    <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                        <p className={labelStyle}>Origem do Dinheiro</p>
                        <div className="space-y-2 mt-2">
                            <label className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer hover:border-emerald-400 transition-all group">
                                <input type="radio" name="source" value="Caixa" required className="text-emerald-600 focus:ring-emerald-500 w-4 h-4" />
                                <div className="flex items-center gap-2 text-slate-700 font-bold text-sm group-hover:text-emerald-700">
                                    <Wallet className="h-4 w-4 text-slate-400 group-hover:text-emerald-500"/> Caixa da Loja (Gaveta)
                                </div>
                            </label>
                            
                            <label className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer hover:border-emerald-400 transition-all group">
                                <input type="radio" name="source" value="Banco" required className="text-emerald-600 focus:ring-emerald-500 w-4 h-4" />
                                <div className="flex items-center gap-2 text-slate-700 font-bold text-sm group-hover:text-emerald-700">
                                    <Landmark className="h-4 w-4 text-slate-400 group-hover:text-emerald-500"/> Banco / Boleto / Pix
                                </div>
                            </label>
                        </div>
                        <div className="mt-2 flex gap-1.5 text-[10px] text-amber-700 font-bold bg-amber-50 p-2 rounded border border-amber-100">
                            <AlertTriangle className="h-3 w-3 flex-shrink-0 mt-0.5" />
                            <span>Atenção: "Caixa" lança uma sangria automática no fechamento do dia.</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className={labelStyle}>Valor Pago</label>
                            <input name="amount_paid" type="number" step="0.01" defaultValue={bill.amount} className={`${inputStyle} text-right`} />
                        </div>
                        <div>
                            <label className={labelStyle}>Data Pagto</label>
                            <input name="payment_date" type="date" defaultValue={new Date().toISOString().split('T')[0]} className={inputStyle} />
                        </div>
                    </div>

                    <SubmitPayButton />
                </form>
            </div>
        </div>
    )
}