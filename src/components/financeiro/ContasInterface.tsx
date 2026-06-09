// ARQUIVO: src/components/financeiro/ContasInterface.tsx
'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation' 
import { Database } from '@/lib/database.types'
import { Plus, AlertCircle, CheckCircle, Clock, Trash2, TrendingDown, RefreshCw, Layers, Pencil } from 'lucide-react'
import NewBillModal from '@/components/modals/NewBillModal'
import PayBillModal from '@/components/modals/PayBillModal'
import { deleteBill, cancelRecurring, deleteSingleRecurringOccurrence } from '@/lib/actions/payable.actions'

// CORREÇÃO: Definir Bill como 'any' para evitar conflitos de tipagem com o banco desatualizado
type Bill = any

const formatMoney = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('pt-BR', { timeZone: 'UTC' })
const getCurrentMonthValue = () => {
    const now = new Date()
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}

// --- DESIGN SYSTEM ---
const labelStyle = "block text-[10px] font-bold text-slate-400 uppercase mb-1 tracking-wider"
const inputStyle = "block w-full rounded-lg border border-white/10 bg-black/20 shadow-inner text-slate-200 h-10 px-3 focus:ring-1 focus:ring-rose-500/50 focus:border-rose-500/50 font-bold cursor-pointer transition-all outline-none backdrop-blur-sm [color-scheme:dark]"
const activeFilterClass = "w-full text-left px-4 py-3 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold text-sm flex justify-between items-center shadow-sm transition-all"
const inactiveFilterClass = "w-full text-left px-4 py-3 rounded-xl text-slate-400 hover:bg-white/5 border border-transparent font-medium text-sm flex justify-between items-center transition-all"

export default function ContasInterface({ bills, storeId }: { bills: Bill[], storeId: number }) {
    const router = useRouter()
    const searchParams = useSearchParams() 
    
    const [isNewOpen, setIsNewOpen] = useState(false)
    const [editingBill, setEditingBill] = useState<Bill | null>(null)
    const [payBill, setPayBill] = useState<Bill | null>(null)
    const [filter, setFilter] = useState<'Todos' | 'Pendente' | 'Pago'>('Pendente')

    // Pega o mês atual da URL ou usa o mês corrente (Formato YYYY-MM)
    const currentMonth = searchParams.get('mes') 
        ? searchParams.get('mes')?.slice(0, 7) 
        : getCurrentMonthValue()

    // Função para trocar o mês
    const handleMonthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const novoMes = e.target.value // Retorna "2024-02"
        // Recarrega a página passando o dia 01 do novo mês para o backend filtrar
        router.push(`/dashboard/loja/${storeId}/financeiro/contas?mes=${novoMes}-01`)
    }

    // Cálculos Rápidos (CORREÇÃO: .getTime() para comparação segura de datas)
    const visibleBills = bills.filter(b => b.status !== 'Cancelado')
    const totalVencido = visibleBills.filter(b => b.status === 'Pendente' && new Date(b.due_date).getTime() < new Date(new Date().setHours(0,0,0,0)).getTime()).reduce((acc, b) => acc + b.amount, 0)
    const totalPendente = visibleBills.filter(b => b.status === 'Pendente').reduce((acc, b) => acc + b.amount, 0)
    const totalPago = visibleBills.filter(b => b.status === 'Pago').reduce((acc, b) => acc + (b.amount_paid || b.amount), 0)

    const filteredBills = visibleBills.filter(b => filter === 'Todos' ? true : b.status === filter)

    const handleDelete = async (bill: Bill) => {
        if (bill.is_recurring && bill.recurring_group_id) {
            const choice = confirm(
                `"${bill.description}" é uma conta recorrente.\n\nOK = Excluir só esta ocorrência\nCancelar = Cancelar também os próximos meses`
            )
            if (choice) {
                await deleteSingleRecurringOccurrence(bill.id, storeId)
            } else {
                const confirmCancel = confirm('Confirmar cancelamento da recorrência? Isso irá encerrar esta recorrência a partir desta ocorrência.')
                if (confirmCancel) {
                    await cancelRecurring(bill.id, storeId)
                }
            }
        } else {
            if (confirm('Tem certeza que deseja excluir esta conta?')) {
                await deleteBill(bill.id, storeId)
            }
        }
    }

    return (
        <div className="flex flex-col h-full space-y-4">
            
            {/* 1. KPIs (TOPO) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 shrink-0">
                
                {/* Vencidas (Alerta) */}
                <div className="bg-rose-500/10 backdrop-blur-xl p-4 rounded-2xl border border-rose-500/20 shadow-sm flex items-center justify-between relative overflow-hidden group hover:bg-rose-500/20 transition-all">
                    <div className="absolute right-0 top-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity"><AlertCircle className="h-16 w-16 text-rose-400" /></div>
                    <div className="relative z-10">
                        <p className="text-[10px] font-bold text-rose-400 uppercase tracking-wider">Vencidas / Atrasadas</p>
                        <p className="text-2xl font-black text-rose-300 mt-1">{formatMoney(totalVencido)}</p>
                    </div>
                </div>

                {/* A Pagar (Info) */}
                <div className="bg-blue-500/10 backdrop-blur-xl p-4 rounded-2xl border border-blue-500/20 shadow-sm flex items-center justify-between relative overflow-hidden group hover:bg-blue-500/20 transition-all">
                    <div className="absolute right-0 top-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity"><Clock className="h-16 w-16 text-blue-400" /></div>
                    <div className="relative z-10">
                        <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">A Pagar (Total)</p>
                        <p className="text-2xl font-black text-blue-300 mt-1">{formatMoney(totalPendente)}</p>
                    </div>
                </div>

                {/* Pago (Sucesso) */}
                <div className="bg-emerald-500/10 backdrop-blur-xl p-4 rounded-2xl border border-emerald-500/20 shadow-sm flex items-center justify-between relative overflow-hidden group hover:bg-emerald-500/20 transition-all">
                    <div className="absolute right-0 top-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity"><CheckCircle className="h-16 w-16 text-emerald-400" /></div>
                    <div className="relative z-10">
                         <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Pago no Mês</p>
                         <p className="text-2xl font-black text-emerald-300 mt-1">{formatMoney(totalPago)}</p>
                    </div>
                </div>
            </div>

            {/* 2. CORPO (SPLIT VIEW) */}
            <div className="flex-1 flex gap-6 overflow-hidden">
                
                {/* ESQUERDA: PAINEL DE CONTROLE */}
                <div className="w-1/4 min-w-[240px] flex flex-col gap-4">
                    
                    {/* --- NOVO SELETOR DE MÊS --- */}
                    <div className="bg-white/5 backdrop-blur-xl p-4 rounded-2xl border border-white/10 shadow-sm">
                        <label className={labelStyle}>Mês de Referência</label>
                        <input 
                            type="month" 
                            value={currentMonth || ''} 
                            onChange={handleMonthChange}
                            className={inputStyle}
                        />
                    </div>

                    {/* Botão Principal */}
                    <button 
                        onClick={() => setIsNewOpen(true)}
                        className="w-full py-4 bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-500 hover:to-red-600 text-white rounded-2xl shadow-lg shadow-rose-900/20 flex items-center justify-center gap-2 font-bold transition-all active:scale-95 border border-white/10"
                    >
                        <Plus className="h-5 w-5" />
                        NOVA CONTA
                    </button>

                    {/* Filtros Laterais */}
                    <div className="bg-white/5 backdrop-blur-xl rounded-2xl shadow-sm border border-white/10 p-2 flex flex-col gap-1 flex-1">
                        <p className="px-4 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Filtrar por Status</p>
                        
                        <button onClick={() => setFilter('Pendente')} className={filter === 'Pendente' ? activeFilterClass : inactiveFilterClass}>
                            <span>Pendentes</span>
                            <span className="bg-black/20 px-2 py-0.5 rounded text-xs border border-white/5">{visibleBills.filter(b=>b.status === 'Pendente').length}</span>
                        </button>
                        
                        <button onClick={() => setFilter('Pago')} className={filter === 'Pago' ? activeFilterClass : inactiveFilterClass}>
                            <span>Pagos</span>
                            <span className="bg-black/20 px-2 py-0.5 rounded text-xs border border-white/5">{visibleBills.filter(b=>b.status === 'Pago').length}</span>
                        </button>

                        <button onClick={() => setFilter('Todos')} className={filter === 'Todos' ? activeFilterClass : inactiveFilterClass}>
                            <span>Todos</span>
                            <span className="bg-black/20 px-2 py-0.5 rounded text-xs border border-white/5">{visibleBills.length}</span>
                        </button>
                    </div>
                </div>

                {/* DIREITA: LISTA */}
                <div className="flex-1 bg-white/5 backdrop-blur-xl rounded-2xl shadow-sm border border-white/10 flex flex-col overflow-hidden">
                    <div className="bg-black/20 px-6 py-4 border-b border-white/10 flex justify-between items-center">
                        <h3 className="font-bold text-slate-200 text-sm flex items-center gap-2 uppercase tracking-wide">
                            <TrendingDown className="h-4 w-4 text-rose-400" /> Lista de Contas
                        </h3>
                        <span className="text-xs font-bold text-slate-400 bg-black/20 px-2 py-1 rounded border border-white/5">
                            {(currentMonth || '').split('-').reverse().join('/')}
                        </span>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-0 custom-scrollbar">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-black/40 sticky top-0 z-10 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-white/10 backdrop-blur-md">
                                <tr>
                                    <th className="px-6 py-3">Vencimento</th>
                                    <th className="px-6 py-3">Descrição / Fornecedor</th>
                                    <th className="px-6 py-3 text-right">Valor</th>
                                    <th className="px-6 py-3 text-center">Status</th>
                                    <th className="px-6 py-3 text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {filteredBills.length === 0 ? (
                                    <tr><td colSpan={5} className="p-10 text-center text-slate-500 italic">Nenhuma conta encontrada neste mês.</td></tr>
                                ) : (
                                    filteredBills.map(bill => {
                                        // CORREÇÃO: Comparação de data segura com .getTime()
                                        const isLate = bill.status === 'Pendente' && new Date(bill.due_date).getTime() < new Date(new Date().setHours(0,0,0,0)).getTime();
                                        return (
                                            <tr key={bill.id} className="hover:bg-white/5 transition-colors group">
                                                <td className="px-6 py-3 font-mono text-slate-400 text-xs">
                                                    {formatDate(bill.due_date)}
                                                </td>
                                                <td className="px-6 py-3">
                                                    <p className="font-bold text-slate-200 text-sm">{bill.description}</p>
                                                    <div className="flex flex-wrap gap-1.5 mt-1">
                                                        {bill.category && <span className="text-[10px] bg-white/5 text-slate-400 px-1.5 py-0.5 rounded border border-white/10">{bill.category}</span>}
                                                        {bill.suppliers && <span className="text-[10px] text-blue-400 font-medium bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20">{bill.suppliers.nome_fantasia}</span>}
                                                        {/* Badge Recorrente */}
                                                        {bill.is_recurring && (
                                                            <span className="text-[10px] text-indigo-300 font-bold bg-indigo-500/20 px-1.5 py-0.5 rounded border border-indigo-500/30 flex items-center gap-1">
                                                                <RefreshCw className="h-2.5 w-2.5" /> Recorrente
                                                            </span>
                                                        )}
                                                        {/* Badge Parcela */}
                                                        {bill.installment_number && bill.installment_total && (
                                                            <span className="text-[10px] text-amber-300 font-bold bg-amber-500/20 px-1.5 py-0.5 rounded border border-amber-500/30 flex items-center gap-1">
                                                                <Layers className="h-2.5 w-2.5" /> {bill.installment_number}/{bill.installment_total}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-3 text-right font-bold text-slate-200">
                                                    {formatMoney(bill.amount)}
                                                </td>
                                                <td className="px-6 py-3 text-center">
                                                    {bill.status === 'Pago' ? (
                                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-300 bg-emerald-500/20 px-2 py-1 rounded border border-emerald-500/30 uppercase">
                                                            Pago
                                                        </span>
                                                    ) : isLate ? (
                                                        <span className="inline-flex items-center gap-1 text-[10px] font-black text-rose-200 bg-rose-500/40 px-2 py-1 rounded uppercase shadow-sm border border-rose-500/50">
                                                            Atrasado
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-300 bg-white/10 px-2 py-1 rounded border border-white/20 uppercase">
                                                            A Vencer
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-3 text-right">
                                                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button onClick={() => setEditingBill(bill)} className="p-1.5 text-slate-400 hover:text-amber-300 hover:bg-amber-500/10 rounded transition-colors border border-transparent hover:border-amber-500/20" title="Editar conta">
                                                            <Pencil className="h-4 w-4" />
                                                        </button>
                                                        {bill.status === 'Pendente' && (
                                                            <button onClick={() => setPayBill(bill)} className="text-[10px] bg-emerald-600/80 text-white px-3 py-1.5 rounded font-bold hover:bg-emerald-500 shadow-sm flex items-center gap-1 border border-emerald-500/50 transition-colors">
                                                                <CheckCircle className="h-3 w-3" /> BAIXAR
                                                            </button>
                                                        )}
                                                        <button onClick={() => handleDelete(bill)} className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors border border-transparent hover:border-red-500/20">
                                                            <Trash2 className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        )
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Modais */}
            {isNewOpen && <NewBillModal isOpen={isNewOpen} onClose={() => setIsNewOpen(false)} storeId={storeId} />}
            {editingBill && <NewBillModal isOpen={!!editingBill} onClose={() => setEditingBill(null)} storeId={storeId} bill={editingBill} />}
            {payBill && <PayBillModal bill={payBill} onClose={() => setPayBill(null)} />}
        </div>
    )
}
