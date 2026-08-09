'use client'

import { useState } from 'react'
import { Search, CalendarRange, Filter, AlertCircle, Loader2, ArrowLeft, ArrowRight, MessageCircle, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import { getParcelasFiltradas, ParcelaFiltro } from '@/lib/actions/parcelas.actions'
import { sendInstallmentReceiptWhatsApp } from '@/lib/actions/manual-whatsapp.actions'
import { toast } from 'sonner'
import ContratosQuitadosModal from './ContratosQuitadosModal'

type ParcelaData = {
    id: number
    numero_parcela: number
    data_vencimento: string
    valor_parcela: number
    status: string
    data_pagamento: string | null
    customer_id: number
    financiamento_loja?: { venda_id: number, vendas?: { is_historical_import?: boolean } | null }
    customers?: { full_name: string, cpf: string }
}

type ParcelasPorVenda = Record<string, ParcelaData[]>
type ParcelasAgrupadasPorCliente = Record<string, {
    customer?: ParcelaData['customers']
    sales: ParcelasPorVenda
}>

export default function ParcelasInterface({ storeId }: { storeId: number }) {
    const [filtros, setFiltros] = useState<ParcelaFiltro>({
        status: 'todas',
        dataInicial: '',
        dataFinal: '',
        busca: ''
    })
    
    const [parcelas, setParcelas] = useState<ParcelaData[]>([])
    const [loading, setLoading] = useState(false)
    const [hasSearched, setHasSearched] = useState(false)
    const [viewMode, setViewMode] = useState<'cards' | 'table'>('table')
    const [sendingReceiptInstallmentId, setSendingReceiptInstallmentId] = useState<number | null>(null)
    const [sentReceiptInstallmentIds, setSentReceiptInstallmentIds] = useState<number[]>([])
    const [showContratosQuitados, setShowContratosQuitados] = useState(false)

    const handleSearch = async () => {
        setLoading(true)
        setHasSearched(true)
        const isContextSearch = !!(filtros.busca && filtros.busca.trim())
        
        const res = await getParcelasFiltradas(storeId, filtros)
        if (res.success) {
            setParcelas(res.data)
            setViewMode(isContextSearch ? 'cards' : 'table')
        } else {
            alert(res.message || 'Erro ao buscar parcelas')
            setParcelas([])
        }
        setLoading(false)
    }

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val)
    }

    const formatDate = (dateStr: string) => {
        if (!dateStr) return '-'
        const date = new Date(dateStr)
        date.setMinutes(date.getMinutes() + date.getTimezoneOffset()) // ajuste fuso
        return date.toLocaleDateString('pt-BR')
    }

    // Helper para exibir status bonito
    const getStatusBadge = (p: ParcelaData) => {
        const isPago = p.status === 'pago' || p.data_pagamento !== null
        
        if (isPago) {
            return <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-md text-[10px] font-bold uppercase tracking-wider">Pago</span>
        }

        const hoje = new Date()
        hoje.setHours(0, 0, 0, 0)
        let dataVenc = new Date()
        if (p.data_vencimento) {
            const parts = p.data_vencimento.split('T')[0].split('-')
            if (parts.length === 3) {
                dataVenc = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
            }
        }
        
        if (dataVenc < hoje) {
            return <span className="px-2 py-1 bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-md text-[10px] font-bold uppercase tracking-wider">Atrasado</span>
        }

        return <span className="px-2 py-1 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-md text-[10px] font-bold uppercase tracking-wider">Pendente</span>
    }

    const handleSendReceipt = async (parcelaId: number) => {
        if (sendingReceiptInstallmentId === parcelaId) return

        setSendingReceiptInstallmentId(parcelaId)
        try {
            const result = await sendInstallmentReceiptWhatsApp({
                storeId,
                installmentId: parcelaId,
            })

            if (!result.success) {
                toast.error(result.message)
                return
            }

            setSentReceiptInstallmentIds((current) =>
                current.includes(parcelaId) ? current : [...current, parcelaId]
            )
            toast.success('Recibo enviado em PDF pelo WhatsApp da loja.')
        } catch (error) {
            console.error('[ParcelasInterface] Erro ao enviar recibo:', error)
            toast.error('Nao foi possivel enviar o recibo por WhatsApp.')
        } finally {
            setSendingReceiptInstallmentId(null)
        }
    }

    return (
        <div className="flex flex-col h-[calc(100vh-64px)] bg-slate-950 overflow-hidden font-sans">
            {/* CABEÇALHO */}
            <div className="bg-slate-900/40 backdrop-blur-xl border-b border-white/10 px-6 py-4 shadow-xl shadow-black/20 flex-shrink-0 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link
                        href={`/dashboard/loja/${storeId}?menu=gerencia`}
                        className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-slate-400 hover:text-white transition-all active:scale-95"
                        title="Voltar para a Gerência"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </Link>
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-500/20 text-blue-400 rounded-xl border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.15)]">
                            <CalendarRange className="h-6 w-6" />
                        </div>
                        <div>
                            <h1 className="text-xl font-black text-white tracking-tight uppercase">Contas a Receber</h1>
                            <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">Gestão de Parcelas</p>
                        </div>
                    </div>
                </div>
                <button onClick={() => setShowContratosQuitados(true)} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-slate-400 transition-colors hover:bg-white/10 hover:text-white" title="Consultar contratos quitados">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />Contratos quitados
                </button>
            </div>

            {/* BARRA DE FILTROS */}
            <div className="bg-slate-900 border-b border-white/10 px-6 py-4 flex flex-wrap items-end gap-4 shrink-0">
                <div className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Busca (Cliente ou Venda ID)</label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-4 w-4 text-slate-500" />
                        </div>
                        <input
                            type="text"
                            className="w-full bg-slate-950 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-slate-600"
                            placeholder="Buscar..."
                            value={filtros.busca}
                            onChange={e => setFiltros({ ...filtros, busca: e.target.value })}
                            onKeyDown={e => e.key === 'Enter' && handleSearch()}
                        />
                    </div>
                </div>

                <div className="flex flex-col gap-1.5 w-[150px]">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</label>
                    <select
                        className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                        value={filtros.status}
                        onChange={e => setFiltros({ ...filtros, status: e.target.value as ParcelaFiltro['status'] })}
                    >
                        <option value="todas">Todas</option>
                        <option value="pendente">Pendentes</option>
                        <option value="atrasado">Atrasadas</option>
                        <option value="pago">Pagas</option>
                    </select>
                </div>

                <div className="flex flex-col gap-1.5 w-[150px]">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Vencimento Inicial</label>
                    <input
                        type="date"
                        className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all color-scheme-dark"
                        value={filtros.dataInicial}
                        onChange={e => setFiltros({ ...filtros, dataInicial: e.target.value })}
                    />
                </div>

                <div className="flex flex-col gap-1.5 w-[150px]">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Vencimento Final</label>
                    <input
                        type="date"
                        className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all color-scheme-dark"
                        value={filtros.dataFinal}
                        onChange={e => setFiltros({ ...filtros, dataFinal: e.target.value })}
                    />
                </div>

                <button
                    onClick={handleSearch}
                    disabled={loading}
                    className="h-[38px] px-6 bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Filter className="h-4 w-4" />}
                    Filtrar
                </button>
            </div>

            {/* TABELA DE DADOS */}
            <div className="flex-1 overflow-auto p-6 bg-slate-950/30 flex flex-col items-center">
                <div className="w-full max-w-6xl">
                    {!hasSearched ? (
                    <div className="h-full flex flex-col items-center justify-center text-center max-w-sm mx-auto">
                        <div className="w-16 h-16 bg-blue-500/10 border border-blue-500/20 rounded-full flex items-center justify-center mb-6 text-blue-500">
                            <Search className="h-8 w-8" />
                        </div>
                        <h2 className="text-xl font-bold text-white mb-2">Página Vazia</h2>
                        <p className="text-sm text-slate-400">
                            Utilize os filtros acima e clique em Filtrar para visualizar as parcelas de acordo com a sua necessidade.
                        </p>
                    </div>
                ) : loading ? (
                    <div className="h-full flex flex-col items-center justify-center">
                        <Loader2 className="h-8 w-8 text-blue-500 animate-spin mb-4" />
                        <p className="text-sm text-slate-400 font-medium">Buscando parcelas...</p>
                    </div>
                ) : parcelas.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center max-w-sm mx-auto">
                        <div className="w-16 h-16 bg-slate-800 border border-white/10 rounded-full flex items-center justify-center mb-6 text-slate-500">
                            <AlertCircle className="h-8 w-8" />
                        </div>
                        <h2 className="text-xl font-bold text-white mb-2">Nenhuma Parcela</h2>
                        <p className="text-sm text-slate-400">
                            Não encontramos nenhuma parcela com os filtros selecionados. Tente ajustar a busca ou o período.
                        </p>
                    </div>
                ) : viewMode === 'cards' ? (
                    <div className="flex flex-col gap-6">
                        {(() => {
                            const groupedData = parcelas.reduce<ParcelasAgrupadasPorCliente>((acc, p) => {
                                const customerId = p.customer_id;
                                if (!acc[customerId]) {
                                    acc[customerId] = {
                                        customer: p.customers,
                                        sales: {}
                                    };
                                }
                                const vendaId = p.financiamento_loja?.venda_id || 0;
                                if (!acc[customerId].sales[vendaId]) {
                                    acc[customerId].sales[vendaId] = [];
                                }
                                acc[customerId].sales[vendaId].push(p);
                                return acc;
                            }, {});

                            const customerIds = Object.keys(groupedData);

                            return customerIds.map((cid) => {
                                const { customer, sales } = groupedData[cid];
                                const saleIds = Object.keys(sales);
                                
                                return (
                                    <div key={cid} className="bg-slate-900 border border-white/10 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
                                        <div className="bg-slate-800/50 border-b border-white/10 px-6 py-4 flex items-center justify-between">
                                            <div>
                                                <h3 className="text-lg font-bold text-white uppercase tracking-wider">{customer?.full_name || 'Cliente Desconhecido'}</h3>
                                                <p className="text-xs text-slate-400 font-mono mt-0.5">CPF: {customer?.cpf || 'N/A'}</p>
                                            </div>
                                        </div>
                                        
                                        <div className="p-6 flex flex-col gap-6">
                                            {saleIds.map((sid) => {
                                                const saleParcelas = [...sales[sid]].sort((a, b) => {
                                                    const dateOrder = String(a.data_vencimento || '').localeCompare(String(b.data_vencimento || ''))
                                                    return dateOrder || (a.id - b.id)
                                                });
                                                const isHistoricalImport = saleParcelas[0]?.financiamento_loja?.vendas?.is_historical_import === true
                                                return (
                                                    <div key={sid} className="border border-white/5 bg-slate-950/50 rounded-xl overflow-hidden">
                                                        <div className="bg-white/5 px-4 py-3 border-b border-white/5 flex items-center justify-between">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Venda</span>
                                                                <span className="text-sm font-bold text-white font-mono">#{sid}</span>
                                                            </div>
                                                            {sid !== '0' && (
                                                                <Link 
                                                                    href={isHistoricalImport ? `/dashboard/loja/${storeId}/vendas/${sid}/historico-importado` : `/dashboard/loja/${storeId}/vendas/${sid}/experimental`}
                                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs font-bold text-white transition-all shadow-lg shadow-blue-500/20"
                                                                >
                                                                    {isHistoricalImport ? 'Abrir histórico' : 'Ver Venda'}
                                                                    <ArrowRight className="h-3 w-3" />
                                                                </Link>
                                                            )}
                                                        </div>
                                                        <div className="overflow-x-auto">
                                                            <table className="w-full text-left border-collapse">
                                                                <thead>
                                                                    <tr>
                                                                        <th className="bg-transparent border-b border-white/5 px-4 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Parcela</th>
                                                                        <th className="bg-transparent border-b border-white/5 px-4 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                                                                        <th className="bg-transparent border-b border-white/5 px-4 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Vencimento</th>
                                                                        <th className="bg-transparent border-b border-white/5 px-4 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Pagamento</th>
                                                                        <th className="bg-transparent border-b border-white/5 px-4 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Valor</th>
                                                                        <th className="bg-transparent border-b border-white/5 px-4 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Comprovante</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-white/5">
                                                                    {saleParcelas.map((p: ParcelaData) => {
                                                                        const isPago = p.status === 'pago' || p.data_pagamento !== null
                                                                        const isSendingReceipt = sendingReceiptInstallmentId === p.id
                                                                        const receiptSent = sentReceiptInstallmentIds.includes(p.id)

                                                                        return (
                                                                            <tr key={p.id} className="hover:bg-white/5 transition-colors">
                                                                                <td className="px-4 py-2 text-xs text-slate-300 font-bold">
                                                                                    {p.numero_parcela}
                                                                                </td>
                                                                                <td className="px-4 py-2 whitespace-nowrap">
                                                                                    {getStatusBadge(p)}
                                                                                </td>
                                                                                <td className="px-4 py-2 text-xs text-slate-300 font-medium">
                                                                                    {formatDate(p.data_vencimento)}
                                                                                </td>
                                                                                <td className="px-4 py-2 text-xs text-slate-300 font-medium">
                                                                                    {p.data_pagamento ? formatDate(p.data_pagamento) : '-'}
                                                                                </td>
                                                                                <td className="px-4 py-2 text-xs font-bold text-white text-right">
                                                                                    {formatCurrency(p.valor_parcela)}
                                                                                </td>
                                                                                <td className="px-4 py-2 text-right">
                                                                                    {isPago ? (
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={() => handleSendReceipt(p.id)}
                                                                                            disabled={isSendingReceipt}
                                                                                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500 hover:text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                                                                            title="Enviar comprovante desta parcela por WhatsApp"
                                                                                        >
                                                                                            {isSendingReceipt ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />}
                                                                                            <span className="text-[10px] font-bold uppercase tracking-wide">
                                                                                                {isSendingReceipt ? 'Enviando' : receiptSent ? 'Reenviar' : 'Enviar'}
                                                                                            </span>
                                                                                        </button>
                                                                                    ) : (
                                                                                        <span className="text-[10px] text-slate-600">-</span>
                                                                                    )}
                                                                                </td>
                                                                            </tr>
                                                                        )
                                                                    })}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )
                            })
                        })()}
                    </div>
                ) : (
                    <div className="bg-slate-900 border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr>
                                        <th className="bg-slate-800/50 border-b border-white/10 px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Status</th>
                                        <th className="bg-slate-800/50 border-b border-white/10 px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Cliente</th>
                                        <th className="bg-slate-800/50 border-b border-white/10 px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Venda</th>
                                        <th className="bg-slate-800/50 border-b border-white/10 px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Parcela</th>
                                        <th className="bg-slate-800/50 border-b border-white/10 px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Vencimento</th>
                                        <th className="bg-slate-800/50 border-b border-white/10 px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Pagamento</th>
                                        <th className="bg-slate-800/50 border-b border-white/10 px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Valor</th>
                                        <th className="bg-slate-800/50 border-b border-white/10 px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Comprovante</th>
                                        <th className="bg-slate-800/50 border-b border-white/10 px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Ação</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {parcelas.map((p) => {
                                        const isPago = p.status === 'pago' || p.data_pagamento !== null
                                        const isSendingReceipt = sendingReceiptInstallmentId === p.id
                                        const receiptSent = sentReceiptInstallmentIds.includes(p.id)
                                        const isHistoricalImport = p.financiamento_loja?.vendas?.is_historical_import === true

                                        return (
                                            <tr key={p.id} className="hover:bg-slate-800/30 transition-colors group">
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    {getStatusBadge(p)}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="text-sm font-bold text-white truncate max-w-[200px]" title={p.customers?.full_name}>
                                                        {p.customers?.full_name || 'Desconhecido'}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="text-sm text-slate-300 font-mono">#{p.financiamento_loja?.venda_id}</span>
                                                </td>
                                                <td className="px-4 py-3 text-sm text-slate-300 font-bold">
                                                    {p.numero_parcela}
                                                </td>
                                                <td className="px-4 py-3 text-sm text-slate-300 font-medium">
                                                    {formatDate(p.data_vencimento)}
                                                </td>
                                                <td className="px-4 py-3 text-sm text-slate-300 font-medium">
                                                    {p.data_pagamento ? formatDate(p.data_pagamento) : '-'}
                                                </td>
                                                <td className="px-4 py-3 text-sm font-bold text-white">
                                                    {formatCurrency(p.valor_parcela)}
                                                </td>
                                                <td className="px-4 py-3">
                                                    {isPago ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleSendReceipt(p.id)}
                                                            disabled={isSendingReceipt}
                                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500 hover:text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                                            title="Enviar comprovante desta parcela por WhatsApp"
                                                        >
                                                            {isSendingReceipt ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />}
                                                            <span className="text-[10px] font-bold uppercase tracking-wide">
                                                                {isSendingReceipt ? 'Enviando' : receiptSent ? 'Reenviar' : 'Enviar'}
                                                            </span>
                                                        </button>
                                                    ) : (
                                                        <span className="text-[10px] text-slate-600">-</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    {p.financiamento_loja?.venda_id ? (
                                                        <Link 
                                                            href={isHistoricalImport ? `/dashboard/loja/${storeId}/vendas/${p.financiamento_loja?.venda_id}/historico-importado` : `/dashboard/loja/${storeId}/vendas/${p.financiamento_loja?.venda_id}/experimental`}
                                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-white/10 rounded-lg text-xs font-bold text-slate-300 hover:text-white transition-all opacity-0 group-hover:opacity-100"
                                                        >
                                                            {isHistoricalImport ? 'Abrir histórico' : 'Ver Venda'}
                                                            <ArrowRight className="h-3 w-3" />
                                                        </Link>
                                                    ) : (
                                                        <span className="text-[10px] text-slate-500 italic">Avulsa</span>
                                                    )}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
                </div>
            </div>
            {/* Global style para forçar icone dark no input date */}
            <style dangerouslySetInnerHTML={{__html: `
                .color-scheme-dark { color-scheme: dark; }
            `}} />
            {showContratosQuitados && <ContratosQuitadosModal storeId={storeId} onClose={() => setShowContratosQuitados(false)} />}
        </div>
    )
}
