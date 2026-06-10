'use client'

import { useState, useMemo, useEffect } from 'react'
import { CustomerXRayData } from '@/lib/actions/history.actions'
import {
    User, ShoppingBag, TrendingUp, Calendar,
    ArrowUpRight, Clock, Star, Search, Users, Wallet, FileText, Eye, EyeOff, ChevronDown, AlertTriangle, X,
    Stethoscope, ChevronUp, Filter, Loader2
} from 'lucide-react'
import { useStoreModules } from '@/lib/contexts/StoreModulesContext'
import { getCustomerParcelasFiltradas, ParcelaFiltro } from '@/lib/actions/parcelas.actions'

interface CustomerHistoryPageProps {
    data: CustomerXRayData
    storeId: number
}

const formatCurrency = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val)

const formatDate = (dateStr: string) =>
    new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(dateStr))

const formatDateTime = (dateStr: string) =>
    new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(new Date(dateStr))

const getLevelColor = (level: string) => {
    switch (level) {
        case 'Diamante': return 'from-cyan-400 to-blue-600'
        case 'Ouro': return 'from-amber-300 to-yellow-600'
        case 'Prata': return 'from-slate-300 to-slate-500'
        default: return 'from-amber-700 to-amber-900'
    }
}

// Helper to format degree values
const deg = (val: any) => {
    if (val === null || val === undefined || val === '') return '-'
    return String(val)
}

export default function CustomerHistoryPage({ data, storeId }: CustomerHistoryPageProps) {
    const modules = useStoreModules()
    const { customer, stats, habits, sales, postSales, cobranca, devedor } = data
    const [selectedSaleId, setSelectedSaleId] = useState<number | null>(sales[0]?.id || null)
    const [expandedOsId, setExpandedOsId] = useState<number | null>(null)
    const [isPostSalesModalOpen, setIsPostSalesModalOpen] = useState(false)

    // States for Installments (Parcelas) Modal
    const [isParcelasModalOpen, setIsParcelasModalOpen] = useState(false)
    const [parcelasModalData, setParcelasModalData] = useState<any[]>([])
    const [isParcelasLoading, setIsParcelasLoading] = useState(false)
    const [expandedSales, setExpandedSales] = useState<Record<number, boolean>>({})

    const fetchParcelas = async () => {
        setIsParcelasLoading(true)
        const res = await getCustomerParcelasFiltradas(storeId, customer.id, { status: 'todas' })
        if (res.success) {
            setParcelasModalData(res.data || [])
            const uniqueVendas = Array.from(new Set((res.data || []).map((p: any) => p.financiamento_loja?.venda_id || 0)))
            const initialExpanded: Record<number, boolean> = {}
            uniqueVendas.forEach(vid => {
                initialExpanded[Number(vid)] = true
            })
            setExpandedSales(initialExpanded)
        } else {
            setParcelasModalData([])
        }
        setIsParcelasLoading(false)
    }

    useEffect(() => {
        if (isParcelasModalOpen) {
            fetchParcelas()
        }
    }, [isParcelasModalOpen])

    const groupedSalesInModal = useMemo(() => {
        return parcelasModalData.reduce((acc: Record<number, any[]>, p: any) => {
            const vendaId = p.financiamento_loja?.venda_id || 0
            if (!acc[vendaId]) {
                acc[vendaId] = []
            }
            acc[vendaId].push(p)
            return acc
        }, {} as Record<number, any[]>)
    }, [parcelasModalData])

    const selectedSale = useMemo(() =>
        sales.find(s => s.id === selectedSaleId),
        [sales, selectedSaleId])

    const cobrancaLabel = cobranca.metricaPrincipal === 'vendas'
        ? 'Vendas com cobrança'
        : 'Contatos de cobrança'

    const toggleOs = (osId: number) => {
        setExpandedOsId(prev => prev === osId ? null : osId)
    }

    const renderRatingStars = (rating: number | null) => {
        if (!rating || rating < 1) {
            return <span className="text-[11px] font-medium text-slate-500">Sem avaliação</span>
        }

        const rounded = Math.max(1, Math.min(5, Math.round(rating)))

        return (
            <div className="flex items-center gap-1.5">
                <div className="flex items-center gap-0.5">
                    {Array.from({ length: 5 }).map((_, idx) => (
                        <Star
                            key={idx}
                            className={`w-3.5 h-3.5 ${idx < rounded ? 'text-amber-400 fill-amber-400' : 'text-slate-600'}`}
                        />
                    ))}
                </div>
                <span className="text-[11px] font-bold text-amber-300">{rounded}/5</span>
            </div>
        )
    }

    return (
        <div className="flex flex-col h-full gap-4 animate-in fade-in duration-700">

            {/* ROW 1: HEADER — Profile | Habits | KPIs */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">

                {/* COL 1: Profile Card */}
                <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-3xl p-5 relative overflow-hidden group shadow-2xl">
                    <div className={`absolute inset-0 bg-gradient-to-br ${getLevelColor(customer.nivel)} opacity-5 group-hover:opacity-10 transition-opacity duration-700`} />
                    <div className="relative z-10 flex flex-col items-center text-center">
                        <div className={`w-16 h-16 rounded-full p-[2px] bg-gradient-to-br ${getLevelColor(customer.nivel)} shadow-[0_0_30px_rgba(0,0,0,0.5)] mb-3`}>
                            <div className="w-full h-full rounded-full bg-slate-950 flex items-center justify-center relative overflow-hidden">
                                <div className={`absolute inset-0 bg-gradient-to-br ${getLevelColor(customer.nivel)} opacity-20`} />
                                <User className="w-7 h-7 text-slate-200" />
                            </div>
                        </div>
                        <h2 className="text-lg font-black text-white mb-0.5 tracking-tight leading-tight">{customer.nome}</h2>
                        <p className="text-xs text-slate-400 font-medium mb-3">{customer.telefone || 'Sem telefone'}</p>
                        <div className={`px-4 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.2em] bg-gradient-to-r ${getLevelColor(customer.nivel)} text-white shadow-lg ring-1 ring-white/20`}>
                            {customer.nivel}
                        </div>
                    </div>
                </div>

                {/* COL 2: Top Products + Consumption Profile (stacked) */}
                <div className="flex flex-col gap-3">
                    <div className="flex-1 bg-amber-950/20 border border-amber-500/10 rounded-2xl p-4 hover:bg-amber-900/10 transition-colors shadow-lg">
                        <h5 className="text-[9px] font-black text-amber-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                            <Star className="w-3 h-3" /> Top Produtos
                        </h5>
                        <ul className="space-y-1.5">
                            {habits.topProdutos.slice(0, 3).map((prod, i) => (
                                <li key={i} className="text-[11px] text-slate-400 font-medium flex justify-between items-center">
                                    <span className="truncate mr-2">{prod.nome}</span>
                                    <span className="font-bold text-white bg-amber-500/10 px-1.5 py-0.5 rounded text-[9px] border border-amber-500/10 shrink-0">{prod.qtd}x</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div className="flex-1 bg-purple-950/20 border border-purple-500/10 rounded-2xl p-4 hover:bg-purple-900/10 transition-colors shadow-lg flex flex-col justify-between">
                        <h5 className="text-[9px] font-black text-purple-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                            <Users className="w-3 h-3" /> Perfil de Consumo
                        </h5>
                        <div className="space-y-3">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-full bg-purple-500/10 ring-1 ring-purple-500/20 shrink-0">
                                    <Users className="w-4 h-4 text-purple-400" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[10px] text-slate-500 font-medium">Compra para:</p>
                                    <p className="text-sm font-black text-white truncate">{habits.compraMaisPara}</p>
                                </div>
                            </div>
                            {habits.topMedico && (
                                <div className="flex items-center gap-3 border-t border-purple-500/10 pt-2">
                                    <div className="p-1.5 rounded-full bg-purple-500/10 ring-1 ring-purple-500/20 shrink-0">
                                        <Stethoscope className="w-3.5 h-3.5 text-purple-400" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[10px] text-slate-500 font-medium">Médico Favorito:</p>
                                        <p className="text-xs font-bold text-white truncate" title={habits.topMedico}>{habits.topMedico}</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* COL 3-4: KPI Cards (expanded) */}
                <div className="lg:col-span-2 grid grid-cols-2 xl:grid-cols-3 gap-3">
                    <div className="bg-emerald-950/30 border border-emerald-500/20 rounded-2xl p-4 flex flex-col justify-between backdrop-blur-md hover:bg-emerald-900/20 transition-colors duration-300">
                        <div className="p-2 bg-emerald-500/10 rounded-xl ring-1 ring-emerald-500/20 w-fit">
                            <ShoppingBag className="w-4 h-4 text-emerald-400" />
                        </div>
                        <div>
                            <p className="text-xl font-black text-white mt-2 tracking-tight">{formatCurrency(stats.totalGasto)}</p>
                            <p className="text-[10px] text-emerald-400/70 font-bold uppercase tracking-wider">Total Compras</p>
                        </div>
                    </div>
                    <div className="bg-blue-950/30 border border-blue-500/20 rounded-2xl p-4 flex flex-col justify-between backdrop-blur-md hover:bg-blue-900/20 transition-colors duration-300">
                        <div className="p-2 bg-blue-500/10 rounded-xl ring-1 ring-blue-500/20 w-fit">
                            <TrendingUp className="w-4 h-4 text-blue-400" />
                        </div>
                        <div>
                            <p className="text-xl font-black text-white mt-2 tracking-tight">{formatCurrency(stats.ticketMedio)}</p>
                            <p className="text-[10px] text-blue-400/70 font-bold uppercase tracking-wider">Ticket Medio</p>
                        </div>
                    </div>
                    <div className="bg-amber-950/30 border border-amber-500/20 rounded-2xl p-4 flex flex-col justify-between backdrop-blur-md hover:bg-amber-900/20 transition-colors duration-300">
                        <div className="p-2 bg-amber-500/10 rounded-xl ring-1 ring-amber-500/20 w-fit">
                            <Calendar className="w-4 h-4 text-amber-400" />
                        </div>
                        <div>
                            <p className="text-xl font-black text-white mt-2 tracking-tight">{stats.totalCompras}</p>
                            <p className="text-[10px] text-amber-400/70 font-bold uppercase tracking-wider">Compras Realizadas</p>
                        </div>
                    </div>
                    <div className="bg-purple-950/30 border border-purple-500/20 rounded-2xl p-4 flex flex-col justify-between backdrop-blur-md hover:bg-purple-900/20 transition-colors duration-300">
                        <div className="p-2 bg-purple-500/10 rounded-xl ring-1 ring-purple-500/20 w-fit">
                            <Clock className="w-4 h-4 text-purple-400" />
                        </div>
                        <div>
                            <p className="text-xl font-black text-white mt-2 tracking-tight">{stats.diasDesdeUltimaCompra}</p>
                            <p className="text-[10px] text-purple-400/70 font-bold uppercase tracking-wider">Dias s/ Comprar</p>
                        </div>
                    </div>
                    {modules.postSales && <div className="bg-fuchsia-950/30 border border-fuchsia-500/20 rounded-2xl p-4 flex flex-col justify-between backdrop-blur-md hover:bg-fuchsia-900/20 transition-colors duration-300">
                        <div className="flex items-start justify-between gap-2">
                            <div className="p-2 bg-fuchsia-500/10 rounded-xl ring-1 ring-fuchsia-500/20 w-fit">
                                <Star className="w-4 h-4 text-fuchsia-300" />
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsPostSalesModalOpen(true)}
                                disabled={postSales.totalRegistros === 0}
                                className={`px-2 py-1 rounded-lg border text-[9px] font-bold uppercase tracking-wider transition-colors ${postSales.totalRegistros > 0
                                    ? 'text-fuchsia-200 bg-fuchsia-500/10 border-fuchsia-500/30 hover:bg-fuchsia-500/20'
                                    : 'text-slate-500 bg-white/5 border-white/10 cursor-not-allowed'
                                    }`}
                            >
                                Ver histórico
                            </button>
                        </div>
                        <div>
                            <p className="text-xl font-black text-white mt-2 tracking-tight">
                                {postSales.mediaAvaliacao !== null ? `${postSales.mediaAvaliacao.toFixed(1)} / 5` : 'Sem nota'}
                            </p>
                            <p className="text-[10px] text-fuchsia-300/80 font-bold uppercase tracking-wider">Média Pós-Venda</p>
                            <p className="text-[10px] text-slate-500 font-medium mt-1">
                                {postSales.totalRegistros > 0
                                    ? `${postSales.totalRegistros} registro(s) de pós-venda`
                                    : 'Nenhum pós-venda registrado'}
                            </p>
                        </div>
                    </div>}
                    {modules.installments && <div className="bg-orange-950/30 border border-orange-500/20 rounded-2xl p-4 flex flex-col justify-between backdrop-blur-md hover:bg-orange-900/20 transition-colors duration-300">
                        <div className="flex items-start justify-between gap-2">
                            <div className="p-2 bg-orange-500/10 rounded-xl ring-1 ring-orange-500/20 w-fit">
                                <Wallet className="w-4 h-4 text-orange-300" />
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsParcelasModalOpen(true)}
                                className="px-2 py-1 rounded-lg border text-[9px] font-bold uppercase tracking-wider transition-colors text-orange-200 bg-orange-500/10 border-orange-500/30 hover:bg-orange-500/20"
                            >
                                Ver parcelas
                            </button>
                        </div>
                        <div>
                            <p className="text-xl font-black text-white mt-2 tracking-tight">{cobranca.valorMetrica}</p>
                            <p className="text-[10px] text-orange-300/80 font-bold uppercase tracking-wider">{cobrancaLabel}</p>
                            <p className="text-[10px] text-slate-500 font-medium mt-1">
                                {cobranca.jaFoiCobrado ? 'Cliente já foi cobrado' : 'Sem cobrança registrada'}
                            </p>
                        </div>
                    </div>}
                </div>
            </div>

            {modules.installments && devedor.isDevedor && (
                <div className="bg-red-950/25 border border-red-500/30 rounded-2xl p-4 backdrop-blur-md flex flex-col gap-3">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="flex items-start gap-3">
                            <div className="p-2 rounded-xl bg-red-500/15 ring-1 ring-red-500/30 shrink-0">
                                <AlertTriangle className="w-4 h-4 text-red-300" />
                            </div>
                            <div>
                                <p className="text-sm font-black text-red-200 uppercase tracking-wider">Cliente devedor</p>
                                <p className="text-xs text-red-200/80 font-medium">{devedor.vendasComSaldo} venda(s) com saldo pendente.</p>
                            </div>
                        </div>
                        <div className="sm:text-right">
                            <p className="text-[10px] font-bold text-red-200/70 uppercase tracking-wider">Saldo pendente</p>
                            <p className="text-xl font-black text-red-200">{formatCurrency(devedor.saldoPendente)}</p>
                        </div>
                    </div>
                    {(() => {
                        const todasAtrasadas = sales.flatMap(s => (s as any).parcelasPendentes || []).filter((p: any) => p.isAtrasada);
                        if (todasAtrasadas.length === 0) return null;
                        return (
                            <div className="mt-1 border-t border-red-500/20 pt-3">
                                <p className="text-xs font-bold text-red-300 mb-2 uppercase tracking-wider">Parcelas Atrasadas</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">
                                    {todasAtrasadas.map((p: any) => (
                                        <div key={p.id} className="bg-red-950/40 p-2.5 rounded-xl border border-red-500/20 flex justify-between items-center hover:bg-red-900/30 transition-colors">
                                            <div>
                                                <p className="text-[9px] text-red-300/70 uppercase font-bold tracking-wider mb-0.5">Venc. {new Date(p.data_vencimento).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</p>
                                                <p className="text-[11px] font-bold text-red-200">Parcela {p.numero_parcela}</p>
                                            </div>
                                            <p className="text-xs font-black text-red-400">{formatCurrency(p.valor_parcela)}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })()}
                </div>
            )}


            {/* ROW 2: MAIN — History List | Sale Details */}
            <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 gap-4">

                {/* LEFT: SALES LIST */}
                <div className="lg:col-span-1 bg-black/40 backdrop-blur-xl border border-white/10 rounded-3xl flex flex-col overflow-hidden shadow-2xl">
                    <div className="p-5 border-b border-white/5 bg-white/5 flex justify-between items-center">
                        <h3 className="text-xs font-black text-slate-300 uppercase tracking-widest flex items-center gap-2">
                            <Clock className="w-3.5 h-3.5 text-slate-500" /> Histórico
                        </h3>
                        <span className="text-[9px] font-bold bg-white/10 text-slate-400 px-2 py-0.5 rounded border border-white/5">
                            {sales.length} COMPRAS
                        </span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 custom-scrollbar space-y-2">
                        {sales.map((sale) => (
                            <button
                                key={sale.id}
                                onClick={() => { setSelectedSaleId(sale.id); setExpandedOsId(null) }}
                                className={`w-full text-left p-3.5 rounded-2xl border transition-all duration-300 group relative overflow-hidden ${selectedSaleId === sale.id
                                    ? 'bg-indigo-600/20 border-indigo-500/50 shadow-[0_0_20px_rgba(79,70,229,0.1)]'
                                    : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/10'
                                    }`}
                            >
                                <div className="flex justify-between items-start mb-1.5 relative z-10">
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${selectedSaleId === sale.id
                                        ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/20'
                                        : 'bg-slate-800 text-slate-400 border-slate-700'
                                        }`}>
                                        #{sale.id}
                                    </span>
                                    <span className="text-[10px] font-medium text-slate-400">{formatDate(sale.data)}</span>
                                </div>
                                <div className="flex justify-between items-end relative z-10">
                                    <div>
                                        <p className="text-base font-black text-white tracking-tight">{formatCurrency(sale.valorTotal)}</p>
                                        <p className="text-[9px] uppercase font-bold text-slate-500 mt-0.5">{sale.itens.length} itens • {sale.vendedor}</p>
                                    </div>
                                    <div className={`p-1 rounded-full transition-colors ${selectedSaleId === sale.id ? 'bg-indigo-500 text-white' : 'bg-white/5 text-slate-500 group-hover:bg-white/10'}`}>
                                        <ArrowUpRight className={`w-3.5 h-3.5 transition-transform duration-300 ${selectedSaleId === sale.id ? 'rotate-45' : ''}`} />
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* RIGHT: SALE DETAILS */}
                <div className="lg:col-span-2 bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-3xl flex flex-col overflow-hidden relative shadow-2xl">
                    <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-[0.03] pointer-events-none" />
                    <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-600/10 blur-[100px] pointer-events-none rounded-full" />
                    <div className="absolute bottom-0 left-0 w-96 h-96 bg-cyan-600/10 blur-[100px] pointer-events-none rounded-full" />

                    {selectedSale ? (
                        <>
                            <div className="p-5 border-b border-white/5 bg-white/5 backdrop-blur-md flex justify-between items-start z-10 relative">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.2em]">Detalhes da Compra</span>
                                        {selectedSale.os && selectedSale.os.length > 0 && (
                                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/20">
                                                {selectedSale.os.length} OS
                                            </span>
                                        )}
                                    </div>
                                    <h2 className="text-2xl font-black text-white flex items-center gap-3 tracking-tight">
                                        #{selectedSale.id}
                                        <div className="h-5 w-px bg-white/10" />
                                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${selectedSale.status === 'Fechada' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                                            }`}>
                                            {selectedSale.status.toUpperCase()}
                                        </span>
                                    </h2>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">DATA</p>
                                    <p className="text-lg font-black text-white">{formatDate(selectedSale.data)}</p>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar z-10 relative space-y-6">

                                {/* ITENS */}
                                <div>
                                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
                                        <ShoppingBag className="w-3 h-3" /> Itens Adquiridos
                                    </h4>
                                    <div className="space-y-2">
                                        {selectedSale.itens.map((item, idx) => (
                                            <div key={idx} className="bg-black/20 rounded-xl p-3 border border-white/5 flex items-center justify-between hover:bg-white/5 transition-colors group">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-10 h-10 rounded-lg bg-slate-800/50 flex items-center justify-center text-slate-200 font-black text-sm border border-white/5 shadow-inner">
                                                        {item.qtd}
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-white text-sm tracking-tight group-hover:text-indigo-200 transition-colors">{item.produto}</p>
                                                        <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500 flex items-center gap-1 mt-0.5">
                                                            <User className="w-2.5 h-2.5" /> Para: <span className="text-indigo-300">{item.paraQuem}</span>
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="font-black text-white text-sm tracking-tight">{formatCurrency(item.valor * item.qtd)}</p>
                                                    <p className="text-[10px] font-medium text-slate-600">{formatCurrency(item.valor)} un.</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* PAGAMENTOS + OS side by side */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
                                            <Wallet className="w-3 h-3" /> Pagamento
                                        </h4>
                                        {selectedSale.pagamentos && selectedSale.pagamentos.length > 0 ? (
                                            <div className="space-y-2">
                                                {selectedSale.pagamentos.map((pg, i) => (
                                                    <div key={i} className="flex justify-between items-center p-3 rounded-xl bg-emerald-900/10 border border-emerald-500/10">
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <p className="text-sm font-bold text-white">{pg.metodo}</p>
                                                                {(pg as any).isParcela
                                                                    ? <span className="text-[8px] bg-orange-500/20 text-orange-300 px-1.5 py-0.5 rounded uppercase font-bold border border-orange-500/30">Parcela</span>
                                                                    : <span className="text-[8px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded uppercase font-bold border border-emerald-500/30">Compra</span>
                                                                }
                                                            </div>
                                                            <p className="text-[9px] text-emerald-400 font-medium uppercase tracking-wider">{pg.parcelas}</p>
                                                        </div>
                                                        <p className="text-sm font-black text-emerald-400">{formatCurrency(pg.valor)}</p>
                                                    </div>
                                                ))}
                                                <div className="flex justify-between items-center p-2 border-t border-white/5 mt-1">
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase">Total</span>
                                                    <span className="text-base font-black text-emerald-400">{formatCurrency(selectedSale.valorTotal)}</span>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="p-4 rounded-xl bg-white/5 border border-white/5 text-center">
                                                <p className="text-xs text-slate-500">Sem dados de pagamento</p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Ordens de Serviço */}
                                    <div>
                                        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
                                            <FileText className="w-3 h-3" /> Ordens de Serviço
                                        </h4>
                                        {selectedSale.os && selectedSale.os.length > 0 ? (
                                            <div className="space-y-2">
                                                {selectedSale.os.map((os, i) => {
                                                    const isExpanded = expandedOsId === os.id
                                                    const raw = os.olho_direito // raw OS data (full row)
                                                    const hasReceita = raw?.receita_longe_od_esferico || raw?.receita_longe_oe_esferico

                                                    return (
                                                        <div key={i} className="rounded-xl bg-blue-900/10 border border-blue-500/10 hover:bg-blue-900/15 transition-colors overflow-hidden">
                                                            {/* OS Header */}
                                                            <div className="p-3">
                                                                <div className="flex justify-between items-start mb-1.5">
                                                                    <span className="text-[10px] font-black text-blue-300 bg-blue-500/20 px-1.5 py-0.5 rounded border border-blue-500/20">OS #{os.id}</span>
                                                                    <span className="text-[9px] font-bold text-slate-400 uppercase">{os.situacao}</span>
                                                                </div>
                                                                {os.medico && <p className="text-xs text-slate-300 mb-0.5"><strong className="text-white">Médico:</strong> {os.medico}</p>}
                                                                <p className="text-[10px] text-slate-500">Entrega: {os.data_entrega ? formatDate(os.data_entrega) : 'A definir'}</p>

                                                                {/* Toggle Button */}
                                                                <button
                                                                    onClick={() => toggleOs(os.id)}
                                                                    className={`w-full mt-2 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-300 border flex items-center justify-center gap-1.5 ${isExpanded
                                                                        ? 'bg-blue-600/30 text-blue-200 border-blue-500/30'
                                                                        : 'bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border-blue-500/20'
                                                                        }`}
                                                                >
                                                                    {isExpanded ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                                                                    {isExpanded ? 'Ocultar Receita' : 'Ver Receita / Lentes'}
                                                                    <ChevronDown className={`w-3 h-3 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                                                                </button>
                                                            </div>

                                                            {/* Expanded Prescription Details */}
                                                            {isExpanded && raw && (
                                                                <div className="border-t border-blue-500/10 bg-blue-950/30 p-4 animate-in slide-in-from-top-2 duration-300">
                                                                    {hasReceita ? (
                                                                        <>
                                                                            {/* Prescription Table */}
                                                                            <div className="overflow-x-auto">
                                                                                <table className="w-full text-[10px]">
                                                                                    <thead>
                                                                                        <tr className="text-slate-500 uppercase tracking-wider">
                                                                                            <th className="text-left py-1 pr-2 font-bold"></th>
                                                                                            <th className="text-center py-1 px-1 font-bold">ESF</th>
                                                                                            <th className="text-center py-1 px-1 font-bold">CIL</th>
                                                                                            <th className="text-center py-1 px-1 font-bold">EIXO</th>
                                                                                        </tr>
                                                                                    </thead>
                                                                                    <tbody className="text-slate-200 font-mono">
                                                                                        {/* Longe */}
                                                                                        <tr className="border-t border-white/5">
                                                                                            <td className="py-1.5 pr-2 text-blue-400 font-bold text-[9px] uppercase">Longe OD</td>
                                                                                            <td className="text-center py-1.5 px-1 font-bold">{deg(raw.receita_longe_od_esferico)}</td>
                                                                                            <td className="text-center py-1.5 px-1 font-bold">{deg(raw.receita_longe_od_cilindrico)}</td>
                                                                                            <td className="text-center py-1.5 px-1">{deg(raw.receita_longe_od_eixo)}</td>
                                                                                        </tr>
                                                                                        <tr className="border-t border-white/5">
                                                                                            <td className="py-1.5 pr-2 text-blue-400 font-bold text-[9px] uppercase">Longe OE</td>
                                                                                            <td className="text-center py-1.5 px-1 font-bold">{deg(raw.receita_longe_oe_esferico)}</td>
                                                                                            <td className="text-center py-1.5 px-1 font-bold">{deg(raw.receita_longe_oe_cilindrico)}</td>
                                                                                            <td className="text-center py-1.5 px-1">{deg(raw.receita_longe_oe_eixo)}</td>
                                                                                        </tr>
                                                                                        {/* Perto */}
                                                                                        {(raw.receita_perto_od_esferico || raw.receita_perto_oe_esferico) && (
                                                                                            <>
                                                                                                <tr className="border-t border-blue-500/10">
                                                                                                    <td className="py-1.5 pr-2 text-cyan-400 font-bold text-[9px] uppercase">Perto OD</td>
                                                                                                    <td className="text-center py-1.5 px-1 font-bold">{deg(raw.receita_perto_od_esferico)}</td>
                                                                                                    <td className="text-center py-1.5 px-1 font-bold">{deg(raw.receita_perto_od_cilindrico)}</td>
                                                                                                    <td className="text-center py-1.5 px-1">{deg(raw.receita_perto_od_eixo)}</td>
                                                                                                </tr>
                                                                                                <tr className="border-t border-white/5">
                                                                                                    <td className="py-1.5 pr-2 text-cyan-400 font-bold text-[9px] uppercase">Perto OE</td>
                                                                                                    <td className="text-center py-1.5 px-1 font-bold">{deg(raw.receita_perto_oe_esferico)}</td>
                                                                                                    <td className="text-center py-1.5 px-1 font-bold">{deg(raw.receita_perto_oe_cilindrico)}</td>
                                                                                                    <td className="text-center py-1.5 px-1">{deg(raw.receita_perto_oe_eixo)}</td>
                                                                                                </tr>
                                                                                            </>
                                                                                        )}
                                                                                    </tbody>
                                                                                </table>
                                                                            </div>

                                                                            {/* Adição + Medidas */}
                                                                            <div className="flex gap-3 mt-3 flex-wrap">
                                                                                {raw.receita_adicao && (
                                                                                    <div className="bg-emerald-900/20 border border-emerald-500/10 rounded-lg px-3 py-1.5">
                                                                                        <span className="text-[9px] text-emerald-500 font-bold uppercase block">Adição</span>
                                                                                        <span className="text-sm font-black text-emerald-300">{raw.receita_adicao}</span>
                                                                                    </div>
                                                                                )}
                                                                                {(raw.medida_dnp_od || raw.medida_dnp_oe) && (
                                                                                    <div className="bg-slate-800/50 border border-white/5 rounded-lg px-3 py-1.5">
                                                                                        <span className="text-[9px] text-slate-500 font-bold uppercase block">DNP</span>
                                                                                        <span className="text-sm font-bold text-white">{raw.medida_dnp_od || '-'} / {raw.medida_dnp_oe || '-'}</span>
                                                                                    </div>
                                                                                )}
                                                                                {(raw.medida_altura_od || raw.medida_altura_oe) && (
                                                                                    <div className="bg-slate-800/50 border border-white/5 rounded-lg px-3 py-1.5">
                                                                                        <span className="text-[9px] text-slate-500 font-bold uppercase block">Altura</span>
                                                                                        <span className="text-sm font-bold text-white">{raw.medida_altura_od || '-'} / {raw.medida_altura_oe || '-'}</span>
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        </>
                                                                    ) : (
                                                                        <p className="text-xs text-slate-500 text-center italic py-2">
                                                                            Receita não preenchida nesta O.S.
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        ) : (
                                            <div className="p-4 rounded-xl bg-white/5 border border-white/5 text-center">
                                                <p className="text-xs text-slate-500">Nenhuma O.S. vinculada</p>
                                            </div>
                                        )}

                                        {selectedSale.observacoes?.trim() && (
                                            <div className="mt-6">
                                                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
                                                    <FileText className="w-3 h-3" /> Observacao da Venda
                                                </h4>
                                                <div className="bg-black/20 rounded-xl p-4 border border-white/5 text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                                                    {selectedSale.observacoes.trim()}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-600">
                            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4 animate-pulse">
                                <Search className="w-7 h-7 opacity-50" />
                            </div>
                            <p className="text-lg font-black text-slate-500">Selecione uma compra</p>
                            <p className="text-xs font-medium opacity-50">Clique na lista ao lado para ver os detalhes</p>
                        </div>
                    )}
                </div>
            </div>

            {modules.postSales && isPostSalesModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <button
                        type="button"
                        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
                        onClick={() => setIsPostSalesModalOpen(false)}
                        aria-label="Fechar modal"
                    />
                    <div className="relative w-full max-w-3xl max-h-[82vh] rounded-3xl bg-slate-950/95 border border-white/15 shadow-2xl overflow-hidden">
                        <div className="p-5 border-b border-white/10 bg-white/5 flex items-center justify-between">
                            <div>
                                <p className="text-[10px] font-black text-fuchsia-300 uppercase tracking-[0.2em]">Pós-venda</p>
                                <h3 className="text-lg font-black text-white">Histórico de acompanhamentos</h3>
                                <p className="text-[11px] text-slate-400">{postSales.totalRegistros} registro(s)</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsPostSalesModalOpen(false)}
                                className="w-9 h-9 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors flex items-center justify-center"
                                aria-label="Fechar"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="max-h-[calc(82vh-88px)] overflow-y-auto p-4 space-y-3 custom-scrollbar">
                            {postSales.totalRegistros === 0 ? (
                                <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
                                    <p className="text-sm font-semibold text-slate-300">Nenhum pós-venda registrado.</p>
                                </div>
                            ) : (
                                postSales.registros.map((registro) => (
                                    <div key={registro.id} className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] font-black px-2 py-1 rounded border bg-slate-900 text-slate-300 border-slate-700">
                                                    #{registro.id}
                                                </span>
                                                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded border ${registro.status === 'Concluido'
                                                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                                                    : 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                                                    }`}>
                                                    {registro.status}
                                                </span>
                                            </div>
                                            <p className="text-[11px] font-medium text-slate-400">{formatDateTime(registro.createdAt)}</p>
                                        </div>

                                        <div>
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Avaliação</p>
                                            {renderRatingStars(registro.avaliacaoCliente)}
                                        </div>

                                        <div>
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Observação</p>
                                            <p className="text-sm text-slate-200 leading-relaxed">
                                                {registro.observacoesFinais?.trim() || 'Sem observação'}
                                            </p>
                                        </div>

                                        <p className="text-[10px] text-slate-500">
                                            O.S.: {registro.serviceOrderId ? `#${registro.serviceOrderId}` : 'não vinculada'}
                                        </p>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {modules.installments && isParcelasModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <button
                        type="button"
                        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
                        onClick={() => setIsParcelasModalOpen(false)}
                        aria-label="Fechar modal"
                    />
                    <div className="relative w-full max-w-4xl max-h-[90vh] rounded-3xl bg-slate-950/95 border border-white/15 shadow-2xl flex flex-col overflow-hidden">
                        {/* Header */}
                        <div className="p-5 border-b border-white/10 bg-white/5 flex items-center justify-between shrink-0">
                            <div>
                                <p className="text-[10px] font-black text-orange-400 uppercase tracking-[0.2em]">Financeiro</p>
                                <h3 className="text-lg font-black text-white">Parcelamentos do Cliente</h3>
                                <p className="text-[11px] text-slate-400">{customer.nome}</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsParcelasModalOpen(false)}
                                className="w-9 h-9 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors flex items-center justify-center"
                                aria-label="Fechar"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>



                        {/* Conteúdo (Scrollable) */}
                        <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar bg-slate-950/60">
                            {isParcelasLoading ? (
                                <div className="py-12 flex flex-col items-center justify-center">
                                    <Loader2 className="h-8 w-8 text-orange-500 animate-spin mb-4" />
                                    <p className="text-xs text-slate-400 font-medium">Buscando parcelamento...</p>
                                </div>
                            ) : Object.keys(groupedSalesInModal).length === 0 ? (
                                <div className="py-12 text-center rounded-2xl border border-white/10 bg-white/5">
                                    <AlertTriangle className="h-8 w-8 text-slate-500 mx-auto mb-3" />
                                    <p className="text-sm font-bold text-slate-300">Nenhum parcelamento encontrado.</p>
                                    <p className="text-xs text-slate-500 mt-1">Experimente remover os filtros de busca ou período.</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {Object.keys(groupedSalesInModal).map((vendaIdStr) => {
                                        const vendaId = Number(vendaIdStr)
                                        const saleParcelas = groupedSalesInModal[vendaId]
                                        const isExpanded = expandedSales[vendaId] ?? true
                                        
                                        const totalSaleValue = saleParcelas.reduce((acc: number, p: any) => acc + Number(p.valor_parcela || 0), 0)
                                        const paidSaleValue = saleParcelas.filter((p: any) => p.status === 'pago' || p.data_pagamento !== null).reduce((acc: number, p: any) => acc + Number(p.valor_parcela || 0), 0)
                                        const pendingSaleValue = totalSaleValue - paidSaleValue

                                        return (
                                            <div key={vendaId} className="border border-white/10 bg-slate-900/40 rounded-2xl overflow-hidden backdrop-blur-md">
                                                <div 
                                                    onClick={() => setExpandedSales(prev => ({ ...prev, [vendaId]: !isExpanded }))}
                                                    className="bg-white/5 px-4 py-3 border-b border-white/10 flex items-center justify-between cursor-pointer hover:bg-white/10 transition-colors"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Venda</span>
                                                            <span className="text-sm font-black text-white font-mono">#{vendaId}</span>
                                                        </div>
                                                        <div className="hidden sm:flex items-center gap-4 text-xs font-medium text-slate-400 border-l border-white/10 pl-4">
                                                            <span>Total: <strong className="text-white">{formatCurrency(totalSaleValue)}</strong></span>
                                                            <span>Pendente: <strong className="text-orange-400">{formatCurrency(pendingSaleValue)}</strong></span>
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="flex items-center gap-3">
                                                        {vendaId > 0 && (
                                                            <a 
                                                                href={`/dashboard/loja/${storeId}/vendas/${vendaId}/experimental`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                onClick={(e) => e.stopPropagation()}
                                                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-orange-600 hover:bg-orange-500 rounded-lg text-[10px] font-bold text-white transition-all shadow-md shadow-orange-500/10"
                                                            >
                                                                Ver Venda
                                                            </a>
                                                        )}
                                                        <button type="button" className="text-slate-400 hover:text-white transition-colors">
                                                            <ChevronDown className={`w-4 h-4 transform transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                                                        </button>
                                                    </div>
                                                </div>

                                                {isExpanded && (
                                                    <div className="overflow-x-auto border-t border-white/5 bg-black/10">
                                                        <table className="w-full text-left border-collapse text-xs">
                                                            <thead>
                                                                <tr className="border-b border-white/5">
                                                                    <th className="px-4 py-2.5 text-[9px] font-black text-slate-500 uppercase tracking-wider">Nº Parcela</th>
                                                                    <th className="px-4 py-2.5 text-[9px] font-black text-slate-500 uppercase tracking-wider">Status</th>
                                                                    <th className="px-4 py-2.5 text-[9px] font-black text-slate-500 uppercase tracking-wider">Vencimento</th>
                                                                    <th className="px-4 py-2.5 text-[9px] font-black text-slate-500 uppercase tracking-wider">Data Pagamento</th>
                                                                    <th className="px-4 py-2.5 text-[9px] font-black text-slate-500 uppercase tracking-wider text-right">Valor</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-white/5">
                                                                {saleParcelas.map((p: any) => {
                                                                    const isPago = p.status === 'pago' || p.data_pagamento !== null
                                                                    const vencStr = p.data_vencimento ? p.data_vencimento.split('T')[0] : ''
                                                                    const hojeStr2 = new Date().toISOString().split('T')[0]
                                                                    const isAtrasado = !isPago && vencStr < hojeStr2

                                                                    return (
                                                                        <tr key={p.id} className="hover:bg-white/5 transition-colors">
                                                                            <td className="px-4 py-2 text-slate-300 font-bold">
                                                                                {p.numero_parcela}
                                                                            </td>
                                                                            <td className="px-4 py-2">
                                                                                {isPago ? (
                                                                                    <span className="px-1.5 py-0.5 bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 rounded-md text-[9px] font-bold uppercase tracking-wider">Pago</span>
                                                                                ) : isAtrasado ? (
                                                                                    <span className="px-1.5 py-0.5 bg-rose-500/15 text-rose-400 border border-rose-500/20 rounded-md text-[9px] font-bold uppercase tracking-wider">Atrasado</span>
                                                                                ) : (
                                                                                    <span className="px-1.5 py-0.5 bg-amber-500/15 text-amber-400 border border-amber-500/20 rounded-md text-[9px] font-bold uppercase tracking-wider">Pendente</span>
                                                                                )}
                                                                            </td>
                                                                            <td className="px-4 py-2 text-slate-400">
                                                                                {p.data_vencimento ? new Date(p.data_vencimento).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '-'}
                                                                            </td>
                                                                            <td className="px-4 py-2 text-slate-400">
                                                                                {p.data_pagamento ? new Date(p.data_pagamento).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '-'}
                                                                            </td>
                                                                            <td className="px-4 py-2 text-right text-white font-bold">
                                                                                {formatCurrency(p.valor_parcela)}
                                                                            </td>
                                                                        </tr>
                                                                    )
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
