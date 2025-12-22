'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Search, Calendar, Loader2, Wallet, ArrowLeft, ShoppingBag, CheckCircle2, AlertTriangle, ArrowDownCircle } from 'lucide-react'
import { searchPendenciasCliente, receberParcela } from '@/lib/actions/vendas.actions'
import EmployeeAuthModal from '@/components/modals/EmployeeAuthModal'
import { PrintParcelaButton } from '@/components/financeiro/PrintParcelaButton'

const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const formatDate = (d: string) => new Date(d).toLocaleDateString('pt-BR', { timeZone: 'UTC' })
const getToday = () => new Date().toISOString().split('T')[0]

const parseMoney = (val: string) => {
    if (!val) return 0
    const clean = val.replace(/[^\d,]/g, '')
    return parseFloat(clean.replace(',', '.')) || 0
}

function ParcelaCard({ p, onClick }: { p: any, onClick: () => void }) {
    const isVencida = new Date(p.data_vencimento) < new Date(getToday())
    
    return (
        <button 
            onClick={onClick}
            className="w-full flex items-center justify-between p-3 bg-white border border-slate-100 rounded-lg hover:border-emerald-300 hover:shadow-md hover:bg-emerald-50/30 transition-all group text-left"
        >
            <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${isVencida ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-500'}`}>
                    <Calendar className="h-4 w-4" />
                </div>
                <div>
                    <p className="text-xs font-bold text-slate-600 uppercase">{p.numero_parcela}ª Parcela</p>
                    <p className={`text-xs font-medium ${isVencida ? 'text-red-600' : 'text-slate-400'}`}>
                        Vence: {formatDate(p.data_vencimento)}
                    </p>
                </div>
            </div>
            <div className="text-right">
                <span className="block text-emerald-700 font-black text-base">{formatCurrency(p.valor_parcela)}</span>
                <span className="text-[9px] font-bold text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity uppercase tracking-wide">
                    Pagar Agora
                </span>
            </div>
        </button>
    )
}

export default function ParcelaSearchModal({ isOpen, onClose, storeId }: { isOpen: boolean, onClose: () => void, storeId: number }) {
    const [mounted, setMounted] = useState(false)

    const [step, setStep] = useState<'search' | 'details' | 'pay' | 'success'>('search')
    const [query, setQuery] = useState('')
    const [results, setResults] = useState<any[]>([])
    const [isSearching, startSearch] = useTransition()
    
    const [selectedClientData, setSelectedClientData] = useState<any>(null)
    const [selectedParcela, setSelectedParcela] = useState<any>(null)
    const [paidParcelaId, setPaidParcelaId] = useState<number | null>(null)
    
    const [valorTotalPagoStr, setValorTotalPagoStr] = useState('') 
    const [valorJurosStr, setValorJurosStr] = useState('0,00') 
    const [forma, setForma] = useState('PIX')
    const [estrategia, setEstrategia] = useState('criar_pendencia')
    
    const [isAuthOpen, setIsAuthOpen] = useState(false)
    const [isProcessing, startProcess] = useTransition()
    const searchInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        setMounted(true)
    }, [])

    useEffect(() => {
        if (isOpen) {
            setStep('search')
            setQuery('')
            setResults([])
            setPaidParcelaId(null) 
            setTimeout(() => searchInputRef.current?.focus(), 100)
        }
    }, [isOpen])

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault()
        if (query.length < 3) return
        startSearch(async () => {
            try {
                const res = await searchPendenciasCliente(storeId, query)
                setResults(res as any[])
            } catch (error) {
                console.error("[DEBUG] Erro na busca:", error)
            }
        })
    }

    const handleSelectClient = (clientData: any) => {
        setSelectedClientData(clientData)
        setStep('details')
    }

    const handleSelectParcela = (parcela: any) => {
        console.log("[DEBUG] Parcela selecionada:", parcela)
        setSelectedParcela(parcela)
        
        const valLimpo = formatCurrency(parcela.valor_parcela).replace(/[^\d,]/g, '')
        setValorTotalPagoStr(valLimpo)
        setValorJurosStr('0,00') 
        setEstrategia('criar_pendencia')
        setStep('pay')
    }

    const parcelasAgrupadas = selectedClientData ? selectedClientData.parcelas.reduce((acc: any, p: any) => {
        const key = p.venda_id
        if (!acc[key]) {
            acc[key] = { venda_id: key, data_venda: p.data_venda, beneficiario: p.beneficiario, itens: [] }
        }
        acc[key].itens.push(p)
        return acc
    }, {}) : {}

    const gruposVendas = Object.values(parcelasAgrupadas).sort((a: any, b: any) => 
        new Date(a.data_venda).getTime() - new Date(b.data_venda).getTime()
    )

    // --- PONTO CRÍTICO 1: O Clique Inicial ---
    const handlePreConfirm = () => {
        console.log("[DEBUG] 1. Clicou em CONFIRMAR RECEBIMENTO")
        console.log("[DEBUG] Estado atual:", { isProcessing, isAuthOpen, storeId })
        
        if (isProcessing) {
            console.log("[DEBUG] Abortando: Já está processando")
            return
        }

        console.log("[DEBUG] Abrindo Modal de Autenticação...")
        setIsAuthOpen(true)
    }

    // --- PONTO CRÍTICO 2: Retorno da Senha ---
    const handleAuthSuccess = (employee: { id: number }) => {
        console.log("[DEBUG] 2. Autenticação SUCESSO. Funcionario ID:", employee.id)
        
        setIsAuthOpen(false)
        if (!selectedParcela) {
            console.error("[DEBUG] ERRO: Nenhuma parcela selecionada no state!")
            return
        }

        const valorOriginal = selectedParcela.valor_parcela
        const valorTotalPago = parseMoney(valorTotalPagoStr)
        const valorJuros = parseMoney(valorJurosStr)
        
        console.log("[DEBUG] Valores parseados:", { valorOriginal, valorTotalPago, valorJuros, forma })

        const formData = new FormData()
        formData.append('parcela_id', selectedParcela.id.toString())
        formData.append('venda_id', selectedParcela.venda_id.toString())
        formData.append('store_id', storeId.toString())
        formData.append('employee_id', employee.id.toString())
        
        formData.append('valor_original', valorOriginal.toString())
        formData.append('valor_pago_total', valorTotalPago.toString()) 
        formData.append('valor_juros', valorJuros.toString()) 
        
        formData.append('forma_pagamento', forma)
        formData.append('data_pagamento', getToday())
        
        const principalAbatido = valorTotalPago - valorJuros
        const diferenca = valorOriginal - principalAbatido
        const isParcial = diferenca > 0.01

        formData.append('estrategia', isParcial ? estrategia : 'quitacao_total')

        console.log("[DEBUG] 3. Iniciando Server Action com FormData...")
        
        startProcess(async () => {
            try {
                const res = await receberParcela(null, formData)
                console.log("[DEBUG] 4. Resposta do Server Action:", res)

                if (res.success) {
                    console.log("[DEBUG] Sucesso! Mudando step para 'success'")
                    setPaidParcelaId(selectedParcela.id)
                    setStep('success')
                } else {
                    console.error("[DEBUG] Erro retornado pelo servidor:", res.message)
                    alert(`Erro: ${res.message}`)
                }
            } catch (err) {
                console.error("[DEBUG] CRITICAL ERROR na chamada da Server Action:", err)
                alert("Erro crítico ao processar pagamento. Verifique o console.")
            }
        })
    }

    if (!mounted || !isOpen) return null

    return createPortal(
        <>
        {/* AJUSTEI O Z-INDEX PARA 50 PARA GARANTIR QUE NÃO CUBRA O MODAL DE SENHA */}
        <div className="fixed inset-0 z-[50] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
                
                {/* Header */}
                <div className="bg-emerald-600 px-6 py-4 flex justify-between items-center text-white shrink-0">
                    <div className="flex items-center gap-3">
                        {step !== 'search' && step !== 'success' && (
                            <button onClick={() => setStep(step === 'pay' ? 'details' : 'search')} className="p-1 hover:bg-white/20 rounded-full transition-colors">
                                <ArrowLeft className="h-5 w-5" />
                            </button>
                        )}
                        <h3 className="font-bold flex items-center gap-2 text-lg">
                            <Wallet className="h-5 w-5" /> 
                            {step === 'search' ? 'Recebimento' : step === 'details' ? 'Selecione a Parcela' : step === 'pay' ? 'Confirmar Pagamento' : 'Concluído'}
                        </h3>
                    </div>
                    <button onClick={onClose} className="hover:bg-white/20 p-1.5 rounded-full transition-colors"><X className="h-5 w-5"/></button>
                </div>

                <div className="flex-1 overflow-y-auto p-0 bg-slate-50">
                    
                    {step === 'search' && (
                        <div className="p-6 space-y-6">
                            <form onSubmit={handleSearch} className="relative">
                                <input 
                                    ref={searchInputRef}
                                    value={query}
                                    onChange={e => setQuery(e.target.value)}
                                    placeholder="Nome do cliente..."
                                    className="w-full h-12 rounded-xl border-slate-300 shadow-sm focus:ring-emerald-500 focus:border-emerald-500 font-bold text-slate-800 text-lg pl-12"
                                />
                                <Search className="absolute left-4 top-3.5 h-5 w-5 text-gray-400" />
                                <button type="submit" className="absolute right-2 top-2 bg-emerald-100 text-emerald-700 px-4 py-2 rounded-lg text-xs font-bold hover:bg-emerald-200 uppercase tracking-wide">
                                    {isSearching ? <Loader2 className="h-4 w-4 animate-spin"/> : 'Buscar'}
                                </button>
                            </form>
                            <div className="space-y-3">
                                {results.map((grupo: any) => (
                                    <button key={grupo.cliente.id} onClick={() => handleSelectClient(grupo)} className="w-full bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:border-emerald-400 hover:shadow-md transition-all text-left flex justify-between items-center group">
                                        <div>
                                            <p className="font-bold text-slate-800 text-lg group-hover:text-emerald-700 transition-colors">{grupo.cliente.full_name}</p>
                                            <p className="text-xs text-slate-500 font-mono mt-1">CPF: {grupo.cliente.cpf || 'Não informado'}</p>
                                        </div>
                                        <div className="text-right">
                                            <span className="block text-xs font-bold text-slate-400 uppercase">Total Pendente</span>
                                            <span className="block text-emerald-600 font-black text-lg">{formatCurrency(grupo.parcelas.reduce((acc: number, p: any) => acc + p.valor_parcela, 0))}</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {step === 'details' && selectedClientData && (
                        <div className="p-4 space-y-6">
                            <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl text-center">
                                <h2 className="text-xl font-black text-emerald-900">{selectedClientData.cliente.full_name}</h2>
                                <p className="text-xs text-emerald-700 mt-1 uppercase font-bold tracking-wide">Selecione uma parcela para pagar</p>
                            </div>
                            <div className="space-y-6">
                                {gruposVendas.map((grupo: any) => (
                                    <div key={grupo.venda_id} className="relative pl-4 border-l-2 border-slate-200">
                                        <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-slate-300 border-4 border-slate-50"></div>
                                        <div className="mb-3">
                                            <p className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                                <ShoppingBag className="h-4 w-4 text-slate-400" />
                                                Compra em {formatDate(grupo.data_venda)}
                                            </p>
                                            {grupo.beneficiario && <p className="text-xs text-blue-600 font-bold ml-6 mt-0.5 bg-blue-50 inline-block px-2 py-0.5 rounded">Para: {grupo.beneficiario}</p>}
                                        </div>
                                        <div className="space-y-2">
                                            {grupo.itens.sort((a: any, b: any) => a.numero_parcela - b.numero_parcela).map((p: any) => (
                                                <ParcelaCard key={p.id} p={p} onClick={() => handleSelectParcela(p)} />
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {step === 'pay' && selectedParcela && (
                        <div className="p-6 space-y-6 animate-in slide-in-from-right-4">
                            <div className="text-center pb-4 border-b border-slate-200">
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Valor Original</p>
                                <p className="text-4xl font-black text-slate-800 tracking-tight">{formatCurrency(selectedParcela.valor_parcela)}</p>
                                <div className="flex justify-center gap-4 mt-2">
                                    <p className="text-sm text-slate-500">Parcela {selectedParcela.numero_parcela}</p>
                                    <p className={`text-sm font-bold ${new Date(selectedParcela.data_vencimento) < new Date(getToday()) ? 'text-red-600' : 'text-slate-500'}`}>
                                        Vencimento: {formatDate(selectedParcela.data_vencimento)}
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Total Recebido</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-2.5 text-emerald-600 font-bold">R$</span>
                                        <input 
                                            type="text" 
                                            value={valorTotalPagoStr} 
                                            onChange={e => setValorTotalPagoStr(e.target.value)} 
                                            className="w-full h-11 rounded-lg border-slate-300 shadow-sm focus:ring-emerald-500 focus:border-emerald-500 font-bold text-slate-800 pl-11 text-xl"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Forma</label>
                                    <select value={forma} onChange={e => setForma(e.target.value)} className="w-full h-11 rounded-lg border-slate-300 shadow-sm focus:ring-emerald-500 focus:border-emerald-500 font-bold text-slate-800 cursor-pointer">
                                        <option>PIX</option><option>Dinheiro</option><option>Cartão Débito</option><option>Cartão Crédito</option>
                                    </select>
                                </div>
                            </div>

                            {new Date(selectedParcela.data_vencimento) < new Date(getToday()) && (
                                <div className="bg-red-50 p-4 rounded-xl border border-red-200">
                                    <label className="block text-xs font-bold text-red-800 mb-1 uppercase flex items-center gap-2">
                                        <AlertTriangle className="h-3 w-3" /> Juros / Multa (Incluso no total)
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-2.5 text-red-600 font-bold">R$</span>
                                        <input 
                                            type="text" 
                                            value={valorJurosStr} 
                                            onChange={e => setValorJurosStr(e.target.value)} 
                                            className="w-full h-10 rounded-lg border-red-300 bg-white shadow-sm focus:ring-red-500 focus:border-red-500 font-bold text-red-800 pl-11"
                                        />
                                    </div>
                                    <p className="text-[10px] text-red-600 mt-1">Este valor não abate a dívida.</p>
                                </div>
                            )}

                            {(() => {
                                const vOrig = selectedParcela.valor_parcela
                                const vTotal = parseMoney(valorTotalPagoStr)
                                const vJuros = parseMoney(valorJurosStr)
                                
                                const principalAbatido = vTotal - vJuros
                                const diferenca = vOrig - principalAbatido
                                
                                if (diferenca > 0.01) {
                                    return (
                                        <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 animate-in fade-in">
                                            <div className="flex items-center gap-2 text-amber-800 font-bold text-sm mb-3">
                                                <AlertTriangle className="h-4 w-4" /> Restam R$ {formatCurrency(diferenca)} da dívida
                                            </div>
                                            <div className="space-y-2">
                                                <label className="flex items-start gap-3 cursor-pointer p-2 rounded hover:bg-amber-100/50 transition-colors">
                                                    <input type="radio" name="strat" checked={estrategia === 'criar_pendencia'} onChange={() => setEstrategia('criar_pendencia')} className="mt-1 text-amber-600 focus:ring-amber-500" />
                                                    <div><span className="block text-sm font-bold text-gray-800">Manter como Pendência</span><span className="block text-xs text-gray-500">Cria nova parcela.</span></div>
                                                </label>
                                                <label className="flex items-start gap-3 cursor-pointer p-2 rounded hover:bg-amber-100/50 transition-colors">
                                                    <input type="radio" name="strat" checked={estrategia === 'somar_proxima'} onChange={() => setEstrategia('somar_proxima')} className="mt-1 text-amber-600 focus:ring-amber-500" />
                                                    <div><span className="block text-sm font-bold text-gray-800">Jogar para Próxima</span><span className="block text-xs text-gray-500">Soma na próxima parcela.</span></div>
                                                </label>
                                            </div>
                                        </div>
                                    )
                                } else if (diferenca < -0.01) {
                                    return (
                                        <div className="bg-blue-50 p-4 rounded-xl border border-blue-200 animate-in fade-in">
                                            <div className="flex items-center gap-2 text-blue-800 font-bold text-sm">
                                                <ArrowDownCircle className="h-4 w-4" /> 
                                                <span>Amortização Extra: R$ {formatCurrency(Math.abs(diferenca))}</span>
                                            </div>
                                            <p className="text-xs text-blue-600 mt-2 pl-6">
                                                O valor excedente será <strong>descontado automaticamente</strong> da próxima parcela pendente.
                                            </p>
                                        </div>
                                    )
                                }
                                return null
                            })()}
                            
                            <button 
                                onClick={handlePreConfirm} 
                                disabled={isProcessing} 
                                className="w-full py-4 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 shadow-lg flex items-center justify-center gap-2 transition-transform active:scale-95"
                            >
                                {isProcessing ? <Loader2 className="h-6 w-6 animate-spin"/> : <CheckCircle2 className="h-6 w-6" />}
                                TESTE CLIQUE
                            </button>
                        </div>
                    )}

                    {step === 'success' && (
                         <div className="p-10 flex flex-col items-center justify-center text-center animate-in zoom-in-50">
                            <div className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center mb-6 text-emerald-600">
                                <CheckCircle2 className="h-12 w-12" />
                            </div>
                            <h2 className="text-2xl font-black text-slate-800 mb-2">Pagamento Confirmado!</h2>
                            <p className="text-slate-500 mb-8 max-w-xs mx-auto">O recebimento foi registrado no sistema.</p>

                            <div className="w-full max-w-sm space-y-3">
                                {paidParcelaId && (
                                    <PrintParcelaButton parcelaId={paidParcelaId} variant="full" />
                                )}

                                <button onClick={onClose} className="w-full py-3 text-slate-500 font-bold hover:bg-slate-100 rounded-xl transition-colors">
                                    Fechar Janela
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
                onClose={() => {
                    console.log("[DEBUG] Modal de Auth fechado pelo usuário");
                    setIsAuthOpen(false);
                }} 
                onSuccess={handleAuthSuccess} 
                title="Autorizar Pagamento" 
                description="Insira seu PIN para confirmar." 
            />
        )}
        </>,
        document.body
    )
}