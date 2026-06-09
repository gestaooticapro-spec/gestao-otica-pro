'use client'

import { useRef, useEffect, useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { saveBill } from '@/lib/actions/payable.actions'
import { X, Save, Loader2, Calendar, Tag, FileText, RefreshCw, Minus, Plus } from 'lucide-react'
import { Database } from '@/lib/database.types'

type Bill = Database['public']['Tables']['accounts_payable']['Row']
type EditScope = 'single' | 'future'

function SubmitButton({ installments, isEditing }: { installments: number, isEditing: boolean }) {
    const { pending } = useFormStatus()
    const label = isEditing ? 'SALVAR ALTERAÇÕES' : installments > 1 ? `LANÇAR ${installments} PARCELAS` : 'SALVAR CONTA'
    return (
        <button disabled={pending} className="w-full bg-rose-600 hover:bg-rose-500 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-rose-900/20 disabled:opacity-50 transition-all active:scale-95 border border-white/10">
            {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
            {label}
        </button>
    )
}

const labelStyle = "block text-[10px] font-bold text-slate-400 uppercase mb-1.5 tracking-wider"
const inputStyle = "block w-full rounded-lg border border-white/10 bg-black/20 shadow-inner text-slate-200 h-10 text-sm px-3 focus:ring-1 focus:ring-rose-500/50 focus:border-rose-500/50 font-bold placeholder:font-normal placeholder:text-slate-500 transition-all outline-none [color-scheme:dark]"

export default function NewBillModal({ isOpen, onClose, storeId, bill }: { isOpen: boolean, onClose: () => void, storeId: number, bill?: Bill | null }) {
    const [state, dispatch] = useFormState(saveBill, { success: false, message: '' })
    const formRef = useRef<HTMLFormElement>(null)
    const [isRecurring, setIsRecurring] = useState(false)
    const [installments, setInstallments] = useState(1)
    const [editScope, setEditScope] = useState<EditScope>('single')
    const isEditing = !!bill

    useEffect(() => {
        if (state.success) {
            onClose()
            formRef.current?.reset()
            setIsRecurring(false)
            setInstallments(1)
            setEditScope('single')
        } else if (state.message) {
            alert(state.message)
        }
    }, [state, onClose])

    useEffect(() => {
        if (!isOpen) return
        setIsRecurring(!!bill?.is_recurring)
        setInstallments(bill?.installment_total || 1)
        setEditScope('single')
    }, [bill, isOpen])

    if (!isOpen) return null

    const handleDecrease = () => setInstallments(p => Math.max(1, p - 1))
    const handleIncrease = () => {
        if (isRecurring) return
        setInstallments(p => Math.min(60, p + 1))
    }
    const handleToggleRecurring = () => {
        const next = !isRecurring
        setIsRecurring(next)
        if (next) setInstallments(1)
    }

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-white/10 w-full max-w-md rounded-2xl shadow-2xl shadow-black/60 overflow-hidden flex flex-col">

                {/* Header */}
                <div className="bg-gradient-to-r from-rose-600/80 to-red-700/80 backdrop-blur-xl px-6 py-4 border-b border-white/10 flex justify-between items-center">
                    <h3 className="font-bold text-white flex items-center gap-2">
                        <FileText className="h-5 w-5" /> {isEditing ? 'Editar Conta a Pagar' : 'Nova Conta a Pagar'}
                    </h3>
                    <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-full text-white transition-colors">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <form action={dispatch} ref={formRef} className="p-6 space-y-5">
                    {/* Hidden fields */}
                    <input type="hidden" name="store_id" value={storeId} />
                    <input type="hidden" name="id" value={bill?.id || ''} />
                    <input type="hidden" name="is_recurring" value={isRecurring ? 'true' : 'false'} />
                    <input type="hidden" name="installments" value={installments} />
                    <input type="hidden" name="edit_scope" value={editScope} />

                    {/* Descrição */}
                    <div>
                        <label className={labelStyle}>Descrição / Histórico</label>
                        <input
                            name="description"
                            required
                            placeholder="Ex: Aluguel, Boleto Hoya, Conta de Luz..."
                            className={inputStyle}
                            autoFocus
                            defaultValue={bill?.description || ''}
                        />
                    </div>

                    {/* Parcelas + Valor */}
                    <div>
                        <label className={labelStyle}>Parcelas × Valor</label>
                        <div className="flex items-center gap-2">
                            {/* Stepper de parcelas */}
                            <div className={`flex items-center rounded-lg border overflow-hidden transition-all ${isRecurring ? 'border-white/5 opacity-40' : 'border-white/15 bg-black/20'}`}>
                                <button
                                    type="button"
                                    onClick={handleDecrease}
                                    disabled={isRecurring || isEditing}
                                    className="w-9 h-10 text-slate-400 hover:text-white hover:bg-white/10 font-bold text-lg transition-colors flex items-center justify-center disabled:cursor-not-allowed"
                                >
                                    <Minus className="h-3 w-3" />
                                </button>
                                <span className="text-white font-black text-sm w-8 text-center tabular-nums">
                                    {installments}
                                </span>
                                <button
                                    type="button"
                                    onClick={handleIncrease}
                                    disabled={isRecurring || isEditing}
                                    className="w-9 h-10 text-slate-400 hover:text-white hover:bg-white/10 font-bold transition-colors flex items-center justify-center disabled:cursor-not-allowed"
                                >
                                    <Plus className="h-3 w-3" />
                                </button>
                            </div>

                            <span className="text-slate-500 font-bold text-sm shrink-0">× R$</span>

                            {/* Valor */}
                            <input
                                name="amount"
                                type="number"
                                step="0.01"
                                required
                                className={`${inputStyle} flex-1`}
                                placeholder="0,00"
                                defaultValue={bill?.amount || ''}
                            />
                        </div>
                    </div>

                    {/* Vencimento */}
                    <div>
                        <label className={labelStyle}>
                            {installments > 1 ? '1ª Parcela — Vencimento' : 'Vencimento'}
                        </label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
                            <input name="due_date" type="date" required className={`${inputStyle} pl-9`} defaultValue={bill?.due_date?.split('T')[0] || ''} />
                        </div>
                        {installments > 1 && (
                            <p className="text-[10px] text-indigo-400/80 mt-1.5 ml-1 flex items-center gap-1">
                                <RefreshCw className="h-2.5 w-2.5" />
                                As demais {installments - 1} parcela(s) serão lançadas nos meses seguintes automaticamente.
                            </p>
                        )}
                    </div>

                    {/* Toggle Recorrente */}
                    <button
                        type="button"
                        onClick={handleToggleRecurring}
                        disabled={installments > 1 || isEditing}
                        className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border font-bold text-sm transition-all ${
                            isRecurring
                                ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300 shadow-sm shadow-indigo-500/10'
                                : 'bg-white/5 border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-300'
                        } disabled:opacity-30 disabled:cursor-not-allowed`}
                    >
                        <div className="flex items-center gap-2">
                            <RefreshCw className={`h-4 w-4 transition-all ${isRecurring ? 'text-indigo-400' : 'text-slate-500'}`} />
                            <span>Vence todo mês (Recorrente)</span>
                        </div>
                        {/* Toggle visual */}
                        <div className={`w-10 h-5 rounded-full transition-all duration-300 flex items-center px-0.5 ${isRecurring ? 'bg-indigo-500' : 'bg-white/10'}`}>
                            <div className={`w-4 h-4 rounded-full bg-white shadow-md transition-all duration-300 ${isRecurring ? 'translate-x-5' : 'translate-x-0'}`} />
                        </div>
                    </button>
                    {installments > 1 && (
                        <p className="text-[10px] text-slate-500 -mt-3 ml-1">
                            Reduza para 1× para ativar a recorrência.
                        </p>
                    )}
                    {isEditing && (
                        <p className="text-[10px] text-slate-500 -mt-3 ml-1">
                            Para manter a estrutura segura, a edição não altera recorrência nem quantidade de parcelas.
                        </p>
                    )}

                    {isEditing && bill?.is_recurring && (
                        <div className="space-y-2">
                            <label className={labelStyle}>Aplicar alteração</label>
                            <label className="flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-white/5 cursor-pointer">
                                <input type="radio" checked={editScope === 'single'} onChange={() => setEditScope('single')} />
                                <div>
                                    <p className="text-sm font-bold text-slate-200">Só esta ocorrência</p>
                                    <p className="text-[10px] text-slate-400">As próximas continuam com os valores anteriores.</p>
                                </div>
                            </label>
                            <label className="flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-white/5 cursor-pointer">
                                <input type="radio" checked={editScope === 'future'} onChange={() => setEditScope('future')} />
                                <div>
                                    <p className="text-sm font-bold text-slate-200">Esta e as próximas</p>
                                    <p className="text-[10px] text-slate-400">Atualiza a ocorrência atual e as pendentes futuras da mesma recorrência.</p>
                                </div>
                            </label>
                        </div>
                    )}

                    {/* Categoria */}
                    <div>
                        <label className={labelStyle}>Categoria</label>
                        <div className="relative">
                            <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
                            <select name="category" className={`${inputStyle} pl-9 cursor-pointer`} defaultValue={bill?.category || 'Fixa'}>
                                <option value="Fixa">Despesa Fixa (Aluguel, Luz)</option>
                                <option value="Fornecedor">Fornecedor / Produtos</option>
                                <option value="Pessoal">Pessoal / Salários</option>
                                <option value="Impostos">Impostos</option>
                                <option value="Outros">Outros</option>
                            </select>
                        </div>
                    </div>

                    <div className="pt-1">
                        <SubmitButton installments={installments} isEditing={isEditing} />
                    </div>
                </form>
            </div>
        </div>
    )
}
