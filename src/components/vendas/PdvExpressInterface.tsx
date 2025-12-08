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

    const labelStyle = 'block text-[10px] font-bold text-blue-100 uppercase mb-1 tracking-wider'
    const inputStyle = 'block w-full rounded-lg border-0 bg-white shadow-sm text-gray-800 h-10 text-sm px-3 focus:ring-2 focus:ring-blue-300 focus:outline-none font-bold transition-all placeholder:font-normal placeholder:text-gray-400'

    return (
        <div className="flex flex-col h-full bg-transparent overflow-hidden">
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-hidden min-h-0">
                
                {/* ESQUERDA (CONTROLES) */}
                <div className="lg:col-span-5 flex flex-col gap-4 h-full overflow-hidden">
                    <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-6 rounded-2xl shadow-lg shadow-blue-200 border border-white/20 flex-shrink-0">
                        <div className="flex items-center gap-2 mb-6 border-b border-white/20 pb-3">
                            <div className="p-1.5 bg-white/20 rounded-lg text-white">
                                <ScanBarcode className="h-5 w-5" />
                            </div>
                            <h2 className="text-sm font-bold text-white tracking-wide">PDV Rápido</h2>
                        </div>
                        <div className="space-y-5">
                            <div>
                                <label className={labelStyle}>Vendedor Responsável</label>
                                <div className="relative">
                                    <UserCircle className="absolute left-3 top-2.5 h-5 w-5 text-gray-400 z-10 pointer-events-none" />
                                    <select 
                                        value={selectedEmployeeId}
                                        onChange={(e) => setSelectedEmployeeId(e.target.value)}
                                        className={`${inputStyle} pl-10 cursor-pointer`}
                                    >
                                        <option value="">-- Selecione --</option>
                                        {employees.map(emp => (
                                            <option key={emp.id} value={emp.id}>{emp.full_name}</option>
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
                                        className={`${inputStyle} pl-10 pr-10`}
                                        placeholder="Bipe ou digite..."
                                        autoComplete="off"
                                    />
                                    <div className="absolute left-3 top-2.5 text-gray-400">
                                        {isSearching ? <Loader2 className="h-5 w-5 animate-spin text-blue-500" /> : <Search className="h-5 w-5" />}
                                    </div>
                                    {query && (
                                        <button onClick={executaBusca} className="absolute right-1.5 top-1.5 bg-blue-100 hover:bg-blue-200 text-blue-700 p-1.5 rounded-md transition-colors" title="Buscar">
                                            <ArrowRight className="h-4 w-4" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ÁREA DE RESULTADOS / FEEDBACK */}
                    {searchResults.length > 0 ? (
                        <div className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col animate-in fade-in slide-in-from-top-2 min-h-0">
                            <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex justify-between items-center flex-shrink-0">
                                <span className="text-[10px] font-bold text-gray-500 uppercase">Resultados ({searchResults.length})</span>
                                <button onClick={() => {setSearchResults([]); setQuery('')}} className="text-[10px] font-bold text-blue-600 hover:underline">Limpar</button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                                 {searchResults.map((prod) => (
                                    <button 
                                        type="button" 
                                        key={`${prod.tipo_origem}-${prod.id}`} 
                                        onClick={() => handleAddItem(prod)} 
                                        className="w-full text-left p-3 rounded-lg border border-transparent hover:border-blue-200 hover:bg-blue-50 flex justify-between items-center group transition-all"
                                    >
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            <div className="p-2 bg-gray-100 rounded text-gray-400 group-hover:bg-white group-hover:text-blue-500 flex-shrink-0">
                                                <Package className="h-5 w-5" />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-bold text-gray-800 text-sm group-hover:text-blue-700 truncate">{prod.descricao}</p>
                                                <p className="text-[10px] text-gray-400 font-mono mt-0.5">Est: {prod.estoque}</p>
                                            </div>
                                        </div>
                                        <div className="text-right pl-2 flex-shrink-0">
                                            <span className="block font-bold text-green-600 text-sm">{formatCurrency(prod.preco)}</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        // CONDICIONAL DE FEEDBACK
                        hasSearched && !isSearching ? (
                             <div className="flex-1 flex flex-col justify-center items-center text-amber-600 bg-amber-50 rounded-2xl border border-amber-200 min-h-0 animate-in fade-in">
                                <SearchX className="h-12 w-12 mb-3 opacity-50" />
                                <p className="text-sm font-bold">Nenhum produto encontrado</p>
                                <p className="text-xs mt-1 opacity-80">Verifique o nome ou código.</p>
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col justify-center items-center text-gray-300 bg-white/40 rounded-2xl border-2 border-dashed border-gray-200 min-h-0">
                                <ScanBarcode className="h-12 w-12 mb-2 opacity-20" />
                                <p className="text-xs font-medium">Aguardando...</p>
                            </div>
                        )
                    )}
                </div>

                {/* DIREITA (CARRINHO) - IGUAL AO ANTERIOR */}
                <div className="lg:col-span-7 flex flex-col bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden h-full">
                    <div className="bg-white px-5 py-3 border-b border-gray-100 flex justify-between items-center flex-shrink-0">
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
                                <ShoppingCart className="h-4 w-4" />
                            </div>
                            <span className="text-sm font-bold text-gray-800 uppercase tracking-wide">Cesta de Compras</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-[10px] bg-gray-100 px-2 py-1 rounded text-gray-600 font-bold">{cartItems.length} itens</span>
                            {cartItems.length > 0 && (
                                <button onClick={() => setCartItems([])} className="text-[10px] text-red-400 hover:text-red-600 font-bold px-2 py-1 rounded hover:bg-red-50 transition-colors">
                                    LIMPAR
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar bg-gray-50/30">
                        {cartItems.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-gray-300 opacity-60">
                                <ShoppingCart className="h-12 w-12 mb-2 opacity-20" />
                                <p className="text-xs">Cesta vazia</p>
                            </div>
                        ) : (
                            cartItems.map((item) => (
                                <div key={item.tempId} className="flex justify-between items-center p-3 bg-white rounded-xl border border-gray-100 shadow-sm hover:border-blue-200 transition-colors">
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-gray-800 text-sm truncate">{item.description}</p>
                                        <div className="flex gap-2 mt-0.5">
                                            <span className="text-[9px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded uppercase">{item.type === 'armacoes' ? 'Armação' : 'Produto'}</span>
                                            <span className="text-[10px] text-gray-400">1 x {formatCurrency(item.price)}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4 pl-3 flex-shrink-0">
                                        <p className="font-bold text-gray-800 text-base">{formatCurrency(item.price)}</p>
                                        <button onClick={() => handleRemoveItem(item.tempId)} className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Remover">
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                    <div className="bg-white border-t border-gray-200 p-5 shadow-[0_-5px_20px_rgba(0,0,0,0.05)] z-10 flex-shrink-0">
                        <div className="flex justify-between items-end mb-4">
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Total a Pagar</p>
                            <p className="text-4xl font-black text-slate-800 tracking-tight leading-none">{formatCurrency(valorTotal)}</p>
                        </div>
                        <button 
                            onClick={handleFinalizar}
                            disabled={cartItems.length === 0}
                            className={`w-full h-12 rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95 text-sm font-bold uppercase tracking-wide
                                ${!selectedEmployeeId 
                                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed' 
                                    : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200'
                                }`}
                        >
                            <span>Finalizar Venda</span>
                            <ArrowRight className="h-4 w-4" />
                        </button>
                        {!selectedEmployeeId && (
                            <p className="text-center text-[10px] text-red-500 font-bold mt-2 animate-pulse">⚠ Selecione o Vendedor para liberar</p>
                        )}
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