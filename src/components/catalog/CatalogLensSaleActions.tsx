'use client'

import { useEffect, useState, useTransition } from 'react'
import { ArrowRight, Briefcase, Loader2, Plus, Search, ShoppingCart, X } from 'lucide-react'
import { createNewVenda, getSalesList, searchCustomersByName } from '@/lib/actions/vendas.actions'
import { getEmployees } from '@/lib/actions/employee.actions'
import { useRouter } from 'next/navigation'

type CatalogLensSaleActionsProps = {
  storeId: number
  globalOfferId: string
  displayName: string
  originalPrice: number
  laboratorio: string
  versao: string
}

type Mode = 'new' | 'existing' | null

export default function CatalogLensSaleActions({
  storeId,
  globalOfferId,
  displayName,
  originalPrice,
  laboratorio,
  versao,
}: CatalogLensSaleActionsProps) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>(null)
  const [query, setQuery] = useState('')
  const [customers, setCustomers] = useState<any[]>([])
  const [sales, setSales] = useState<any[]>([])
  const [employees, setEmployees] = useState<any[]>([])
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (mode !== 'existing') return

    setMessage(null)
    setSales([])
    startTransition(async () => {
      const result = await getSalesList(storeId, { mode: 'pendencias' })
      if (!result.success) {
        setMessage(result.message || 'Não foi possível carregar as vendas abertas.')
        return
      }
      setSales(result.data || [])
    })
  }, [mode, storeId])

  useEffect(() => {
    if (mode !== 'new') return

    startTransition(async () => {
      const result = await getEmployees(storeId)
      setEmployees(result.filter((employee) => employee.is_active !== false))
    })
  }, [mode, storeId])

  const buildSaleHref = (vendaId: number) => {
    const params = new URLSearchParams({
      open_product: '1',
      catalog_offer_id: globalOfferId,
      catalog_offer_name: displayName,
      catalog_offer_price: String(originalPrice),
      catalog_offer_lab: laboratorio,
      catalog_offer_version: versao,
    })
    return `/dashboard/loja/${storeId}/vendas/${vendaId}/experimental?${params.toString()}`
  }

  const handleSearch = () => {
    if (query.trim().length < 2) {
      setMessage('Digite pelo menos 2 caracteres para pesquisar.')
      return
    }

    setMessage(null)
    startTransition(async () => {
      if (mode === 'new') {
        const result = await searchCustomersByName(query, storeId)
        if (!result.success) {
          setMessage(result.message || 'Não foi possível buscar clientes.')
          return
        }
        setCustomers(result.data || [])
        return
      }

    })
  }

  const handleCreateSale = (customerId: number) => {
    if (!selectedEmployeeId) {
      setMessage('Selecione o vendedor antes de escolher o cliente.')
      return
    }
    setMessage(null)
    startTransition(async () => {
      const result = await createNewVenda(customerId, Number(selectedEmployeeId))
      if (!result.success || !result.data) {
        setMessage(result.message || 'Não foi possível criar a venda.')
        return
      }
      router.push(buildSaleHref(result.data.id))
    })
  }

  if (!mode) {
    return (
      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setMode('new')}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-cyan-500 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-slate-950 transition hover:bg-cyan-400"
        >
          <Plus className="h-4 w-4" /> Criar venda nova
        </button>
        <button
          type="button"
          onClick={() => setMode('existing')}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-white transition hover:border-cyan-400/30 hover:text-cyan-100"
        >
          <ShoppingCart className="h-4 w-4" /> Usar venda aberta
        </button>
      </div>
    )
  }

  const isNewSale = mode === 'new'
  return (
    <div className="mt-5 rounded-2xl border border-cyan-400/20 bg-cyan-500/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-200">
          {isNewSale ? 'Selecionar cliente para nova venda' : 'Selecionar venda aberta'}
        </p>
        <button type="button" onClick={() => { setMode(null); setMessage(null); setCustomers([]); setSales([]); setEmployees([]); setSelectedEmployeeId('') }} className="text-slate-400 hover:text-white" aria-label="Voltar">
          <X className="h-4 w-4" />
        </button>
      </div>

      {isNewSale ? (
        <div className="mt-3 space-y-3">
          <div className="relative">
            <Briefcase className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-300" />
            <select
              value={selectedEmployeeId}
              onChange={(event) => setSelectedEmployeeId(event.target.value)}
              disabled={isPending && employees.length === 0}
              className="w-full rounded-xl border border-slate-500/60 bg-slate-900 py-2 pl-10 pr-3 text-sm font-medium text-white outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-400/20 disabled:opacity-50"
            >
              <option value="" className="bg-slate-900 text-slate-200">
                {employees.length === 0 && isPending ? 'Carregando vendedores...' : 'Selecione o vendedor'}
              </option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id} className="bg-slate-900 text-white">
                  {employee.full_name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-2">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); handleSearch() } }}
              placeholder="Nome ou CPF do cliente"
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-400/40"
              autoFocus
            />
            <button type="button" onClick={handleSearch} disabled={isPending} className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-3 text-slate-200 hover:text-white disabled:opacity-50" aria-label="Pesquisar">
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <select
            defaultValue=""
            disabled={isPending}
            onChange={(event) => {
              const vendaId = Number(event.target.value)
              if (Number.isFinite(vendaId) && vendaId > 0) router.push(buildSaleHref(vendaId))
            }}
            className="w-full rounded-xl border border-slate-500/60 bg-slate-900 px-3 py-2 text-sm font-medium text-white outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-400/20 disabled:opacity-50"
          >
            <option value="" className="bg-slate-900 text-slate-200">{isPending ? 'Carregando vendas abertas...' : 'Selecione uma venda aberta'}</option>
            {sales.map((sale) => (
              <option key={sale.id} value={sale.id} className="bg-slate-900 text-white">
                #{sale.id} · {sale.customers?.full_name || 'Cliente não identificado'} · {new Date(sale.created_at).toLocaleDateString('pt-BR')}
              </option>
            ))}
          </select>
          {!isPending && sales.length === 0 && !message ? (
            <p className="mt-2 text-xs text-slate-400">Não há vendas abertas nesta loja.</p>
          ) : null}
        </div>
      )}

      {message ? <p className="mt-3 text-xs text-amber-200">{message}</p> : null}

      <div className="mt-3 max-h-48 space-y-2 overflow-y-auto">
        {isNewSale
          ? customers.map((customer) => (
              <button key={customer.id} type="button" onClick={() => handleCreateSale(customer.id)} disabled={isPending} className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-left transition hover:border-cyan-400/30 hover:bg-white/5 disabled:opacity-50">
                <span className="min-w-0"><span className="block truncate text-sm font-bold text-white">{customer.full_name}</span><span className="text-[10px] text-slate-500">CPF {customer.cpf || 'não informado'}</span></span>
                <ArrowRight className="h-4 w-4 shrink-0 text-cyan-300" />
              </button>
            ))
          : null}
      </div>
    </div>
  )
}
