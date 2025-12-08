// ARQUIVO: src/components/financeiro/ContasInterface.tsx
'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation' 
import { Database } from '@/lib/database.types'
import { Plus, Calendar, AlertCircle, CheckCircle, Clock, Trash2, Filter, ArrowRight, DollarSign, TrendingDown } from 'lucide-react'
import NewBillModal from '@/components/modals/NewBillModal'
import PayBillModal from '@/components/modals/PayBillModal'
import { deleteBill } from '@/lib/actions/payable.actions'

// CORREÇÃO: Definir Bill como 'any' para evitar conflitos de tipagem com o banco desatualizado
type Bill = any

const formatMoney = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('pt-BR', { timeZone: 'UTC' })

// --- DESIGN SYSTEM ---
const labelStyle = "block text-[10px] font-bold text-slate-600 uppercase mb-0.5 tracking-wider"
const activeFilterClass = "w-full text-left px-4 py-3 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 font-bold text-sm flex justify-between items-center shadow-sm transition-all"
const inactiveFilterClass = "w-full text-left px-4 py-3 rounded-lg text-slate-500 hover:bg-slate-50 font-medium text-sm flex justify-between items-center transition-all"

export default function ContasInterface({ bills, storeId }: { bills: Bill[], storeId: number }) {
    const router = useRouter()
    const searchParams = useSearchParams() 
    
    const [isNewOpen, setIsNewOpen] = useState(false)
    const [payBill, setPayBill] = useState<Bill | null>(null)
    const [filter, setFilter] = useState<'Todos' | 'Pendente' | 'Pago'>('Pendente')

    // Pega o mês atual da URL ou usa o mês corrente (Formato YYYY-MM)
    const currentMonth = searchParams.get('mes') 
        ? searchParams.get('mes')?.slice(0, 7) 
        : new Date().toISOString().slice(0, 7)

    // Função para trocar o mês
    const handleMonthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const novoMes = e.target.value // Retorna "2024-02"
        // Recarrega a página passando o dia 01 do novo mês para o backend filtrar
        router.push(`/dashboard/loja/${storeId}/financeiro/contas?mes=${novoMes}-01`)
    }

    // Cálculos Rápidos (CORREÇÃO: .getTime() para comparação segura de datas)
    const totalVencido = bills.filter(b => b.status === 'Pendente' && new Date(b.due_date).getTime() < new Date(new Date().setHours(0,0,0,0)).getTime()).reduce((acc, b) => acc + b.amount, 0)
    const totalPendente = bills.filter(b => b.status === 'Pendente').reduce((acc, b) => acc + b.amount, 0)
    const totalPago = bills.filter(b => b.status === 'Pago').reduce((acc, b) => acc + (b.amount_paid || b.amount), 0)

    const filteredBills = bills.filter(b => filter === 'Todos' ? true : b.status === filter)

    const handleDelete = async (id: number) => {
        if (confirm("Tem certeza que deseja excluir esta conta?")) {
            await deleteBill(id, storeId)
        }
    }

    return (
        <div className="flex flex-col h-full space-y-4">
            
            {/* 1. KPIs (TOPO) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 shrink-0">
                
                {/* Vencidas (Alerta) */}
                <div className="bg-white p-4 rounded-2xl border-l-4 border-rose-500 shadow-sm flex items-center justify-between relative overflow-hidden group">
                    <div className="absolute right-0 top-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity"><AlertCircle className="h-16 w-16 text-rose-500" /></div>
                    <div className="relative z-10">
                        <p className="text-[10px] font-bold text-rose-500 uppercase tracking-wider">Vencidas / Atrasadas</p>
                        <p className="text-2xl font-black text-rose-600 mt-1">{formatMoney(totalVencido)}</p>
                    </div>
                </div>

                {/* A Pagar (Info) */}
                <div className="bg-white p-4 rounded-2xl border-l-4 border-blue-500 shadow-sm flex items-center justify-between relative overflow-hidden group">
                    <div className="absolute right-0 top-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity"><Clock className="h-16 w-16 text-blue-500" /></div>
                    <div className="relative z-10">
                        <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">A Pagar (Total)</p>
                        <p className="text-2xl font-black text-blue-600 mt-1">{formatMoney(totalPendente)}</p>
                    </div>
                </div>

                {/* Pago (Sucesso) */}
                <div className="bg-white p-4 rounded-2xl border-l-4 border-emerald-500 shadow-sm flex items-center justify-between relative overflow-hidden group">
                    <div className="absolute right-0 top-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity"><CheckCircle className="h-16 w-16 text-emerald-500" /></div>
                    <div className="relative z-10">
                         <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Pago no Mês</p>
                         <p className="text-2xl font-black text-emerald-600 mt-1">{formatMoney(totalPago)}</p>
                    </div>
                </div>
            </div>

            {/* 2. CORPO (SPLIT VIEW) */}
            <div className="flex-1 flex gap-6 overflow-hidden">
                
                {/* ESQUERDA: PAINEL DE CONTROLE */}
                <div className="w-1/4 min-w-[240px] flex flex-col gap-4">
                    
                    {/* --- NOVO SELETOR DE MÊS --- */}
                    <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                        <label className={labelStyle}>Mês de Referência</label>
                        <input 
                            type="month" 
                            value={currentMonth || ''} 
                            onChange={handleMonthChange}
                            className="block w-full rounded-lg border border-slate-300 bg-slate-50 shadow-sm text-slate-900 h-10 px-3 focus:ring-2 focus:ring-rose-500 focus:border-rose-500 font-bold cursor-pointer"
                        />
                    </div>

                    {/* Botão Principal */}
                    <button 
                        onClick={() => setIsNewOpen(true)}
                        className="w-full py-4 bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-700 hover:to-red-800 text-white rounded-2xl shadow-lg shadow-rose-200 flex items-center justify-center gap-2 font-bold transition-transform active:scale-95"
                    >
                        <Plus className="h-5 w-5" />
                        NOVA CONTA
                    </button>

                    {/* Filtros Laterais */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-2 flex flex-col gap-1 flex-1">
                        <p className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Filtrar por Status</p>
                        
                        <button onClick={() => setFilter('Pendente')} className={filter === 'Pendente' ? activeFilterClass : inactiveFilterClass}>
                            <span>Pendentes</span>
                            <span className="bg-white/50 px-2 py-0.5 rounded text-xs border border-slate-200">{bills.filter(b=>b.status === 'Pendente').length}</span>
                        </button>
                        
                        <button onClick={() => setFilter('Pago')} className={filter === 'Pago' ? activeFilterClass : inactiveFilterClass}>
                            <span>Pagos</span>
                            <span className="bg-white/50 px-2 py-0.5 rounded text-xs border border-slate-200">{bills.filter(b=>b.status === 'Pago').length}</span>
                        </button>

                        <button onClick={() => setFilter('Todos')} className={filter === 'Todos' ? activeFilterClass : inactiveFilterClass}>
                            <span>Todos</span>
                            <span className="bg-white/50 px-2 py-0.5 rounded text-xs border border-slate-200">{bills.length}</span>
                        </button>
                    </div>
                </div>

                {/* DIREITA: LISTA */}
                <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
                    <div className="bg-slate-50 px-6 py-3 border-b border-slate-200 flex justify-between items-center">
                        <h3 className="font-bold text-slate-700 text-sm flex items-center gap-2 uppercase tracking-wide">
                            <TrendingDown className="h-4 w-4 text-rose-500" /> Lista de Contas
                        </h3>
                        <span className="text-xs font-bold text-slate-400 bg-white px-2 py-1 rounded border border-slate-200">
                            {(currentMonth || '').split('-').reverse().join('/')}
                        </span>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-0 custom-scrollbar">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-white sticky top-0 z-10 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                                <tr>
                                    <th className="px-6 py-3">Vencimento</th>
                                    <th className="px-6 py-3">Descrição / Fornecedor</th>
                                    <th className="px-6 py-3 text-right">Valor</th>
                                    <th className="px-6 py-3 text-center">Status</th>
                                    <th className="px-6 py-3 text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {filteredBills.length === 0 ? (
                                    <tr><td colSpan={5} className="p-10 text-center text-slate-400 italic">Nenhuma conta encontrada neste mês.</td></tr>
                                ) : (
                                    filteredBills.map(bill => {
                                        // CORREÇÃO: Comparação de data segura com .getTime()
                                        const isLate = bill.status === 'Pendente' && new Date(bill.due_date).getTime() < new Date(new Date().setHours(0,0,0,0)).getTime();
                                        return (
                                            <tr key={bill.id} className="hover:bg-slate-50 transition-colors group">
                                                <td className="px-6 py-3 font-mono text-slate-500 text-xs">
                                                    {formatDate(bill.due_date)}
                                                </td>
                                                <td className="px-6 py-3">
                                                    <p className="font-bold text-slate-700 text-sm">{bill.description}</p>
                                                    <div className="flex gap-2 mt-0.5">
                                                        {bill.category && <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 rounded border border-slate-200">{bill.category}</span>}
                                                        {bill.suppliers && <span className="text-[10px] text-blue-600 font-medium">{bill.suppliers.nome_fantasia}</span>}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-3 text-right font-bold text-slate-800">
                                                    {formatMoney(bill.amount)}
                                                </td>
                                                <td className="px-6 py-3 text-center">
                                                    {bill.status === 'Pago' ? (
                                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded border border-emerald-100 uppercase">
                                                            Pago
                                                        </span>
                                                    ) : isLate ? (
                                                        <span className="inline-flex items-center gap-1 text-[10px] font-black text-white bg-rose-500 px-2 py-1 rounded uppercase shadow-sm">
                                                            Atrasado
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded border border-slate-200 uppercase">
                                                            A Vencer
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-3 text-right">
                                                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        {bill.status === 'Pendente' && (
                                                            <button onClick={() => setPayBill(bill)} className="text-[10px] bg-green-600 text-white px-3 py-1.5 rounded font-bold hover:bg-green-700 shadow-sm flex items-center gap-1">
                                                                <CheckCircle className="h-3 w-3" /> BAIXAR
                                                            </button>
                                                        )}
                                                        <button onClick={() => handleDelete(bill.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
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
            {payBill && <PayBillModal bill={payBill} onClose={() => setPayBill(null)} />}
        </div>
    )
}