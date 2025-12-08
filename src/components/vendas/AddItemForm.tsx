'use client'

import { useState, useEffect, useRef, KeyboardEvent } from 'react'
import { useFormStatus, useFormState } from 'react-dom'
import {
  addVendaItem,
  searchProductCatalog, 
  type SaveVendaItemResult,
  type ProductSearchResult
} from '@/lib/actions/vendas.actions'
import { Loader2, PlusCircle, Search, ScanBarcode, Box } from 'lucide-react'

type AddItemFormProps = {
  vendaId: number
  storeId: number
  onItemAdded: () => Promise<void> 
  disabled: boolean
}

const formatCurrency = (value: number | null | undefined): string => {
  return (value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

const parseLocaleFloat = (stringNumber: string | null | undefined): number => {
  if (!stringNumber) return 0.0
  const cleaned = stringNumber.replace(/\./g, '').replace(',', '.')
  return parseFloat(cleaned) || 0.0
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      // MUDANÇA: Botão agora é branco/semi-transparente para combinar com o fundo colorido, ou um tom mais escuro para contraste
      className="flex items-center justify-center gap-2 w-full h-10 bg-white/20 hover:bg-white/30 text-white border border-white/40 rounded-xl shadow-sm backdrop-blur-sm transition-all font-bold uppercase tracking-wide text-sm active:scale-95"
      title="Adicionar Item"
    >
      {pending ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : (
        <>
            <PlusCircle className="h-5 w-5" />
            <span>ADICIONAR</span>
        </>
      )}
    </button>
  )
}

export default function AddItemForm({
  vendaId,
  storeId,
  onItemAdded,
  disabled,
}: AddItemFormProps) {
  const formRef = useRef<HTMLFormElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const [itemTipo, setItemTipo] = useState<'Lente' | 'Armacao' | 'Tratamento' | 'Servico' | 'Outro'>('Lente')
  const [descricao, setDescricao] = useState('')
  const [quantidade, setQuantidade] = useState(1)
  const [valorUnitario, setValorUnitario] = useState('0,00')

  const [selectedIds, setSelectedIds] = useState({
    lente_id: null as number | null,
    armacao_id: null as number | null,
    tratamento_id: null as number | null,
  })

  const [suggestions, setSuggestions] = useState<ProductSearchResult[]>([])
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [isSearching, setIsSearching] = useState(false)

  const initialState: SaveVendaItemResult = { success: false, message: '' }
  const [saveState, dispatchSave] = useFormState(addVendaItem, initialState)
  
  const lastStateRef = useRef(initialState);

  useEffect(() => {
    if (saveState !== lastStateRef.current && saveState.success) {
      formRef.current?.reset()
      setDescricao('')
      setQuantidade(1)
      setValorUnitario('0,00')
      setSelectedIds({ lente_id: null, armacao_id: null, tratamento_id: null })
      onItemAdded() 
    }
    lastStateRef.current = saveState;
  }, [saveState, onItemAdded])

  useEffect(() => {
    if (itemTipo === 'Servico' || itemTipo === 'Outro' || descricao.trim().length < 2) {
        setSuggestions([])
        setIsDropdownOpen(false)
        return
    }

    const currentId = itemTipo === 'Lente' ? selectedIds.lente_id 
                    : itemTipo === 'Armacao' ? selectedIds.armacao_id 
                    : itemTipo === 'Tratamento' ? selectedIds.tratamento_id : null;
    
    if (currentId) return; 

    setIsSearching(true)
    const timer = setTimeout(() => {
        searchProductCatalog(descricao, storeId, itemTipo).then(result => {
            if (result.success && result.data) {
                setSuggestions(result.data)
                setIsDropdownOpen(result.data.length > 0)
            }
            setIsSearching(false)
        })
    }, 300)

    return () => clearTimeout(timer)
  }, [descricao, itemTipo, storeId, selectedIds])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDescricao(e.target.value)
    setSelectedIds({ lente_id: null, armacao_id: null, tratamento_id: null })
  }

  const handleSuggestionClick = (item: ProductSearchResult) => {
    setDescricao(item.descricao)
    setValorUnitario(formatCurrency(item.preco_venda))
    
    if (item.tipo === 'Lente') setSelectedIds({ ...selectedIds, lente_id: item.id })
    else if (item.tipo === 'Armacao') setSelectedIds({ ...selectedIds, armacao_id: item.id })
    else if (item.tipo === 'Tratamento') setSelectedIds({ ...selectedIds, tratamento_id: item.id })
    
    setIsDropdownOpen(false)
    setSuggestions([])
  }
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
        e.preventDefault();
    }
  }

  const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      setItemTipo(e.target.value as any);
      setDescricao('');
      setValorUnitario('0,00');
      setSelectedIds({ lente_id: null, armacao_id: null, tratamento_id: null });
      setSuggestions([]);
  }

  // Estilos de Texto no Fundo Colorido (Branco com opacidade para hierarquia)
  const labelStyle = 'block text-[10px] font-bold text-blue-100 mb-1 uppercase tracking-wider' 
  
  // Estilo do Input (Branco Puro para contraste máximo)
  const inputStyle = 'block w-full rounded-lg border-0 bg-white shadow-sm text-gray-800 h-10 text-sm px-3 focus:ring-2 focus:ring-blue-300 focus:outline-none disabled:bg-gray-100 disabled:text-gray-400 placeholder:text-gray-400 transition-all'

  return (
    // MUDANÇA: Card com Gradiente Suave (Azul -> Indigo) e Sombra Colorida
    <div className="relative bg-gradient-to-br from-blue-600 to-indigo-600 p-5 rounded-2xl shadow-lg shadow-blue-200 border border-white/20">
      
      {/* Título do Card */}
      <div className="flex items-center gap-2 mb-4 border-b border-white/20 pb-3">
         <div className="p-1.5 bg-white/20 rounded-lg text-white">
            <ScanBarcode className="h-5 w-5" />
         </div>
         <h3 className="text-sm font-bold text-white">
            Adicionar Produto
         </h3>
      </div>
      
      <form ref={formRef} action={dispatchSave} className="space-y-4">
        <input type="hidden" name="venda_id" value={vendaId} />
        <input type="hidden" name="lente_id" value={selectedIds.lente_id ?? ''} />
        <input type="hidden" name="armacao_id" value={selectedIds.armacao_id ?? ''} />
        <input type="hidden" name="tratamento_id" value={selectedIds.tratamento_id ?? ''} />
        <input type="hidden" name="valor_unitario" value={parseLocaleFloat(valorUnitario)} />

        <div className="grid grid-cols-12 gap-3 items-end">
            
            {/* 1. Tipo */}
            <div className="col-span-3 md:col-span-3">
                <label className={labelStyle}>Tipo</label>
                <div className="relative">
                    <select 
                        name="item_tipo" 
                        value={itemTipo} 
                        onChange={handleTypeChange} 
                        disabled={disabled}
                        className={`${inputStyle} font-bold cursor-pointer appearance-none`}
                    >
                        <option value="Lente">Lente</option>
                        <option value="Armacao">Armação</option>
                        <option value="Tratamento">Trat.</option>
                        <option value="Servico">Serv.</option>
                        <option value="Outro">Outro</option>
                    </select>
                    {/* Ícone de seta personalizado para o select */}
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                        <svg className="h-4 w-4 fill-current" viewBox="0 0 20 20"><path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" /></svg>
                    </div>
                </div>
            </div>

            {/* 2. Descrição (Busca) */}
            <div className="col-span-5 md:col-span-5 relative" ref={dropdownRef}>
                <label className={labelStyle}>Descrição / Busca</label>
                <div className="relative">
                    <input 
                        name="descricao" 
                        type="text" 
                        value={descricao} 
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        disabled={disabled}
                        placeholder="Digite nome ou código..."
                        className={`${inputStyle} pr-9 font-medium`}
                        autoComplete="off"
                        autoFocus
                    />
                    <div className="absolute right-3 top-2.5 text-gray-400">
                        {isSearching ? <Loader2 className="h-5 w-5 animate-spin text-blue-500" /> : <Search className="h-5 w-5" />}
                    </div>
                </div>

                {/* Dropdown de Sugestões (Estilo Limpo) */}
                {isDropdownOpen && suggestions.length > 0 && (
                    <div className="absolute z-50 w-full mt-2 bg-white rounded-xl shadow-2xl max-h-60 overflow-y-auto border border-gray-100 ring-1 ring-black ring-opacity-5 animate-in fade-in slide-in-from-top-2">
                        {suggestions.map((item) => (
                            <div 
                                key={`${item.tipo}-${item.id}`}
                                onClick={() => handleSuggestionClick(item)}
                                className="px-4 py-3 text-sm text-gray-700 hover:bg-blue-50 cursor-pointer border-b border-gray-50 last:border-0 group transition-colors"
                            >
                                <div className="flex justify-between items-center">
                                    <div className="flex flex-col">
                                        <span className="font-bold text-gray-800 group-hover:text-blue-700">{item.descricao}</span>
                                        {item.detalhes && <span className="text-xs text-gray-400 mt-0.5">{item.detalhes}</span>}
                                    </div>
                                    <span className="text-blue-600 font-bold bg-blue-50 px-2 py-1 rounded text-xs group-hover:bg-white">
                                        {formatCurrency(item.preco_venda)}
                                    </span>
                                </div>
                            </div>
                        ))}
                     </div>
                )}
            </div>

            {/* 3. Qtd */}
            <div className="col-span-2 md:col-span-2">
                <label className={labelStyle}>Qtd.</label>
                <input 
                    name="quantidade" 
                    type="number" 
                    min="1" 
                    value={quantidade} 
                    onChange={e => setQuantidade(parseInt(e.target.value) || 1)}
                    disabled={disabled}
                    className={`${inputStyle} text-center font-bold`} 
                />
            </div>

            {/* 4. Valor */}
            <div className="col-span-2 md:col-span-2">
                <label className={labelStyle}>Valor (R$)</label>
                <input 
                    type="text" 
                    value={valorUnitario} 
                    onChange={e => setValorUnitario(e.target.value)}
                    disabled={disabled}
                    className={`${inputStyle} text-right font-bold text-green-600`} 
                />
            </div>
        </div>

        <div className="pt-2">
            <SubmitButton />
        </div>
        
        {saveState.message && !saveState.success && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-200/20 text-white text-xs font-bold text-center backdrop-blur-md">
                {saveState.message}
            </div>
        )}
      </form>
    </div>
  )
}