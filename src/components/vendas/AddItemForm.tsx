//============================
//📄 ARQUIVO: src/components/vendas/AddItemForm.tsx
//============================

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
      className="flex items-center justify-center gap-1.5 w-full h-8 bg-white/20 hover:bg-white/30 text-white border border-white/40 rounded-lg shadow-sm backdrop-blur-sm transition-all font-bold uppercase tracking-wide text-xs active:scale-95"
      title="Adicionar Item"
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <>
          <PlusCircle className="h-4 w-4" />
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
  const [unidade, setUnidade] = useState('Unidade') // NOVO: Estado para unidade
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
      setUnidade('Unidade')
      setValorUnitario('0,00')
      setSelectedIds({ lente_id: null, armacao_id: null, tratamento_id: null })
      onItemAdded()
    }
    lastStateRef.current = saveState;
  }, [saveState, onItemAdded])

  // LÓGICA DE BUSCA GLOBAL (Ignora o tipo selecionado inicialmente) [cite: 1132]
  useEffect(() => {
    if (descricao.trim().length < 2) {
      setSuggestions([])
      setIsDropdownOpen(false)
      return
    }

    // Se já temos um ID selecionado (clicou na sugestão), não busca de novo
    const currentId = itemTipo === 'Lente' ? selectedIds.lente_id
      : itemTipo === 'Armacao' ? selectedIds.armacao_id
        : itemTipo === 'Tratamento' ? selectedIds.tratamento_id : null;

    if (currentId) return;

    setIsSearching(true)
    const timer = setTimeout(() => {
      // ATUALIZAÇÃO: Passa 'Todos' para buscar em tudo
      searchProductCatalog(descricao, storeId, 'Todos').then(result => {
        if (result.success && result.data) {
          setSuggestions(result.data)
          setIsDropdownOpen(result.data.length > 0)
        }
        setIsSearching(false)
      })
    }, 300)

    return () => clearTimeout(timer)
  }, [descricao, storeId, selectedIds, itemTipo])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDescricao(e.target.value)
    setSelectedIds({ lente_id: null, armacao_id: null, tratamento_id: null })
  }

  // ATUALIZAÇÃO: Troca o tipo automaticamente ao clicar [cite: 1133]
  const handleSuggestionClick = (item: ProductSearchResult) => {
    setDescricao(item.descricao)
    setValorUnitario(formatCurrency(item.preco_venda))

    // 1. Define o Tipo com base no retorno do backend
    setItemTipo(item.tipo)

    // 2. Define o ID correto
    if (item.tipo === 'Lente') setSelectedIds({ ...selectedIds, lente_id: item.id })
    else if (item.tipo === 'Armacao') setSelectedIds({ ...selectedIds, armacao_id: item.id })
    else if (item.tipo === 'Tratamento') setSelectedIds({ ...selectedIds, tratamento_id: item.id })
    else setSelectedIds({ lente_id: null, armacao_id: null, tratamento_id: null })

    // 3. Lógica Inteligente de Unidade
    if (item.tipo === 'Lente') {
      setUnidade('Par')
    } else {
      setUnidade('Unidade')
    }

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
    // Se o usuário trocar o tipo manualmente, limpamos o ID para evitar inconsistência
    setSelectedIds({ lente_id: null, armacao_id: null, tratamento_id: null });
  }

  const labelStyle = 'block text-[9px] font-bold text-blue-100 mb-0.5 uppercase tracking-wider'
  // MODIFICADO: Aumentado contraste para border-gray-400
  const inputStyle = 'block w-full rounded-md border border-gray-400 bg-white shadow-sm text-gray-800 h-8 text-xs px-2 focus:ring-1 focus:ring-blue-300 focus:outline-none disabled:bg-gray-100 disabled:text-gray-400 placeholder:text-gray-400 transition-all'

  return (
    <div className="relative bg-gradient-to-br from-blue-600 to-indigo-600 p-3 rounded-xl shadow-md shadow-blue-200 border border-white/20">

      <div className="flex items-center gap-1.5 mb-2 border-b border-white/20 pb-2">
        <div className="p-1 bg-white/20 rounded-md text-white">
          <ScanBarcode className="h-4 w-4" />
        </div>
        <h3 className="text-xs font-bold text-white">
          Adicionar Produto
        </h3>
      </div>

      <form ref={formRef} action={dispatchSave} className="space-y-2">
        <input type="hidden" name="venda_id" value={vendaId} />
        <input type="hidden" name="lente_id" value={selectedIds.lente_id ?? ''} />
        <input type="hidden" name="armacao_id" value={selectedIds.armacao_id ?? ''} />
        <input type="hidden" name="tratamento_id" value={selectedIds.tratamento_id ?? ''} />
        <input type="hidden" name="unidade" value={unidade} />
        <input type="hidden" name="valor_unitario" value={parseLocaleFloat(valorUnitario)} />

        <div className="grid grid-cols-12 gap-2 items-end">

          {/* ATUALIZAÇÃO VISUAL: Inverti a ordem das colunas no grid [cite: 1136] */}

          {/* 1. Descrição / Busca (Agora é o primeiro, col-span maior) */}
          <div className="col-span-6 md:col-span-6 relative" ref={dropdownRef}>
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
                className={`${inputStyle} pr-7 font-medium`}
                autoComplete="off"
                autoFocus
              />
              <div className="absolute right-2 top-2 text-gray-400">
                {isSearching ? <Loader2 className="h-4 w-4 animate-spin text-blue-500" /> : <Search className="h-4 w-4" />}
              </div>
            </div>

            {/* Dropdown de Sugestões */}
            {isDropdownOpen && suggestions.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-white rounded-lg shadow-xl max-h-48 overflow-y-auto border border-gray-100 ring-1 ring-black ring-opacity-5 animate-in fade-in slide-in-from-top-2">
                {suggestions.map((item) => (
                  <div
                    key={`${item.tipo}-${item.id}`}
                    onClick={() => handleSuggestionClick(item)}
                    className="px-3 py-2 text-xs text-gray-700 hover:bg-blue-50 cursor-pointer border-b border-gray-50 last:border-0 group transition-colors"
                  >
                    <div className="flex justify-between items-center">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-gray-800 group-hover:text-blue-700">{item.descricao}</span>
                          <span className="text-[8px] bg-gray-100 text-gray-500 px-1 py-0.5 rounded border uppercase">{item.tipo}</span>
                        </div>
                        {item.detalhes && <span className="text-[10px] text-gray-400 mt-0.5">{item.detalhes}</span>}
                      </div>
                      <span className="text-blue-600 font-bold bg-blue-50 px-1.5 py-0.5 rounded text-[10px] group-hover:bg-white">
                        {formatCurrency(item.preco_venda)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 2. Tipo (Agora é o segundo, col-span menor) */}
          <div className="col-span-2 md:col-span-2">
            <label className={labelStyle}>Tipo</label>
            <div className="relative">
              <select
                name="item_tipo"
                value={itemTipo}
                onChange={handleTypeChange}
                disabled={disabled}
                className={`${inputStyle} font-bold cursor-pointer appearance-none text-[10px] px-1`}
              >
                <option value="Lente">Lente</option>
                <option value="Armacao">Armação</option>
                <option value="Tratamento">Trat.</option>
                <option value="Servico">Serv.</option>
                <option value="Outro">Outro</option>
              </select>
            </div>
          </div>

          {/* 3. Qtd e Unidade */}
          <div className="col-span-2 md:col-span-2">
            <label className={labelStyle}>Qtd.</label>
            <div className="flex gap-1">
              <input
                name="quantidade"
                type="number"
                min="1"
                value={quantidade}
                onChange={e => setQuantidade(parseInt(e.target.value) || 1)}
                disabled={disabled}
                className={`${inputStyle} text-center font-bold w-1/2 px-0.5`}
              />
              <select
                value={unidade}
                onChange={(e) => setUnidade(e.target.value)}
                disabled={disabled}
                className={`${inputStyle} text-[10px] px-0.5 w-1/2 appearance-none text-center bg-gray-50`}
              >
                <option value="Unidade">Un.</option>
                <option value="Par">Par</option>
                <option value="Caixa">Cx.</option>
              </select>
            </div>
          </div>

          {/* 4. Valor Unitário */}
          <div className="col-span-2 md:col-span-2">
            <label className={labelStyle}>Valor (R$)</label>
            <input
              type="text"
              value={valorUnitario}
              onChange={(e) => setValorUnitario(e.target.value)}
              disabled={disabled}
              className={`${inputStyle} text-right font-bold`}
            />
          </div>

        </div>

        <div className="pt-1">
          <SubmitButton />
        </div>
      </form>
    </div>
  )
}