'use client'

import { useRef, useEffect } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { saveBill } from '@/lib/actions/payable.actions'
import { X, Save, Loader2, Calendar, DollarSign, Tag, FileText } from 'lucide-react'

function SubmitButton() {
    const { pending } = useFormStatus()
    return (
        <button disabled={pending} className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-rose-200 disabled:opacity-50 transition-transform active:scale-95">
            {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
            SALVAR CONTA
        </button>
    )
}

// --- DESIGN SYSTEM (ALTO CONTRASTE) ---
const labelStyle = "block text-[10px] font-bold text-slate-700 uppercase mb-1 tracking-wider"
const inputStyle = "block w-full rounded-lg border border-slate-300 bg-white shadow-sm text-slate-900 h-10 text-sm px-3 focus:ring-2 focus:ring-rose-500 focus:border-rose-500 font-bold placeholder:font-normal placeholder:text-slate-400 transition-all"

export default function NewBillModal({ isOpen, onClose, storeId }: { isOpen: boolean, onClose: () => void, storeId: number }) {
    const [state, dispatch] = useFormState(saveBill, { success: false, message: '' })
    const formRef = useRef<HTMLFormElement>(null)

    useEffect(() => {
        if (state.success) {
            onClose()
            formRef.current?.reset()
        } else if (state.message) {
            alert(state.message)
        }
    }, [state, onClose])

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col">
                
                {/* Header Gradiente */}
                <div className="bg-gradient-to-r from-rose-600 to-red-700 px-6 py-4 border-b border-rose-800 flex justify-between items-center">
                    <h3 className="font-bold text-white flex items-center gap-2">
                        <FileText className="h-5 w-5" /> Nova Conta a Pagar
                    </h3>
                    <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-full text-white transition-colors"><X className="h-5 w-5"/></button>
                </div>
                
                <form action={dispatch} ref={formRef} className="p-6 space-y-5 bg-slate-50">
                    <input type="hidden" name="store_id" value={storeId} />
                    
                    <div>
                        <label className={labelStyle}>Descrição / Histórico</label>
                        <input name="description" required placeholder="Ex: Aluguel, Boleto Hoya..." className={inputStyle} autoFocus />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className={labelStyle}>Valor (R$)</label>
                            <div className="relative">
                                <DollarSign className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                                <input name="amount" type="number" step="0.01" required className={`${inputStyle} pl-9 text-lg`} placeholder="0.00" />
                            </div>
                        </div>
                        <div>
                            <label className={labelStyle}>Vencimento</label>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                                <input name="due_date" type="date" required className={`${inputStyle} pl-9`} />
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className={labelStyle}>Categoria</label>
                        <div className="relative">
                            <Tag className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                            <select name="category" className={`${inputStyle} pl-9 cursor-pointer`}>
                                <option value="Fixa">Despesa Fixa (Aluguel, Luz)</option>
                                <option value="Fornecedor">Fornecedor / Produtos</option>
                                <option value="Pessoal">Pessoal / Salários</option>
                                <option value="Impostos">Impostos</option>
                                <option value="Outros">Outros</option>
                            </select>
                        </div>
                    </div>

                    <div className="pt-2">
                        <SubmitButton />
                    </div>
                </form>
            </div>
        </div>
    )
}