// ARQUIVO: src/components/modals/CustomerHistoryModal.tsx
'use client'

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
            msg += `\n\n📋 *Carnê Venda #${f.vendaId}* (${formatDate(f.dataVenda)})`
            msg += `\nNº | Venc. | Valor | Pgto | Pago`
            f.parcelas.forEach((p) => {
                const venc = formatDate(p.dataVencimento)
                const valor = formatCurrency(p.valor)
                const dtPgto = p.dataPagamento ? formatDate(p.dataPagamento) : '-'
                const vlrPago = p.status === 'Pago' ? formatCurrency(p.valorPago || p.valor) : '-'
                const emoji = p.status === 'Pago' ? '✅' : '⏳'
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

        // Remove caracteres não numéricos
        const phone = selectedCustomer.fone.replace(/\D/g, '')
        // Adiciona código do país se necessário
        const phoneWithCountry = phone.startsWith('55') ? phone : `55${phone}`
        const url = `https://wa.me/${phoneWithCountry}?text=${encodeURIComponent(message)}`
        window.open(url, '_blank')
    }

    // =============================================
    // RENDER
    // =============================================
    if (!isOpen) return null

    return (
        <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={onClose}
        >
            <div
                className="relative w-full max-w-2xl bg-gray-100 rounded-xl shadow-2xl border border-gray-300 overflow-hidden flex flex-col max-h-[85vh]"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex justify-between items-center px-5 py-4 bg-white border-b border-gray-200">
                    <div className="flex items-center gap-3">
                        {selectedCustomer && (
                            <button
                                onClick={handleBack}
                                className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors"
                            >
                                <ChevronRight className="h-5 w-5 rotate-180" />
                            </button>
                        )}
                        <div>
                            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                <Search className="h-5 w-5 text-blue-600" />
                                Consulta Rápida
                            </h3>
                            {selectedCustomer && (
                                <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                                    <User className="h-3 w-3" />
                                    {selectedCustomer.nome}
                                </p>
                            )}
                        </div>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-red-500 transition-colors">
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
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Buscar por nome, CPF ou telefone..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all text-gray-700"
                                    autoFocus
                                />
                                {isSearching && (
                                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-blue-500 animate-spin" />
                                )}
                            </div>

                            {/* Resultados da busca */}
                            <div className="space-y-2 max-h-[400px] overflow-y-auto">
                                {searchResults.length > 0 ? (
                                    searchResults.map((customer) => (
                                        <button
                                            key={customer.id}
                                            onClick={() => handleSelectCustomer(customer)}
                                            className="w-full flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200 hover:border-blue-300 hover:shadow-sm transition-all text-left"
                                        >
                                            <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                                                <User className="h-5 w-5 text-blue-600" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-semibold text-gray-800 truncate">{customer.nome}</p>
                                                <p className="text-xs text-gray-500">
                                                    {customer.cpf && <span className="mr-3">CPF: {customer.cpf}</span>}
                                                    {customer.fone && <span>Tel: {customer.fone}</span>}
                                                </p>
                                            </div>
                                            <ChevronRight className="h-5 w-5 text-gray-400" />
                                        </button>
                                    ))
                                ) : searchTerm.length >= 2 && !isSearching ? (
                                    <div className="text-center py-8 text-gray-400">
                                        <AlertCircle className="h-10 w-10 mx-auto mb-2 opacity-50" />
                                        <p>Nenhum cliente encontrado</p>
                                    </div>
                                ) : searchTerm.length === 0 ? (
                                    <div className="text-center py-8 text-gray-400">
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
                            <div className="flex border-b border-gray-200 bg-white">
                                <button
                                    onClick={() => setActiveTab('financeiro')}
                                    className={`flex-1 py-3 px-4 text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${activeTab === 'financeiro'
                                        ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50'
                                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                                        }`}
                                >
                                    <Wallet className="h-4 w-4" />
                                    💳 Financeiro
                                </button>
                                <button
                                    onClick={() => setActiveTab('receitas')}
                                    className={`flex-1 py-3 px-4 text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${activeTab === 'receitas'
                                        ? 'text-purple-600 border-b-2 border-purple-600 bg-purple-50/50'
                                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                                        }`}
                                >
                                    <Glasses className="h-4 w-4" />
                                    👓 Receitas
                                </button>
                            </div>

                            {/* Conteúdo das Tabs */}
                            <div className="flex-1 overflow-y-auto p-4">
                                {isLoadingData ? (
                                    <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                                        <Loader2 className="h-8 w-8 animate-spin mb-2" />
                                        <p className="text-sm">Carregando dados...</p>
                                    </div>
                                ) : activeTab === 'financeiro' ? (
                                    // === TAB FINANCEIRO ===
                                    <div className="space-y-4">
                                        {financialData && financialData.totais.totalParcelas > 0 ? (
                                            <>
                                                {/* Resumo Geral */}
                                                <div className="bg-white rounded-lg border border-gray-200 p-4">
                                                    <h4 className="text-xs font-bold text-gray-400 uppercase mb-3">Resumo Geral</h4>
                                                    <div className="grid grid-cols-3 gap-4 text-center">
                                                        <div>
                                                            <p className="text-2xl font-black text-green-600">
                                                                {financialData.totais.parcelasPagas}
                                                            </p>
                                                            <p className="text-xs text-gray-500">Pagas</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-2xl font-black text-amber-600">
                                                                {financialData.totais.parcelasPendentes}
                                                            </p>
                                                            <p className="text-xs text-gray-500">Pendentes</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-2xl font-black text-gray-700">
                                                                {financialData.totais.totalParcelas}
                                                            </p>
                                                            <p className="text-xs text-gray-500">Total</p>
                                                        </div>
                                                    </div>

                                                    <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 gap-4 text-sm">
                                                        <div className="flex justify-between">
                                                            <span className="text-gray-500">Pago:</span>
                                                            <span className="font-bold text-green-600">
                                                                {formatCurrency(financialData.totais.valorPago)}
                                                            </span>
                                                        </div>
                                                        <div className="flex justify-between">
                                                            <span className="text-gray-500">Restante:</span>
                                                            <span className="font-bold text-amber-600">
                                                                {formatCurrency(financialData.totais.valorRestante)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Próximo Vencimento */}
                                                {financialData.proximoVencimento && (
                                                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200 p-3 flex items-center gap-4">
                                                        <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                                                            <Calendar className="h-5 w-5 text-blue-600" />
                                                        </div>
                                                        <div>
                                                            <p className="text-xs font-bold text-blue-600 uppercase">Próximo Vencimento</p>
                                                            <p className="text-base font-black text-gray-800">
                                                                {formatDate(financialData.proximoVencimento.data!)}
                                                                <span className="text-sm font-normal text-gray-500 ml-2">
                                                                    Parcela {financialData.proximoVencimento.numeroParcela} • {formatCurrency(financialData.proximoVencimento.valor)}
                                                                </span>
                                                            </p>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Tabela de Parcelas por Financiamento */}
                                                {financialData.financiamentos.map((f) => (
                                                    <div key={f.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                                                        {/* Header do Carnê */}
                                                        <div className="bg-gray-50 border-b border-gray-200 px-4 py-2 flex items-center gap-2">
                                                            <CreditCard className="h-4 w-4 text-gray-400" />
                                                            <span className="text-xs font-bold text-gray-600">
                                                                Carnê Venda #{f.vendaId}
                                                            </span>
                                                            <span className="text-xs text-gray-400">•</span>
                                                            <span className="text-xs text-gray-500">{formatDate(f.dataVenda)}</span>
                                                            <span className="text-xs text-gray-400 ml-auto">
                                                                {f.parcelasPagas}/{f.totalParcelas} pagas
                                                            </span>
                                                        </div>

                                                        {/* Tabela */}
                                                        <div className="overflow-x-auto">
                                                            <table className="w-full text-xs">
                                                                <thead>
                                                                    <tr className="border-b border-gray-100 text-gray-400 uppercase">
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
                                                                                className={`border-b border-gray-50 ${isPago ? 'bg-green-50/50' : isAtrasado ? 'bg-red-50/50' : ''
                                                                                    }`}
                                                                            >
                                                                                <td className="px-3 py-1.5 font-medium text-gray-600">
                                                                                    {p.numeroParcela}
                                                                                </td>
                                                                                <td className="px-3 py-1.5 text-gray-600">
                                                                                    {formatDate(p.dataVencimento)}
                                                                                </td>
                                                                                <td className="px-3 py-1.5 text-right font-medium text-gray-700">
                                                                                    {formatCurrency(p.valor)}
                                                                                </td>
                                                                                <td className="px-3 py-1.5 text-gray-500">
                                                                                    {p.dataPagamento ? formatDate(p.dataPagamento) : (
                                                                                        <span className={isAtrasado ? 'text-red-500 font-semibold' : 'text-gray-300'}>
                                                                                            {isAtrasado ? 'Atrasado' : '-'}
                                                                                        </span>
                                                                                    )}
                                                                                </td>
                                                                                <td className="px-3 py-1.5 text-right">
                                                                                    {isPago ? (
                                                                                        <span className="font-medium text-green-600">
                                                                                            {formatCurrency(p.valorPago || p.valor)}
                                                                                        </span>
                                                                                    ) : (
                                                                                        <span className="text-gray-300">-</span>
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
                                            <div className="text-center py-10 text-gray-400">
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
                                                <div key={rx.id} className="bg-white rounded-lg border border-gray-200 p-4">
                                                    {/* Cabeçalho */}
                                                    <div className="flex justify-between items-start mb-3 border-b border-gray-100 pb-2">
                                                        <div>
                                                            <span className="text-xs font-bold text-purple-700 bg-purple-50 px-2 py-1 rounded flex items-center gap-1 w-fit">
                                                                <Calendar className="h-3 w-3" />
                                                                {formatDate(rx.dataCompra)}
                                                            </span>
                                                            {rx.medico && (
                                                                <p className="text-xs text-gray-500 mt-1">Dr(a). {rx.medico}</p>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Grid de Valores - Longe */}
                                                    <div className="mb-2">
                                                        <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Para Longe</p>
                                                        <div className="grid grid-cols-7 gap-1 text-center text-xs">
                                                            <div className="col-span-1 font-bold text-gray-400 text-[10px]"></div>
                                                            <div className="col-span-2 font-bold text-gray-400 text-[10px]">ESF</div>
                                                            <div className="col-span-2 font-bold text-gray-400 text-[10px]">CIL</div>
                                                            <div className="col-span-2 font-bold text-gray-400 text-[10px]">EIXO</div>

                                                            <div className="col-span-1 font-bold text-blue-600">OD</div>
                                                            <div className="col-span-2 bg-gray-100 rounded py-1 font-medium text-gray-700">{rx.longeOdEsf || '-'}</div>
                                                            <div className="col-span-2 bg-gray-100 rounded py-1 font-medium text-gray-700">{rx.longeOdCil || '-'}</div>
                                                            <div className="col-span-2 bg-gray-100 rounded py-1 font-medium text-gray-700">{rx.longeOdEixo || '-'}</div>

                                                            <div className="col-span-1 font-bold text-blue-600">OE</div>
                                                            <div className="col-span-2 bg-gray-100 rounded py-1 font-medium text-gray-700">{rx.longeOeEsf || '-'}</div>
                                                            <div className="col-span-2 bg-gray-100 rounded py-1 font-medium text-gray-700">{rx.longeOeCil || '-'}</div>
                                                            <div className="col-span-2 bg-gray-100 rounded py-1 font-medium text-gray-700">{rx.longeOeEixo || '-'}</div>
                                                        </div>
                                                    </div>

                                                    {/* Adição */}
                                                    {rx.adicao && (
                                                        <div className="mt-2 pt-2 border-t border-dashed border-gray-200 text-xs text-gray-600">
                                                            <span>Adição: <strong>{rx.adicao}</strong></span>
                                                        </div>
                                                    )}
                                                </div>
                                            ))
                                        ) : (
                                            <div className="text-center py-10 text-gray-400">
                                                <Glasses className="h-10 w-10 mx-auto mb-2 opacity-50" />
                                                <p>Nenhuma receita encontrada</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Footer com botão WhatsApp */}
                            {selectedCustomer && (
                                <div className="bg-white border-t border-gray-200 p-4">
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
                                        className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors shadow-md"
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
