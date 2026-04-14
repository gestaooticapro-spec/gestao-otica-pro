'use client'

import { useState, useRef, useTransition, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
    buscarProdutoExpress,
    type ProdutoExpressResult
} from '@/lib/actions/vendas.actions'
import { Database } from '@/lib/database.types'
import {
    ScanBarcode, Search, ShoppingCart, Loader2,
    Trash2, ArrowRight, Package, Plus, UserCircle, AlertTriangle, SearchX
} from 'lucide-react'
import PaymentModal from '@/components/modals/PaymentModal'

const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

type Employee = Database['public']['Tables']['employees']['Row']

export type CartItem = {
    tempId: string
    originalId: number
    type: 'produtos_gerais' | 'armacoes'
    description: string
    price: number
    quantity: number
}

interface Props {
    storeId: number
    employees: Employee[]
}

function EditablePrice({ value, onChange }: { value: number, onChange: (val: number) => void }) {
    const [isEditing, setIsEditing] = useState(false);
    const [inputValue, setInputValue] = useState(value.toString());

    useEffect(() => {
        if (!isEditing) setInputValue(value.toString());
    }, [value, isEditing]);

    const handleBlur = () => {
        setIsEditing(false);
        const parsed = parseFloat(inputValue);
        if (!isNaN(parsed) && parsed >= 0) {
            onChange(parsed);
        } else {
            setInputValue(value.toString());
        }
    };

    if (isEditing) {
        return (
            <input
                type="number"
                step="0.01"
                min="0"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onBlur={handleBlur}
                onKeyDown={(e) => e.key === 'Enter' && handleBlur()}
                autoFocus
                className="w-28 bg-black/30 text-white font-black text-xl tracking-tight leading-none drop-shadow-md border border-cyan-500/50 rounded px-2 py-1 text-right focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            />
        );
    }

    return (
        <button
            onClick={() => setIsEditing(true)}
            className="font-black text-white hover:text-cyan-400 text-xl tracking-tight leading-none drop-shadow-md transition-colors cursor-text group-hover:bg-white/5 px-2 py-1 rounded border border-transparent hover:border-cyan-500/30"
            title="Editar preço"
            type="button"
        >
            {formatCurrency(value)}
        </button>
    );
}

export default function PdvExpressInterface({ storeId, employees }: Props) {
    const router = useRouter()

    const [cartItems, setCartItems] = useState<CartItem[]>([])
    const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('')

    // Busca
    const [query, setQuery] = useState('')
    const [searchResults, setSearchResults] = useState<ProdutoExpressResult[]>([])
    const [isSearching, startSearchTransition] = useTransition()
    // NOVO ESTADO: Controla se já houve uma tentativa de busca
    const [hasSearched, setHasSearched] = useState(false)

    const searchInputRef = useRef<HTMLInputElement>(null)
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false)

    useEffect(() => { searchInputRef.current?.focus() }, [])

    const valorTotal = cartItems.reduce((acc, item) => acc + (item.price * item.quantity), 0)

    const handleAddItem = (produto: ProdutoExpressResult) => {
        const newItem: CartItem = {
            tempId: Math.random().toString(36).substr(2, 9),
            originalId: produto.id,
            type: produto.tipo_origem,
            description: produto.descricao,
            price: produto.preco,
            quantity: 1
        }
        setCartItems(prev => [newItem, ...prev])
        setSearchResults([])
        setQuery('')
        setHasSearched(false)
        setTimeout(() => searchInputRef.current?.focus(), 100)
    }

    const handleRemoveItem = (tempId: string) => {
        setCartItems(prev => prev.filter(item => item.tempId !== tempId))
    }

    const handlePriceChange = (tempId: string, newPrice: number) => {
        setCartItems(prev => prev.map(item =>
            item.tempId === tempId ? { ...item, price: newPrice } : item
        ))
    }

    const executaBusca = () => {
        if (!query.trim()) return
        startSearchTransition(async () => {
            const results = await buscarProdutoExpress(query, storeId)
            const singleResult = results.length === 1 ? results[0] : null;

            // Marca que a busca foi feita
            setHasSearched(true)

            if (singleResult && singleResult.codigo_barras === query.trim()) {
                handleAddItem(singleResult)
            } else {
                setSearchResults(results)
            }
        })
    }

    const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            executaBusca()
        }
    }

    const handleFinalizar = useCallback(() => {
        if (cartItems.length === 0) return alert("Carrinho vazio!")
        if (!selectedEmployeeId) {
            alert("Selecione o Vendedor antes de pagar.")
            return
        }
        setIsPaymentModalOpen(true)
    }, [cartItems.length, selectedEmployeeId])

    const handleReset = () => {
        setIsPaymentModalOpen(false)
        setCartItems([])
        setQuery('')
        setHasSearched(false)
        setSelectedEmployeeId('')
        searchInputRef.current?.focus()
    }

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'F2') {
                e.preventDefault();
                handleFinalizar();
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [handleFinalizar])

    const labelStyle = 'block text-[10px] font-black text-slate-400 uppercase mb-1.5 tracking-[0.1em]'
    const inputStyle = 'block w-full rounded-xl border border-white/10 bg-white/5 text-white h-11 text-sm px-4 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 focus:outline-none font-bold transition-all placeholder:font-normal placeholder:text-slate-500 backdrop-blur-md'

    return (
        <div className="flex flex-col h-full bg-transparent overflow-hidden relative">

            <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-hidden min-h-0 relative z-10">

                {/* ESQUERDA (CONTROLES) */}
                <div className="lg:col-span-4 flex flex-col gap-5 h-full overflow-hidden">
                    <div className="bg-white/5 backdrop-blur-xl p-6 rounded-[2rem] shadow-2xl border border-white/10 flex-shrink-0 relative overflow-hidden">
                        {/* Glow decorativo */}
                        <div className="absolute -top-24 -left-24 w-48 h-48 bg-cyan-500/10 blur-[80px] rounded-full pointer-events-none" />

                        <div className="flex items-center gap-3 mb-6 border-b border-white/5 pb-4 relative z-10">
                            <div className="p-2 bg-white/10 rounded-xl text-cyan-400 border border-white/10">
                                <ScanBarcode className="h-5 w-5" />
                            </div>
                            <h2 className="text-base font-black text-white tracking-tight uppercase">Mesa de Operação</h2>
                        </div>
                        <div className="space-y-5">
                            <div>
                                <label className={labelStyle}>Vendedor Responsável</label>
                                <div className="relative">
                                    <UserCircle className="absolute left-3.5 top-3 h-5 w-5 text-slate-500 z-10 pointer-events-none" />
                                    <select
                                        value={selectedEmployeeId}
                                        onChange={(e) => setSelectedEmployeeId(e.target.value)}
                                        className={`${inputStyle} pl-11 cursor-pointer appearance-none`}
                                    >
                                        <option value="" className="bg-slate-900 text-white">-- Selecione --</option>
                                        {employees.map(emp => (
                                            <option key={emp.id} value={emp.id} className="bg-slate-900 text-white">{emp.full_name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className={labelStyle}>Adicionar Produto</label>
                                <div className="relative">
                                    <input
                                        ref={searchInputRef}
                                        type="text"
                                        value={query}
                                        onChange={(e) => {
                                            setQuery(e.target.value)
                                            setHasSearched(false) // Reseta o aviso ao digitar
                                        }}
                                        onKeyDown={handleInputKeyDown}
                                        className={`${inputStyle} pl-11 pr-11`}
                                        placeholder="Bipe ou digite o produto..."
                                        autoComplete="off"
                                    />
                                    <div className="absolute left-3.5 top-3 text-slate-500">
                                        {isSearching ? <Loader2 className="h-5 w-5 animate-spin text-cyan-400" /> : <Search className="h-5 w-5" />}
                                    </div>
                                    {query && (
                                        <button onClick={executaBusca} className="absolute right-2 top-2 bg-cyan-500/20 hover:bg-cyan-500/40 text-cyan-400 p-1.5 rounded-lg transition-all border border-cyan-500/20" title="Buscar">
                                            <ArrowRight className="h-4 w-4" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ÁREA DE RESULTADOS / FEEDBACK */}
                    {searchResults.length > 0 ? (
                        <div className="flex-1 bg-white/5 backdrop-blur-xl rounded-[2rem] shadow-2xl border border-white/10 overflow-hidden flex flex-col animate-in fade-in slide-in-from-top-2 min-h-0 relative">
                            <div className="bg-white/5 px-6 py-3 border-b border-white/10 flex justify-between items-center flex-shrink-0">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Encontrados ({searchResults.length})</span>
                                <button onClick={() => { setSearchResults([]); setQuery('') }} className="text-[10px] font-black text-cyan-400 hover:text-cyan-300 uppercase tracking-widest transition-colors">Limpar</button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                                {searchResults.map((prod) => (
                                    <button
                                        type="button"
                                        key={`${prod.tipo_origem}-${prod.id}`}
                                        onClick={() => handleAddItem(prod)}
                                        className="w-full text-left p-4 rounded-2xl border border-transparent hover:border-white/20 hover:bg-white/5 flex justify-between items-center group transition-all"
                                    >
                                        <div className="flex items-center gap-4 overflow-hidden">
                                            <div className="p-3 bg-white/5 rounded-xl text-slate-400 group-hover:bg-cyan-500/20 group-hover:text-cyan-400 border border-white/5 flex-shrink-0 transition-all">
                                                <Package className="h-5 w-5" />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-bold text-slate-100 text-sm group-hover:text-white truncate transition-colors">{prod.descricao}</p>
                                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Estoque: {prod.estoque}</p>
                                            </div>
                                        </div>
                                        <div className="text-right pl-3 flex-shrink-0">
                                            <span className="block font-black text-emerald-400 text-sm drop-shadow-[0_0_10px_rgba(52,211,153,0.3)]">{formatCurrency(prod.preco)}</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        // CONDICIONAL DE FEEDBACK
                        hasSearched && !isSearching ? (
                            <div className="flex-1 flex flex-col justify-center items-center text-amber-400 bg-amber-500/5 rounded-[2rem] border border-amber-500/20 min-h-0 animate-in fade-in">
                                <SearchX className="h-12 w-12 mb-4 opacity-30" />
                                <p className="text-sm font-black uppercase tracking-widest">Nenhum resultado</p>
                                <p className="text-xs mt-1 opacity-60">Verifique o termo buscado.</p>
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col justify-center items-center text-slate-600 bg-white/5 rounded-[2rem] border-2 border-dashed border-white/10 min-h-0 backdrop-blur-sm">
                                <ScanBarcode className="h-12 w-12 mb-2 opacity-10" />
                                <p className="text-xs font-black uppercase tracking-[0.2em] opacity-40">Aguardando...</p>
                            </div>
                        )
                    )}
                </div>

                {/* DIREITA (CARRINHO) */}
                <div className="lg:col-span-8 flex flex-col bg-white/5 backdrop-blur-xl rounded-[2rem] shadow-2xl border border-white/10 overflow-hidden h-full">
                    <div className="bg-white/5 px-8 py-5 border-b border-white/10 flex justify-between items-center flex-shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/20 shadow-lg shadow-emerald-500/10">
                                <ShoppingCart className="h-5 w-5" />
                            </div>
                            <span className="text-base font-black text-white uppercase tracking-tight">Cesta de Compras</span>
                        </div>
                        <div className="flex items-center gap-4">
                            <span className="text-[10px] bg-white/5 border border-white/10 px-3 py-1 rounded-full text-slate-300 font-black uppercase tracking-widest">{cartItems.length} itens</span>
                            {cartItems.length > 0 && (
                                <button onClick={() => setCartItems([])} className="text-[10px] text-red-500 hover:text-red-400 font-black uppercase tracking-widest transition-colors">
                                    LIMPAR TUDO
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-6 space-y-3 custom-scrollbar">
                        {cartItems.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-600 opacity-40">
                                <ShoppingCart className="h-16 w-16 mb-4 opacity-10" />
                                <p className="text-xs font-black uppercase tracking-[0.3em]">Cesta vazia</p>
                            </div>
                        ) : (
                            cartItems.map((item) => (
                                <div key={item.tempId} className="flex justify-between items-center p-4 bg-white/5 rounded-2xl border border-white/5 shadow-inner hover:border-white/20 transition-all group">
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-slate-100 text-base group-hover:text-white truncate transition-colors">{item.description}</p>
                                        <div className="flex gap-3 mt-1.5 focus-within:">
                                            <span className="text-[9px] bg-white/10 text-slate-400 border border-white/5 px-2 py-0.5 rounded font-black uppercase tracking-widest">{item.type === 'armacoes' ? 'Armação' : 'Produto'}</span>
                                            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">1 Unidade • {formatCurrency(item.price)}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4 pl-4 flex-shrink-0">
                                        <EditablePrice value={item.price} onChange={(val) => handlePriceChange(item.tempId, val)} />
                                        <button onClick={() => handleRemoveItem(item.tempId)} className="p-2.5 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all border border-transparent hover:border-red-500/20" title="Remover">
                                            <Trash2 className="h-5 w-5" />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                    <div className="bg-black/20 border-t border-white/10 p-8 flex-shrink-0 relative overflow-hidden">
                        {/* Brilho de fundo */}
                        <div className="absolute bottom-0 right-0 w-64 h-64 bg-emerald-500/5 blur-[100px] rounded-full pointer-events-none" />

                        <div className="flex flex-col md:flex-row justify-between items-center gap-6 relative z-10">
                            <div className="text-center md:text-left">
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2">Total do Investimento</p>
                                <p className="text-5xl font-black text-white tracking-tighter leading-none drop-shadow-2xl">{formatCurrency(valorTotal)}</p>
                            </div>

                            <div className="w-full md:w-auto flex flex-col items-center gap-3">
                                <button
                                    onClick={handleFinalizar}
                                    disabled={cartItems.length === 0}
                                    className={`w-full md:w-80 h-16 rounded-[1.25rem] shadow-2xl flex items-center justify-center gap-3 transition-all active:scale-95 text-base font-black uppercase tracking-[0.1em]
                                        ${!selectedEmployeeId
                                            ? 'bg-white/5 text-slate-600 border border-white/5 cursor-not-allowed'
                                            : 'bg-emerald-500 hover:bg-emerald-400 text-emerald-950 shadow-emerald-500/20 hover:shadow-emerald-500/40'
                                        }`}
                                >
                                    <span>PAGAR AGORA</span>
                                    <ArrowRight className="h-5 w-5" />
                                </button>
                                {!selectedEmployeeId ? (
                                    <p className="text-center text-[10px] text-red-400 font-black uppercase tracking-widest animate-pulse flex items-center gap-2">
                                        <AlertTriangle className="h-3 w-3" /> Selecione o Vendedor
                                    </p>
                                ) : (
                                    <p className="text-center text-[10px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-2">
                                        Pressione F2 para finalizar rápido
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {isPaymentModalOpen && (
                <PaymentModal
                    isOpen={isPaymentModalOpen}
                    onClose={() => setIsPaymentModalOpen(false)}
                    onReset={handleReset}
                    storeId={storeId}
                    employeeId={selectedEmployeeId ? parseInt(selectedEmployeeId) : 0}
                    valorTotal={valorTotal}
                    cartItems={cartItems}
                />
            )}
        </div>
    )
}