'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Plus, ShoppingCart, Calendar, User, ArrowRight, ArrowLeft, AlertCircle, CheckCircle2, XCircle, Clock, RefreshCcw } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import VendasFilter from '@/components/vendas/VendasFilter'
import { useBackgroundPreference, BackgroundToggle } from '@/components/ui/BackgroundToggle'
import { currentPathWithSearch, withReturnTo } from '@/lib/return-navigation'

interface VendasListInterfaceProps {
    vendas: any[]
    storeId: number
    mode: 'pendencias' | 'historico'
    startDate?: string
    endDate?: string
}

export default function VendasListInterface({ vendas, storeId, mode, startDate, endDate }: VendasListInterfaceProps) {
    const { preference } = useBackgroundPreference()
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const [isRefreshing, setIsRefreshing] = useState(false)
    const hasRefreshedOnMount = useRef(false)
    const currentListUrl = currentPathWithSearch(pathname, searchParams)

    const refreshList = (showFeedback = true) => {
        if (showFeedback) {
            setIsRefreshing(true)
        }

        router.refresh()

        if (showFeedback) {
            window.setTimeout(() => setIsRefreshing(false), 800)
        }
    }

    const handleRefresh = () => {
        refreshList(true)
    }

    // Forca um refresh ao abrir a pagina para evitar lista antiga vinda do cache de navegacao.
    useEffect(() => {
        if (hasRefreshedOnMount.current) return
        hasRefreshedOnMount.current = true
        router.refresh()
    }, [router])

    // Auto-refresh quando a janela recebe foco (volta para a aba).
    useEffect(() => {
        const onFocus = () => {
            setIsRefreshing(true)
            router.refresh()
            window.setTimeout(() => setIsRefreshing(false), 800)
        }

        window.addEventListener('focus', onFocus)
        return () => window.removeEventListener('focus', onFocus)
    }, [router])

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        })
    }

    const getStatusBadge = (status: string) => {
        if (status === 'Fechada') return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase"><CheckCircle2 className="h-3 w-3" /> Fechada</span>
        if (status === 'Cancelada') return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-black bg-red-500/10 text-red-400 border border-red-500/20 uppercase"><XCircle className="h-3 w-3" /> Cancelada</span>
        if (status === 'Devolvida') return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-black bg-purple-500/10 text-purple-400 border border-purple-500/20 uppercase"><RefreshCcw className="h-3 w-3" /> Devolvida</span>
        return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-black bg-amber-500/10 text-amber-400 border border-amber-500/20 uppercase"><Clock className="h-3 w-3" /> Em Aberto</span>
    }

    return (
        <div className="relative flex flex-col h-[calc(100vh-64px)] bg-slate-950 overflow-hidden font-sans">
            <div className={`absolute inset-0 z-0 transition-opacity duration-1000 ${preference === 'image' ? 'opacity-100' : 'opacity-0'}`}>
                <div className="absolute inset-0 z-0 bg-[url('/dashboard.jpg')] bg-cover bg-center opacity-40 blur-[2px]" />
                <div className="absolute inset-0 z-0 bg-gradient-to-b from-slate-950/50 via-slate-950/70 to-slate-950/95" />
            </div>

            <div className="relative z-10 bg-white/5 backdrop-blur-xl border-b border-white/10 px-6 py-3 flex items-center gap-3 flex-shrink-0 shadow-2xl h-14">
                <Link
                    href={`/dashboard/loja/${storeId}?menu=loja-vazia`}
                    className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-slate-400 hover:text-white transition-all active:scale-95"
                    title="Voltar para o Painel"
                >
                    <ArrowLeft className="h-5 w-5" />
                </Link>
                <div className="h-6 w-px bg-white/10"></div>
                <div className="p-2 bg-blue-500/20 text-blue-400 rounded-xl border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.2)]">
                    <ShoppingCart className="h-5 w-5" />
                </div>
                <div>
                    <h1 className="text-lg font-black text-white tracking-tight uppercase">Central de Vendas</h1>
                    <p className="text-[10px] text-blue-400 font-black uppercase tracking-[0.2em] opacity-80">
                        Gerencie fechamentos e historico
                    </p>
                </div>

                <div className="ml-auto flex items-center gap-4">
                    <Link
                        href={`/dashboard/loja/${storeId}/atendimento`}
                        className="bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 shadow-[0_0_15px_rgba(16,185,129,0.15)] transition-all hover:-translate-y-0.5"
                    >
                        <Plus className="h-4 w-4" />
                        NOVA VENDA
                    </Link>
                    <div className="h-8 w-px bg-white/10"></div>
                    <BackgroundToggle />
                </div>
            </div>

            <div className="relative z-10 flex-1 overflow-hidden p-4 lg:p-6 flex flex-col gap-6">
                <VendasFilter />

                <div className="bg-white/5 backdrop-blur-md rounded-2xl shadow-xl border border-white/10 overflow-hidden flex flex-col flex-1">
                    <div className={`px-4 py-3 border-b border-white/10 flex items-center justify-between flex-shrink-0 ${mode === 'pendencias' ? 'bg-amber-500/5' : 'bg-white/5'}`}>
                        <h2 className={`font-bold text-sm flex items-center gap-2 ${mode === 'pendencias' ? 'text-amber-400' : 'text-slate-200'}`}>
                            {mode === 'pendencias' ? <AlertCircle className="h-4 w-4" /> : <Calendar className="h-4 w-4" />}
                            {mode === 'pendencias' ? 'Fila de Pendencias' : 'Historico do Periodo'}
                            <div className="flex items-center gap-2 ml-1">
                                <span className="opacity-60 text-xs bg-white/10 px-2 py-0.5 rounded-full text-white">
                                    {vendas?.length || 0}
                                </span>
                                <button
                                    onClick={handleRefresh}
                                    disabled={isRefreshing}
                                    title="Atualizar lista"
                                    className={`p-1 rounded-md hover:bg-white/10 transition-all text-slate-400 hover:text-white ${isRefreshing ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                    <RefreshCcw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                                </button>
                            </div>
                        </h2>
                    </div>

                    <div className="overflow-y-auto flex-1 p-0 custom-scrollbar">
                        <table className="w-full text-left border-collapse">
                            <thead className="sticky top-0 z-30">
                                <tr className="text-slate-400 text-[10px] uppercase font-bold border-b border-white/10 shadow-[0_6px_16px_rgba(2,6,23,0.45)]">
                                    <th className="p-3 w-32 bg-slate-900/95 backdrop-blur-xl">ID / Criada Em</th>
                                    <th className="p-3 w-32 bg-slate-900/95 backdrop-blur-xl">Fechada Em</th>
                                    <th className="p-3 bg-slate-900/95 backdrop-blur-xl">Cliente</th>
                                    <th className="p-3 text-center bg-slate-900/95 backdrop-blur-xl">Status</th>
                                    <th className="p-3 text-right bg-slate-900/95 backdrop-blur-xl">Total</th>
                                    <th className="p-3 text-right bg-slate-900/95 backdrop-blur-xl">Falta Pagar</th>
                                    <th className="p-3 text-center w-20 bg-slate-900/95 backdrop-blur-xl">Acao</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {!vendas || vendas.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="p-16 text-center text-slate-500">
                                            <div className="flex flex-col items-center justify-center opacity-50">
                                                <ShoppingCart className="h-12 w-12 mb-4 text-slate-600" />
                                                <p className="text-lg font-medium text-slate-400">Nenhum registro encontrado.</p>
                                                {mode === 'pendencias' ? (
                                                    <p className="text-sm mt-1">Tudo limpo! Nenhuma venda em aberto.</p>
                                                ) : (
                                                    <p className="text-sm mt-1">Tente ajustar as datas do filtro.</p>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    vendas.map((venda: any) => {
                                      const saldoDaVenda = venda.is_historical_import === true ? 0 : Number(venda.valor_restante || 0)

                                      return (
                                        <tr key={venda.id} className="hover:bg-white/5 transition-colors group">
                                            <td className="p-3">
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                    <div className="font-black text-sm text-white">#{venda.id}</div>
                                                    {venda.service_orders?.map((os: any) => (
                                                        <div key={os.id} className="text-[9px] font-black bg-amber-500/20 text-amber-500 px-1 rounded border border-amber-500/30 whitespace-nowrap" title={`OS Protocolo: ${os.protocolo_fisico || 'N/A'}`}>
                                                            OS #{os.id}
                                                        </div>
                                                    ))}
                                                    {venda.nf_emitida && (
                                                        <span className="text-[9px] font-black bg-blue-500/20 text-blue-400 px-1 rounded border border-blue-500/30" title="NFC-e emitida">NFC-e</span>
                                                    )}
                                                </div>
                                                <div className="text-[10px] text-slate-500 flex items-center gap-1 mt-1 font-medium">
                                                    <Calendar className="h-3 w-3" />
                                                    {formatDate(venda.created_at)}
                                                </div>
                                            </td>
                                            <td className="p-3">
                                                {venda.data_fechamento ? (
                                                    <div className="text-[10px] text-emerald-400 font-bold flex items-center gap-1 bg-emerald-500/10 px-2 py-1 rounded w-fit border border-emerald-500/20">
                                                        <Clock className="h-3 w-3" />
                                                        {formatDate(venda.data_fechamento)}
                                                    </div>
                                                ) : (
                                                    <span className="text-slate-600 text-[10px] font-mono">--/--/--</span>
                                                )}
                                            </td>
                                            <td className="p-3">
                                                <div className="font-bold text-sm text-slate-300 flex items-center gap-2">
                                                    <div className="p-1 rounded bg-blue-500/10 text-blue-400">
                                                        <User className="h-3 w-3" />
                                                    </div>
                                                    {venda.customers?.full_name || 'Consumidor Final'}
                                                </div>
                                            </td>
                                            <td className="p-3 text-center">
                                                {getStatusBadge(venda.status)}
                                            </td>
                                            <td className="p-3 text-right font-bold text-sm text-slate-400">
                                                {formatCurrency(venda.valor_final)}
                                            </td>
                                            <td className="p-3 text-right">
                                                <span className={`font-black text-sm ${saldoDaVenda > 0.01 ? 'text-amber-400' : 'text-emerald-400'}`} title={venda.is_historical_import === true ? 'Venda histórica: o carnê é acompanhado separadamente' : undefined}>
                                                    {formatCurrency(saldoDaVenda)}
                                                </span>
                                            </td>
                                            <td className="p-3 text-center">
                                                <Link
                                                    href={withReturnTo(`/dashboard/loja/${storeId}/vendas/${venda.id}/experimental`, currentListUrl)}
                                                    className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white/5 text-slate-400 hover:bg-indigo-500/20 hover:text-indigo-300 border border-transparent hover:border-indigo-500/30 transition-all"
                                                    title="Ver Detalhes"
                                                >
                                                    <ArrowRight className="h-4 w-4" />
                                                </Link>
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
        </div>
    )
}
