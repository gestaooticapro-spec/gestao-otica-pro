'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, Check, Clock3, ExternalLink, GitMerge, History, Loader2, RotateCcw, ShieldAlert, Trash2, X } from 'lucide-react'
import type { DailyHealthAlert } from '@/lib/daily-store-health'

type Props = { storeId: number; alert: DailyHealthAlert; onClose: () => void; onChanged: () => void }
type DuplicateRecord = Record<string, any> & { id: number; usageCount: number; lastUsageAt: string | null }
type DuplicateGroup = { fingerprint: string; ids: number[]; reasons: string[]; records: DuplicateRecord[] }
type QueueData = { totalGroups?: number; totalRecords: number; groups?: DuplicateGroup[]; cases?: any[] }
type MergeHistoryItem = { operationKey: string; targetId: number; targetLabel?: string | null; removedIds: number[]; createdAt: string; reversed: boolean; recoverable: boolean }
type MergePreview = {
  fingerprint: string
  targetId: number
  targetLabel: string
  referencesToMove: number
  dependencies: Array<{ table: string; label: string; sourceCount: number; targetCount: number }>
  fieldConflicts: Array<{ field: string; label: string; severity: 'choice' | 'blocker'; values: Array<{ id: number; value: string }> }>
  fieldComplements: Array<{ field: string; label: string; fromId: number; value: string }>
  blockers: string[]
  stockPlan: { targetStock: number; sourceStock: number; resultingStock: number } | null
  executable: boolean
}

function date(value: string | null | undefined) {
  return value ? new Date(value).toLocaleDateString('pt-BR') : 'Sem registro'
}

function money(value: number) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function reasonLabel(reason: string) {
  return ({ cpf: 'CPF igual', telefone: 'telefone igual', nome: 'nome igual', produto_composto: 'nome, marca e referencia compativeis' } as Record<string, string>)[reason] || reason
}

function dependencyDescription(dependency: MergePreview['dependencies'][number]) {
  if (dependency.table === 'dependentes') {
    const moved = dependency.sourceCount === 1 ? '1 dependente será transferido' : `${dependency.sourceCount} dependentes serão transferidos`
    const existing = dependency.targetCount === 1 ? 'este cadastro já possui 1 dependente' : `este cadastro já possui ${dependency.targetCount} dependentes`
    return `${moved} para o cadastro principal; ${existing}.`
  }
  return `${dependency.sourceCount} a mover${dependency.targetCount ? `; ${dependency.targetCount} já no principal` : ''}`
}

function CustomerRecord({ record, onPreview, loading, disabled }: { record: DuplicateRecord; onPreview: () => void; loading: boolean; disabled: boolean }) {
  return <article className="min-w-0 border border-white/10 bg-black/20 p-4">
    <h4 className="truncate font-bold text-white">{record.full_name} <span className="font-normal text-slate-400">#{record.id}</span></h4>
    <dl className="mt-3 space-y-1 text-sm text-slate-300">
      <div className="flex justify-between gap-4"><dt>CPF</dt><dd className="text-right text-white">{record.cpf || 'Nao informado'}</dd></div>
      <div className="flex justify-between gap-4"><dt>Telefone</dt><dd className="text-right text-white">{record.fone_movel || record.phone || 'Nao informado'}</dd></div>
      <div className="flex justify-between gap-4"><dt>E-mail</dt><dd className="max-w-[65%] truncate text-right text-white">{record.email || 'Nao informado'}</dd></div>
      <div className="flex justify-between gap-4"><dt>Cadastro</dt><dd className="text-right text-white">{date(record.created_at)}</dd></div>
      <div className="flex justify-between gap-4"><dt>Vendas</dt><dd className="text-right text-white">{record.usageCount}</dd></div>
      <div className="flex justify-between gap-4"><dt>Ultima venda</dt><dd className="text-right text-white">{date(record.lastUsageAt)}</dd></div>
    </dl>
    <button type="button" disabled={disabled} onClick={onPreview} className="mt-4 inline-flex h-9 items-center gap-2 border border-cyan-300/30 px-3 text-xs font-semibold text-cyan-100 hover:bg-cyan-300/10 disabled:opacity-50">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitMerge className="h-4 w-4" />}Prévia usando este como o principal</button>
  </article>
}

function ProductRecord({ record, onPreview, loading, disabled }: { record: DuplicateRecord; onPreview: () => void; loading: boolean; disabled: boolean }) {
  return <article className="min-w-0 border border-white/10 bg-black/20 p-4">
    <h4 className="font-bold text-white">{record.nome} <span className="font-normal text-slate-400">#{record.id}</span></h4>
    <dl className="mt-3 space-y-1 text-sm text-slate-300">
      <div className="flex justify-between gap-4"><dt>Marca</dt><dd className="text-right text-white">{record.marca || 'Nao informada'}</dd></div>
      <div className="flex justify-between gap-4"><dt>Referencia</dt><dd className="text-right text-white">{record.referencia || 'Nao informada'}</dd></div>
      <div className="flex justify-between gap-4"><dt>Codigo</dt><dd className="text-right text-white">{record.codigo_barras || 'Nao informado'}</dd></div>
      <div className="flex justify-between gap-4"><dt>Venda</dt><dd className="text-right text-white">{money(record.preco_venda)}</dd></div>
      <div className="flex justify-between gap-4"><dt>Estoque</dt><dd className="text-right text-white">{record.estoque_atual}</dd></div>
      <div className="flex justify-between gap-4"><dt>Itens vendidos</dt><dd className="text-right text-white">{record.usageCount}</dd></div>
    </dl>
    <button type="button" disabled={disabled} onClick={onPreview} className="mt-4 inline-flex h-9 items-center gap-2 border border-cyan-300/30 px-3 text-xs font-semibold text-cyan-100 hover:bg-cyan-300/10 disabled:opacity-50">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitMerge className="h-4 w-4" />}Prévia usando este como o principal</button>
  </article>
}

export default function DataQualityCasesModal({ storeId, alert, onClose, onChanged }: Props) {
  const kind = useMemo(() => ({
    'duplicate-customers': 'duplicate-customers',
    'duplicate-products': 'duplicate-products',
    'used-products-without-cost': 'products-without-cost',
    'stale-open-sales': 'stale-open-sales',
  } as const)[alert.id], [alert.id])
  const [data, setData] = useState<QueueData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [costs, setCosts] = useState<Record<number, string>>({})
  const [mergePreviews, setMergePreviews] = useState<Record<string, MergePreview>>({})
  const [loadingPreview, setLoadingPreview] = useState<string | null>(null)
  const [confirmingMerge, setConfirmingMerge] = useState<string | null>(null)
  const [showMergeHistory, setShowMergeHistory] = useState(false)
  const [mergeHistory, setMergeHistory] = useState<MergeHistoryItem[]>([])
  const [loadingMergeHistory, setLoadingMergeHistory] = useState(false)
  const [confirmingUndo, setConfirmingUndo] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!kind) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ storeId: String(storeId), kind })
      if (alert.records.ids.length) params.set('ids', alert.records.ids.join(','))
      const response = await fetch(`/api/daily-health/data-quality-cases?${params}`, { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Nao foi possivel carregar a fila.')
      setData(payload)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Nao foi possivel carregar a fila.')
    } finally {
      setLoading(false)
    }
  }, [alert.records.ids, kind, storeId])

  useEffect(() => { void load() }, [load])

  const loadMergeHistory = useCallback(async () => {
    if (kind !== 'duplicate-customers' && kind !== 'duplicate-products') return
    setLoadingMergeHistory(true)
    setError(null)
    try {
      const params = new URLSearchParams({ storeId: String(storeId), kind, history: 'merges' })
      const response = await fetch(`/api/daily-health/data-quality-cases?${params}`, { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Nao foi possivel carregar as mesclagens recentes.')
      setMergeHistory(payload.merges || [])
    } catch (historyError) {
      setError(historyError instanceof Error ? historyError.message : 'Nao foi possivel carregar as mesclagens recentes.')
    } finally {
      setLoadingMergeHistory(false)
    }
  }, [kind, storeId])

  const toggleMergeHistory = async () => {
    const next = !showMergeHistory
    setShowMergeHistory(next)
    setConfirmingUndo(null)
    if (next) await loadMergeHistory()
  }

  const review = async (group: DuplicateGroup, decision: 'keep_separate' | 'defer') => {
    setSaving(`${group.fingerprint}:${decision}`)
    setError(null)
    try {
      const response = await fetch('/api/daily-health/data-quality-cases', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ action: 'review_duplicate', storeId, issueType: kind === 'duplicate-customers' ? 'duplicate_customer' : 'duplicate_product', fingerprint: group.fingerprint, recordIds: group.ids, decision }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Nao foi possivel salvar a decisao.')
      onChanged()
      await load()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Nao foi possivel salvar a decisao.')
    } finally {
      setSaving(null)
    }
  }

  const updateCost = async (productId: number) => {
    const cost = Number(String(costs[productId] || '').replace(',', '.'))
    if (!Number.isFinite(cost) || cost <= 0) { setError('Informe um custo maior que zero.'); return }
    setSaving(`cost:${productId}`)
    setError(null)
    try {
      const response = await fetch('/api/daily-health/data-quality-cases', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ action: 'update_product_cost', storeId, productId, cost }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Nao foi possivel salvar o custo.')
      onChanged()
      await load()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Nao foi possivel salvar o custo.')
    } finally {
      setSaving(null)
    }
  }

  const loadMergePreview = async (group: DuplicateGroup, targetId: number) => {
    if (kind !== 'duplicate-customers' && kind !== 'duplicate-products') return
    const previewKey = `${group.fingerprint}:${targetId}`
    setLoadingPreview(previewKey)
    setError(null)
    try {
      const params = new URLSearchParams({
        storeId: String(storeId), kind, preview: 'merge', fingerprint: group.fingerprint, targetId: String(targetId),
      })
      const response = await fetch(`/api/daily-health/data-quality-cases?${params}`, { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Nao foi possivel preparar a previa.')
      setMergePreviews((current) => ({ ...current, [group.fingerprint]: payload.preview }))
      setConfirmingMerge(null)
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : 'Nao foi possivel preparar a previa.')
    } finally {
      setLoadingPreview(null)
    }
  }

  const executeMerge = async (group: DuplicateGroup, preview: MergePreview) => {
    const savingKey = `${group.fingerprint}:merge`
    setSaving(savingKey)
    setError(null)
    try {
      const response = await fetch('/api/daily-health/data-quality-cases', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({
          action: 'execute_merge', storeId,
          issueType: kind === 'duplicate-customers' ? 'duplicate_customer' : 'duplicate_product',
          fingerprint: group.fingerprint, recordIds: group.ids, targetId: preview.targetId,
          operationKey: crypto.randomUUID(),
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Nao foi possivel concluir a mesclagem.')
      setConfirmingMerge(null)
      setMergePreviews((current) => {
        const next = { ...current }
        delete next[group.fingerprint]
        return next
      })
      setShowMergeHistory(true)
      await loadMergeHistory()
      onChanged()
      await load()
    } catch (mergeError) {
      setError(mergeError instanceof Error ? mergeError.message : 'Nao foi possivel concluir a mesclagem.')
    } finally {
      setSaving(null)
    }
  }

  const undoMerge = async (merge: MergeHistoryItem) => {
    setSaving(`undo:${merge.operationKey}`)
    setError(null)
    try {
      const response = await fetch('/api/daily-health/data-quality-cases', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ action: 'undo_merge', storeId, mergeOperationKey: merge.operationKey, undoOperationKey: crypto.randomUUID() }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Nao foi possivel desfazer a mesclagem.')
      setConfirmingUndo(null)
      await Promise.all([load(), loadMergeHistory()])
      onChanged()
    } catch (undoError) {
      setError(undoError instanceof Error ? undoError.message : 'Nao foi possivel desfazer a mesclagem.')
    } finally {
      setSaving(null)
    }
  }

  const duplicate = kind === 'duplicate-customers' || kind === 'duplicate-products'
  const title = kind === 'duplicate-customers' ? 'Revisar clientes parecidos' : kind === 'duplicate-products' ? 'Revisar produtos parecidos' : kind === 'products-without-cost' ? 'Informar custo dos produtos' : 'Vendas abertas ha mais de 7 dias'

  return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm" onClick={onClose}>
    <section className="max-h-[90vh] w-full max-w-6xl overflow-y-auto border border-white/10 bg-slate-950 p-5 shadow-2xl md:p-7" onClick={(event) => event.stopPropagation()}>
      <header className="flex items-start justify-between gap-4 border-b border-white/10 pb-4"><div><h2 className="text-xl font-black text-white">{title}</h2>{data ? <p className="mt-1 text-sm text-slate-400">{duplicate ? `${data.totalGroups || 0} grupos aguardam decisao; este lote traz ate 10.` : `${data.totalRecords} casos ainda aguardam revisao.`}</p> : null}</div><div className="flex items-center gap-2">{duplicate ? <button type="button" onClick={() => void toggleMergeHistory()} className={`inline-flex h-9 items-center gap-2 border px-3 text-xs font-semibold ${showMergeHistory ? 'border-cyan-300/40 bg-cyan-300/10 text-cyan-100' : 'border-white/10 text-slate-300 hover:bg-white/5 hover:text-white'}`}><History className="h-4 w-4" />Mesclagens recentes</button> : null}<button type="button" onClick={onClose} aria-label="Fechar" title="Fechar" className="inline-flex h-9 w-9 items-center justify-center border border-white/10 text-slate-300 hover:bg-white/5 hover:text-white"><X className="h-4 w-4" /></button></div></header>
      {loading ? <div className="flex min-h-48 items-center justify-center text-slate-400"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Carregando casos...</div> : null}
      {error ? <p className="mt-4 border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">{error}</p> : null}

      {showMergeHistory && duplicate ? <section className="mt-5 border border-white/10 bg-black/20 p-4" aria-label="Mesclagens recentes">
        <div className="flex items-center justify-between gap-3"><div><h3 className="font-bold text-white">Mesclagens recentes</h3><p className="mt-1 text-xs text-slate-400">O sistema só desfaz quando os cadastros e vínculos continuam como estavam ao final da mesclagem.</p></div>{loadingMergeHistory ? <Loader2 className="h-4 w-4 animate-spin text-cyan-200" /> : null}</div>
        {!loadingMergeHistory && !mergeHistory.length ? <p className="mt-4 text-sm text-slate-400">Nenhuma mesclagem foi realizada nesta fila.</p> : null}
        {!loadingMergeHistory && mergeHistory.length ? <div className="mt-4 space-y-3">{mergeHistory.map((merge) => <article key={merge.operationKey} className="border border-white/10 px-3 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-bold text-white">{merge.targetLabel || 'Cadastro principal'} <span className="font-normal text-slate-400">#{merge.targetId}</span></p><p className="mt-1 text-xs text-slate-400">Cadastros incorporados: {merge.removedIds.map((id) => `#${id}`).join(', ')} · {new Date(merge.createdAt).toLocaleString('pt-BR')}</p></div>{merge.reversed ? <span className="text-xs font-bold text-emerald-200">Mesclagem desfeita</span> : !merge.recoverable ? <span className="text-xs text-slate-500">Recuperação indisponível</span> : confirmingUndo === merge.operationKey ? null : <button type="button" disabled={saving !== null} onClick={() => setConfirmingUndo(merge.operationKey)} className="inline-flex h-9 items-center gap-2 border border-amber-300/40 px-3 text-xs font-semibold text-amber-100 hover:bg-amber-300/10 disabled:opacity-50"><RotateCcw className="h-4 w-4" />Desfazer</button>}</div>
          {confirmingUndo === merge.operationKey && !merge.reversed ? <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-white/10 pt-3"><p className="mr-auto max-w-2xl text-xs text-amber-100">Os cadastros separados e seus vínculos serão restaurados. Se houve qualquer alteração depois da mesclagem, a operação será bloqueada.</p><button type="button" disabled={saving !== null} onClick={() => setConfirmingUndo(null)} className="inline-flex h-9 items-center border border-white/15 px-3 text-xs font-semibold text-slate-200 hover:bg-white/5 disabled:opacity-50">Cancelar</button><button type="button" disabled={saving !== null} onClick={() => void undoMerge(merge)} className="inline-flex h-9 items-center gap-2 border border-amber-300/50 bg-amber-300/10 px-3 text-xs font-bold text-amber-100 hover:bg-amber-300/20 disabled:opacity-50">{saving === `undo:${merge.operationKey}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}Confirmar desfazer</button></div> : null}
        </article>)}</div> : null}
      </section> : null}

      {!loading && duplicate && data?.groups?.length ? <div className="mt-5 space-y-6">{data.groups.map((group, index) => {
        const preview = mergePreviews[group.fingerprint]
        return <section key={group.fingerprint} className="border-b border-white/10 pb-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-bold text-white">Caso {index + 1} de {data.groups?.length}</p><p className="border-l-2 border-amber-300 bg-amber-300/10 px-3 py-2 text-xs font-bold text-amber-100">Coincidência encontrada: <span className="text-amber-200">{group.reasons.map(reasonLabel).join(', ')}</span></p></div>
        <div className={`mt-3 grid gap-3 ${group.records.length === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3'}`}>{group.records.map((record) => {
          const previewKey = `${group.fingerprint}:${record.id}`
          const previewProps = { onPreview: () => void loadMergePreview(group, record.id), loading: loadingPreview === previewKey, disabled: loadingPreview !== null || saving !== null }
          return kind === 'duplicate-customers' ? <CustomerRecord key={record.id} record={record} {...previewProps} /> : <ProductRecord key={record.id} record={record} {...previewProps} />
        })}</div>
        {preview ? <section className="mt-4 border border-cyan-300/20 bg-cyan-300/5 p-4" aria-label="Prévia da mesclagem">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.12em] text-cyan-200">Cadastro principal</p><h4 className="mt-1 font-bold text-white">{preview.targetLabel} <span className="font-normal text-slate-400">#{preview.targetId}</span></h4></div><p className="text-sm font-semibold text-white">{preview.referencesToMove} vínculos seriam transferidos</p></div>
          {preview.dependencies.length ? <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{preview.dependencies.map((dependency) => <div key={`${dependency.table}:${dependency.label}`} className="border border-white/10 bg-black/20 px-3 py-2"><p className="text-xs text-slate-400">{dependency.table === 'dependentes' ? 'Dependentes vinculados' : dependency.label}</p><p className="mt-1 text-sm font-bold text-white">{dependencyDescription(dependency)}</p></div>)}</div> : <p className="mt-4 text-sm text-slate-300">Nenhum vínculo operacional precisa ser transferido.</p>}
          {preview.stockPlan ? <p className="mt-4 text-sm text-slate-200">Estoque previsto: <strong className="text-white">{preview.stockPlan.targetStock} + {preview.stockPlan.sourceStock} = {preview.stockPlan.resultingStock}</strong>.</p> : null}
          {preview.fieldComplements.length ? <div className="mt-4"><p className="text-xs font-bold uppercase tracking-[0.1em] text-emerald-200">Dados que podem completar o principal</p><p className="mt-2 text-sm text-slate-200">{preview.fieldComplements.map((item) => `${item.label}: ${item.value}`).join(' · ')}</p></div> : null}
          {preview.fieldConflicts.length ? <div className="mt-4"><p className="text-xs font-bold uppercase tracking-[0.1em] text-amber-200">Diferenças que exigem escolha</p><div className="mt-2 space-y-2">{preview.fieldConflicts.map((conflict) => <div key={conflict.field} className={`border-l-2 pl-3 text-sm ${conflict.severity === 'blocker' ? 'border-rose-400 text-rose-100' : 'border-amber-300 text-amber-100'}`}><strong>{conflict.label}:</strong> {conflict.values.map((item) => `#${item.id} ${item.value}`).join(' · ')}</div>)}</div></div> : null}
          <div className={`mt-4 flex items-start gap-3 border px-3 py-3 text-sm ${preview.blockers.length ? 'border-rose-400/30 bg-rose-400/10 text-rose-100' : 'border-emerald-300/30 bg-emerald-300/10 text-emerald-100'}`}><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /><div>{preview.blockers.length ? <><p className="font-bold">A mesclagem ainda precisa resolver:</p><p className="mt-1">{preview.blockers.join(' · ')}</p></> : <p><strong>Prévia consistente.</strong> Os vínculos podem ser transferidos para o cadastro principal em uma única operação.</p>}</div></div>
          {preview.executable && !preview.blockers.length ? <div className="mt-4 flex flex-wrap items-center justify-end gap-3 border-t border-white/10 pt-4">
            {confirmingMerge === group.fingerprint ? <><p className="mr-auto max-w-xl text-sm text-amber-100">Confirme somente se estes cadastros representam a mesma pessoa ou o mesmo produto. Os cadastros secundários serão removidos depois da transferência dos vínculos.</p><button type="button" disabled={saving !== null} onClick={() => setConfirmingMerge(null)} className="inline-flex h-10 items-center border border-white/15 px-4 text-sm font-semibold text-slate-200 hover:bg-white/5 disabled:opacity-50">Cancelar</button><button type="button" disabled={saving !== null} onClick={() => void executeMerge(group, preview)} className="inline-flex h-10 items-center gap-2 border border-rose-300/50 bg-rose-300/10 px-4 text-sm font-bold text-rose-100 hover:bg-rose-300/20 disabled:opacity-50">{saving === `${group.fingerprint}:merge` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}Confirmar mesclagem</button></> : <button type="button" disabled={saving !== null} onClick={() => setConfirmingMerge(group.fingerprint)} className="inline-flex h-10 items-center gap-2 border border-emerald-300/50 px-4 text-sm font-bold text-emerald-100 hover:bg-emerald-300/10 disabled:opacity-50"><GitMerge className="h-4 w-4" />Mesclar agora</button>}
          </div> : null}
        </section> : null}
        <div className="mt-4 flex flex-wrap justify-end gap-2"><button type="button" disabled={saving !== null} onClick={() => void review(group, 'defer')} className="inline-flex h-9 items-center gap-2 border border-white/15 px-3 text-xs font-semibold text-slate-200 hover:bg-white/5 disabled:opacity-50"><Clock3 className="h-4 w-4" />Revisar em 7 dias</button><button type="button" disabled={saving !== null} onClick={() => void review(group, 'keep_separate')} className="inline-flex h-9 items-center gap-2 border border-emerald-300/40 px-3 text-xs font-semibold text-emerald-100 hover:bg-emerald-300/10 disabled:opacity-50">{saving === `${group.fingerprint}:keep_separate` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Manter separados</button></div>
      </section>})}</div> : null}

      {!loading && kind === 'products-without-cost' && data?.cases?.length ? <div className="mt-5 grid gap-3 md:grid-cols-2">{data.cases.map((product) => <article key={product.id} className="border border-white/10 bg-black/20 p-4"><h3 className="font-bold text-white">{product.nome}</h3><p className="mt-1 text-xs text-slate-400">{[product.marca, product.referencia, product.tipo_produto].filter(Boolean).join(' · ')}</p><div className="mt-4 flex items-end gap-2"><label className="flex-1 text-xs font-semibold text-slate-300">Custo unitario<input type="text" inputMode="decimal" value={costs[product.id] || ''} onChange={(event) => setCosts((current) => ({ ...current, [product.id]: event.target.value }))} placeholder="0,00" className="mt-1 h-10 w-full border border-white/15 bg-black/30 px-3 text-sm text-white outline-none focus:border-emerald-300/60" /></label><button type="button" disabled={saving !== null} onClick={() => void updateCost(product.id)} className="inline-flex h-10 items-center gap-2 border border-emerald-300/40 px-3 text-xs font-semibold text-emerald-100 hover:bg-emerald-300/10 disabled:opacity-50">{saving === `cost:${product.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Salvar</button></div></article>)}</div> : null}

      {!loading && kind === 'stale-open-sales' && data?.cases?.length ? <div className="mt-5 space-y-3">{data.cases.map((sale) => <article key={sale.id} className="flex flex-wrap items-center justify-between gap-4 border border-white/10 bg-black/20 p-4"><div><h3 className="font-bold text-white">Venda #{sale.id} · {sale.customerName}</h3><p className="mt-1 text-sm text-slate-400">Aberta em {date(sale.createdAt)} · {money(sale.value)}{sale.employeeName ? ` · ${sale.employeeName}` : ''}</p></div><Link href={`/dashboard/loja/${storeId}/vendas/${sale.id}/experimental`} onClick={onClose} className="inline-flex h-9 items-center gap-2 border border-emerald-300/40 px-3 text-xs font-semibold text-emerald-100 hover:bg-emerald-300/10">Abrir venda<ExternalLink className="h-4 w-4" /></Link></article>)}</div> : null}

      {!loading && data && ((duplicate && !data.groups?.length) || (!duplicate && !data.cases?.length)) ? <div className="flex min-h-48 flex-col items-center justify-center text-center text-slate-300"><Check className="mb-3 h-6 w-6 text-emerald-200" /><p className="font-semibold">Este lote nao tem mais casos pendentes.</p><button type="button" onClick={onClose} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-emerald-200">Voltar aos pontos de atencao<ArrowRight className="h-4 w-4" /></button></div> : null}
    </section>
  </div>
}
