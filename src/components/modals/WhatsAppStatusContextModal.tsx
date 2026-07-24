'use client'

import { useEffect, useState, useTransition } from 'react'
import { CheckCircle2, Clock3, Image, Loader2, MessageCircle, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  contextualizeWhatsAppStatusPublication,
  getPendingWhatsAppStatusContexts,
  type PendingWhatsAppStatusContext,
} from '@/lib/actions/whatsapp-status.actions'

type Props = {
  isOpen: boolean
  storeId: number
  onClose: () => void
  onRemainingChange?: (count: number) => void
}

const categories = [
  { value: 'greeting', label: 'Bom dia / relacionamento' },
  { value: 'promotion', label: 'Promoção' },
  { value: 'frame', label: 'Armação' },
  { value: 'product', label: 'Produto ou novidade' },
  { value: 'notice', label: 'Aviso da loja' },
  { value: 'other', label: 'Outro' },
]

export default function WhatsAppStatusContextModal({
  isOpen,
  storeId,
  onClose,
  onRemainingChange,
}: Props) {
  const [items, setItems] = useState<PendingWhatsAppStatusContext[]>([])
  const [loading, setLoading] = useState(false)
  const [category, setCategory] = useState('frame')
  const [description, setDescription] = useState('')
  const [responseGuidance, setResponseGuidance] = useState('')
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(true)
  const [isSaving, startSaving] = useTransition()

  const current = items[0] || null

  useEffect(() => {
    if (!isOpen) return
    setLoading(true)
    getPendingWhatsAppStatusContexts(storeId)
      .then((result) => {
        setItems(result)
        onRemainingChange?.(result.length)
      })
      .catch((error) => {
        console.error(error)
        toast.error('Não foi possível carregar os Status detectados.')
      })
      .finally(() => setLoading(false))
  }, [isOpen, storeId])

  function resetForm() {
    setCategory('frame')
    setDescription('')
    setResponseGuidance('')
    setAutoReplyEnabled(true)
  }

  function handleSave() {
    if (!current || isSaving) return
    if (description.trim().length < 5) {
      toast.error('Explique brevemente o conteúdo e o objetivo da publicação.')
      return
    }

    startSaving(async () => {
      try {
        const result = await contextualizeWhatsAppStatusPublication({
          storeId,
          publicationId: current.id,
          category,
          description,
          responseGuidance,
          autoReplyEnabled,
        })
        if (!result.success) {
          toast.error(result.message)
          return
        }

        const remaining = items.slice(1)
        setItems(remaining)
        onRemainingChange?.(remaining.length)
        resetForm()
        toast.success(remaining.length ? 'Status salvo. Abrindo o próximo.' : 'Status contextualizado.')
        if (remaining.length === 0) onClose()
      } catch (error) {
        console.error(error)
        toast.error('Não foi possível salvar o contexto do Status.')
      }
    })
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-emerald-400/20 bg-slate-950 shadow-[0_30px_100px_rgba(0,0,0,0.7)]">
        <div className="flex items-center justify-between border-b border-white/10 bg-emerald-500/5 px-6 py-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-300">WhatsApp Status</p>
            <h2 className="mt-1 text-lg font-black text-white">Explique o objetivo da publicação</h2>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-slate-400 transition hover:bg-white/10 hover:text-white" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex h-80 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
          </div>
        ) : !current ? (
          <div className="flex h-80 flex-col items-center justify-center px-8 text-center">
            <CheckCircle2 className="mb-4 h-12 w-12 text-emerald-400" />
            <p className="font-bold text-white">Nenhum Status aguardando contexto.</p>
          </div>
        ) : (
          <div className="space-y-5 p-6">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between gap-3 text-xs text-slate-400">
                <span className="flex items-center gap-2 font-bold uppercase tracking-wider">
                  {current.media_kind ? <Image className="h-4 w-4 text-emerald-300" /> : <MessageCircle className="h-4 w-4 text-emerald-300" />}
                  {current.media_kind || 'Texto'}
                </span>
                <span className="flex items-center gap-1">
                  <Clock3 className="h-3.5 w-3.5" />
                  {new Date(current.published_at).toLocaleString('pt-BR')}
                </span>
              </div>
              <p className="mt-3 line-clamp-4 text-sm leading-relaxed text-slate-200">
                {current.message_text || 'Status sem legenda. Descreva abaixo o que aparece na publicação.'}
              </p>
              <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-amber-300">
                {items.length} {items.length === 1 ? 'Status aguardando contexto' : 'Status aguardando contexto'}
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400">Tipo de publicação</label>
              <select value={category} onChange={(event) => setCategory(event.target.value)} className="h-11 w-full rounded-xl border border-white/10 bg-slate-900 px-3 text-sm font-bold text-white outline-none focus:border-emerald-400/50">
                {categories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400">O que foi publicado e qual é o objetivo?</label>
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} maxLength={1200} placeholder="Ex.: Foto de uma armação feminina nova. O objetivo é convidar a cliente para experimentar na loja." className="w-full resize-none rounded-xl border border-white/10 bg-slate-900 p-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-emerald-400/50" />
            </div>

            <div>
              <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400">Como o sistema deve conduzir a conversa? <span className="text-slate-600">(opcional)</span></label>
              <textarea value={responseGuidance} onChange={(event) => setResponseGuidance(event.target.value)} rows={2} maxLength={800} placeholder="Ex.: Perguntar qual cor a cliente gostou e oferecer atendimento na loja." className="w-full resize-none rounded-xl border border-white/10 bg-slate-900 p-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-emerald-400/50" />
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
              <input type="checkbox" checked={autoReplyEnabled} onChange={(event) => setAutoReplyEnabled(event.target.checked)} className="mt-0.5 h-4 w-4 accent-emerald-500" />
              <span>
                <span className="block text-sm font-bold text-slate-200">Permitir resposta automática neste Status</span>
                <span className="block text-xs text-slate-500">Desmarcado, toda interação continuará indo para um funcionário.</span>
              </span>
            </label>

            <button onClick={handleSave} disabled={isSaving} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3.5 text-sm font-black uppercase tracking-wider text-white transition hover:bg-emerald-500 disabled:opacity-50">
              {isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
              {items.length > 1 ? 'Salvar e ir para o próximo' : 'Salvar contexto'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
