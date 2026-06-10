'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Search, Calendar, Loader2, Wallet, ArrowLeft, ShoppingBag, CheckCircle2, AlertTriangle, ArrowDownCircle, Printer } from 'lucide-react'
import { searchPendenciasCliente, receberParcela } from '@/lib/actions/vendas.actions'
import EmployeeAuthModal from '@/components/modals/EmployeeAuthModal'
import { printParcela } from '@/components/financeiro/PrintParcelaButton'


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
            className="w-full flex items-center justify-between p-3 bg-white/5 border border-white/10 rounded-xl hover:bg-amber-500/10 hover:border-amber-500/30 transition-all group text-left relative overflow-hidden"
        >
            {isVencida && <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500" />}
            {!isVencida && <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500/50" />}

            <div className="flex items-center gap-3 pl-2">
                <div className={`p-2 rounded-lg ${isVencida ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/10 text-amber-500'}`}>
                    <Calendar className="h-4 w-4" />
                </div>
                <div>
                    <p className="text-xs font-bold text-slate-300 uppercase tracking-wide">{p.numero_parcela}ª Parcela</p>
                    <p className={`text-[10px] font-bold ${isVencida ? 'text-red-400' : 'text-slate-500'}`}>
                        Vence: {formatDate(p.data_vencimento)}
                    </p>
                </div>
            </div>
            <div className="text-right">
                <span className="block text-slate-200 font-black text-base">{formatCurrency(p.valor_parcela)}</span>
                <span className="text-[9px] font-bold text-amber-500 opacity-0 group-hover:opacity-100 transition-opacity uppercase tracking-wide">
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
    const [hasSearched, setHasSearched] = useState(false)
    const [isSearching, startSearch] = useTransition()


    const [selectedClientData, setSelectedClientData] = useState<any>(null)
    const [selectedParcela, setSelectedParcela] = useState<any>(null)
    const [paidParcelaId, setPaidParcelaId] = useState<number | null>(null)

    const [valorTotalPagoStr, setValorTotalPagoStr] = useState('')
    const [valorJurosStr, setValorJurosStr] = useState('0,00')
    const [forma, setForma] = useState('PIX Remoto')
    const [estrategia, setEstrategia] = useState('criar_pendencia')

    const [isAuthOpen, setIsAuthOpen] = useState(false)
    const [isProcessing, startProcess] = useTransition()
    const [isPrinting, setIsPrinting] = useState(false)
    const searchInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        setMounted(true)
    }, [])

    useEffect(() => {
        if (isOpen) {
            setStep('search')
            setQuery('')
            setResults([])
            setHasSearched(false)
            setPaidParcelaId(null)
            setTimeout(() => searchInputRef.current?.focus(), 100)
        }

    }, [isOpen])

    useEffect(() => {
        if (!isOpen) return

        const timer = setTimeout(() => {
            if (query.trim().length >= 3) {
                startSearch(async () => {
                    try {
                        const res = await searchPendenciasCliente(storeId, query)
                        setResults(res as any[])
                        setHasSearched(true)
                    } catch (error) {
                        console.error("[DEBUG] Erro na busca:", error)
                    }
                })
            } else {
                setResults([])
                setHasSearched(false)
            }
        }, 300)

        return () => clearTimeout(timer)
    }, [query, storeId, isOpen])

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault()
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
                    const parcelaId = selectedParcela.id
                    setPaidParcelaId(parcelaId)
                    setStep('success')
                    setIsPrinting(true)
                    printParcela(parcelaId).catch(console.error).finally(() => setIsPrinting(false))
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
            <div className="fixed inset-0 z-[50] flex items-start pt-20 justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                <div className="bg-slate-950 w-full max-w-lg rounded-2xl shadow-2xl border border-white/10 overflow-hidden flex flex-col h-[600px]">

                    {/* Header Amber (Financeiro) */}
                    <div className="bg-amber-950/30 border-b border-amber-500/20 px-6 py-4 flex justify-between items-center text-amber-100 shrink-0">
                        <div className="flex items-center gap-3">
                            {step !== 'search' && step !== 'success' && (
                                <button onClick={() => setStep(step === 'pay' ? 'details' : 'search')} className="p-1.5 hover:bg-white/5 rounded-full transition-colors">
                                    <ArrowLeft className="h-5 w-5" />
                                </button>
                            )}
                            <div className="p-1.5 bg-amber-500/10 rounded-lg">
                                <Wallet className="h-5 w-5 text-amber-400" />
                            </div>
                            <div>
                                <h3 className="font-bold text-lg text-amber-100 leading-tight">
                                    {step === 'search' ? 'Recebimento' : step === 'details' ? 'Selecione a Parcela' : step === 'pay' ? 'Confirmar Pagamento' : 'Sucesso'}
                                </h3>
                                <p className="text-[10px] font-bold text-amber-500/60 uppercase tracking-widest">Financeiro</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="hover:bg-white/5 p-2 rounded-full transition-colors text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-0 custom-scrollbar">

                        {step === 'search' && (
                            <div className="p-6 space-y-6">
                                <form onSubmit={handleSearch} className="relative">
                                    <input
                                        ref={searchInputRef}
                                        value={query}
                                        onChange={e => setQuery(e.target.value)}
                                        placeholder="Nome do cliente..."
                                        className="w-full h-12 bg-white/5 border border-white/10 rounded-xl shadow-sm focus:ring-1 focus:ring-amber-500/50 focus:border-amber-500/50 outline-none font-bold text-slate-200 text-lg pl-12 placeholder:text-slate-600 transition-all"
                                    />
                                    <Search className="absolute left-4 top-3.5 h-5 w-5 text-slate-500" />
                                    <button type="submit" className="absolute right-2 top-2 bg-amber-600/20 text-amber-400 border border-amber-500/20 px-4 py-2 rounded-lg text-xs font-bold hover:bg-amber-600 hover:text-white transition-all uppercase tracking-wide">
                                        {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Buscar'}
                                    </button>
                                </form>
                                <div className="space-y-3">
                                    {results.map((grupo: any) => (
                                        <button key={grupo.cliente.id} onClick={() => handleSelectClient(grupo)} className="w-full bg-white/[0.02] p-4 rounded-xl border border-white/5 hover:border-amber-500/30 hover:bg-amber-500/5 transition-all text-left flex justify-between items-center group relative overflow-hidden">
                                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-600/30 group-hover:bg-amber-500 transition-colors" />
                                            <div className="pl-2">
                                                <p className="font-bold text-slate-200 text-lg group-hover:text-amber-400 transition-colors">{grupo.cliente.full_name}</p>
                                                <p className="text-xs text-slate-500 font-mono mt-1">CPF: {grupo.cliente.cpf || 'Não informado'}</p>
                                            </div>
                                            <div className="text-right">
                                                <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Pendente</span>
                                                <span className="block text-amber-500 font-black text-lg">{formatCurrency(grupo.parcelas.reduce((acc: number, p: any) => acc + p.valor_parcela, 0))}</span>
                                            </div>
                                        </button>
                                    ))}

                                    {results.length === 0 && !isSearching && hasSearched && (
                                        <div className="text-center py-12 text-slate-500 font-medium">
                                            Nenhum cliente encontrado.
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {step === 'details' && selectedClientData && (
                            <div className="p-4 space-y-6">
                                <div className="bg-amber-900/10 border border-amber-500/10 p-4 rounded-xl text-center">
                                    <h2 className="text-xl font-black text-amber-100">{selectedClientData.cliente.full_name}</h2>
                                    <p className="text-xs text-amber-500/70 mt-1 uppercase font-bold tracking-wide">Selecione uma parcela para pagar</p>
                                </div>
                                <div className="space-y-6">
                                    {gruposVendas.map((grupo: any) => (
                                        <div key={grupo.venda_id} className="relative pl-6 border-l border-white/10 ml-2">
                                            <div className="absolute -left-[5px] top-0 w-2.5 h-2.5 rounded-full bg-slate-800 border-2 border-slate-600"></div>
                                            <div className="mb-3">
                                                <p className="text-sm font-bold text-slate-300 flex items-center gap-2">
                                                    <ShoppingBag className="h-4 w-4 text-slate-500" />
                                                    Compra em <span className="text-white">{formatDate(grupo.data_venda)}</span>
                                                </p>
                                                {grupo.beneficiario && <p className="text-[10px] text-blue-400 font-bold ml-6 mt-1 bg-blue-500/10 border border-blue-500/20 inline-block px-2 py-0.5 rounded">Para: {grupo.beneficiario}</p>}
                                            </div>
                                            <div className="space-y-2">
                                                {grupo.itens
                                                    .sort((a: any, b: any) => {
                                                        const dateDiff = new Date(a.data_vencimento).getTime() - new Date(b.data_vencimento).getTime()
                                                        if (dateDiff !== 0) return dateDiff
                                                        return a.numero_parcela - b.numero_parcela
                                                    })
                                                    .map((p: any) => (
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
                                <div className="text-center pb-4 border-b border-white/10">
                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Valor Original</p>
                                    <p className="text-5xl font-black text-white tracking-tight drop-shadow-lg">{formatCurrency(selectedParcela.valor_parcela)}</p>
                                    <div className="flex justify-center gap-4 mt-3">
                                        <p className="text-xs text-slate-400 bg-white/5 px-2 py-1 rounded border border-white/5">Parcela {selectedParcela.numero_parcela}</p>
                                        <p className={`text-xs font-bold px-2 py-1 rounded border ${new Date(selectedParcela.data_vencimento) < new Date(getToday()) ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-slate-800 text-slate-400 border-white/5'}`}>
                                            Vencimento: {formatDate(selectedParcela.data_vencimento)}
                                        </p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-bold text-amber-500/80 mb-1.5 uppercase list-none">Total Recebido</label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-3 text-emerald-500 font-bold">R$</span>
                                            <input
                                                type="text"
                                                value={valorTotalPagoStr}
                                                onChange={e => setValorTotalPagoStr(e.target.value)}
                                                className="w-full h-11 bg-white/5 border border-white/10 rounded-lg shadow-sm focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 outline-none font-bold text-emerald-400 pl-10 text-xl transition-colors"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-amber-500/80 mb-1.5 uppercase">Forma</label>
                                        <div className="relative">
                                            <select value={forma} onChange={e => setForma(e.target.value)} className="w-full h-11 bg-white/5 border border-white/10 rounded-lg shadow-sm focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 outline-none font-bold text-slate-200 cursor-pointer appearance-none px-4">
                                                <option className="bg-slate-900">PIX Remoto</option>
                                                <option className="bg-slate-900">PIX na maquininha</option>
                                                <option className="bg-slate-900">Dinheiro</option>
                                                <option className="bg-slate-900">Cartão Débito</option>
                                                <option className="bg-slate-900">Cartão Crédito</option>
                                            </select>
                                            <ArrowDownCircle className="absolute right-3 top-3.5 h-4 w-4 text-slate-500 pointer-events-none" />
                                        </div>
                                    </div>
                                </div>

                                {new Date(selectedParcela.data_vencimento) < new Date(getToday()) && (
                                    <div className="bg-red-500/10 p-4 rounded-xl border border-red-500/20">
                                        <label className="block text-[10px] font-bold text-red-400 mb-1.5 uppercase flex items-center gap-2">
                                            <AlertTriangle className="h-3 w-3" /> Juros / Multa (SE DESEJAR COLOQUE OS JUROS AQUI)
                                        </label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-2.5 text-red-400 font-bold">R$</span>
                                            <input
                                                type="text"
                                                value={valorJurosStr}
                                                onChange={e => setValorJurosStr(e.target.value)}
                                                className="w-full h-10 bg-red-950/30 border border-red-500/20 rounded-lg shadow-sm focus:border-red-500/50 outline-none font-bold text-red-300 pl-10"
                                            />
                                        </div>
                                        <p className="text-[10px] text-red-400/70 mt-2">Este valor não abate a dívida.</p>
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
                                            <div className="bg-amber-900/20 p-4 rounded-xl border border-amber-500/20 animate-in fade-in">
                                                <div className="flex items-center gap-2 text-amber-300 font-bold text-sm mb-3">
                                                    <AlertTriangle className="h-4 w-4" /> Restam R$ {formatCurrency(diferenca)} da dívida
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg hover:bg-white/5 transition-colors border border-transparent hover:border-white/5">
                                                        <input type="radio" name="strat" checked={estrategia === 'criar_pendencia'} onChange={() => setEstrategia('criar_pendencia')} className="mt-1 text-amber-500 bg-transparent border-slate-500 focus:ring-amber-500 focus:ring-offset-slate-900" />
                                                        <div><span className="block text-sm font-bold text-slate-200">Manter como Pendência</span><span className="block text-xs text-slate-500">Cria nova parcela.</span></div>
                                                    </label>
                                                    <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg hover:bg-white/5 transition-colors border border-transparent hover:border-white/5">
                                                        <input type="radio" name="strat" checked={estrategia === 'somar_proxima'} onChange={() => setEstrategia('somar_proxima')} className="mt-1 text-amber-500 bg-transparent border-slate-500 focus:ring-amber-500 focus:ring-offset-slate-900" />
                                                        <div><span className="block text-sm font-bold text-slate-200">Jogar para Próxima</span><span className="block text-xs text-slate-500">Soma na próxima parcela.</span></div>
                                                    </label>
                                                </div>
                                            </div>
                                        )
                                    } else if (diferenca < -0.01) {
                                        return (
                                            <div className="bg-blue-900/20 p-4 rounded-xl border border-blue-500/20 animate-in fade-in">
                                                <div className="flex items-center gap-2 text-blue-300 font-bold text-sm">
                                                    <ArrowDownCircle className="h-4 w-4" />
                                                    <span>Amortização Extra: R$ {formatCurrency(Math.abs(diferenca))}</span>
                                                </div>
                                                <p className="text-xs text-blue-400 mt-2 pl-6 opacity-80">
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
                                    className="w-full py-4 rounded-xl bg-amber-600 text-white font-bold hover:bg-amber-500 shadow-lg shadow-amber-900/20 flex items-center justify-center gap-2 transition-all active:scale-95 text-lg uppercase tracking-wide"
                                >
                                    {isProcessing ? <Loader2 className="h-6 w-6 animate-spin" /> : <CheckCircle2 className="h-6 w-6" />}
                                    RECEBER
                                </button>
                            </div>
                        )}

                        {step === 'success' && (
                            <div className="p-10 flex flex-col items-center justify-center text-center animate-in zoom-in-50">
                                <div className="w-24 h-24 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mb-6 text-emerald-500 shadow-xl shadow-emerald-500/10">
                                    {isPrinting ? <Loader2 className="h-12 w-12 animate-spin" /> : <CheckCircle2 className="h-12 w-12" />}
                                </div>
                                <h2 className="text-2xl font-black text-white mb-2">Pagamento Confirmado!</h2>
                                <p className="text-slate-400 mb-8 max-w-xs mx-auto">
                                    {isPrinting ? 'Enviando recibo para impressora...' : 'O recebimento foi registrado no sistema.'}
                                </p>

                                <div className="w-full max-w-sm space-y-3">
                                    <button onClick={onClose} className="w-full py-4 bg-emerald-700/30 text-emerald-300 font-bold hover:bg-emerald-700/50 rounded-xl transition-colors uppercase text-sm tracking-wide">
                                        Fechar
                                    </button>
                                    {paidParcelaId && (
                                        <button
                                            onClick={() => { setIsPrinting(true); printParcela(paidParcelaId).catch(console.error).finally(() => setIsPrinting(false)) }}
                                            disabled={isPrinting}
                                            className="w-full py-3 text-slate-500 font-bold hover:bg-white/5 hover:text-slate-300 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm"
                                        >
                                            <Printer className="h-4 w-4" /> Reimprimir Recibo
                                        </button>
                                    )}
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
