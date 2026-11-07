'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, UserMinus, MessageCircle, Loader2, Search, Phone, UserRound,
  CalendarDays, MapPin, Mail, FileText, ExternalLink, RotateCcw, X, ShieldAlert,
} from 'lucide-react'
import { useBackgroundPreference, BackgroundToggle } from '@/components/ui/BackgroundToggle'
import { sendManualWhatsAppFromClient } from '@/lib/whatsapp/manual-client'
import { formatCurrency } from '@/lib/utils'

type CustomerInactive = {
  customer_id: number
  full_name: string
  cpf: string | null
  birth_date: string | null
  phone: string | null
  fone_movel: string | null
  email: string | null
  rua: string | null
  numero: string | null
  bairro: string | null
  complemento: string | null
  cidade: string | null
  uf: string | null
  cep: string | null
  is_spc: boolean
  last_purchase: string
  total_spent: number
  purchase_count: number
  exclusion_reason: string | null
  exclusion_note: string | null
  excluded_at: string | null
}

type PhoneFilter = 'all' | 'has' | 'missing'
type SpcFilter = 'all' | 'yes' | 'no'
type CustomerSort = 'last_purchase_asc' | 'last_purchase_desc' | 'name_asc' | 'name_desc' | 'city_asc' | 'city_desc' | 'total_spent_desc'
type ExclusionReason = 'falecimento' | 'mudou_longe' | 'outro'

const pageSize = 50

function isoDate(date: Date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return localDate.toISOString().slice(0, 10)
}

function getOneYearAgo() {
  const date = new Date()
  date.setFullYear(date.getFullYear() - 1)
  return isoDate(date)
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Não informada'
  const date = new Date(`${value.slice(0, 10)}T12:00:00`)
  return Number.isNaN(date.getTime()) ? 'Não informada' : date.toLocaleDateString('pt-BR')
}

function formatPhone(value: string | null | undefined) {
  const phone = String(value || '').trim()
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return phone
}

function reasonLabel(reason: string | null) {
  if (reason === 'falecimento') return 'Falecimento'
  if (reason === 'mudou_longe') return 'Mudou para longe'
  if (reason === 'outro') return 'Outro motivo'
  return 'Retirado da lista'
}

export default function ClientesInativosPage() {
  const router = useRouter()
  const params = useParams()
  const storeId = Number(params.storeId)
  const { preference } = useBackgroundPreference()
  const [clientes, setClientes] = useState<CustomerInactive[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState(getOneYearAgo)
  const [phoneFilter, setPhoneFilter] = useState<PhoneFilter>('all')
  const [spcFilter, setSpcFilter] = useState<SpcFilter>('all')
  const [sort, setSort] = useState<CustomerSort>('last_purchase_asc')
  const [showExcluded, setShowExcluded] = useState(false)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerInactive | null>(null)
  const [removingCustomer, setRemovingCustomer] = useState<CustomerInactive | null>(null)
  const [reason, setReason] = useState<ExclusionReason | ''>('')
  const [reasonNote, setReasonNote] = useState('')
  const [mutatingCustomerId, setMutatingCustomerId] = useState<number | null>(null)
  const [sendingWhatsApp, setSendingWhatsApp] = useState<number | null>(null)

  const fetchCustomers = useCallback(async (signal: AbortSignal) => {
    if (!storeId) return
    setLoading(true)
    setErrorMessage(null)
    const query = new URLSearchParams({
      storeId: String(storeId),
      page: String(page),
      phone: phoneFilter,
      spc: spcFilter,
      sort,
      showExcluded: String(showExcluded),
    })
    if (fromDate) query.set('from', fromDate)
    if (toDate) query.set('to', toDate)
    if (busca.trim()) query.set('search', busca.trim())
    try {
      const response = await fetch(`/api/clientes-inativos?${query.toString()}`, { signal, cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Não foi possível carregar a lista.')
      setClientes(data.items || [])
      setTotal(Number(data.total || 0))
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível carregar a lista.')
      setClientes([])
      setTotal(0)
    } finally {
      if (!signal.aborted) setLoading(false)
    }
  }, [busca, fromDate, page, phoneFilter, refreshKey, sort, spcFilter, storeId, showExcluded, toDate])

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => void fetchCustomers(controller.signal), busca.trim() ? 250 : 0)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [fetchCustomers])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const phoneLabel = (customer: CustomerInactive) => formatPhone(customer.fone_movel || customer.phone)
  const cityLabel = (customer: CustomerInactive) => [customer.cidade, customer.uf].filter(Boolean).join(' / ')
  const addressLabel = (customer: CustomerInactive) => [customer.rua, customer.numero, customer.complemento, customer.bairro].filter(Boolean).join(', ')

  const resetPage = (callback: () => void) => {
    setPage(1)
    callback()
  }

  const sendWhatsApp = async (customer: CustomerInactive) => {
    const phone = customer.fone_movel || customer.phone
    if (!phone) return
    setSendingWhatsApp(customer.customer_id)
    try {
      const firstName = customer.full_name.split(' ')[0]
      const result = await sendManualWhatsAppFromClient({
        storeId,
        remotePhone: phone,
        messageText: `Olá ${firstName}, tudo bem? Aqui é da nossa ótica! Faz um tempinho que não te vemos por aqui. Que tal dar uma passadinha na loja? Temos novidades esperando por você! 😊`,
        messageType: 'relationship',
        source: 'clientes_inativos.reactivation_button',
        metadata: { customerName: customer.full_name, totalGasto: customer.total_spent, ultimaVenda: customer.last_purchase },
      })
      if (result.success) setSuccessMessage(result.message || 'Mensagem enviada via WhatsApp da loja.')
      else setErrorMessage(result.message || 'Não foi possível enviar a mensagem.')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível enviar a mensagem.')
    } finally {
      setSendingWhatsApp(null)
    }
  }

  const saveExclusion = async () => {
    if (!removingCustomer || !reason || mutatingCustomerId) return
    setMutatingCustomerId(removingCustomer.customer_id)
    setErrorMessage(null)
    try {
      const response = await fetch('/api/clientes-inativos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, customerId: removingCustomer.customer_id, reason, note: reasonNote }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Não foi possível tirar o cliente da lista.')
      setRemovingCustomer(null)
      setReason('')
      setReasonNote('')
      setSuccessMessage('Cliente retirado da lista. Você pode restaurá-lo na aba “Retirados”.')
      setRefreshKey((value) => value + 1)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível tirar o cliente da lista.')
    } finally {
      setMutatingCustomerId(null)
    }
  }

  const restoreCustomer = async (customer: CustomerInactive) => {
    if (mutatingCustomerId) return
    setMutatingCustomerId(customer.customer_id)
    setErrorMessage(null)
    try {
      const response = await fetch('/api/clientes-inativos', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, customerId: customer.customer_id }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Não foi possível restaurar o cliente.')
      setSuccessMessage('Cliente restaurado na lista de inativos.')
      setRefreshKey((value) => value + 1)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível restaurar o cliente.')
    } finally {
      setMutatingCustomerId(null)
    }
  }

  const summary = useMemo(() => `${total.toLocaleString('pt-BR')} ${showExcluded ? 'retirado(s)' : 'cliente(s)'}`, [showExcluded, total])

  return (
    <div className="min-h-full relative flex flex-col p-5 md:p-8 lg:p-10 z-0">
      <div className={`fixed inset-0 z-[-1] transition-opacity duration-1000 ${preference === 'image' ? 'opacity-100' : 'opacity-0'}`}>
        <div className="absolute inset-0 bg-[url('/tela1.jpg')] bg-cover bg-center" />
        <div className="absolute inset-0 bg-black/70 backdrop-blur-xl" />
      </div>
      <div className="absolute top-6 right-6 z-50"><BackgroundToggle /></div>

      <div className="mb-6 max-w-7xl mx-auto w-full">
        <Link href={`/dashboard/loja/${storeId}?menu=gerencia`} className="p-2 mb-5 inline-flex bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-slate-400 hover:text-white transition-all" title="Voltar para o Painel">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-rose-500/20 rounded-xl ring-1 ring-rose-500/30"><UserMinus className="w-8 h-8 text-rose-400" /></div>
            <div>
              <h1 className="text-3xl font-black text-white tracking-tight">Clientes Sumidos</h1>
              <p className="text-slate-400 text-sm mt-1">Ajuste o período e os critérios para encontrar clientes sem compras recentes.</p>
            </div>
          </div>
          <div className="text-left sm:text-right">
            <span className="text-3xl font-black text-rose-400">{loading ? '…' : total.toLocaleString('pt-BR')}</span>
            <p className="text-slate-500 text-xs font-bold uppercase">{showExcluded ? 'Retirados' : 'Encontrados'}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-950/65 p-4 md:p-5 backdrop-blur-md space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
            <label className="xl:col-span-2 relative">
              <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Buscar</span>
              <Search className="absolute left-3 top-[34px] w-4 h-4 text-slate-500" />
              <input value={busca} onChange={(event) => resetPage(() => setBusca(event.target.value))} placeholder="Nome, telefone, e-mail ou cidade" className="mt-1 w-full h-10 pl-9 pr-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-rose-400/60" />
            </label>
            <label>
              <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Última compra desde</span>
              <input type="date" value={fromDate} max={toDate || undefined} onChange={(event) => resetPage(() => setFromDate(event.target.value))} className="mt-1 w-full h-10 px-3 rounded-xl bg-slate-900 border border-white/10 text-sm text-white focus:outline-none focus:border-rose-400/60" />
            </label>
            <label>
              <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Última compra até</span>
              <input type="date" value={toDate} min={fromDate || undefined} onChange={(event) => resetPage(() => setToDate(event.target.value))} className="mt-1 w-full h-10 px-3 rounded-xl bg-slate-900 border border-white/10 text-sm text-white focus:outline-none focus:border-rose-400/60" />
            </label>
            <label>
              <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Telefone</span>
              <select value={phoneFilter} onChange={(event) => resetPage(() => setPhoneFilter(event.target.value as PhoneFilter))} className="mt-1 w-full h-10 px-3 rounded-xl bg-slate-900 border border-white/10 text-sm text-white focus:outline-none focus:border-rose-400/60">
                <option value="all">Todos</option><option value="has">Com telefone</option><option value="missing">Sem telefone</option>
              </select>
            </label>
          </div>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-1">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-400">
                Classificar
                <select value={sort} onChange={(event) => resetPage(() => setSort(event.target.value as CustomerSort))} className="h-9 px-3 rounded-lg bg-slate-900 border border-white/10 text-xs text-white focus:outline-none">
                  <option value="last_purchase_asc">Última compra: mais antiga</option>
                  <option value="last_purchase_desc">Última compra: mais recente</option>
                  <option value="name_asc">Nome: A–Z</option>
                  <option value="name_desc">Nome: Z–A</option>
                  <option value="city_asc">Cidade: A–Z</option>
                  <option value="city_desc">Cidade: Z–A</option>
                  <option value="total_spent_desc">Maior valor comprado</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-xs font-bold text-slate-400">
                <ShieldAlert className="w-4 h-4 text-amber-400" /> Situação SPC
                <select value={spcFilter} onChange={(event) => resetPage(() => setSpcFilter(event.target.value as SpcFilter))} className="h-9 px-3 rounded-lg bg-slate-900 border border-white/10 text-xs text-white focus:outline-none">
                  <option value="all">Todos</option><option value="no">Fora do SPC</option><option value="yes">No SPC</option>
                </select>
              </label>
              <button type="button" onClick={() => resetPage(() => setShowExcluded((value) => !value))} className={`px-3 py-2 rounded-lg border text-xs font-bold transition-colors ${showExcluded ? 'border-amber-400/30 bg-amber-500/10 text-amber-200' : 'border-white/10 text-slate-300 hover:bg-white/5'}`}>
                {showExcluded ? 'Ver clientes ativos na lista' : 'Ver retirados'}
              </button>
            </div>
            <p className="text-[11px] text-slate-500">Padrão: última compra até {formatDate(getOneYearAgo())} (um ano atrás).</p>
          </div>
        </div>
        {errorMessage && <div role="alert" className="mt-3 rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{errorMessage}</div>}
        {successMessage && <div role="status" className="mt-3 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{successMessage}<button onClick={() => setSuccessMessage(null)} className="ml-3 underline">Fechar</button></div>}
      </div>

      <div className="max-w-7xl mx-auto w-full flex-1">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-20 bg-black/20 rounded-3xl border border-white/5"><Loader2 className="w-10 h-10 animate-spin text-rose-500 mb-4" /><p className="text-slate-400">Buscando clientes…</p></div>
        ) : clientes.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-16 bg-black/20 rounded-3xl border border-white/5 text-center"><UserMinus className="w-12 h-12 text-rose-400 mb-4 opacity-50" /><p className="text-slate-300 font-medium">{showExcluded ? 'Não há clientes retirados com esses filtros.' : 'Nenhum cliente encontrado com esses filtros.'}</p><p className="text-slate-500 text-sm mt-2">Tente ampliar a faixa de datas ou remover algum filtro.</p></div>
        ) : (
          <div className="space-y-3">
            {clientes.map((customer) => {
              const phone = phoneLabel(customer)
              const city = cityLabel(customer)
              return (
                <article key={customer.customer_id} className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-950/60 p-4 md:p-5 hover:border-white/20 backdrop-blur-md">
                  <div className="min-w-0 flex-1">
                    <button type="button" onClick={() => setSelectedCustomer(customer)} className="text-left text-white font-bold text-lg hover:text-rose-200 focus-visible:outline-none focus-visible:underline">{customer.full_name || 'Cliente sem nome'}</button>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-400">
                      <span className="inline-flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />{phone || 'Sem telefone'}</span>
                      {city && <span className="inline-flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" />{city}</span>}
                      <span className="text-rose-300">Última compra: {formatDate(customer.last_purchase)}</span>
                      {customer.is_spc && <span className="rounded-full border border-rose-400/20 bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-200">No SPC</span>}
                      {!customer.is_spc && <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-200">Fora do SPC</span>}
                      {showExcluded && <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-200">{reasonLabel(customer.exclusion_reason)}</span>}
                    </div>
                    {showExcluded && customer.exclusion_note && <p className="mt-2 text-xs text-slate-500">Observação: {customer.exclusion_note}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                    <p className="mr-2 text-right text-xs text-slate-500">{customer.purchase_count} compra(s)<br /><strong className="text-slate-300">Total {formatCurrency(Number(customer.total_spent || 0))}</strong></p>
                    {!showExcluded && <button type="button" onClick={() => void sendWhatsApp(customer)} disabled={!phone || sendingWhatsApp === customer.customer_id} className="inline-flex items-center gap-2 px-3 py-2.5 rounded-xl bg-green-500/15 text-green-300 hover:bg-green-500 hover:text-white transition-all text-xs font-bold disabled:opacity-30 disabled:cursor-not-allowed"><MessageCircle className="w-4 h-4" />{sendingWhatsApp === customer.customer_id ? 'Enviando…' : 'Avisar'}</button>}
                    <Link href={`/dashboard/loja/${storeId}/cliente/${customer.customer_id}/historico?from=clientes-inativos`} className="inline-flex items-center gap-2 px-3 py-2.5 rounded-xl bg-indigo-500/15 text-indigo-200 hover:bg-indigo-500/30 transition-colors text-xs font-bold"><ExternalLink className="w-4 h-4" />Abrir dossiê</Link>
                    {showExcluded ? (
                      <button type="button" onClick={() => void restoreCustomer(customer)} disabled={mutatingCustomerId === customer.customer_id} className="inline-flex items-center gap-2 px-3 py-2.5 rounded-xl border border-amber-300/20 text-amber-200 hover:bg-amber-500/10 transition-colors text-xs font-bold disabled:opacity-50"><RotateCcw className="w-4 h-4" />{mutatingCustomerId === customer.customer_id ? 'Restaurando…' : 'Restaurar'}</button>
                    ) : (
                      <button type="button" onClick={() => { setRemovingCustomer(customer); setReason(''); setReasonNote('') }} className="inline-flex items-center gap-2 px-3 py-2.5 rounded-xl border border-white/10 text-slate-300 hover:border-rose-300/30 hover:bg-rose-500/10 hover:text-rose-200 transition-colors text-xs font-bold"><UserMinus className="w-4 h-4" />Tirar da lista</button>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )}
        {!loading && total > 0 && <div className="flex items-center justify-between gap-3 py-6 text-sm text-slate-400"><span>{summary} · Página {page} de {totalPages}</span><div className="flex gap-2"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="px-3 py-2 rounded-lg border border-white/10 disabled:opacity-30 hover:bg-white/5">Anterior</button><button type="button" disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} className="px-3 py-2 rounded-lg border border-white/10 disabled:opacity-30 hover:bg-white/5">Próxima</button></div></div>}
      </div>

      {selectedCustomer && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedCustomer(null) }}>
          <section role="dialog" aria-modal="true" aria-labelledby="inactive-customer-title" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-white/10 bg-slate-950 p-5 shadow-2xl md:p-7">
            <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4"><div className="flex items-center gap-3"><div className="rounded-xl bg-indigo-500/15 p-3 text-indigo-200"><UserRound className="h-6 w-6" /></div><div><h2 id="inactive-customer-title" className="text-xl font-black text-white">{selectedCustomer.full_name}</h2><p className="mt-1 text-xs text-slate-500">Dados resumidos do cadastro</p></div></div><button type="button" onClick={() => setSelectedCustomer(null)} aria-label="Fechar" className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button></div>
            <div className="grid grid-cols-1 gap-3 py-5 sm:grid-cols-2">
              <Detail icon={<Phone />} label="Celular" value={formatPhone(selectedCustomer.fone_movel) || 'Não informado'} />
              <Detail icon={<Phone />} label="Telefone" value={formatPhone(selectedCustomer.phone) || 'Não informado'} />
              <Detail icon={<Mail />} label="E-mail" value={selectedCustomer.email || 'Não informado'} />
              <Detail icon={<CalendarDays />} label="Nascimento" value={formatDate(selectedCustomer.birth_date)} />
              <Detail icon={<MapPin />} label="Cidade / UF" value={cityLabel(selectedCustomer) || 'Não informado'} />
              <Detail icon={<FileText />} label="CPF" value={selectedCustomer.cpf || 'Não informado'} />
              <Detail icon={<MapPin />} label="Endereço" value={addressLabel(selectedCustomer) || 'Não informado'} />
              <Detail icon={<ShieldAlert />} label="SPC" value={selectedCustomer.is_spc ? 'Está no SPC' : 'Fora do SPC'} />
              <Detail icon={<CalendarDays />} label="Última compra" value={formatDate(selectedCustomer.last_purchase)} />
              <Detail icon={<FileText />} label="Compras registradas" value={`${selectedCustomer.purchase_count} · ${formatCurrency(Number(selectedCustomer.total_spent || 0))}`} />
            </div>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 border-t border-white/10 pt-4"><button type="button" onClick={() => setSelectedCustomer(null)} className="px-4 py-2.5 rounded-xl border border-white/10 text-slate-300 text-sm font-bold hover:bg-white/5">Fechar</button><button type="button" onClick={() => router.push(`/dashboard/loja/${storeId}/cliente/${selectedCustomer.customer_id}/historico?from=clientes-inativos`)} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-500/20 text-indigo-100 text-sm font-bold hover:bg-indigo-500/30"><ExternalLink className="w-4 h-4" />Abrir dossiê completo</button></div>
          </section>
        </div>
      )}

      {removingCustomer && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && !mutatingCustomerId) setRemovingCustomer(null) }}>
          <section role="dialog" aria-modal="true" aria-labelledby="remove-customer-title" className="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-950 p-5 shadow-2xl md:p-6">
            <div className="flex items-start justify-between gap-4"><div><h2 id="remove-customer-title" className="text-xl font-black text-white">Tirar da lista</h2><p className="mt-1 text-sm text-slate-400">{removingCustomer.full_name} não aparecerá na lista ativa. É possível restaurá-lo depois.</p></div><button type="button" disabled={Boolean(mutatingCustomerId)} onClick={() => setRemovingCustomer(null)} aria-label="Fechar" className="rounded-lg p-2 text-slate-400 hover:bg-white/10"><X className="h-5 w-5" /></button></div>
            <label className="mt-5 block"><span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Motivo</span><select value={reason} onChange={(event) => setReason(event.target.value as ExclusionReason | '')} className="mt-1 w-full h-11 px-3 rounded-xl bg-slate-900 border border-white/10 text-sm text-white"><option value="">Selecione…</option><option value="falecimento">Falecimento</option><option value="mudou_longe">Mudou para longe</option><option value="outro">Outro motivo</option></select></label>
            <label className="mt-4 block"><span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Observação opcional</span><textarea value={reasonNote} onChange={(event) => setReasonNote(event.target.value.slice(0, 500))} rows={3} placeholder="Anotação interna para a equipe" className="mt-1 w-full resize-y rounded-xl bg-slate-900 border border-white/10 p-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-rose-400/50" /></label>
            <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2"><button type="button" disabled={Boolean(mutatingCustomerId)} onClick={() => setRemovingCustomer(null)} className="px-4 py-2.5 rounded-xl border border-white/10 text-slate-300 text-sm font-bold hover:bg-white/5">Cancelar</button><button type="button" disabled={!reason || Boolean(mutatingCustomerId)} onClick={() => void saveExclusion()} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-rose-500/20 text-rose-100 text-sm font-bold hover:bg-rose-500/30 disabled:opacity-40">{mutatingCustomerId === removingCustomer.customer_id && <Loader2 className="w-4 h-4 animate-spin" />}Tirar da lista</button></div>
          </section>
        </div>
      )}
    </div>
  )
}

function Detail({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3"><p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">{icon}{label}</p><p className="mt-1 break-words text-sm font-medium text-slate-200">{value}</p></div>
}
