'use client'

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { ArrowUpRight, Loader2, MessageCircleQuestion, RotateCcw, Send, Sparkles, ThumbsDown, X } from 'lucide-react'
import { useModals } from '@/lib/contexts/ModalsContext'
import { USAGE_HISTORY_LIMIT, USAGE_QUESTION_LIMIT, type UsageDestination, type UsageMessage } from '@/lib/usage-assistant'

type Message = UsageMessage & { destinations?: UsageDestination[]; feedbackId?: string; question?: string; feedback?: 'sending' | 'sent' | 'error' }

function DestinationLink({ destination, children, onOpen }: {
  destination: UsageDestination; children: ReactNode; onOpen: (destination: UsageDestination) => void
}) {
  const className = 'inline rounded-sm font-semibold text-cyan-200 underline decoration-cyan-300/50 underline-offset-4 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300'
  return destination.kind === 'page'
    ? <Link href={destination.href} className={className} onClick={() => onOpen(destination)}>{children}</Link>
    : <button type="button" className={`${className} text-left`} onClick={() => onOpen(destination)}>{children}</button>
}

function AssistantAnswer({ message, onOpen }: { message: Message; onOpen: (destination: UsageDestination) => void }) {
  const destinations = new Map((message.destinations || []).map(item => [item.id, item]))
  const inlineIds = new Set<string>()
  const parts = message.content.split(/(\[[^\]\n]+\]\([a-z0-9-]+\)|\*\*[^*\n]+\*\*)/g)
  return <>
    <div className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-200">
      {parts.map((part, index) => {
        const link = part.match(/^\[([^\]\n]+)\]\(([a-z0-9-]+)\)$/)
        if (link) {
          const destination = destinations.get(link[2])
          if (!destination) return <span key={index}>{link[1]}</span>
          inlineIds.add(link[2])
          return <DestinationLink key={index} destination={destination} onOpen={onOpen}>{link[1]}</DestinationLink>
        }
        return part.startsWith('**') && part.endsWith('**')
          ? <strong key={index} className="font-bold text-white">{part.slice(2, -2)}</strong>
          : <span key={index}>{part}</span>
      })}
    </div>
    {[...destinations.values()].some(item => !inlineIds.has(item.id)) && <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-white/10 pt-3 text-xs">
      {[...destinations.values()].filter(item => !inlineIds.has(item.id)).map(item => <DestinationLink key={item.id} destination={item} onOpen={onOpen}>
        {item.label} <ArrowUpRight className="inline h-3 w-3" aria-hidden="true" />
      </DestinationLink>)}
    </div>}
  </>
}

function UsageAssistantDialog({ storeId, storeName, onClose }: { storeId: number; storeName: string; onClose: () => void }) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const requestRef = useRef<AbortController | null>(null)
  const busyRef = useRef(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [pendingQuestion, setPendingQuestion] = useState('')
  const [error, setError] = useState('')
  const loading = Boolean(pendingQuestion)
  const { openParcelaModal, openCustomerHistoryModal } = useModals()

  useEffect(() => {
    const dialog = dialogRef.current
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog?.showModal()
    inputRef.current?.focus()
    return () => {
      requestRef.current?.abort()
      dialog?.close()
      document.body.style.overflow = previousOverflow
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'auto' })
    if (!loading) inputRef.current?.focus()
  }, [messages, loading, error])

  const openDestination = (destination: UsageDestination) => {
    onClose()
    if (destination.kind === 'action') {
      if (destination.action === 'installments') openParcelaModal()
      if (destination.action === 'customer-info') openCustomerHistoryModal()
    }
  }

  const send = async (question: string) => {
    const message = question.trim()
    if (!message || message.length > USAGE_QUESTION_LIMIT || busyRef.current) return
    busyRef.current = true
    setError('')
    setInput('')
    setPendingQuestion(message)
    const controller = new AbortController()
    requestRef.current = controller
    try {
      const response = await fetch('/api/usage-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          storeId,
          message,
          history: messages.slice(-USAGE_HISTORY_LIMIT).map(item => ({ role: item.role, content: item.content })),
        }),
      })
      const result = await response.json()
      if (!response.ok || typeof result.answer !== 'string' || !Array.isArray(result.destinations)) {
        throw new Error(typeof result.error === 'string' ? result.error : 'Não consegui responder agora. Tente novamente.')
      }
      if (!controller.signal.aborted) {
        setMessages(previous => [...previous, { role: 'user', content: message }, {
          role: 'assistant', content: result.answer, destinations: result.destinations, question: message, feedbackId: crypto.randomUUID(),
        }])
      }
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'Não consegui conectar com a IA. Tente novamente.')
        setInput(message)
      }
    } finally {
      busyRef.current = false
      if (!controller.signal.aborted) setPendingQuestion('')
    }
  }

  const submit = (event: FormEvent) => { event.preventDefault(); void send(input) }
  const reportAnswer = async (message: Message) => {
    if (!message.feedbackId || !message.question || message.feedback === 'sending' || message.feedback === 'sent') return
    const feedbackId = message.feedbackId
    const update = (feedback: Message['feedback']) => setMessages(previous => previous.map(item => item.feedbackId === feedbackId ? { ...item, feedback } : item))
    update('sending')
    try {
      const response = await fetch('/api/usage-assistant/feedback', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: feedbackId, storeId, question: message.question, answer: message.content }),
      })
      if (!response.ok) throw new Error('feedback_failed')
      update('sent')
    } catch { update('error') }
  }
  const suggestions = [
    'Como faço uma venda de óculos?',
    'Como receber uma entrada depois de gerar o carnê?',
    'Como acompanho os óculos no laboratório?',
  ]

  return createPortal(<dialog
    ref={dialogRef}
    aria-labelledby={titleId}
    className="m-auto max-h-none overflow-hidden rounded-2xl border border-cyan-200/15 bg-slate-950 p-0 text-left text-white shadow-2xl shadow-black/60 backdrop:bg-slate-950/80 backdrop:backdrop-blur-sm"
    style={{ width: 'min(44rem, calc(100vw - 1.5rem))', height: 'min(760px, calc(100dvh - 1.5rem))' }}
    onCancel={event => { event.preventDefault(); onClose() }}
    onClick={event => { if (event.target === event.currentTarget) onClose() }}
  >
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-white/10 bg-gradient-to-r from-cyan-950/80 to-slate-900 px-4 py-4 sm:px-6">
        <div className="rounded-xl border border-cyan-300/20 bg-cyan-300/10 p-2.5 text-cyan-200"><Sparkles className="h-5 w-5" aria-hidden="true" /></div>
        <div className="min-w-0 flex-1"><h2 id={titleId} className="text-base font-bold">Pergunte pra IA</h2><p className="truncate text-xs text-slate-400">Ajuda para usar o sistema · {storeName}</p></div>
        <button type="button" disabled={loading} title="Nova conversa" aria-label="Iniciar nova conversa" onClick={() => { setMessages([]); setInput(''); setError(''); inputRef.current?.focus() }} className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-30"><RotateCcw className="h-4 w-4" /></button>
        <button type="button" onClick={onClose} title="Fechar conversa" aria-label="Fechar conversa" className="rounded-lg p-2 text-slate-300 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"><X className="h-5 w-5" /></button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
        {messages.length === 0 && !loading && <div className="mx-auto flex max-w-lg flex-col items-center py-5 text-center sm:py-10">
          <MessageCircleQuestion className="mb-4 h-10 w-10 text-cyan-300/80" strokeWidth={1.4} aria-hidden="true" />
          <h3 className="text-xl font-bold">Qual é a sua dúvida?</h3>
          <p className="mt-2 text-sm leading-6 text-slate-400">Pergunte como usar uma função. Vou consultar a base de conhecimento e indicar o caminho para você.</p>
          <div className="mt-6 grid w-full gap-2">{suggestions.map(question => <button key={question} type="button" onClick={() => void send(question)} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left text-sm text-slate-300 transition hover:border-cyan-300/30 hover:bg-cyan-400/5 hover:text-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">{question}<ArrowUpRight className="ml-2 inline h-3.5 w-3.5 text-cyan-300/70" aria-hidden="true" /></button>)}</div>
        </div>}
        <div className="space-y-5" role="log" aria-label="Conversa com a assistente" aria-live="polite" aria-relevant="additions text">
          {messages.map((message, index) => <div key={index} className={message.role === 'user' ? 'ml-auto max-w-[90%] rounded-2xl rounded-tr-sm border border-cyan-300/15 bg-cyan-900/30 px-4 py-3' : 'rounded-2xl rounded-tl-sm border border-white/10 bg-slate-900/70 px-4 py-4'}>
            <p className={`mb-2 text-[10px] font-bold uppercase tracking-wider ${message.role === 'user' ? 'text-cyan-300' : 'text-slate-400'}`}>{message.role === 'user' ? 'Você' : 'Assistente de uso'}</p>
            {message.role === 'assistant' ? <>
              <AssistantAnswer message={message} onOpen={openDestination} />
              <div className="mt-4 border-t border-white/10 pt-3">
                {message.feedback === 'sent' ? <p role="status" className="text-xs text-emerald-300">Obrigado pelo seu feedback! Vamos trabalhar para melhorar sua experiência.</p> : <>
                  <button type="button" disabled={message.feedback === 'sending'} onClick={() => void reportAnswer(message)} className="inline-flex items-center gap-2 text-left text-xs text-slate-400 hover:text-rose-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-50">
                    {message.feedback === 'sending' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <ThumbsDown className="h-3.5 w-3.5" aria-hidden="true" />}
                    Resposta ruim: não ajudou ou está errada
                  </button>
                  {message.feedback === 'error' && <p role="alert" className="mt-2 text-xs text-amber-300">Não foi possível registrar. Clique novamente para tentar.</p>}
                </>}
              </div>
            </> : <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-100">{message.content}</p>}
          </div>)}
          {loading && <>
            <div className="ml-auto max-w-[90%] rounded-2xl rounded-tr-sm border border-cyan-300/15 bg-cyan-900/30 px-4 py-3"><p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-cyan-300">Você</p><p className="whitespace-pre-wrap break-words text-sm leading-6">{pendingQuestion}</p></div>
            <div role="status" className="flex items-center gap-2 px-1 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin text-cyan-300" aria-hidden="true" />Consultando a base de conhecimento…</div>
          </>}
        </div>
        {error && <p role="alert" className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/5 px-4 py-3 text-sm leading-6 text-amber-100">{error}</p>}
        <div ref={endRef} />
      </div>

      <form onSubmit={submit} className="shrink-0 border-t border-white/10 bg-slate-900/80 px-4 pb-4 pt-3 sm:px-6">
        <div className="flex items-end gap-2 rounded-xl border border-white/15 bg-slate-950 p-2 focus-within:border-cyan-300/40">
          <textarea ref={inputRef} value={input} maxLength={USAGE_QUESTION_LIMIT} rows={2} disabled={loading} aria-label="Sua dúvida sobre o sistema" placeholder="Escreva sua dúvida…" onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(input) } }} className="max-h-32 min-h-12 flex-1 resize-none bg-transparent px-2 py-1 text-sm leading-6 text-white outline-none placeholder:text-slate-500 disabled:opacity-50" />
          <button type="submit" disabled={loading || !input.trim()} aria-label="Enviar pergunta" className="rounded-lg bg-cyan-400 p-3 text-slate-950 transition hover:bg-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button>
        </div>
        <p className="mt-2 text-center text-[11px] leading-4 text-slate-500">Você pode continuar o assunto. A conversa termina ao fechar esta janela.</p>
      </form>
    </div>
  </dialog>, document.body)
}

export default function UsageAssistant({ storeId, storeName }: { storeId: number; storeName: string }) {
  const [open, setOpen] = useState(false)
  return <div className="mt-3">
    <button type="button" onClick={() => setOpen(true)} className="inline-flex max-w-sm items-center justify-center gap-2 rounded-xl border border-cyan-300/15 bg-slate-950/40 px-4 py-2.5 text-xs font-medium leading-5 text-cyan-100/80 backdrop-blur-sm transition hover:border-cyan-300/40 hover:bg-cyan-400/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300" aria-haspopup="dialog">
      <Sparkles className="h-4 w-4 shrink-0 text-cyan-300" aria-hidden="true" /><span>Não sabe como usar alguma função? <strong className="font-bold text-cyan-200">Pergunte pra IA</strong></span>
    </button>
    {open && <UsageAssistantDialog key={storeId} storeId={storeId} storeName={storeName} onClose={() => setOpen(false)} />}
  </div>
}
