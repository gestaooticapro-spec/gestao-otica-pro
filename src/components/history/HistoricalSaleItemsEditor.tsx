'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { History, Loader2, Package, PackagePlus, Search, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import {
  addHistoricalVendaItem,
  deleteHistoricalVendaItem,
  searchProductCatalog,
  type ProductSearchResult,
  type SaveHistoricalVendaItemResult,
  type VendaItem,
} from '@/lib/actions/vendas.actions'

type Props = {
  vendaId: number
  storeId: number
  items: VendaItem[]
}

const formatCurrency = (value: number | null | undefined) =>
  Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const parseLocaleNumber = (value: string) => {
  const normalized = value.includes(',')
    ? value.replace(/\./g, '').replace(',', '.')
    : value
  return Number(normalized) || 0
}

const displayProductName = (item: ProductSearchResult) => {
  const name = String(item.descricao || '').trim()
  const brand = String(item.marca || '').trim()
  if (!brand || name.toLowerCase().includes(brand.toLowerCase())) return name
  return `${brand} ${name}`
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 text-xs font-black uppercase tracking-wider text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60">
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackagePlus className="h-4 w-4" />}
      Adicionar ao histórico
    </button>
  )
}

export default function HistoricalSaleItemsEditor({ vendaId, storeId, items }: Props) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const searchBoxRef = useRef<HTMLDivElement>(null)
  const [description, setDescription] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<ProductSearchResult | null>(null)
  const [itemType, setItemType] = useState<ProductSearchResult['tipo']>('Outro')
  const [quantity, setQuantity] = useState('1')
  const [unit, setUnit] = useState('Unidade')
  const [unitValue, setUnitValue] = useState('0,00')
  const [suggestions, setSuggestions] = useState<ProductSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [removing, startRemoving] = useTransition()
  const initialState: SaveHistoricalVendaItemResult = { success: false, message: '' }
  const [saveState, saveAction] = useFormState(addHistoricalVendaItem, initialState)

  useEffect(() => {
    if (!saveState.timestamp) return
    setMessage(saveState.message)
    if (!saveState.success) return

    formRef.current?.reset()
    setDescription('')
    setSelectedProduct(null)
    setItemType('Outro')
    setQuantity('1')
    setUnit('Unidade')
    setUnitValue('0,00')
    setSuggestions([])
    router.refresh()
  }, [saveState, router])

  useEffect(() => {
    if (selectedProduct || description.trim().length < 2) {
      setSuggestions([])
      return
    }

    setSearching(true)
    const timer = window.setTimeout(async () => {
      const result = await searchProductCatalog(description.trim(), storeId, 'Todos')
      setSuggestions(result.success ? result.data || [] : [])
      setSearching(false)
    }, 300)

    return () => window.clearTimeout(timer)
  }, [description, selectedProduct, storeId])

  useEffect(() => {
    const closeSuggestions = (event: MouseEvent) => {
      if (!searchBoxRef.current?.contains(event.target as Node)) setSuggestions([])
    }
    document.addEventListener('mousedown', closeSuggestions)
    return () => document.removeEventListener('mousedown', closeSuggestions)
  }, [])

  const selectProduct = (product: ProductSearchResult) => {
    setSelectedProduct(product)
    setDescription(displayProductName(product))
    setItemType(product.tipo)
    setUnitValue(Number(product.preco_venda || 0).toFixed(2).replace('.', ','))
    setQuantity('1')
    setUnit(product.tipo === 'Lente' ? 'Par' : 'Unidade')
    setSuggestions([])
    setMessage(null)
  }

  const changeDescription = (value: string) => {
    setDescription(value)
    setSelectedProduct(null)
    setMessage(null)
  }

  const removeItem = (item: VendaItem) => {
    if (!window.confirm(`Remover “${item.descricao || 'produto'}” deste histórico?`)) return
    startRemoving(async () => {
      const result = await deleteHistoricalVendaItem(item.id, vendaId, storeId)
      setMessage(result.message)
      if (result.success) router.refresh()
    })
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-indigo-300" />
          <div>
            <h2 className="text-sm font-black uppercase tracking-wider text-white">Produtos comprados</h2>
            <p className="mt-0.5 text-xs text-slate-500">Complemento histórico, sem estoque, comissão, caixa ou OS.</p>
          </div>
        </div>
        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-bold text-slate-400">{items.length} {items.length === 1 ? 'item' : 'itens'}</span>
      </div>

      <div className="mb-5 space-y-2">
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/15 bg-black/20 p-5 text-sm text-slate-400">Nenhum produto foi informado para esta venda.</div>
        ) : items.map((item) => {
          const details = item.detalhes_avulsos && typeof item.detalhes_avulsos === 'object'
            ? item.detalhes_avulsos as Record<string, unknown>
            : null
          const manuallyAdded = details?.historical_manual_entry === true
          return (
            <div key={item.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-xs font-black text-indigo-300">{Number(item.quantidade || 0).toLocaleString('pt-BR')}</div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-bold text-slate-100">{item.descricao || 'Produto sem descrição'}</p>
                  <span className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-500">{item.item_tipo || 'Outro'}</span>
                  {manuallyAdded && <span className="rounded border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-300">complementado</span>}
                </div>
                {Number(item.valor_unitario || 0) > 0 && <p className="mt-1 text-xs text-slate-500">{formatCurrency(item.valor_unitario)} por unidade · total {formatCurrency(item.valor_total_item)}</p>}
              </div>
              {manuallyAdded && (
                <button type="button" onClick={() => removeItem(item)} disabled={removing} className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-2 text-rose-300 transition hover:bg-rose-500/20 disabled:opacity-50" title="Remover produto acrescentado">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          )
        })}
      </div>

      <form ref={formRef} action={saveAction} className="rounded-xl border border-amber-500/15 bg-amber-500/5 p-4">
        <input type="hidden" name="venda_id" value={vendaId} />
        <input type="hidden" name="store_id" value={storeId} />
        <input type="hidden" name="product_id" value={selectedProduct?.id || ''} />
        <input type="hidden" name="valor_unitario" value={parseLocaleNumber(unitValue)} />

        <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-amber-200"><History className="h-4 w-4" />Complementar esta venda</div>
        <div className="grid gap-3 md:grid-cols-12">
          <div ref={searchBoxRef} className="relative md:col-span-6">
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Produto ou descrição</label>
            <div className="relative">
              <input name="descricao" value={description} onChange={(event) => changeDescription(event.target.value)} required minLength={2} autoComplete="off" placeholder="Busque no cadastro ou escreva uma descrição" className="h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3 pr-9 text-sm text-white outline-none transition focus:border-amber-500/40" />
              {searching ? <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-amber-300" /> : <Search className="absolute right-3 top-3 h-4 w-4 text-slate-500" />}
            </div>
            {suggestions.length > 0 && (
              <div className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-white/10 bg-slate-900 shadow-2xl">
                {suggestions.map((product) => (
                  <button key={`${product.tipo}-${product.id}`} type="button" onClick={() => selectProduct(product)} className="flex w-full items-center justify-between gap-3 border-b border-white/5 px-3 py-2.5 text-left transition last:border-0 hover:bg-white/5">
                    <span className="min-w-0"><span className="block truncate text-sm font-bold text-slate-200">{displayProductName(product)}</span><span className="text-[10px] uppercase text-slate-500">{product.tipo}{product.detalhes ? ` · ${product.detalhes}` : ''}</span></span>
                    <span className="shrink-0 text-xs font-bold text-amber-300">{formatCurrency(product.preco_venda)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Tipo</label>
            <select name="item_tipo" value={itemType} onChange={(event) => setItemType(event.target.value as ProductSearchResult['tipo'])} className="h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-2 text-xs font-bold text-slate-200 outline-none focus:border-amber-500/40">
              <option value="Lente">Lente</option><option value="Armacao">Armação</option><option value="Solar">Solar</option><option value="Tratamento">Tratamento</option><option value="Servico">Serviço</option><option value="Outro">Outro</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Quantidade</label>
            <div className="flex gap-1">
              <input name="quantidade" type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} required className="h-10 min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-950 px-2 text-center text-sm font-bold text-white outline-none focus:border-amber-500/40" />
              <select name="unidade" value={unit} onChange={(event) => setUnit(event.target.value)} className="h-10 w-16 rounded-lg border border-white/10 bg-slate-950 px-1 text-[10px] text-slate-300 outline-none focus:border-amber-500/40"><option value="Unidade">Un.</option><option value="Par">Par</option><option value="Caixa">Cx.</option></select>
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Valor histórico</label>
            <input value={unitValue} onChange={(event) => setUnitValue(event.target.value)} inputMode="decimal" className="h-10 w-full rounded-lg border border-white/10 bg-slate-950 px-3 text-right text-sm font-bold text-amber-300 outline-none focus:border-amber-500/40" />
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className={`text-xs ${saveState.success ? 'text-emerald-300' : 'text-rose-300'}`}>{message}</p>
          <SubmitButton />
        </div>
      </form>
    </section>
  )
}
