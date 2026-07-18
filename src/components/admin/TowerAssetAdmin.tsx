'use client'

import Link from 'next/link'
import { QRCodeSVG } from 'qrcode.react'
import { Boxes, Check, Copy, Loader2, PackageCheck, Printer, RefreshCw, Search, Store, Wrench } from 'lucide-react'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  createTowerAssetBatch,
  issueTowerAssetEnrollment,
  markTowerAssetBatchPrinted,
  prepareTowerAssetAssociation,
  setTowerAssetLifecycleStatus,
  type TowerAssetAdminData,
  type TowerAssetAssociationCredential,
  type TowerAssetEnrollmentCredential,
  type TowerAssetStatus,
} from '@/lib/actions/tower-assets.actions'

type Props = { initialData: TowerAssetAdminData }

const statusLabel: Record<TowerAssetStatus, string> = {
  generated: 'Código gerado', printed: 'Etiqueta impressa', prepared: 'Electron preparado',
  in_stock: 'Em estoque', assigned: 'Instalada', maintenance: 'Em manutenção', retired: 'Aposentada',
}

export default function TowerAssetAdmin({ initialData }: Props) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [message, setMessage] = useState('')
  const [enrollment, setEnrollment] = useState<TowerAssetEnrollmentCredential | null>(null)
  const [association, setAssociation] = useState<TowerAssetAssociationCredential | null>(null)
  const [copied, setCopied] = useState('')
  const [busy, startTransition] = useTransition()
  const visibleAssets = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const filtered = normalized
      ? initialData.assets.filter((asset) => `${asset.publicCode} ${asset.batchCode} ${asset.currentStoreName || ''} ${statusLabel[asset.status]}`.toLowerCase().includes(normalized))
              : initialData.assets
    return filtered.slice(0, 150)
  }, [initialData.assets, query])

  const copy = async (key: string, value: string) => {
    await navigator.clipboard.writeText(value)
    setCopied(key)
    window.setTimeout(() => setCopied(''), 1600)
  }

  const createBatch = (formData: FormData) => startTransition(async () => {
    const result = await createTowerAssetBatch({
      batchName: String(formData.get('batchName') || ''),
      quantity: Number(formData.get('quantity') || 0),
      year: Number(formData.get('year') || new Date().getFullYear()),
    })
    setMessage(result.message)
    if (result.success) router.refresh()
  })

  const markPrinted = (batchId: string) => startTransition(async () => {
    const result = await markTowerAssetBatchPrinted(batchId)
    setMessage(result.message)
    if (result.success) router.refresh()
  })

  const prepareEnrollment = (assetId: string) => startTransition(async () => {
    const result = await issueTowerAssetEnrollment(assetId)
    setMessage(result.message)
    if (result.enrollment) { setEnrollment(result.enrollment); setAssociation(null) }
  })

  const associate = (assetId: string, formData: FormData) => startTransition(async () => {
    const selectedAsset = initialData.assets.find((asset) => asset.id === assetId)
    if (selectedAsset?.status === 'assigned' && !window.confirm(
      `A nova associação revogará imediatamente o vínculo atual de ${selectedAsset.publicCode}. Continuar?`,
    )) return
    const result = await prepareTowerAssetAssociation({ assetId, storeId: Number(formData.get('storeId')), validForHours: Number(formData.get('validForHours') || 168) })
    setMessage(result.message)
    if (result.association) { setAssociation(result.association); setEnrollment(null) }
    if (result.success) router.refresh()
  })

  const changeStatus = (assetId: string, status: 'in_stock' | 'maintenance' | 'retired') => startTransition(async () => {
    if (status === 'retired' && !window.confirm('Aposentar esta Torre e revogar sua identidade local?')) return
    const result = await setTowerAssetLifecycleStatus(assetId, status)
    setMessage(result.message)
    if (result.success) router.refresh()
  })

  return <div className="space-y-7">
    {message && <div className="rounded-xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm font-bold text-amber-100">{message}</div>}
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Object.entries({ Total: initialData.assets.length, Preparadas: initialData.assets.filter((a) => ['prepared', 'in_stock'].includes(a.status)).length, Instaladas: initialData.assets.filter((a) => a.status === 'assigned').length, Manutenção: initialData.assets.filter((a) => a.status === 'maintenance').length }).map(([label, value]) => <div key={label} className="rounded-2xl border border-white/10 bg-slate-900/70 p-5"><p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 text-3xl font-black">{value}</p></div>)}</section>

    <section className="rounded-3xl border border-cyan-300/15 bg-cyan-300/[.05] p-6 sm:p-8"><div className="flex items-center gap-3"><Boxes className="h-6 w-6 text-cyan-300" /><div><h2 className="text-xl font-black">Gerar lote de etiquetas</h2><p className="mt-1 text-sm text-slate-400">Cria identidades sequenciais públicas e uma página pronta para imprimir ou salvar em PDF.</p></div></div><form action={createBatch} className="mt-6 grid gap-4 sm:grid-cols-[1fr_130px_130px_auto]"><input name="batchName" required placeholder="Ex.: Primeiro lote comercial" className="h-12 rounded-xl border border-white/10 bg-slate-950 px-4 text-sm font-bold" /><input name="quantity" type="number" min="1" max="1000" defaultValue="100" className="h-12 rounded-xl border border-white/10 bg-slate-950 px-4 text-sm font-bold" /><input name="year" type="number" min="2020" max="2200" defaultValue={new Date().getFullYear()} className="h-12 rounded-xl border border-white/10 bg-slate-950 px-4 text-sm font-bold" /><button disabled={busy} className="h-12 rounded-xl bg-cyan-300 px-5 text-sm font-black text-slate-950 disabled:opacity-40">{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Gerar lote'}</button></form></section>

    <section className="rounded-3xl border border-white/10 bg-slate-900/70 p-6"><h2 className="text-xl font-black">Lotes</h2><div className="mt-5 grid gap-3 lg:grid-cols-2">{initialData.batches.map((batch) => <article key={batch.id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-black">{batch.batchName}</p><p className="mt-1 font-mono text-xs text-slate-500">{batch.batchCode} · {batch.quantity} etiquetas</p></div><span className="rounded-full bg-white/5 px-3 py-1 text-xs font-bold text-slate-300">{batch.status === 'generated' ? 'Gerado' : batch.status === 'printed' ? 'Impresso' : 'Fechado'}</span></div><div className="mt-4 flex flex-wrap gap-2"><Link href={`/admin/torres/equipamentos/lotes/${batch.id}/etiquetas`} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 px-3 text-xs font-black hover:bg-white/5"><Printer className="h-4 w-4" />Abrir etiquetas</Link>{batch.status === 'generated' && <button type="button" disabled={busy} onClick={() => markPrinted(batch.id)} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-300 px-3 text-xs font-black text-emerald-950"><PackageCheck className="h-4 w-4" />Marcar impressas</button>}</div></article>)}</div></section>

    {(enrollment || association) && <section className="rounded-3xl border border-amber-300/25 bg-slate-900 p-6 sm:p-8"><div className="grid gap-6 lg:grid-cols-[260px_1fr]"><div className="rounded-3xl bg-white p-4"><QRCodeSVG value={(enrollment || association)!.qrPayload} size={240} level="H" marginSize={1} className="h-auto w-full" /></div><div><p className="text-xs font-black uppercase tracking-[.16em] text-amber-300">{enrollment ? 'Registro do Electron' : 'Associação com a loja'}</p><h2 className="mt-2 text-2xl font-black">{(enrollment || association)!.publicCode}</h2>{association && <p className="mt-2 text-sm text-slate-300">Loja: {association.storeName}</p>}<Credential label="Código alternativo" value={(enrollment || association)!.fallbackCode} copied={copied === 'fallback'} onCopy={() => copy('fallback', (enrollment || association)!.fallbackCode)} />{association && <Credential label="PIN provisório da manutenção" value={association.adminPin} copied={copied === 'pin'} onCopy={() => copy('pin', association.adminPin)} />}<p className="mt-4 text-xs leading-5 text-slate-500">O QR e o código são temporários. A etiqueta permanente contém somente {enrollment ? enrollment.publicCode : association?.publicCode}.</p></div></div></section>}

    <section className="rounded-3xl border border-white/10 bg-slate-900/70 p-6"><div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-xl font-black">Torres físicas</h2><p className="mt-1 text-sm text-slate-500">Mostrando até 150 resultados por pesquisa.</p></div><div className="flex gap-2"><button type="button" onClick={() => router.refresh()} className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/10 px-3 text-xs font-black"><RefreshCw className="h-4 w-4" />Atualizar status</button><label className="flex h-11 min-w-64 items-center gap-2 rounded-xl border border-white/10 bg-slate-950 px-3"><Search className="h-4 w-4 text-slate-500" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Código, lote, loja ou status" className="w-full bg-transparent text-sm outline-none" /></label></div></div><div className="mt-5 space-y-3">{visibleAssets.map((asset) => <article key={asset.id} className="rounded-2xl border border-white/10 bg-slate-950/35 p-4"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="font-mono text-lg font-black text-cyan-200">{asset.publicCode}</p><p className="mt-1 text-xs text-slate-500">{asset.batchCode} · {statusLabel[asset.status]}</p>{asset.currentStoreName && <p className="mt-2 flex items-center gap-2 text-sm font-bold text-emerald-200"><Store className="h-4 w-4" />{asset.currentStoreName}</p>}</div><div className="flex flex-wrap gap-2">{!['assigned', 'retired'].includes(asset.status) && <button type="button" disabled={busy} onClick={() => prepareEnrollment(asset.id)} className="min-h-10 rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-3 text-xs font-black text-cyan-100">{asset.enrolledAt ? 'Reinstalar Electron' : 'Preparar Electron'}</button>}{['prepared', 'maintenance'].includes(asset.status) && <button type="button" disabled={busy} onClick={() => changeStatus(asset.id, 'in_stock')} className="min-h-10 rounded-xl border border-white/10 px-3 text-xs font-black">Em estoque</button>}{asset.status === 'assigned' && <button type="button" disabled={busy} onClick={() => changeStatus(asset.id, 'maintenance')} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-amber-300/20 px-3 text-xs font-black text-amber-100"><Wrench className="h-4 w-4" />Recolher</button>}{asset.status !== 'retired' && <button type="button" disabled={busy} onClick={() => changeStatus(asset.id, 'retired')} className="min-h-10 rounded-xl border border-rose-300/15 px-3 text-xs font-black text-rose-200">Aposentar</button>}</div></div>{['prepared', 'in_stock', 'maintenance', 'assigned'].includes(asset.status) && <form action={(formData) => associate(asset.id, formData)} className="mt-4 flex flex-wrap items-end gap-3 border-t border-white/5 pt-4"><label className="text-[10px] font-black uppercase tracking-wide text-slate-500">Associar à loja<select name="storeId" required defaultValue="" className="mt-1 block h-10 min-w-64 rounded-xl border border-white/10 bg-slate-950 px-3 text-xs text-white"><option value="" disabled>Selecione a loja</option>{initialData.stores.map((store) => <option key={store.id} value={store.id}>{store.name} · {store.tenantName}</option>)}</select></label><label className="text-[10px] font-black uppercase tracking-wide text-slate-500">Validade<select name="validForHours" defaultValue="168" className="mt-1 block h-10 rounded-xl border border-white/10 bg-slate-950 px-3 text-xs text-white"><option value="24">24 h</option><option value="168">7 dias</option><option value="720">30 dias</option></select></label><button disabled={busy} className="h-10 rounded-xl bg-amber-300 px-4 text-xs font-black text-slate-950">Gerar associação</button></form>}</article>)}</div></section>
  </div>
}

function Credential({ label, value, copied, onCopy }: { label: string; value: string; copied: boolean; onCopy(): void }) {
  return <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/50 p-4"><p className="text-[10px] font-black uppercase tracking-[.14em] text-slate-400">{label}</p><div className="mt-2 flex items-center justify-between gap-3"><code className="text-xl font-black tracking-[.14em]">{value}</code><button type="button" onClick={onCopy} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold">{copied ? <Check className="mr-1 inline h-4 w-4 text-emerald-300" /> : <Copy className="mr-1 inline h-4 w-4" />}{copied ? 'Copiado' : 'Copiar'}</button></div></div>
}
