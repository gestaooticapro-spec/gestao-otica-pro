'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { 
  X, Search, Package, ArrowRight, Loader2, 
  ArrowUpCircle, ArrowDownCircle, AlertTriangle, Lock 
} from 'lucide-react'
import { buscarProdutoExpress, type ProdutoExpressResult } from '@/lib/actions/vendas.actions'
import { registrarMovimentacao } from '@/lib/actions/stock.actions'
import EmployeeAuthModal from '@/components/modals/EmployeeAuthModal'

interface Props {
  isOpen: boolean
  onClose: () => void
  storeId: number
}

const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function StockMovementModal({ isOpen, onClose, storeId }: Props) {
  const [step, setStep] = useState<'search' | 'form'>('search')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ProdutoExpressResult[]>([])
  const [selectedProduct, setSelectedProduct] = useState<ProdutoExpressResult | null>(null)
  
  const [tipo, setTipo] = useState<'Entrada' | 'Saida' | 'Perda' | 'Ajuste' | 'Brinde'>('Saida')
  const [quantidade, setQuantidade] = useState(1)
  const [motivo, setMotivo] = useState('')
  
  // --- NOVOS ESTADOS PARA O FLUXO 2 ---
  const [relatedVendaId, setRelatedVendaId] = useState('')
  const [gerouSobra, setGerouSobra] = useState(false)
  const [sobraDiametro, setSobraDiametro] = useState('')
  const [sobraOlho, setSobraOlho] = useState('OD')
  // ------------------------------------
  
  const [isSearching, startSearch] = useTransition()
  const [isSaving, startSave] = useTransition()
  
  const [isAuthOpen, setIsAuthOpen] = useState(false)
  
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Reset ao abrir
  useEffect(() => {
    if (isOpen) {
        setStep('search')
        setQuery('')
        setResults([])
        setSelectedProduct(null)
        setQuantidade(1)
        setMotivo('')
        
        // Reset novos campos
        setRelatedVendaId('')
        setGerouSobra(false)
        setSobraDiametro('')
        setSobraOlho('OD')
        
        setTimeout(() => searchInputRef.current?.focus(), 100)
    }
  }, [isOpen])

  // Lógica de Busca
  const performSearch = (searchTerm: string) => {
    if (searchTerm.length < 3) return 
    startSearch(async () => {
      const res = await buscarProdutoExpress(searchTerm, storeId)
      setResults(res)
    })
  }

  // Busca Automática (Debounce)
  useEffect(() => {
      if (step !== 'search' || query.length < 3) {
          if (query.length === 0) setResults([]);
          return;
      }

      const timer = setTimeout(() => {
          performSearch(query);
      }, 500);

      return () => clearTimeout(timer);
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, step, storeId]); 

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    performSearch(query)
  }

  const handleSelect = (prod: ProdutoExpressResult) => {
    setSelectedProduct(prod)
    setStep('form')
  }

  const handlePreSubmit = () => {
    if (!selectedProduct) return
    if (!motivo.trim()) return alert("O motivo é obrigatório.")
    if (quantidade <= 0) return alert("Quantidade inválida.")
    
    setIsAuthOpen(true)
  }

  const handleAuthSuccess = (employee: { id: number, full_name: string }) => {
    setIsAuthOpen(false)
    
    const formData = new FormData()
    formData.append('store_id', storeId.toString())
    formData.append('employee_id', employee.id.toString())
    formData.append('product_id', selectedProduct!.id.toString())
    formData.append('tipo', tipo)
    formData.append('quantidade', quantidade.toString())
    formData.append('motivo', motivo)

    // --- NOVOS DADOS ---
    if (relatedVendaId) formData.append('related_venda_id', relatedVendaId)
    
    if (tipo === 'Perda' && gerouSobra) {
        formData.append('sobra_detalhes', JSON.stringify({
            diametro: parseFloat(sobraDiametro),
            olho: sobraOlho
        }))
    }
    // -------------------

    startSave(async () => {
        const res = await registrarMovimentacao({ success: false, message: '' }, formData)
        if (res.success) {
            alert("Movimentação registrada!")
            onClose()
        } else {
            alert("Erro: " + res.message)
        }
    })
  }

  if (!isOpen) return null

  const isEntrada = tipo === 'Entrada' || tipo === 'Ajuste';
  
  // --- ESTILOS PADRONIZADOS (ALTO CONTRASTE) ---
  // Borda Slate-300 visível mesmo sem foco
  const inputClass = "w-full rounded-lg border border-slate-300 bg-white shadow-sm text-slate-800 font-bold focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all";

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <ArrowLeftRightIcon tipo={tipo} />
                {step === 'search' ? 'Buscar Produto' : 'Registrar Movimentação'}
            </h3>
            <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full text-gray-500"><X className="h-5 w-5"/></button>
        </div>

        <div className="p-6 overflow-y-auto">
            {step === 'search' && (
                <div className="space-y-4">
                    <form onSubmit={handleSearchSubmit} className="relative">
                        <input 
                            ref={searchInputRef}
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="Digite 3 letras ou bipe o código..."
                            className={`${inputClass} h-12 pl-10 pr-4 text-lg`}
                        />
                        <Search className="absolute left-3 top-3.5 h-5 w-5 text-gray-400" />
                        {isSearching && <Loader2 className="absolute right-3 top-3.5 h-5 w-5 text-blue-500 animate-spin" />}
                    </form>
                    <div className="space-y-2">
                        {results.map(prod => (
                            <button key={prod.id} onClick={() => handleSelect(prod)} className="w-full text-left p-3 rounded-lg border border-gray-200 hover:bg-blue-50 hover:border-blue-300 transition-all flex justify-between items-center group">
                                <div>
                                    <p className="font-bold text-gray-800 text-sm">{prod.descricao}</p>
                                    <p className="text-xs text-gray-500 font-mono mt-0.5">Est: {prod.estoque}</p>
                                </div>
                                <span className="block font-bold text-green-600 text-sm">{formatCurrency(prod.preco)}</span>
                            </button>
                        ))}
                        {results.length === 0 && query.length >= 3 && !isSearching && (
                            <p className="text-center text-gray-400 text-sm py-4">Nenhum produto encontrado.</p>
                        )}
                    </div>
                </div>
            )}

            {step === 'form' && selectedProduct && (
                <div className="space-y-5">
                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex items-start gap-3">
                        <div className="p-2 bg-white rounded-lg shadow-sm"><Package className="h-6 w-6 text-blue-600" /></div>
                        <div>
                            <p className="font-bold text-blue-900 text-sm">{selectedProduct.descricao}</p>
                            <p className="text-xs text-blue-700 mt-1">Estoque: <strong>{selectedProduct.estoque}</strong></p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Tipo de Movimento</label>
                            <select value={tipo} onChange={e => setTipo(e.target.value as any)} className={`${inputClass} h-10`}>
                                <option value="Saida">Saída (Baixa)</option>
                                <option value="Brinde">Brinde / Cortesia</option>
                                <option value="Perda">Perda / Quebra</option>
                                <option value="Ajuste">Ajuste</option>
                                <option value="Entrada">Entrada</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Quantidade</label>
                            <input type="number" min="1" value={quantidade} onChange={e => setQuantidade(parseInt(e.target.value))} className={`${inputClass} h-10 text-center text-lg`}/>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Motivo *</label>
                        <textarea value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex: Brinde para o cliente X por fidelidade..." className={`${inputClass} h-24 p-3 resize-none text-sm font-normal`}/>
                    </div>

                    {/* --- INICIO DOS CAMPOS DE PERDA/QUEBRA --- */}
                    {tipo === 'Perda' && (
                        <div className="bg-rose-50 p-4 rounded-xl border border-rose-200 space-y-3 animate-in slide-in-from-top-2">
                            <div>
                                <label className="block text-xs font-bold text-rose-800 uppercase mb-1">Vincular à Venda (Opcional)</label>
                                <input 
                                    type="number" 
                                    placeholder="ID da Venda ou OS" 
                                    value={relatedVendaId} 
                                    onChange={e => setRelatedVendaId(e.target.value)} 
                                    className={`${inputClass} h-9 border-rose-300 focus:ring-rose-500 text-sm`}
                                />
                                <p className="text-[10px] text-rose-600 mt-1">Isso aloca o prejuízo ao relatório da venda.</p>
                            </div>

                            <div className="flex items-center gap-2 pt-2 border-t border-rose-200">
                                <input 
                                    type="checkbox" 
                                    id="chk_sobra" 
                                    checked={gerouSobra} 
                                    onChange={e => setGerouSobra(e.target.checked)}
                                    className="rounded text-rose-600 focus:ring-rose-500 w-5 h-5 border-rose-300"
                                />
                                <label htmlFor="chk_sobra" className="text-sm font-bold text-rose-900 select-none cursor-pointer">
                                    Gerou sobra aproveitável?
                                </label>
                            </div>

                            {gerouSobra && (
                                <div className="grid grid-cols-2 gap-3 pl-6 animate-in fade-in">
                                    <div>
                                        <label className="block text-[10px] font-bold text-rose-800 uppercase mb-1">Diâmetro Útil</label>
                                        <input type="number" value={sobraDiametro} onChange={e => setSobraDiametro(e.target.value)} className={`${inputClass} h-9 border-rose-300 text-sm`} placeholder="Ex: 65" />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-rose-800 uppercase mb-1">Olho</label>
                                        <select value={sobraOlho} onChange={e => setSobraOlho(e.target.value)} className={`${inputClass} h-9 border-rose-300 text-sm`}>
                                            <option value="OD">OD</option>
                                            <option value="OE">OE</option>
                                        </select>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    {/* --- FIM DOS CAMPOS DE PERDA/QUEBRA --- */}

                    {(tipo === 'Saida' || tipo === 'Perda' || tipo === 'Brinde') && (selectedProduct.estoque - quantidade < 0) && (
                        <div className="flex items-center gap-2 text-xs font-bold text-amber-700 bg-amber-50 p-3 rounded-lg border border-amber-200">
                            <AlertTriangle className="h-4 w-4" />
                            Atenção: Estoque ficará negativo ({selectedProduct.estoque - quantidade}).
                        </div>
                    )}

                    <div className="flex gap-3 pt-2">
                        <button onClick={() => setStep('search')} className="flex-1 py-3 rounded-xl border border-gray-300 font-bold text-gray-600 hover:bg-gray-100 bg-white">Voltar</button>
                        <button 
                            onClick={handlePreSubmit} 
                            disabled={isSaving}
                            className={`flex-1 py-3 rounded-xl text-white font-bold shadow-md flex items-center justify-center gap-2
                                ${isEntrada ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
                            `}
                        >
                            {isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Lock className="h-5 w-5" />}
                            Autorizar & Salvar
                        </button>
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>

    {/* Modal de Autenticação */}
    {isAuthOpen && (
      <EmployeeAuthModal 
            storeId={storeId} 
            isOpen={isAuthOpen} 
            onClose={() => setIsAuthOpen(false)} 
            onSuccess={handleAuthSuccess}
            title="Autorizar Movimentação"
            description="Insira seu PIN para confirmar a alteração de estoque."
        />
    )}
    </>
  )
}

function ArrowLeftRightIcon({ tipo }: { tipo: string }) {
    if (tipo === 'Entrada') return <ArrowUpCircle className="h-5 w-5 text-green-600" />
    if (tipo === 'Ajuste') return <ArrowRight className="h-5 w-5 text-blue-600" />
    return <ArrowDownCircle className="h-5 w-5 text-red-600" />
}