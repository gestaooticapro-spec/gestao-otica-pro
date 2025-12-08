'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { X, Search, DollarSign, Calendar, Loader2, Wallet, CreditCard, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { searchPendenciasCliente, receberParcela } from '@/lib/actions/vendas.actions'
import EmployeeAuthModal from '@/components/modals/EmployeeAuthModal'

const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const formatDate = (d: string) => new Date(d).toLocaleDateString('pt-BR')
const getToday = () => new Date().toISOString().split('T')[0]

export default function ParcelaSearchModal({ isOpen, onClose, storeId }: { isOpen: boolean, onClose: () => void, storeId: number }) {
    const [step, setStep] = useState<'search' | 'pay'>('search')
    const [query, setQuery] = useState('')
    const [results, setResults] = useState<any[]>([])
    const [isSearching, startSearch] = useTransition()
    
    // Estado do Pagamento
    const [selectedParcela, setSelectedParcela] = useState<any>(null)
    const [valorPagoStr, setValorPagoStr] = useState('')
    const [forma, setForma] = useState('PIX')
    const [estrategia, setEstrategia] = useState('criar_pendencia')
    
    // Auth
    const [isAuthOpen, setIsAuthOpen] = useState(false)
    const [isProcessing, startProcess] = useTransition()

    const searchInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (isOpen) setTimeout(() => searchInputRef.current?.focus(), 100)
    }, [isOpen])

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault()
        if (query.length < 3) return
        startSearch(async () => {
            const res = await searchPendenciasCliente(storeId, query)
            setResults(res as any[])
        })
    }

    const handleSelectParcela = (parcela: any) => {
        setSelectedParcela(parcela)
        setValorPagoStr(formatCurrency(parcela.valor_parcela).replace('R$', '').trim())
        setStep('pay')
    }

    const handlePreConfirm = () => {
        setIsAuthOpen(true)
    }

    const handleAuthSuccess = (employee: { id: number }) => {
        setIsAuthOpen(false)
        if (!selectedParcela) return

        const valorOriginal = selectedParcela.valor_parcela
        const valorPago = parseFloat(valorPagoStr.replace(/\./g, '').replace(',', '.'))
        const diferenca = valorOriginal - valorPago
        const isParcial = diferenca > 0.01

        const formData = new FormData()
        formData.append('parcela_id', selectedParcela.id.toString())
        formData.append('venda_id', selectedParcela.venda_id.toString())
        formData.append('store_id', storeId.toString())
        formData.append('employee_id', employee.id.toString())
        formData.append('valor_original', valorOriginal.toString())
        formData.append('valor_pago', valorPago.toString())
        formData.append('forma_pagamento', forma)
        formData.append('data_pagamento', getToday())
        formData.append('estrategia', isParcial ? estrategia : 'quitacao_total')

        startProcess(async () => {
            const res = await receberParcela(null, formData)
            if (res.success) {
                alert("Pagamento Recebido!")
                onClose()
            } else {
                alert(res.message)
            }
        })
    }

    if (!isOpen) return null

    // Estilos
    const inputStyle = "w-full h-11 rounded-lg border-slate-300 shadow-sm focus:ring-emerald-500 focus:border-emerald-500 font-bold text-slate-800"

    return (
        <>
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
                
                <div className="bg-emerald-600 px-6 py-4 flex justify-between items-center text-white shrink-0">
                    <h3 className="font-bold flex items-center gap-2">
                        <Wallet className="h-5 w-5" /> Recebimento de Parcelas
                    </h3>
                    <button onClick={onClose} className="hover:bg-white/20 p-1.5 rounded-full transition-colors"><X className="h-5 w-5"/></button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
                    
                    {step === 'search' && (
                        <div className="space-y-6">
                            <form onSubmit={handleSearch} className="relative">
                                <input 
                                    ref={searchInputRef}
                                    value={query}
                                    onChange={e => setQuery(e.target.value)}
                                    placeholder="Nome do cliente ou CPF..."
                                    className={`${inputStyle} pl-11 text-lg`}
                                />
                                <Search className="absolute left-3.5 top-3.5 h-5 w-5 text-gray-400" />
                                <button type="submit" className="absolute right-2 top-2 bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-md text-xs font-bold hover:bg-emerald-200">
                                    {isSearching ? <Loader2 className="h-4 w-4 animate-spin"/> : 'BUSCAR'}
                                </button>
                            </form>

                            <div className="space-y-4">
                                {results.length === 0 && !isSearching && query.length > 2 && (
                                    <p className="text-center text-gray-400 text-sm">Nenhuma parcela pendente encontrada.</p>
                                )}

                                {results.map((grupo: any) => (
                                    <div key={grupo.cliente.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                        <div className="bg-slate-100 px-4 py-2 border-b border-slate-200 flex justify-between items-center">
                                            <span className="font-bold text-slate-700 text-sm">{grupo.cliente.full_name}</span>
                                            <span className="text-xs text-slate-500 font-mono">{grupo.cliente.cpf || 'CPF N/A'}</span>
                                        </div>
                                        <div className="divide-y divide-slate-100">
                                            {grupo.parcelas.map((p: any) => {
                                                const isVencida = new Date(p.data_vencimento) < new Date(getToday())
                                                return (
                                                    <button 
                                                        key={p.id} 
                                                        onClick={() => handleSelectParcela(p)}
                                                        className="w-full flex items-center justify-between p-3 hover:bg-emerald-50 transition-colors text-left group"
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <div className={`p-2 rounded-lg ${isVencida ? 'bg-red-100 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                                                                <Calendar className="h-4 w-4" />
                                                            </div>
                                                            <div>
                                                                <p className="text-xs font-bold text-gray-500 uppercase">{p.numero_parcela}ª Parcela</p>
                                                                <p className={`text-xs ${isVencida ? 'text-red-600 font-bold' : 'text-gray-600'}`}>
                                                                    Vence: {formatDate(p.data_vencimento)}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <span className="block text-emerald-700 font-black text-base">{formatCurrency(p.valor_parcela)}</span>
                                                            <span className="text-[10px] text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity font-bold">CLIQUE PARA PAGAR</span>
                                                        </div>
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {step === 'pay' && selectedParcela && (
                        <div className="space-y-5 animate-in slide-in-from-right-4">
                            <div className="text-center pb-4 border-b border-slate-200">
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Valor Original</p>
                                <p className="text-4xl font-black text-slate-800 tracking-tight">{formatCurrency(selectedParcela.valor_parcela)}</p>
                                <p className="text-sm text-slate-500 mt-1">Parcela {selectedParcela.numero_parcela} • Vencimento {formatDate(selectedParcela.data_vencimento)}</p>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Valor Recebido</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-2.5 text-emerald-600 font-bold">R$</span>
                                        <input 
                                            type="text" 
                                            value={valorPagoStr} 
                                            onChange={e => setValorPagoStr(e.target.value)} 
                                            className={`${inputStyle} pl-9 text-xl text-emerald-700`}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Forma</label>
                                    <select value={forma} onChange={e => setForma(e.target.value)} className={inputStyle}>
                                        <option>PIX</option>
                                        <option>Dinheiro</option>
                                        <option>Cartão Débito</option>
                                        <option>Cartão Crédito</option>
                                    </select>
                                </div>
                            </div>

                            {/* Lógica de Diferença (Parcial) */}
                            {(() => {
                                const vOrig = selectedParcela.valor_parcela
                                const vPago = parseFloat(valorPagoStr.replace(/\./g, '').replace(',', '.') || '0')
                                const diff = vOrig - vPago
                                
                                if (diff > 0.01) return (
                                    <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 animate-in fade-in">
                                        <div className="flex items-center gap-2 text-amber-800 font-bold text-sm mb-2">
                                            <AlertTriangle className="h-4 w-4" /> Restam R$ {formatCurrency(diff)}
                                        </div>
                                        <div className="space-y-2">
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input type="radio" checked={estrategia === 'criar_pendencia'} onChange={() => setEstrategia('criar_pendencia')} className="text-amber-600 focus:ring-amber-500" />
                                                <span className="text-sm text-slate-700">Criar nova parcela pendente</span>
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input type="radio" checked={estrategia === 'somar_proxima'} onChange={() => setEstrategia('somar_proxima')} className="text-amber-600 focus:ring-amber-500" />
                                                <span className="text-sm text-slate-700">Somar na próxima parcela</span>
                                            </label>
                                        </div>
                                    </div>
                                )
                                return null
                            })()}

                            <div className="flex gap-3 pt-2">
                                <button onClick={() => setStep('search')} className="flex-1 py-3 rounded-xl border border-slate-300 text-slate-600 font-bold hover:bg-white">Voltar</button>
                                <button onClick={handlePreConfirm} disabled={isProcessing} className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 shadow-lg flex items-center justify-center gap-2">
                                    {isProcessing ? <Loader2 className="h-5 w-5 animate-spin"/> : <CheckCircle2 className="h-5 w-5" />}
                                    CONFIRMAR
                                </button>
                            </div>
                        </div>
                    )}

                </div>
            </div>
        </div>

        {isAuthOpen && (
            <EmployeeAuthModal 
                storeId={storeId} 
                isOpen={isAuthOpen} 
                onClose={() => setIsAuthOpen(false)} 
                onSuccess={handleAuthSuccess}
                title="Autorizar Recebimento"
                description="Insira seu PIN para confirmar a baixa."
            />
        )}
        </>
    )
}