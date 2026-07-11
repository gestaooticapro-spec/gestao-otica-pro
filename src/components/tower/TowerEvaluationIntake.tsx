'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowLeft, Loader2, Plus, Search, Sparkles, User } from 'lucide-react'
import { searchCustomersByName } from '@/lib/actions/vendas.actions'
import { createQuickCustomer } from '@/lib/actions/customer.actions'
import { upsertOpticalEvaluation } from '@/lib/actions/evaluation.actions'
import { generateLensRecommendationsAction } from '@/lib/actions/lens-recommendation.actions'
import { linkCustomerToTowerSession, linkEvaluationToTowerSession } from '@/lib/actions/tower-session.actions'
import type { RecommendationOption } from '@/lib/server/lens-recommendation'

type CustomerOption = { id: number; full_name: string; fone_movel?: string | null }

type Props = {
  storeId: number
  towerSessionId: string
  heatmapSessionId: string
  activeCatalogVersionId: string | null
}

const prescriptionFields = [
  ['receitaLongeOdEsferico', 'OD Esf.', '0.00'],
  ['receitaLongeOdCilindrico', 'OD Cil.', '0.00'],
  ['receitaLongeOdEixo', 'OD Eixo', '0'],
  ['receitaLongeOeEsferico', 'OE Esf.', '0.00'],
  ['receitaLongeOeCilindrico', 'OE Cil.', '0.00'],
  ['receitaLongeOeEixo', 'OE Eixo', '0'],
  ['receitaAdicao', 'Adição', '0.00'],
] as const

const templates = [
  { key: 'computador', label: 'Computador' },
  { key: 'leitura', label: 'Leitura' },
  { key: 'dirigir', label: 'Dirige' },
  { key: 'celular', label: 'Celular' },
  { key: 'sol', label: 'Sol' },
  { key: 'conforto', label: 'Conforto' },
]

function parseDegree(value: string) {
  const parsed = Number.parseFloat(value.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

export default function TowerEvaluationIntake({
  storeId,
  towerSessionId,
  heatmapSessionId,
  activeCatalogVersionId,
}: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CustomerOption[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null)
  const [quickCreateOpen, setQuickCreateOpen] = useState(false)
  const [quickName, setQuickName] = useState('')
  const [quickPhone, setQuickPhone] = useState('')
  const [recipe, setRecipe] = useState<Record<string, string>>({})
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [suggestions, setSuggestions] = useState<RecommendationOption[]>([])

  async function selectCustomer(customer: CustomerOption) {
    setBusy(true)
    const linked = await linkCustomerToTowerSession({ storeId, sessionId: towerSessionId, customerId: customer.id })
    if (linked.success) {
      setSelectedCustomer(customer)
      setResults([])
      setMessage('Cliente titular selecionado.')
    } else {
      setMessage(linked.message)
    }
    setBusy(false)
  }

  async function searchCustomers() {
    if (!query.trim()) return
    setBusy(true)
    const response = await searchCustomersByName(query, storeId)
    setResults((response.success ? response.data : []) as CustomerOption[])
    setMessage(response.success ? '' : response.message || 'Não foi possível buscar clientes.')
    setBusy(false)
  }

  async function createCustomer() {
    setBusy(true)
    const form = new FormData()
    form.set('store_id', String(storeId))
    form.set('full_name', quickName)
    form.set('fone_movel', quickPhone)
    const created = await createQuickCustomer(form)
    if (created.success && created.data) {
      setQuickCreateOpen(false)
      await selectCustomer({ id: created.data.id, full_name: created.data.full_name, fone_movel: created.data.fone_movel })
    } else {
      setMessage(created.message)
    }
    setBusy(false)
  }

  async function generateSuggestions() {
    if (!selectedCustomer) {
      setMessage('Selecione o cliente titular antes de gerar sugestões.')
      return
    }
    if (!activeCatalogVersionId) {
      setMessage('Não existe catálogo ativo para gerar sugestões nesta loja.')
      return
    }

    setBusy(true)
    const saved = await upsertOpticalEvaluation({
      storeId,
      evaluatedCustomerId: selectedCustomer.id,
      evaluatedDependenteId: null,
      responsibleCustomerId: selectedCustomer.id,
      evaluatedNameSnapshot: selectedCustomer.full_name,
      responsibleNameSnapshot: selectedCustomer.full_name,
      relationshipSnapshot: 'Titular',
      sourceSystem: 'manual',
      status: 'em_andamento',
      parseStatus: 'success',
      receitaLongeOdEsferico: recipe.receitaLongeOdEsferico || null,
      receitaLongeOdCilindrico: recipe.receitaLongeOdCilindrico || null,
      receitaLongeOdEixo: recipe.receitaLongeOdEixo || null,
      receitaLongeOeEsferico: recipe.receitaLongeOeEsferico || null,
      receitaLongeOeCilindrico: recipe.receitaLongeOeCilindrico || null,
      receitaLongeOeEixo: recipe.receitaLongeOeEixo || null,
      receitaAdicao: recipe.receitaAdicao || null,
      rawPayloadJson: { tower_session_id: towerSessionId, tower_heatmap_session_id: heatmapSessionId },
    })

    if (!saved.success || !saved.data) {
      setMessage(saved.message)
      setBusy(false)
      return
    }

    const linked = await linkEvaluationToTowerSession({ storeId, sessionId: towerSessionId, evaluationId: saved.data.id })
    if (!linked.success) {
      setMessage(linked.message)
      setBusy(false)
      return
    }

    const generated = await generateLensRecommendationsAction({
      storeId,
      versionId: activeCatalogVersionId,
      esferico: parseDegree(recipe.receitaLongeOdEsferico || ''),
      cilindrico: parseDegree(recipe.receitaLongeOdCilindrico || ''),
      adicao: parseDegree(recipe.receitaAdicao || ''),
      rotina_tags: selectedTemplates,
      objetivo_tags: selectedTemplates.includes('conforto') ? ['conforto'] : [],
      desired_benefits: selectedTemplates.includes('conforto') ? ['conforto'] : [],
      heatmapSessionId,
    })

    if (!generated.success) {
      setMessage(generated.message)
      setBusy(false)
      return
    }

    const data = generated.data as { recommendations?: RecommendationOption[] } | undefined
    setSuggestions(data?.recommendations ?? [])
    setMessage('Sugestões geradas a partir da receita, entrevista e Campo Visual.')
    setBusy(false)
  }

  return (
    <main className="min-h-[100dvh] bg-slate-950 px-5 py-4 text-white sm:px-7 sm:py-5">
      <header className="mx-auto flex w-full max-w-5xl items-center gap-3">
        <Link href={`/torre/${storeId}/campo-visual?session=${towerSessionId}`} className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300">Torre de experiência</p>
          <h1 className="text-xl font-black">Avaliação</h1>
        </div>
      </header>

      <div className="mx-auto mt-5 grid w-full max-w-5xl gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-[28px] border border-white/10 bg-slate-900/70 p-5">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-200">1. Cliente titular</p>
          {selectedCustomer ? (
            <div className="mt-4 rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-4">
              <p className="text-sm text-emerald-100">Titular selecionado</p>
              <p className="mt-1 text-lg font-black">{selectedCustomer.full_name}</p>
              <button type="button" onClick={() => setSelectedCustomer(null)} className="mt-3 text-xs font-bold text-slate-300 underline">Trocar cliente</button>
            </div>
          ) : (
            <>
              <div className="mt-4 flex gap-2">
                <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && void searchCustomers()} placeholder="Buscar por nome ou CPF" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm outline-none focus:border-cyan-300" />
                <button type="button" onClick={() => void searchCustomers()} disabled={busy} className="rounded-xl bg-cyan-400 px-3 text-slate-950"><Search className="h-4 w-4" /></button>
              </div>
              <div className="mt-3 space-y-2">
                {results.map((customer) => <button key={customer.id} type="button" onClick={() => void selectCustomer(customer)} className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-slate-950/60 px-3 py-3 text-left hover:border-cyan-300/40"><span className="font-bold">{customer.full_name}</span><User className="h-4 w-4 text-slate-400" /></button>)}
              </div>
              <button type="button" onClick={() => setQuickCreateOpen(!quickCreateOpen)} className="mt-4 inline-flex items-center gap-2 text-sm font-black text-cyan-200"><Plus className="h-4 w-4" /> Cadastrar cliente rapidamente</button>
              {quickCreateOpen && <div className="mt-3 space-y-2 rounded-2xl border border-white/10 bg-slate-950/60 p-3"><input value={quickName} onChange={(event) => setQuickName(event.target.value)} placeholder="Nome completo" className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-sm" /><input value={quickPhone} onChange={(event) => setQuickPhone(event.target.value)} placeholder="Celular" className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-sm" /><button type="button" onClick={() => void createCustomer()} disabled={busy} className="w-full rounded-xl bg-cyan-400 px-3 py-2.5 text-sm font-black text-slate-950">Salvar cliente</button></div>}
            </>
          )}
        </section>

        <section className={`rounded-[28px] border border-white/10 bg-slate-900/70 p-5 ${selectedCustomer ? '' : 'opacity-50'}`}>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-200">2. Receita e entrevista</p>
          <h2 className="mt-2 text-xl font-black">Campos da receita</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {prescriptionFields.map(([key, label, placeholder]) => <label key={key} className="text-xs font-bold text-slate-300"><span className="mb-1 block">{label}</span><input disabled={!selectedCustomer} value={recipe[key] ?? ''} onChange={(event) => setRecipe((current) => ({ ...current, [key]: event.target.value }))} placeholder={placeholder} className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm outline-none focus:border-cyan-300 disabled:cursor-not-allowed" /></label>)}
          </div>
          <h2 className="mt-6 text-xl font-black">Perguntas rápidas</h2>
          <p className="mt-1 text-sm text-slate-400">Use um template como ponto de partida e ajuste a conversa ao cliente.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {templates.map((template) => <button key={template.key} type="button" disabled={!selectedCustomer} onClick={() => setSelectedTemplates((current) => current.includes(template.key) ? current.filter((item) => item !== template.key) : [...current, template.key])} className={`rounded-full border px-3 py-2 text-xs font-black transition ${selectedTemplates.includes(template.key) ? 'border-cyan-300 bg-cyan-400 text-slate-950' : 'border-white/10 bg-slate-950 text-slate-300'} disabled:cursor-not-allowed`}>{template.label}</button>)}
          </div>
          <button type="button" onClick={() => void generateSuggestions()} disabled={!selectedCustomer || busy} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-400 px-4 py-4 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Gerar sugestões</button>
        </section>
      </div>

      {(message || suggestions.length > 0) && <section className="mx-auto mt-5 w-full max-w-5xl rounded-[28px] border border-white/10 bg-slate-900/70 p-5"><p className="text-sm text-cyan-100">{message}</p>{suggestions.length > 0 && <div className="mt-4 grid gap-3 sm:grid-cols-3">{suggestions.map((option) => <article key={option.configKey} className="rounded-2xl border border-white/10 bg-slate-950/70 p-4"><p className="font-black">{option.familyName}</p><p className="mt-1 text-sm text-slate-300">{option.offerLabel}</p><p className="mt-3 text-xs leading-5 text-slate-400">{option.reasons[0] || option.commercialSummary}</p></article>)}</div>}</section>}
    </main>
  )
}
