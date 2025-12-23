//============================
//📄 ARQUIVO: src/components/vendas/AddItemFormExperimental.tsx
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
import { Loader2, PlusCircle, Search, ScanBarcode } from 'lucide-react'

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
            className="flex items-center justify-center gap-1.5 w-full h-9 bg-blue-600 hover:bg-blue-700 text-white border border-blue-800 rounded-lg shadow-sm transition-all font-bold uppercase tracking-wide text-xs active:scale-95"
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

export default function AddItemFormExperimental({
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
    const [unidade, setUnidade] = useState('Unidade')
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

    // LÓGICA DE BUSCA GLOBAL
    useEffect(() => {
        if (descricao.trim().length < 2) {
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

    const handleSuggestionClick = (item: ProductSearchResult) => {
        setDescricao(item.descricao)
        setValorUnitario(formatCurrency(item.preco_venda))

        setItemTipo(item.tipo)

        if (item.tipo === 'Lente') setSelectedIds({ ...selectedIds, lente_id: item.id })
        else if (item.tipo === 'Armacao') setSelectedIds({ ...selectedIds, armacao_id: item.id })
        else if (item.tipo === 'Tratamento') setSelectedIds({ ...selectedIds, tratamento_id: item.id })
        else setSelectedIds({ lente_id: null, armacao_id: null, tratamento_id: null })

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
        setSelectedIds({ lente_id: null, armacao_id: null, tratamento_id: null });
    }

    // ESTILOS ADAPTADOS PARA FUNDO BRANCO (MODAL)
    const labelStyle = 'block text-[10px] font-bold text-gray-500 mb-0.5 uppercase tracking-wider'
    const inputStyle = 'block w-full rounded-md border border-gray-400 bg-white shadow-sm text-gray-800 h-9 text-xs px-2 focus:ring-1 focus:ring-blue-500 focus:outline-none disabled:bg-gray-100 disabled:text-gray-400 placeholder:text-gray-400 transition-all'

    return (
        <div className="bg-white p-1 h-full flex flex-col">
            {/* REMOVIDO CABEÇALHO INTERNO POIS O MODAL JÁ TEM */}

            <form ref={formRef} action={dispatchSave} className="space-y-3">
                <input type="hidden" name="venda_id" value={vendaId} />
                <input type="hidden" name="lente_id" value={selectedIds.lente_id ?? ''} />
                <input type="hidden" name="armacao_id" value={selectedIds.armacao_id ?? ''} />
                <input type="hidden" name="tratamento_id" value={selectedIds.tratamento_id ?? ''} />
                <input type="hidden" name="unidade" value={unidade} />
                <input type="hidden" name="valor_unitario" value={parseLocaleFloat(valorUnitario)} />

                <div className="grid grid-cols-12 gap-3 items-end">

                    {/* 1. Descrição / Busca */}
                    <div className="col-span-12 relative" ref={dropdownRef}>
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
                                className={`${inputStyle} pr-7 font-medium text-sm`}
                                autoComplete="off"
                                autoFocus
                            />
                            <div className="absolute right-2 top-2.5 text-gray-400">
                                {isSearching ? <Loader2 className="h-4 w-4 animate-spin text-blue-500" /> : <Search className="h-4 w-4" />}
                            </div>
                        </div>

                        {/* Dropdown de Sugestões */}
                        {isDropdownOpen && suggestions.length > 0 && (
                            <div className="absolute z-50 w-full mt-1 bg-white rounded-lg shadow-xl max-h-60 overflow-y-auto border border-gray-200 ring-1 ring-black ring-opacity-5 animate-in fade-in slide-in-from-top-2">
                                {suggestions.map((item) => (
                                    <div
                                        key={`${item.tipo}-${item.id}`}
                                        onClick={() => handleSuggestionClick(item)}
                                        className="px-3 py-2.5 text-xs text-gray-700 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-0 group transition-colors"
                                    >
                                        <div className="flex justify-between items-center">
                                            <div className="flex flex-col">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="font-bold text-gray-800 group-hover:text-blue-700 text-sm">{item.descricao}</span>
                                                    <span className="text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded border uppercase font-bold">{item.tipo}</span>
                                                </div>
                                                {item.detalhes && <span className="text-[11px] text-gray-400 mt-0.5">{item.detalhes}</span>}
                                            </div>
                                            <span className="text-blue-700 font-bold bg-blue-50 px-2 py-1 rounded text-xs group-hover:bg-white border border-blue-100">
                                                {formatCurrency(item.preco_venda)}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* 2. Tipo */}
                    <div className="col-span-4">
                        <label className={labelStyle}>Tipo</label>
                        <div className="relative">
                            <select
                                name="item_tipo"
                                value={itemTipo}
                                onChange={handleTypeChange}
                                disabled={disabled}
                                className={`${inputStyle} font-bold cursor-pointer appearance-none px-2`}
                            >
                                <option value="Lente">Lente</option>
                                <option value="Armacao">Armação</option>
                                <option value="Tratamento">Tratamento</option>
                                <option value="Servico">Serviço</option>
                                <option value="Outro">Outro</option>
                            </select>
                        </div>
                    </div>

                    {/* 3. Qtd e Unidade */}
                    <div className="col-span-4">
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
                    <div className="col-span-4">
                        <label className={labelStyle}>Valor (R$)</label>
                        <input
                            type="text"
                            value={valorUnitario}
                            onChange={(e) => setValorUnitario(e.target.value)}
                            disabled={disabled}
                            className={`${inputStyle} text-right font-bold text-blue-700`}
                        />
                    </div>

                </div>

                <div className="pt-2">
                    <SubmitButton />
                </div>
            </form>
        </div>
    )
}
