// ARQUIVO: src/components/modals/CustomerHistoryModal.tsx
'use client'

import { getWhatsAppLink } from '@/lib/utils'

import { useState, useEffect, useCallback } from 'react'
import { X, Loader2, Search, User, Wallet, Glasses, MessageCircle, Calendar, CreditCard, AlertCircle, ChevronRight } from 'lucide-react'
import {
    searchCustomersQuick,
    getCustomerFinancialSummary,
    getCustomerPrescriptionSummary,
    type CustomerSearchResult,
    type FinancialSummary,
    type PrescriptionSummary,
    type ParcelaDetail
} from '@/lib/actions/customer-history.actions'

// =============================================
// TIPOS
// =============================================
type CustomerHistoryModalProps = {
    isOpen: boolean
    onClose: () => void
    storeId: number
}

type Tab = 'financeiro' | 'receitas'

// =============================================
// HELPERS
// =============================================
const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('pt-BR')

const formatMonthYear = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
}

// =============================================
// COMPONENTE PRINCIPAL
// =============================================
export default function CustomerHistoryModal({ isOpen, onClose, storeId }: CustomerHistoryModalProps) {
    // Estados de busca
    const [searchTerm, setSearchTerm] = useState('')
    const [searchResults, setSearchResults] = useState<CustomerSearchResult[]>([])
    const [isSearching, setIsSearching] = useState(false)

    // Estados do cliente selecionado
    const [selectedCustomer, setSelectedCustomer] = useState<CustomerSearchResult | null>(null)
    const [activeTab, setActiveTab] = useState<Tab>('financeiro')

    // Estados de dados
    const [financialData, setFinancialData] = useState<FinancialSummary | null>(null)
    const [prescriptionData, setPrescriptionData] = useState<PrescriptionSummary[]>([])
    const [isLoadingData, setIsLoadingData] = useState(false)

    // Reset ao fechar
    useEffect(() => {
        if (!isOpen) {
            setSearchTerm('')
            setSearchResults([])
            setSelectedCustomer(null)
            setFinancialData(null)
            setPrescriptionData([])
            setActiveTab('financeiro')
        }
    }, [isOpen])

    // Busca com debounce
    const handleSearch = useCallback(async (termo: string) => {
        if (termo.length < 2) {
            setSearchResults([])
            return
        }

        setIsSearching(true)
        try {
            const results = await searchCustomersQuick(termo, storeId)
            setSearchResults(results)
        } finally {
            setIsSearching(false)
        }
    }, [storeId])

    useEffect(() => {
        const timer = setTimeout(() => {
            handleSearch(searchTerm)
        }, 300)
        return () => clearTimeout(timer)
    }, [searchTerm, handleSearch])

    // Carrega dados do cliente selecionado
    const handleSelectCustomer = async (customer: CustomerSearchResult) => {
        setSelectedCustomer(customer)
        setSearchResults([])
        setSearchTerm('')
        setIsLoadingData(true)

        try {
            const [financial, prescriptions] = await Promise.all([
                getCustomerFinancialSummary(customer.id, storeId),
                getCustomerPrescriptionSummary(customer.id, storeId)
            ])
            setFinancialData(financial)
            setPrescriptionData(prescriptions)
        } finally {
            setIsLoadingData(false)
        }
    }

    // Voltar para busca
    const handleBack = () => {
        setSelectedCustomer(null)
        setFinancialData(null)
        setPrescriptionData([])
    }

    // =============================================
    // WHATSAPP - FORMATAÇÃO DAS MENSAGENS
    // =============================================
    const getFinancialWhatsAppMessage = (): string => {
        if (!financialData || !selectedCustomer) return ''

        const { totais, financiamentos } = financialData

        if (totais.totalParcelas === 0) {
            return `Olá! Não encontramos parcelas ativas em seu nome.`
        }

        let msg = `Olá ${selectedCustomer.nome.split(' ')[0]}!\n`
        msg += `Resumo: ${totais.parcelasPagas}/${totais.totalParcelas} parcelas pagas (${formatCurrency(totais.valorPago)}).`

        if (totais.parcelasPendentes > 0) {
            msg += ` Restam ${totais.parcelasPendentes} (${formatCurrency(totais.valorRestante)}).`
        }

        // Detalhe por carnê
        financiamentos.forEach((f) => {
            msg += `\n\n-- *Carne Venda #${f.vendaId}* (${formatDate(f.dataVenda)}) --`
            msg += `\nNº | Venc. | Valor | Pgto | Pago`
            f.parcelas.forEach((p) => {
                const venc = formatDate(p.dataVencimento)
                const valor = formatCurrency(p.valor)
                const dtPgto = p.dataPagamento ? formatDate(p.dataPagamento) : '-'
                const vlrPago = p.status === 'Pago' ? formatCurrency(p.valorPago || p.valor) : '-'
                const emoji = p.status === 'Pago' ? '[OK]' : '[  ]'
                msg += `\n${emoji} ${p.numeroParcela} | ${venc} | ${valor} | ${dtPgto} | ${vlrPago}`
            })
        })

        return msg
    }

    const getPrescriptionWhatsAppMessage = (): string => {
        if (!prescriptionData.length || !selectedCustomer) return ''

        let msg = `Seus ultimos graus:\n`

        prescriptionData.slice(0, 5).forEach((rx) => {
            const data = formatMonthYear(rx.dataCompra)

            // Formata OD completo
            const odParts = []
            if (rx.longeOdEsf) odParts.push(`Esf ${rx.longeOdEsf}`)
            if (rx.longeOdCil) odParts.push(`Cil ${rx.longeOdCil}`)
            if (rx.longeOdEixo) odParts.push(`Eixo ${rx.longeOdEixo}`)
            const od = odParts.length > 0 ? `OD: ${odParts.join(' ')}` : ''

            // Formata OE completo
            const oeParts = []
            if (rx.longeOeEsf) oeParts.push(`Esf ${rx.longeOeEsf}`)
            if (rx.longeOeCil) oeParts.push(`Cil ${rx.longeOeCil}`)
            if (rx.longeOeEixo) oeParts.push(`Eixo ${rx.longeOeEixo}`)
            const oe = oeParts.length > 0 ? `OE: ${oeParts.join(' ')}` : ''

            // Adição
            const adicao = rx.adicao ? `Add: ${rx.adicao}` : ''

            if (od || oe) {
                msg += `\n${data}:\n`
                if (od) msg += `  ${od}\n`
                if (oe) msg += `  ${oe}\n`
                if (adicao) msg += `  ${adicao}\n`
            }
        })

        return msg.trim()
    }

    const openWhatsApp = (message: string) => {
        if (!selectedCustomer?.fone) {
            alert('Cliente não possui telefone cadastrado.')
            return
        }

        const url = getWhatsAppLink(selectedCustomer.fone, message)
        window.open(url, '_blank')
    }

    // =============================================
    // RENDER
    // =============================================
    if (!isOpen) return null

    return (
        <div
            className="fixed inset-0 z-[60] flex items-start justify-center bg-black/70 backdrop-blur-md p-4 pt-20"
            onClick={onClose}
        >
            <div
                className="relative w-full max-w-2xl bg-slate-900/95 backdrop-blur-xl rounded-2xl shadow-2xl shadow-black/50 border border-white/10 overflow-hidden flex flex-col max-h-[85vh] min-h-[600px]"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex justify-between items-center px-5 py-4 bg-slate-800/60 border-b border-white/10 backdrop-blur-md">
                    <div className="flex items-center gap-3">
                        {selectedCustomer && (
                            <button
                                onClick={handleBack}
                                className="p-1.5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
                            >
                                <ChevronRight className="h-5 w-5 rotate-180" />
                            </button>
                        )}
                        <div>
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <Search className="h-5 w-5 text-indigo-400" />
                                Consulta Rápida
                            </h3>
                            {selectedCustomer && (
                                <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                                    <User className="h-3 w-3" />
                                    {selectedCustomer.nome}
                                </p>
                            )}
                        </div>
                    </div>
                    <button onClick={onClose} className="text-slate-500 hover:text-red-400 transition-colors p-1 rounded-lg hover:bg-white/5">
                        <X className="h-6 w-6" />
                    </button>
                </div>

                {/* Conteúdo */}
                <div className="flex-1 overflow-hidden flex flex-col">
                    {!selectedCustomer ? (
                        // === TELA DE BUSCA ===
                        <div className="p-4 space-y-4">
                            {/* Campo de busca */}
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
                                <input
                                    type="text"
                                    placeholder="Buscar por nome, CPF ou telefone..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-white/10 bg-black/30 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 outline-none transition-all text-slate-200 placeholder-slate-500 backdrop-blur-sm font-medium"
                                    autoFocus
                                />
                                {isSearching && (
                                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-indigo-400 animate-spin" />
                                )}
                            </div>

                            {/* Resultados da busca */}
                            <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar">
                                {searchResults.length > 0 ? (
                                    searchResults.map((customer) => (
                                        <button
                                            key={customer.id}
                                            onClick={() => handleSelectCustomer(customer)}
                                            className="w-full flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/5 hover:border-indigo-500/30 hover:bg-white/10 transition-all text-left backdrop-blur-sm group"
                                        >
                                            <div className="h-10 w-10 rounded-full bg-indigo-500/20 flex items-center justify-center border border-indigo-500/20 group-hover:bg-indigo-500/30 transition-colors">
                                                <User className="h-5 w-5 text-indigo-400" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-semibold text-slate-200 truncate group-hover:text-white transition-colors">{customer.nome}</p>
                                                <p className="text-xs text-slate-500">
                                                    {customer.cpf && <span className="mr-3">CPF: {customer.cpf}</span>}
                                                    {customer.fone && <span>Tel: {customer.fone}</span>}
                                                </p>
                                            </div>
                                            <ChevronRight className="h-5 w-5 text-slate-600 group-hover:text-indigo-400 transition-colors" />
                                        </button>
                                    ))
                                ) : searchTerm.length >= 2 && !isSearching ? (
                                    <div className="text-center py-8 text-slate-500">
                                        <AlertCircle className="h-10 w-10 mx-auto mb-2 opacity-50" />
                                        <p>Nenhum cliente encontrado</p>
                                    </div>
                                ) : searchTerm.length === 0 ? (
                                    <div className="text-center py-8 text-slate-500">
                                        <Search className="h-10 w-10 mx-auto mb-2 opacity-50" />
                                        <p>Digite para buscar um cliente</p>
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    ) : (
                        // === TELA DE DETALHES DO CLIENTE ===
                        <>
                            {/* Tabs */}
                            <div className="flex border-b border-white/10 bg-slate-800/40">
                                <button
                                    onClick={() => setActiveTab('financeiro')}
                                    className={`flex-1 py-3 px-4 text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${activeTab === 'financeiro'
                                        ? 'text-indigo-300 border-b-2 border-indigo-500 bg-indigo-500/10'
                                        : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                                        }`}
                                >
                                    <Wallet className="h-4 w-4" />
                                    💳 Financeiro
                                </button>
                                <button
                                    onClick={() => setActiveTab('receitas')}
                                    className={`flex-1 py-3 px-4 text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${activeTab === 'receitas'
                                        ? 'text-sky-300 border-b-2 border-sky-500 bg-sky-500/10'
                                        : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                                        }`}
                                >
                                    <Glasses className="h-4 w-4" />
                                    👓 Receitas
                                </button>
                            </div>

                            {/* Conteúdo das Tabs */}
                            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                                {isLoadingData ? (
                                    <div className="flex flex-col items-center justify-center py-10 text-slate-500">
                                        <Loader2 className="h-8 w-8 animate-spin mb-2 text-indigo-400" />
                                        <p className="text-sm">Carregando dados...</p>
                                    </div>
                                ) : activeTab === 'financeiro' ? (
                                    // === TAB FINANCEIRO ===
                                    <div className="space-y-4">
                                        {financialData && financialData.totais.totalParcelas > 0 ? (
                                            <>
                                                {/* Resumo Geral */}
                                                <div className="bg-white/5 rounded-xl border border-white/10 p-4 backdrop-blur-sm">
                                                    <h4 className="text-xs font-bold text-slate-500 uppercase mb-3">Resumo Geral</h4>
                                                    <div className="grid grid-cols-3 gap-4 text-center">
                                                        <div>
                                                            <p className="text-2xl font-black text-emerald-400">
                                                                {financialData.totais.parcelasPagas}
                                                            </p>
                                                            <p className="text-xs text-slate-500">Pagas</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-2xl font-black text-amber-400">
                                                                {financialData.totais.parcelasPendentes}
                                                            </p>
                                                            <p className="text-xs text-slate-500">Pendentes</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-2xl font-black text-white">
                                                                {financialData.totais.totalParcelas}
                                                            </p>
                                                            <p className="text-xs text-slate-500">Total</p>
                                                        </div>
                                                    </div>

                                                    <div className="mt-4 pt-4 border-t border-white/10 grid grid-cols-2 gap-4 text-sm">
                                                        <div className="flex justify-between">
                                                            <span className="text-slate-500">Pago:</span>
                                                            <span className="font-bold text-emerald-400">
                                                                {formatCurrency(financialData.totais.valorPago)}
                                                            </span>
                                                        </div>
                                                        <div className="flex justify-between">
                                                            <span className="text-slate-500">Restante:</span>
                                                            <span className="font-bold text-amber-400">
                                                                {formatCurrency(financialData.totais.valorRestante)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Próximo Vencimento */}
                                                {financialData.proximoVencimento && (
                                                    <div className="bg-indigo-500/10 rounded-xl border border-indigo-500/20 p-3 flex items-center gap-4 backdrop-blur-sm">
                                                        <div className="h-10 w-10 rounded-full bg-indigo-500/20 flex items-center justify-center shrink-0 border border-indigo-500/30">
                                                            <Calendar className="h-5 w-5 text-indigo-400" />
                                                        </div>
                                                        <div>
                                                            <p className="text-xs font-bold text-indigo-300 uppercase">Próximo Vencimento</p>
                                                            <p className="text-base font-black text-white">
                                                                {formatDate(financialData.proximoVencimento.data!)}
                                                                <span className="text-sm font-normal text-slate-400 ml-2">
                                                                    Parcela {financialData.proximoVencimento.numeroParcela} • {formatCurrency(financialData.proximoVencimento.valor)}
                                                                </span>
                                                            </p>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Tabela de Parcelas por Financiamento */}
                                                {financialData.financiamentos.map((f) => (
                                                    <div key={f.id} className="bg-white/5 rounded-xl border border-white/10 overflow-hidden backdrop-blur-sm">
                                                        {/* Header do Carnê */}
                                                        <div className="bg-slate-800/60 border-b border-white/10 px-4 py-2 flex items-center gap-2">
                                                            <CreditCard className="h-4 w-4 text-slate-500" />
                                                            <span className="text-xs font-bold text-slate-300">
                                                                Carnê Venda #{f.vendaId}
                                                            </span>
                                                            <span className="text-xs text-slate-600">•</span>
                                                            <span className="text-xs text-slate-400">{formatDate(f.dataVenda)}</span>
                                                            <span className="text-xs text-slate-500 ml-auto">
                                                                {f.parcelasPagas}/{f.totalParcelas} pagas
                                                            </span>
                                                        </div>

                                                        {/* Tabela */}
                                                        <div className="overflow-x-auto">
                                                            <table className="w-full text-xs">
                                                                <thead>
                                                                    <tr className="border-b border-white/5 text-slate-500 uppercase">
                                                                        <th className="px-3 py-2 text-left font-bold">Nº</th>
                                                                        <th className="px-3 py-2 text-left font-bold">Dt Venc</th>
                                                                        <th className="px-3 py-2 text-right font-bold">Valor</th>
                                                                        <th className="px-3 py-2 text-left font-bold">Dt Pgto</th>
                                                                        <th className="px-3 py-2 text-right font-bold">Vlr Pago</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {f.parcelas.map((p) => {
                                                                        const isPago = p.status === 'Pago'
                                                                        const isAtrasado = !isPago && new Date(p.dataVencimento) < new Date()
                                                                        return (
                                                                            <tr
                                                                                key={p.numeroParcela}
                                                                                className={`border-b border-white/5 ${isPago ? 'bg-emerald-500/5' : isAtrasado ? 'bg-red-500/10' : ''
                                                                                    }`}
                                                                            >
                                                                                <td className="px-3 py-1.5 font-medium text-slate-400">
                                                                                    {p.numeroParcela}
                                                                                </td>
                                                                                <td className="px-3 py-1.5 text-slate-400">
                                                                                    {formatDate(p.dataVencimento)}
                                                                                </td>
                                                                                <td className="px-3 py-1.5 text-right font-medium text-slate-300">
                                                                                    {formatCurrency(p.valor)}
                                                                                </td>
                                                                                <td className="px-3 py-1.5 text-slate-500">
                                                                                    {p.dataPagamento ? formatDate(p.dataPagamento) : (
                                                                                        <span className={isAtrasado ? 'text-red-400 font-semibold' : 'text-slate-600'}>
                                                                                            {isAtrasado ? 'Atrasado' : '-'}
                                                                                        </span>
                                                                                    )}
                                                                                </td>
                                                                                <td className="px-3 py-1.5 text-right">
                                                                                    {isPago ? (
                                                                                        <span className="font-medium text-emerald-400">
                                                                                            {formatCurrency(p.valorPago || p.valor)}
                                                                                        </span>
                                                                                    ) : (
                                                                                        <span className="text-slate-600">-</span>
                                                                                    )}
                                                                                </td>
                                                                            </tr>
                                                                        )
                                                                    })}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>
                                                ))}
                                            </>
                                        ) : (
                                            <div className="text-center py-10 text-slate-500">
                                                <Wallet className="h-10 w-10 mx-auto mb-2 opacity-50" />
                                                <p>Nenhum financiamento encontrado</p>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    // === TAB RECEITAS ===
                                    <div className="space-y-3">
                                        {prescriptionData.length > 0 ? (
                                            prescriptionData.map((rx) => (
                                                <div key={rx.id} className="bg-white/5 rounded-xl border border-white/10 p-4 backdrop-blur-sm">
                                                    {/* Cabeçalho */}
                                                    <div className="flex justify-between items-start mb-3 border-b border-white/10 pb-2">
                                                        <div>
                                                            <span className="text-xs font-bold text-sky-300 bg-sky-500/20 px-2 py-1 rounded flex items-center gap-1 w-fit border border-sky-500/20">
                                                                <Calendar className="h-3 w-3" />
                                                                {formatDate(rx.dataCompra)}
                                                            </span>
                                                            {rx.medico && (
                                                                <p className="text-xs text-slate-500 mt-1">Dr(a). {rx.medico}</p>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Grid de Valores - Longe */}
                                                    <div className="mb-2">
                                                        <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Para Longe</p>
                                                        <div className="grid grid-cols-7 gap-1 text-center text-xs">
                                                            <div className="col-span-1 font-bold text-slate-600 text-[10px]"></div>
                                                            <div className="col-span-2 font-bold text-slate-500 text-[10px]">ESF</div>
                                                            <div className="col-span-2 font-bold text-slate-500 text-[10px]">CIL</div>
                                                            <div className="col-span-2 font-bold text-slate-500 text-[10px]">EIXO</div>

                                                            <div className="col-span-1 font-bold text-sky-400">OD</div>
                                                            <div className="col-span-2 bg-white/5 rounded py-1 font-medium text-slate-300 border border-white/5">{rx.longeOdEsf || '-'}</div>
                                                            <div className="col-span-2 bg-white/5 rounded py-1 font-medium text-slate-300 border border-white/5">{rx.longeOdCil || '-'}</div>
                                                            <div className="col-span-2 bg-white/5 rounded py-1 font-medium text-slate-300 border border-white/5">{rx.longeOdEixo || '-'}</div>

                                                            <div className="col-span-1 font-bold text-sky-400">OE</div>
                                                            <div className="col-span-2 bg-white/5 rounded py-1 font-medium text-slate-300 border border-white/5">{rx.longeOeEsf || '-'}</div>
                                                            <div className="col-span-2 bg-white/5 rounded py-1 font-medium text-slate-300 border border-white/5">{rx.longeOeCil || '-'}</div>
                                                            <div className="col-span-2 bg-white/5 rounded py-1 font-medium text-slate-300 border border-white/5">{rx.longeOeEixo || '-'}</div>
                                                        </div>
                                                    </div>

                                                    {/* Adição */}
                                                    {rx.adicao && (
                                                        <div className="mt-2 pt-2 border-t border-dashed border-white/10 text-xs text-slate-400">
                                                            <span>Adição: <strong className="text-slate-200">{rx.adicao}</strong></span>
                                                        </div>
                                                    )}
                                                </div>
                                            ))
                                        ) : (
                                            <div className="text-center py-10 text-slate-500">
                                                <Glasses className="h-10 w-10 mx-auto mb-2 opacity-50" />
                                                <p>Nenhuma receita encontrada</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Footer com botão WhatsApp */}
                            {selectedCustomer && (
                                <div className="bg-slate-800/60 border-t border-white/10 p-4 backdrop-blur-md">
                                    <button
                                        onClick={() => {
                                            const message = activeTab === 'financeiro'
                                                ? getFinancialWhatsAppMessage()
                                                : getPrescriptionWhatsAppMessage()
                                            openWhatsApp(message)
                                        }}
                                        disabled={
                                            (activeTab === 'financeiro' && (!financialData || financialData.totais.totalParcelas === 0)) ||
                                            (activeTab === 'receitas' && prescriptionData.length === 0)
                                        }
                                        className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-lg shadow-emerald-500/20 border border-white/10"
                                    >
                                        <MessageCircle className="h-5 w-5" />
                                        Enviar via WhatsApp
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
