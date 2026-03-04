import { getStockMovements } from '@/lib/actions/stock.actions'
import {
    ArrowUpCircle, ArrowDownCircle, AlertTriangle,
    Calendar, Package, User, ArrowRightLeft
} from 'lucide-react'
import StockMovementForm from './_components/StockMovementForm'
import HistoryFilters from './_components/HistoryFilters'
import MovimentacoesBackground from './_components/MovimentacoesBackground'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const formatDate = (date: string) => new Date(date).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export default async function MovimentacoesPage({
    params,
    searchParams
}: {
    params: { storeId: string },
    searchParams: { inicio?: string, fim?: string, tipo?: string, busca?: string }
}) {
    const storeId = parseInt(params.storeId, 10)

    const hoje = new Date().toISOString().split('T')[0]
    const inicio = searchParams.inicio || hoje
    const fim = searchParams.fim || hoje

    const movimentos = await getStockMovements(storeId, {
        dataInicio: inicio,
        dataFim: fim,
        tipo: searchParams.tipo,
        busca: searchParams.busca
    })

    const kpis = movimentos.reduce((acc: any, mov: any) => {
        if (mov.tipo === 'Entrada' || mov.tipo === 'Ajuste') {
            acc.entradas += mov.quantidade
        } else if (mov.tipo === 'Perda') {
            acc.perdas += mov.quantidade
        } else {
            acc.saidas += mov.quantidade
        }
        return acc
    }, { entradas: 0, saidas: 0, perdas: 0 })

    return (
        <MovimentacoesBackground>
            <div className="flex h-full bg-transparent overflow-hidden">

                {/* --- COLUNA ESQUERDA (30%): KPIs + Histórico --- */}
                <div className="w-1/3 flex flex-col border-r border-white/5 bg-slate-900/30 backdrop-blur-md z-10 shadow-sm">

                    {/* KPIs Compactos */}
                    <div className="bg-gradient-to-br from-amber-500/10 to-orange-600/10 p-4 border-b border-white/5 flex-shrink-0">
                        <h2 className="font-black text-sm flex items-center gap-2 uppercase tracking-wide text-amber-400 mb-3">
                            <ArrowRightLeft className="h-4 w-4" /> Movimentações
                        </h2>
                        <div className="grid grid-cols-3 gap-2">
                            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-2 text-center">
                                <p className="text-[8px] font-bold text-emerald-400 uppercase">Entradas</p>
                                <p className="text-lg font-black text-white">{kpis.entradas}</p>
                            </div>
                            <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-2 text-center">
                                <p className="text-[8px] font-bold text-indigo-400 uppercase">Saídas</p>
                                <p className="text-lg font-black text-white">{kpis.saidas}</p>
                            </div>
                            <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-2 text-center">
                                <p className="text-[8px] font-bold text-rose-400 uppercase">Perdas</p>
                                <p className="text-lg font-black text-white">{kpis.perdas}</p>
                            </div>
                        </div>
                    </div>

                    {/* Filtros de Data */}
                    <HistoryFilters storeId={storeId} inicio={inicio} fim={fim} tipo={searchParams.tipo} />

                    {/* Lista de Histórico */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        {movimentos.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-slate-500 p-6">
                                <Package className="h-10 w-10 mb-3 opacity-20" />
                                <p className="text-xs font-bold">Nenhuma movimentação hoje</p>
                                <p className="text-[10px] text-slate-600 mt-1">Registre uma na coluna ao lado.</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-white/5">
                                {movimentos.map((mov: any) => {
                                    const isEntrada = mov.tipo === 'Entrada' || mov.tipo === 'Ajuste'
                                    const isPerda = mov.tipo === 'Perda'
                                    return (
                                        <div key={mov.id} className="p-3 hover:bg-white/[0.02] transition-colors group">
                                            <div className="flex justify-between items-start">
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <BadgeTipo tipo={mov.tipo} />
                                                        <span className="font-bold text-slate-300 text-xs truncate">
                                                            {mov.products?.nome || 'Produto Removido'}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className="text-[10px] text-slate-600 flex items-center gap-1">
                                                            <Calendar className="h-3 w-3 opacity-40" />
                                                            {formatDate(mov.created_at)}
                                                        </span>
                                                        <span className="text-[10px] text-slate-600 truncate max-w-[120px]" title={mov.motivo}>
                                                            {mov.motivo}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="text-right ml-2 flex-shrink-0">
                                                    <span className={`text-sm font-black ${isEntrada ? 'text-emerald-400' : isPerda ? 'text-rose-400' : 'text-indigo-400'}`}>
                                                        {isEntrada ? '+' : '-'}{mov.quantidade}
                                                    </span>
                                                    <p className="text-[9px] text-slate-600 flex items-center justify-end gap-1 mt-0.5">
                                                        <User className="h-2.5 w-2.5 opacity-30" />
                                                        {mov.employees?.full_name?.split(' ')[0] || 'Sistema'}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* --- COLUNA DIREITA (70%): Formulário de Movimentação --- */}
                <div className="flex-1 flex flex-col bg-transparent relative overflow-hidden">
                    <StockMovementForm storeId={storeId} initialSearchTerm={searchParams.busca} />
                </div>

            </div>
        </MovimentacoesBackground>
    )
}

function BadgeTipo({ tipo }: { tipo: string }) {
    let style = 'bg-slate-800 text-slate-400 border-slate-700'

    if (tipo === 'Entrada') style = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
    if (tipo === 'Saida') style = 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
    if (tipo === 'Perda') style = 'bg-rose-500/10 text-rose-400 border-rose-500/20'
    if (tipo === 'Brinde') style = 'bg-purple-500/10 text-purple-400 border-purple-500/20'
    if (tipo === 'Ajuste') style = 'bg-amber-500/10 text-amber-400 border-amber-500/20'
    if (tipo === 'Devolucao') style = 'bg-sky-500/10 text-sky-400 border-sky-500/20'

    return (
        <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wide border inline-flex items-center flex-shrink-0 ${style}`}>
            {tipo}
        </span>
    )
}