import { getStockMovements } from '@/lib/actions/stock.actions'
import {
    ArrowUpCircle, ArrowDownCircle, AlertTriangle,
    Calendar, Package, User
} from 'lucide-react'
import StockFiltersBar from './_components/StockFiltersBar'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// Helper de formatação
const formatDate = (date: string) => new Date(date).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export default async function MovimentacoesPage({
    params,
    searchParams
}: {
    params: { storeId: string },
    searchParams: { inicio?: string, fim?: string, tipo?: string, busca?: string }
}) {
    const storeId = parseInt(params.storeId, 10)

    // Datas padrão se não vier na URL (Hoje)
    const hoje = new Date().toISOString().split('T')[0]
    const inicio = searchParams.inicio || hoje
    const fim = searchParams.fim || hoje

    // Busca dados filtrados
    const movimentos = await getStockMovements(storeId, {
        dataInicio: inicio,
        dataFim: fim,
        tipo: searchParams.tipo,
        busca: searchParams.busca
    })

    // --- CÁLCULO DOS KPIS (Baseado na lista filtrada) ---
    // Isso dá um resumo instantâneo do que está sendo visto
    const kpis = movimentos.reduce((acc: any, mov: any) => {
        if (mov.tipo === 'Entrada' || mov.tipo === 'Ajuste') {
            acc.entradas += mov.quantidade
        } else if (mov.tipo === 'Perda') {
            acc.perdas += mov.quantidade
        } else {
            // Saida, Brinde
            acc.saidas += mov.quantidade
        }
        return acc
    }, { entradas: 0, saidas: 0, perdas: 0 })

    return (
        <div className="flex flex-col h-[calc(100vh-64px)] bg-transparent overflow-hidden">

            {/* HEADER / KPIs (Topo) */}
            <div className="bg-slate-900/30 backdrop-blur-xl border-b border-white/5 px-6 py-4 shadow-sm flex-shrink-0 z-10">
                <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Card Entradas */}
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 flex items-center gap-4 relative overflow-hidden group">
                        <div className="absolute right-0 top-0 w-24 h-24 bg-emerald-500/10 blur-[40px] rounded-full pointer-events-none group-hover:bg-emerald-500/20 transition-all"></div>
                        <div className="p-3 bg-emerald-500/20 rounded-xl text-emerald-400 shadow-inner"><ArrowUpCircle className="h-6 w-6" /></div>
                        <div className="relative z-10">
                            <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1 opacity-80">Entradas / Ajustes</p>
                            <p className="text-2xl font-black text-white tracking-tight">{kpis.entradas} <span className="text-sm font-bold text-emerald-500/50">unid.</span></p>
                        </div>
                    </div>

                    {/* Card Saídas */}
                    <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-2xl p-4 flex items-center gap-4 relative overflow-hidden group">
                        <div className="absolute right-0 top-0 w-24 h-24 bg-indigo-500/10 blur-[40px] rounded-full pointer-events-none group-hover:bg-indigo-500/20 transition-all"></div>
                        <div className="p-3 bg-indigo-500/20 rounded-xl text-indigo-400 shadow-inner"><ArrowDownCircle className="h-6 w-6" /></div>
                        <div className="relative z-10">
                            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1 opacity-80">Saídas / Vendas</p>
                            <p className="text-2xl font-black text-white tracking-tight">{kpis.saidas} <span className="text-sm font-bold text-indigo-500/50">unid.</span></p>
                        </div>
                    </div>

                    {/* Card Perdas */}
                    <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 flex items-center gap-4 relative overflow-hidden group">
                        <div className="absolute right-0 top-0 w-24 h-24 bg-rose-500/10 blur-[40px] rounded-full pointer-events-none group-hover:bg-rose-500/20 transition-all"></div>
                        <div className="p-3 bg-rose-500/20 rounded-xl text-rose-400 shadow-inner"><AlertTriangle className="h-6 w-6" /></div>
                        <div className="relative z-10">
                            <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest mb-1 opacity-80">Perdas / Quebras</p>
                            <p className="text-2xl font-black text-rose-500 tracking-tight">{kpis.perdas} <span className="text-sm font-bold text-rose-500/50">unid.</span></p>
                        </div>
                    </div>
                </div>
            </div>

            {/* CORPO (SPLIT VIEW) */}
            <div className="flex flex-1 overflow-hidden">

                {/* Coluna Esquerda: Filtros */}
                <div className="w-1/4 min-w-[280px] max-w-[320px] z-30 h-full">
                    <StockFiltersBar storeId={storeId} />
                </div>

                {/* Coluna Direita: Lista */}
                <div className="flex-1 bg-transparent overflow-y-auto custom-scrollbar p-6 relative">
                    {/* Background decorativo */}
                    <div className="absolute top-0 left-0 w-full h-[300px] bg-gradient-to-b from-slate-900/50 to-transparent pointer-events-none"></div>

                    <div className="max-w-7xl mx-auto backdrop-blur-sm relative z-10">
                        <div className="bg-slate-950/30 hover:bg-slate-900/40 transition-colors rounded-3xl border border-white/5 overflow-hidden shadow-2xl backdrop-blur-md">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-black/20 text-slate-400 font-bold uppercase text-[10px] border-b border-white/5 sticky top-0 backdrop-blur-md z-10">
                                    <tr>
                                        <th className="px-6 py-4 tracking-wider">Data / Hora</th>
                                        <th className="px-6 py-4 tracking-wider">Produto</th>
                                        <th className="px-6 py-4 text-center tracking-wider">Tipo</th>
                                        <th className="px-6 py-4 text-center tracking-wider">Qtd</th>
                                        <th className="px-6 py-4 tracking-wider">Motivo</th>
                                        <th className="px-6 py-4 text-right tracking-wider">Resp.</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {movimentos.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="p-16 text-center text-slate-500 flex flex-col items-center justify-center">
                                                <div className="bg-slate-800/50 p-6 rounded-full mb-4">
                                                    <Package className="h-12 w-12 opacity-30" />
                                                </div>
                                                <p className="text-lg font-medium text-slate-400">Nenhuma movimentação encontrada</p>
                                                <p className="text-xs text-slate-600 mt-1">Tente ajustar os filtros ou o período selecionado.</p>
                                            </td>
                                        </tr>
                                    ) : (
                                        movimentos.map((mov: any) => (
                                            <tr key={mov.id} className="hover:bg-white/[0.02] transition-colors group">
                                                <td className="px-6 py-4 text-slate-400 whitespace-nowrap text-xs font-medium">
                                                    <div className="flex items-center gap-2">
                                                        <Calendar className="h-3 w-3 opacity-30 group-hover:opacity-100 transition-opacity text-indigo-400" />
                                                        {formatDate(mov.created_at)}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <p className="font-bold text-slate-200 text-sm group-hover:text-white transition-colors">{mov.products?.nome || 'Produto Removido'}</p>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <p className="text-[10px] text-slate-500 font-mono bg-black/30 px-1.5 rounded border border-white/5">{mov.products?.codigo_barras || '-'}</p>
                                                        {mov.product_variants && (
                                                            <span className="inline-block text-[9px] bg-indigo-500/10 border border-indigo-500/20 px-1.5 rounded text-indigo-300 font-bold">
                                                                {mov.product_variants.nome_variante}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <BadgeTipo tipo={mov.tipo} />
                                                </td>
                                                <td className="px-6 py-4 text-center font-black text-white text-sm bg-white/[0.01]">
                                                    {mov.quantidade}
                                                </td>
                                                <td className="px-6 py-4 text-slate-500 text-xs max-w-xs truncate" title={mov.motivo}>
                                                    {mov.motivo}
                                                </td>
                                                <td className="px-6 py-4 text-right text-slate-600 text-xs">
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        <User className="h-3 w-3 opacity-30" />
                                                        {mov.employees?.full_name?.split(' ')[0] || 'Sistema'}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    )
}

function BadgeTipo({ tipo }: { tipo: string }) {
    let style = 'bg-slate-800 text-slate-400 border-slate-700'

    if (tipo === 'Entrada') style = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_10px_-3px_rgba(16,185,129,0.2)]'
    if (tipo === 'Saida') style = 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
    if (tipo === 'Perda') style = 'bg-rose-500/10 text-rose-400 border-rose-500/20 shadow-[0_0_10px_-3px_rgba(244,63,94,0.2)]'
    if (tipo === 'Brinde') style = 'bg-purple-500/10 text-purple-400 border-purple-500/20'
    if (tipo === 'Ajuste') style = 'bg-amber-500/10 text-amber-400 border-amber-500/20'

    return (
        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wide border inline-flex items-center gap-1.5 ${style}`}>
            {tipo}
        </span>
    )
}