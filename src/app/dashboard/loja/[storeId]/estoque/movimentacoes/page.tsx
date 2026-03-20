import { getStockMovements } from '@/lib/actions/stock.actions'
import {
    ArrowRightLeft, Package
} from 'lucide-react'
import StockMovementForm from './_components/StockMovementForm'
import HistoryFilters from './_components/HistoryFilters'
import MovimentacoesBackground from './_components/MovimentacoesBackground'
import MovementHistoryList from './_components/MovementHistoryList'

export const dynamic = 'force-dynamic'
export const revalidate = 0

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

                    {/* Lista de Histórico (Componente Client) */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
                        <MovementHistoryList movimentos={movimentos as any} storeId={storeId} />
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