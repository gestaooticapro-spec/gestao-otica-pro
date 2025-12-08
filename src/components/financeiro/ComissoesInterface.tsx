'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { 
  Calendar, DollarSign, CheckCircle2, Loader2, 
  User, Wallet, Filter, ChevronRight, TrendingUp, AlertCircle 
} from 'lucide-react'
import { pagarComissoesEmLote, type ResumoComissao } from '@/lib/actions/commission.actions'

const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const formatDate = (d: string) => new Date(d).toLocaleDateString('pt-BR')

// --- DESIGN SYSTEM (Roxo/Fúcsia) ---
const labelStyle = "block text-[9px] font-bold text-white/80 uppercase mb-0.5 tracking-wider"
const inputHeaderStyle = "block w-full rounded-lg border-0 bg-white shadow-lg text-slate-800 h-9 text-xs px-2 focus:ring-2 focus:ring-fuchsia-300 font-bold"

export default function ComissoesInterface({ 
    data, 
    storeId, 
    periodo 
}: { 
    data: ResumoComissao[], 
    storeId: number,
    periodo: { inicio: string, fim: string }
}) {
    const router = useRouter()
    const [selectedId, setSelectedId] = useState<number | null>(null)
    const [isPending, startTransition] = useTransition()

    // Filtros de Data locais
    const [dataInicio, setDataInicio] = useState(periodo.inicio)
    const [dataFim, setDataFim] = useState(periodo.fim)

    const selectedEmployee = data.find(d => d.employee_id === selectedId)

    const handleFilter = () => {
        router.push(`/dashboard/loja/${storeId}/financeiro/comissoes?inicio=${dataInicio}&fim=${dataFim}`)
    }

    const handlePagar = () => {
        if (!selectedEmployee) return
        
        const pendentes = selectedEmployee.detalhes.filter(d => d.status === 'Pendente')
        if (pendentes.length === 0) return

        const ids = pendentes.map(d => d.id)
        const total = pendentes.reduce((acc, curr) => acc + curr.valor_comissao, 0)

        if (!confirm(`Confirmar pagamento de ${formatCurrency(total)} para ${selectedEmployee.employee_name}?`)) return

        startTransition(async () => {
            const res = await pagarComissoesEmLote(storeId, selectedEmployee.employee_id, ids)
            if (res.success) {
                alert('Pagamento registrado com sucesso!')
                router.refresh()
            } else {
                alert('Erro: ' + res.message)
            }
        })
    }

    return (
        <div className="flex h-full overflow-hidden bg-slate-100">
            
            {/* --- ESQUERDA (30%): FILTROS E LISTA --- */}
            <div className="w-1/3 flex flex-col border-r border-slate-200 bg-white z-10 shadow-sm">
                
                {/* Header Gradiente */}
                <div className="bg-gradient-to-br from-violet-600 to-fuchsia-700 p-5 flex flex-col gap-4 shadow-md z-20">
                    <div className="flex justify-between items-center text-white">
                        <h2 className="font-bold text-sm flex items-center gap-2 uppercase tracking-wide">
                            <Wallet className="h-4 w-4" /> Comissões
                        </h2>
                        <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full font-medium">
                            {data.length} colab.
                        </span>
                    </div>

                    {/* Filtros de Data Integrados */}
                    <div className="flex gap-2 items-end">
                        <div className="flex-1">
                            <label className={labelStyle}>De</label>
                            <input 
                                type="date" 
                                value={dataInicio} 
                                onChange={e => setDataInicio(e.target.value)} 
                                className={inputHeaderStyle}
                            />
                        </div>
                        <div className="flex-1">
                            <label className={labelStyle}>Até</label>
                            <input 
                                type="date" 
                                value={dataFim} 
                                onChange={e => setDataFim(e.target.value)} 
                                className={inputHeaderStyle}
                            />
                        </div>
                        <button 
                            onClick={handleFilter}
                            className="h-9 w-9 bg-white/20 hover:bg-white/30 text-white rounded-lg flex items-center justify-center shadow-sm transition-colors"
                            title="Filtrar"
                        >
                            <Filter className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                {/* Lista de Funcionários */}
                <div className="flex-1 overflow-y-auto">
                    {data.length === 0 ? (
                        <div className="text-center p-10 text-slate-400 flex flex-col items-center">
                            <User className="h-10 w-10 mb-2 opacity-20"/>
                            <p className="text-xs">Nenhum registro no período.</p>
                        </div>
                    ) : (
                        data.map((item) => (
                            <div 
                                key={item.employee_id} 
                                onClick={() => setSelectedId(item.employee_id)}
                                className={`p-4 border-b border-slate-100 cursor-pointer transition-colors flex justify-between items-center group
                                    ${selectedId === item.employee_id ? 'bg-fuchsia-50 border-l-4 border-l-fuchsia-600' : 'hover:bg-slate-50 border-l-4 border-l-transparent'}
                                `}
                            >
                                <div>
                                    <p className={`font-bold text-sm ${selectedId === item.employee_id ? 'text-fuchsia-900' : 'text-slate-700'}`}>
                                        {item.employee_name}
                                    </p>
                                    <p className="text-[10px] text-slate-400 mt-1">
                                        Vendas: {formatCurrency(item.total_vendas)}
                                    </p>
                                </div>
                                <div className="text-right">
                                    {item.comissao_pendente > 0 ? (
                                        <span className="block font-black text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded border border-amber-100">
                                            {formatCurrency(item.comissao_pendente)}
                                        </span>
                                    ) : (
                                        <span className="block font-bold text-xs text-emerald-600 bg-emerald-50 px-2 py-1 rounded border border-emerald-100 flex items-center gap-1">
                                            <CheckCircle2 className="h-3 w-3" /> Quitada
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* --- DIREITA (70%): DETALHES --- */}
            <div className="flex-1 flex flex-col bg-slate-50 relative overflow-hidden">
                {selectedEmployee ? (
                    <>
                        {/* Header do Funcionário */}
                        <div className="bg-white px-6 py-4 border-b border-slate-200 shadow-sm shrink-0">
                             <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
                                <User className="h-6 w-6 text-slate-400" />
                                {selectedEmployee.employee_name}
                             </h2>
                        </div>

                        {/* KPIs e Tabela */}
                        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                            <div className="max-w-5xl mx-auto space-y-6 pb-20">
                                
                                {/* KPIs */}
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Vendas no Período</p>
                                        <p className="text-2xl font-black text-slate-700">{formatCurrency(selectedEmployee.total_vendas)}</p>
                                        <div className="mt-2 flex items-center gap-1 text-[10px] text-blue-600 font-bold">
                                            <TrendingUp className="h-3 w-3" /> Performance
                                        </div>
                                    </div>
                                    <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-sm relative overflow-hidden">
                                        <div className="absolute right-0 top-0 p-2 opacity-10"><AlertCircle className="h-12 w-12 text-amber-500"/></div>
                                        <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-1">A Pagar (Pendente)</p>
                                        <p className="text-2xl font-black text-amber-600">{formatCurrency(selectedEmployee.comissao_pendente)}</p>
                                    </div>
                                    <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-sm relative overflow-hidden">
                                        <div className="absolute right-0 top-0 p-2 opacity-10"><CheckCircle2 className="h-12 w-12 text-emerald-500"/></div>
                                        <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-1">Já Pago (Período)</p>
                                        <p className="text-2xl font-black text-emerald-600">{formatCurrency(selectedEmployee.comissao_paga)}</p>
                                    </div>
                                </div>

                                {/* Tabela Detalhada */}
                                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                                    <div className="bg-slate-50 px-5 py-3 border-b border-slate-200">
                                        <h3 className="font-bold text-slate-700 text-sm">Extrato de Vendas</h3>
                                    </div>
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-white text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                                            <tr>
                                                <th className="px-5 py-3">Data</th>
                                                <th className="px-5 py-3">Venda ID</th>
                                                <th className="px-5 py-3 text-right">Valor Venda</th>
                                                <th className="px-5 py-3 text-right">Comissão</th>
                                                <th className="px-5 py-3 text-center">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {selectedEmployee.detalhes.map((det) => (
                                                <tr key={det.id} className="hover:bg-slate-50 transition-colors">
                                                    <td className="px-5 py-3 text-slate-500 font-mono text-xs">{formatDate(det.data)}</td>
                                                    <td className="px-5 py-3 font-bold text-blue-600 text-xs">#{det.venda_id}</td>
                                                    <td className="px-5 py-3 text-right text-slate-600">{formatCurrency(det.valor_venda)}</td>
                                                    <td className="px-5 py-3 text-right font-bold text-slate-800">{formatCurrency(det.valor_comissao)}</td>
                                                    <td className="px-5 py-3 text-center">
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${det.status === 'Pago' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-amber-50 text-amber-700 border-amber-100'}`}>
                                                            {det.status}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                            </div>
                        </div>

                        {/* Rodapé Fixo (Ação) */}
                        {selectedEmployee.comissao_pendente > 0 && (
                            <div className="bg-white border-t border-slate-200 p-4 shadow-[0_-5px_20px_rgba(0,0,0,0.05)] flex justify-between items-center z-20 shrink-0">
                                <div>
                                    <p className="text-xs text-slate-500 font-bold uppercase">Total a Pagar Agora</p>
                                    <p className="text-2xl font-black text-slate-800">{formatCurrency(selectedEmployee.comissao_pendente)}</p>
                                </div>
                                <button 
                                    onClick={handlePagar}
                                    disabled={isPending}
                                    className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-xl shadow-lg shadow-green-200 font-bold flex items-center gap-2 transition-transform active:scale-95"
                                >
                                    {isPending ? <Loader2 className="h-5 w-5 animate-spin"/> : <DollarSign className="h-5 w-5"/>}
                                    CONFIRMAR PAGAMENTO
                                </button>
                            </div>
                        )}

                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-300">
                        <Filter className="h-16 w-16 mb-4 opacity-20" />
                        <p className="text-lg font-light">Selecione um colaborador para ver o extrato</p>
                    </div>
                )}
            </div>
        </div>
    )
}