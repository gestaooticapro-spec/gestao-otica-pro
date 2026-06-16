'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Plus, AlertCircle, CheckCircle, Clock, Trash2, TrendingDown, RefreshCw, Layers, Pencil } from 'lucide-react'
import NewBillModal from '@/components/modals/NewBillModal'
import PayBillModal from '@/components/modals/PayBillModal'
import { deleteBill, cancelRecurring, deleteSingleRecurringOccurrence } from '@/lib/actions/payable.actions'
import { Database } from '@/lib/database.types'

type Bill = Database['public']['Tables']['accounts_payable']['Row'] & {
    suppliers?: {
        nome_fantasia: string
    } | null
}

const formatMoney = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('pt-BR', { timeZone: 'UTC' })
const getCurrentMonthValue = () => {
    const now = new Date()
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}

const DAY_MS = 24 * 60 * 60 * 1000

const startOfUtcDay = (dateStr: string) => {
    const date = new Date(dateStr)
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

const getStartOfWeekMonday = (date: Date) => {
    const day = date.getUTCDay()
    const diffToMonday = day === 0 ? -6 : 1 - day
    return new Date(date.getTime() + diffToMonday * DAY_MS)
}

const getEndOfWeekSunday = (weekStart: Date) => new Date(weekStart.getTime() + 6 * DAY_MS)

const formatWeekLabel = (start: Date, end: Date) =>
    `${start.toLocaleDateString('pt-BR', { timeZone: 'UTC' })} a ${end.toLocaleDateString('pt-BR', { timeZone: 'UTC' })}`

const labelStyle = 'block text-[10px] font-bold text-slate-400 uppercase mb-1 tracking-wider'
const inputStyle = 'block w-full rounded-lg border border-white/10 bg-black/20 shadow-inner text-slate-200 h-10 px-3 focus:ring-1 focus:ring-rose-500/50 focus:border-rose-500/50 font-bold cursor-pointer transition-all outline-none backdrop-blur-sm [color-scheme:dark]'
const selectStyle = 'block w-full rounded-lg border border-white/15 bg-slate-950 text-slate-100 shadow-inner h-10 px-3 focus:ring-1 focus:ring-rose-500/50 focus:border-rose-500/50 font-bold cursor-pointer transition-all outline-none backdrop-blur-sm hover:border-white/25 [color-scheme:dark]'
const activeFilterClass = 'w-full text-left px-4 py-3 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold text-sm flex justify-between items-center shadow-sm transition-all'
const inactiveFilterClass = 'w-full text-left px-4 py-3 rounded-xl text-slate-400 hover:bg-white/5 border border-transparent font-medium text-sm flex justify-between items-center transition-all'

export default function ContasInterface({ bills, storeId }: { bills: Bill[], storeId: number }) {
    const router = useRouter()
    const searchParams = useSearchParams()

    const [isNewOpen, setIsNewOpen] = useState(false)
    const [editingBill, setEditingBill] = useState<Bill | null>(null)
    const [payBill, setPayBill] = useState<Bill | null>(null)
    const [filter, setFilter] = useState<'Todos' | 'Pendente' | 'Pago'>('Pendente')
    const [weekFilter, setWeekFilter] = useState('all')
    const [categoryFilter, setCategoryFilter] = useState('all')

    const currentMonth = searchParams.get('mes')
        ? searchParams.get('mes')?.slice(0, 7)
        : getCurrentMonthValue()

    const handleMonthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const novoMes = e.target.value
        router.push(`/dashboard/loja/${storeId}/financeiro/contas?mes=${novoMes}-01`)
    }

    const visibleBills = bills.filter((bill) => bill.status !== 'Cancelado')
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayUtcTime = today.getTime()

    const weekOptions = Array.from(
        new Map(
            visibleBills.map((bill) => {
                const dueDate = startOfUtcDay(bill.due_date)
                const weekStart = getStartOfWeekMonday(dueDate)
                const weekEnd = getEndOfWeekSunday(weekStart)
                const key = weekStart.toISOString().slice(0, 10)
                return [key, { key, label: formatWeekLabel(weekStart, weekEnd) }]
            })
        ).values()
    ).sort((a, b) => a.key.localeCompare(b.key))

    const categoryOptions = Array.from(
        new Set(
            visibleBills
                .map((bill) => bill.category)
                .filter((category): category is string => Boolean(category))
        )
    ).sort((a, b) => a.localeCompare(b, 'pt-BR'))

    const baseFilteredBills = visibleBills.filter((bill) => {
        const matchesWeek = weekFilter === 'all'
            ? true
            : getStartOfWeekMonday(startOfUtcDay(bill.due_date)).toISOString().slice(0, 10) === weekFilter

        const matchesCategory = categoryFilter === 'all'
            ? true
            : bill.category === categoryFilter

        return matchesWeek && matchesCategory
    })

    const filteredBills = baseFilteredBills.filter((bill) => filter === 'Todos' ? true : bill.status === filter)

    const totalVencido = filteredBills
        .filter((bill) => bill.status === 'Pendente' && startOfUtcDay(bill.due_date).getTime() < todayUtcTime)
        .reduce((acc, bill) => acc + bill.amount, 0)

    const totalPendente = filteredBills
        .filter((bill) => bill.status === 'Pendente')
        .reduce((acc, bill) => acc + bill.amount, 0)

    const totalPago = filteredBills
        .filter((bill) => bill.status === 'Pago')
        .reduce((acc, bill) => acc + (bill.amount_paid || bill.amount), 0)

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
        } else if (confirm('Tem certeza que deseja excluir esta conta?')) {
            await deleteBill(bill.id, storeId)
        }
    }

    return (
        <div className="flex flex-col h-full space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 shrink-0">
                <div className="bg-rose-500/10 backdrop-blur-xl p-4 rounded-2xl border border-rose-500/20 shadow-sm flex items-center justify-between relative overflow-hidden group hover:bg-rose-500/20 transition-all">
                    <div className="absolute right-0 top-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity"><AlertCircle className="h-16 w-16 text-rose-400" /></div>
                    <div className="relative z-10">
                        <p className="text-[10px] font-bold text-rose-400 uppercase tracking-wider">Vencidas / Atrasadas</p>
                        <p className="text-2xl font-black text-rose-300 mt-1">{formatMoney(totalVencido)}</p>
                    </div>
                </div>

                <div className="bg-blue-500/10 backdrop-blur-xl p-4 rounded-2xl border border-blue-500/20 shadow-sm flex items-center justify-between relative overflow-hidden group hover:bg-blue-500/20 transition-all">
                    <div className="absolute right-0 top-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity"><Clock className="h-16 w-16 text-blue-400" /></div>
                    <div className="relative z-10">
                        <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">A Pagar (Total)</p>
                        <p className="text-2xl font-black text-blue-300 mt-1">{formatMoney(totalPendente)}</p>
                    </div>
                </div>

                <div className="bg-emerald-500/10 backdrop-blur-xl p-4 rounded-2xl border border-emerald-500/20 shadow-sm flex items-center justify-between relative overflow-hidden group hover:bg-emerald-500/20 transition-all">
                    <div className="absolute right-0 top-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity"><CheckCircle className="h-16 w-16 text-emerald-400" /></div>
                    <div className="relative z-10">
                        <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Pago no Mês</p>
                        <p className="text-2xl font-black text-emerald-300 mt-1">{formatMoney(totalPago)}</p>
                    </div>
                </div>
            </div>

            <div className="flex-1 flex gap-6 overflow-hidden">
                <div className="w-1/4 min-w-[240px] flex flex-col gap-4">
                    <div className="bg-white/5 backdrop-blur-xl p-4 rounded-2xl border border-white/10 shadow-sm">
                        <label className={labelStyle}>Mês de Referência</label>
                        <input
                            type="month"
                            value={currentMonth || ''}
                            onChange={handleMonthChange}
                            className={inputStyle}
                        />
                    </div>

                    <button
                        onClick={() => setIsNewOpen(true)}
                        className="w-full py-4 bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-500 hover:to-red-600 text-white rounded-2xl shadow-lg shadow-rose-900/20 flex items-center justify-center gap-2 font-bold transition-all active:scale-95 border border-white/10"
                    >
                        <Plus className="h-5 w-5" />
                        NOVA CONTA
                    </button>

                    <div className="bg-white/5 backdrop-blur-xl rounded-2xl shadow-sm border border-white/10 p-2 flex flex-col gap-1 flex-1">
                        <p className="px-4 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Filtrar por Status</p>

                        <div className="px-2 pb-2 space-y-2">
                            <div>
                                <label className={`${labelStyle} mb-1 px-2`}>Semana</label>
                                <select
                                    value={weekFilter}
                                    onChange={(e) => setWeekFilter(e.target.value)}
                                    className={`${selectStyle} h-11 text-sm`}
                                >
                                    <option value="all">Todas as semanas</option>
                                    {weekOptions.map((week) => (
                                        <option key={week.key} value={week.key}>
                                            {week.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className={`${labelStyle} mb-1 px-2`}>Categoria</label>
                                <select
                                    value={categoryFilter}
                                    onChange={(e) => setCategoryFilter(e.target.value)}
                                    className={`${selectStyle} h-11 text-sm`}
                                >
                                    <option value="all">Todas as categorias</option>
                                    {categoryOptions.map((category) => (
                                        <option key={category} value={category}>
                                            {category}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <button onClick={() => setFilter('Pendente')} className={filter === 'Pendente' ? activeFilterClass : inactiveFilterClass}>
                            <span>Pendentes</span>
                            <span className="bg-black/20 px-2 py-0.5 rounded text-xs border border-white/5">{baseFilteredBills.filter((bill) => bill.status === 'Pendente').length}</span>
                        </button>

                        <button onClick={() => setFilter('Pago')} className={filter === 'Pago' ? activeFilterClass : inactiveFilterClass}>
                            <span>Pagos</span>
                            <span className="bg-black/20 px-2 py-0.5 rounded text-xs border border-white/5">{baseFilteredBills.filter((bill) => bill.status === 'Pago').length}</span>
                        </button>

                        <button onClick={() => setFilter('Todos')} className={filter === 'Todos' ? activeFilterClass : inactiveFilterClass}>
                            <span>Todos</span>
                            <span className="bg-black/20 px-2 py-0.5 rounded text-xs border border-white/5">{baseFilteredBills.length}</span>
                        </button>
                    </div>
                </div>

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
                                    <tr><td colSpan={5} className="p-10 text-center text-slate-500 italic">Nenhuma conta encontrada no filtro atual.</td></tr>
                                ) : (
                                    filteredBills.map((bill) => {
                                        const isLate = bill.status === 'Pendente' && startOfUtcDay(bill.due_date).getTime() < todayUtcTime
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
                                                        {bill.is_recurring && (
                                                            <span className="text-[10px] text-indigo-300 font-bold bg-indigo-500/20 px-1.5 py-0.5 rounded border border-indigo-500/30 flex items-center gap-1">
                                                                <RefreshCw className="h-2.5 w-2.5" /> Recorrente
                                                            </span>
                                                        )}
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

            {isNewOpen && <NewBillModal isOpen={isNewOpen} onClose={() => setIsNewOpen(false)} storeId={storeId} />}
            {editingBill && <NewBillModal isOpen={!!editingBill} onClose={() => setEditingBill(null)} storeId={storeId} bill={editingBill} />}
            {payBill && <PayBillModal bill={payBill} onClose={() => setPayBill(null)} />}
        </div>
    )
}
