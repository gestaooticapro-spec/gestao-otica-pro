'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import {
  AlertTriangle,
  Bot,
  Database,
  Loader2,
  MessageCircle,
  Phone,
  RefreshCw,
  Search,
  User,
  Wallet,
  Wifi,
  X,
} from 'lucide-react'
import { useModals } from '@/lib/contexts/ModalsContext'
import {
  getWhatsAppOperatorThreadDetail,
  getWhatsAppOperatorThreads,
  getWhatsAppRetentionPreview,
  runWhatsAppRetentionCleanup,
  sendWhatsAppOperatorMessage,
  setWhatsAppCustomerControl,
  simulateWhatsAppOperatorMessage,
  type CustomerStatusSimulationResponse,
  type WhatsAppCustomerControlMode,
  type WhatsAppRetentionPreview,
  type WhatsAppOperatorTechnicalSummary,
  type WhatsAppOperatorThreadDetail,
  type WhatsAppOperatorThreadListItem,
  type WhatsAppOperatorThreadMessage,
} from '@/lib/actions/whatsapp-operator.actions'

function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 13 && digits.startsWith('55')) {
    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`
  }
  return phone
}

function formatDateTime(value: string | null) {
  if (!value) return '-'
  return new Date(value).toLocaleString('pt-BR')
}

function formatDateOnly(value: string | null) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('pt-BR', { timeZone: 'UTC' })
}

function formatCurrency(value: number | null) {
  if (typeof value !== 'number') return '-'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function controlModeLabel(mode: WhatsAppCustomerControlMode) {
  if (mode === 'force_ai') return 'IA proxima'
  if (mode === 'force_human') return 'Humano'
  return 'Automatico'
}

function controlModeTitle(mode: WhatsAppCustomerControlMode) {
  if (mode === 'force_ai') return 'IA atende a proxima mensagem real e depois volta para automatico.'
  if (mode === 'force_human') return 'Atendimento humano persistente ate alguem voltar para automatico.'
  return 'Motor automatico segue as regras normais.'
}

function readableDecisionValue(value: string | null) {
  if (!value) return '-'
  return value.replace(/_/g, ' ')
}

function formatRelativeMinutes(value: string | null) {
  if (!value) return null
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000))
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  return `${hours}h`
}

function ThreadStateBadge({ thread }: { thread: WhatsAppOperatorThreadListItem }) {
  if (thread.hasPendingHandoff) {
    return (
      <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-200">
        Pendente
      </span>
    )
  }

  if (thread.currentState === 'silent') {
    return (
      <span className="rounded-full border border-slate-600/40 bg-slate-700/30 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-300">
        Silencio
      </span>
    )
  }

  if (thread.currentState === 'waiting_identifier') {
    return (
      <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-cyan-200">
        Aguardando dado
      </span>
    )
  }

  if (thread.currentState === 'waiting_menu') {
    return (
      <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-indigo-200">
        Menu
      </span>
    )
  }

  return (
    <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-200">
      Auto
    </span>
  )
}

function MessageBubble({ message }: { message: WhatsAppOperatorThreadMessage }) {
  const isInbound = message.direction === 'inbound'
  const actorLabel = message.actor === 'operator' ? 'Operador' : message.actor === 'system' ? 'Sistema' : 'Cliente'

  return (
    <div className={`flex ${isInbound ? 'justify-start' : 'justify-end'}`}>
      <div
        className={`max-w-[88%] rounded-2xl border px-4 py-3 shadow-lg ${
          message.actor === 'operator'
            ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-50'
            : message.actor === 'system'
              ? 'border-emerald-500/20 bg-emerald-500/10 text-slate-100'
              : 'border-white/10 bg-white/5 text-slate-100'
        }`}
      >
        <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-wider">
          <span className="text-white/80">{actorLabel}</span>
          {message.messageType ? <span className="text-white/40">{message.messageType}</span> : null}
          <span className="text-white/40">{formatDateTime(message.createdAt)}</span>
        </div>

        <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.text || '[sem texto]'}</p>

        {message.technicalLog ? (
          <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-[11px] text-slate-300">
            <div className="flex flex-wrap gap-3">
              <span>intent: {message.technicalLog.intent || '-'}</span>
              <span>conf: {message.technicalLog.confidence?.toFixed(2) || '-'}</span>
              <span>provider: {message.technicalLog.provider || '-'}</span>
              <span>model: {message.technicalLog.model || '-'}</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-3 text-slate-400">
              <span>in: {message.technicalLog.inputTokens ?? '-'}</span>
              <span>out: {message.technicalLog.outputTokens ?? '-'}</span>
              <span>total: {message.technicalLog.totalTokens ?? '-'}</span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

type SimulationEntry = {
  id: string
  phone: string
  messageText: string
  result: CustomerStatusSimulationResponse
  createdAt: string
}

function SimulationBubble({ entry }: { entry: SimulationEntry }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[88%] rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-amber-50 shadow-lg">
        <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-amber-200/80">
          <span>Simulacao</span>
          <span>{formatDateTime(entry.createdAt)}</span>
        </div>
        <p className="text-sm leading-relaxed text-white/90">{entry.messageText}</p>
        <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-[11px] text-slate-200">
          <div className="flex flex-wrap gap-3">
            <span>acao: {entry.result.debug.action}</span>
            <span>route: {entry.result.debug.postClassificationRoute || entry.result.debug.preAiRoute || '-'}</span>
            <span>override: {entry.result.debug.overrideMode}</span>
          </div>
          <div className="mt-2 text-slate-300">
            resposta: <span className="text-white">{entry.result.replyText || '[sem resposta automatica]'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function TechnicalPanel({
  summary,
  onOpenInstallments,
}: {
  summary: WhatsAppOperatorTechnicalSummary | null
  onOpenInstallments: (query: string) => void
}) {
  if (!summary) {
    return (
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-slate-400">
        Selecione uma thread para ver o contexto tecnico.
      </div>
    )
  }

  const installmentHint = summary.paymentInstallmentHint
  const operationalDecision = summary.operationalDecision

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Ultima decisao</p>
        <div className="mt-3 grid gap-2 text-sm text-slate-300">
          <div>rota: <span className="font-bold text-white">{readableDecisionValue(operationalDecision.route)}</span></div>
          <div>acao: <span className="font-bold text-white">{readableDecisionValue(summary.latestAction)}</span></div>
          <div>motivo: <span className="font-bold text-white">{readableDecisionValue(operationalDecision.reason)}</span></div>
          <div>state: <span className="font-bold text-white">{readableDecisionValue(summary.conversationState)}</span></div>
          <div>outbound: <span className="font-bold text-white">{readableDecisionValue(summary.latestOutboundType)}</span></div>
        </div>

        {(operationalDecision.silenceReason || operationalDecision.handoffReason) ? (
          <div className="mt-3 grid gap-2">
            {operationalDecision.silenceReason ? (
              <div className="rounded-xl border border-slate-500/20 bg-slate-500/10 p-3 text-xs text-slate-200">
                <span className="font-black uppercase tracking-wider text-slate-400">Silencio</span>
                <p className="mt-1">{readableDecisionValue(operationalDecision.silenceReason)}</p>
              </div>
            ) : null}
            {operationalDecision.handoffReason ? (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-100">
                <span className="font-black uppercase tracking-wider text-amber-300">Handoff</span>
                <p className="mt-1">{readableDecisionValue(operationalDecision.handoffReason)}</p>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-3 rounded-xl border border-white/5 bg-white/[0.03] p-3 text-xs text-slate-300">
          <div>intent: <span className="font-bold text-white">{readableDecisionValue(summary.latestIntent)}</span></div>
          <div className="mt-1">confidence: <span className="font-bold text-white">{summary.latestConfidence?.toFixed(2) || '-'}</span></div>
          <div className="mt-1">attachment: <span className="font-bold text-white">{summary.latestInboundHasAttachment ? summary.latestInboundAttachmentKind || 'sim' : 'nao'}</span></div>
        </div>
      </div>

      {installmentHint ? (
        <div className="rounded-2xl border border-orange-500/25 bg-orange-500/10 p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl border border-orange-400/30 bg-orange-400/15 p-2 text-orange-200">
              <Wallet className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-300/80">Parcelas</p>
              <p className="mt-2 text-sm font-bold text-orange-50">
                {installmentHint.customerName || 'Cliente com parcela encontrada'}
              </p>
              {installmentHint.exactMatch ? (
                <p className="mt-2 inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-400/15 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-200">
                  Parcela exata encontrada
                </p>
              ) : null}
              <div className="mt-2 grid gap-1 text-xs text-orange-100/80">
                <span>{installmentHint.count} parcela(s) em aberto</span>
                <span>vencimento: {formatDateOnly(installmentHint.dueDate)}</span>
                <span>valor: {formatCurrency(installmentHint.amount)}</span>
              </div>
              <button
                type="button"
                onClick={() => onOpenInstallments(installmentHint.searchQuery || installmentHint.customerName || '')}
                className="mt-3 inline-flex items-center justify-center gap-2 rounded-xl bg-orange-400 px-3 py-2 text-xs font-black uppercase tracking-wider text-orange-950 transition hover:bg-orange-300"
              >
                <Wallet className="h-3.5 w-3.5" />
                {installmentHint.exactMatch ? 'Abrir baixa manual' : 'Abrir parcelas'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300/80">Memoria da sessao IA</p>
        <div className="mt-3 grid gap-2 text-sm text-cyan-50">
          <div>itens: <span className="font-bold">{summary.aiSessionHistory.length}</span></div>
          <div>ultima atualizacao: <span className="font-bold">{formatDateTime(summary.aiSessionUpdatedAt)}</span></div>
          <div>encerrada em: <span className="font-bold">{formatDateTime(summary.aiSessionEndedAt)}</span></div>
        </div>

        {summary.aiSessionHistory.length > 0 ? (
          <div className="mt-3 space-y-2 rounded-xl border border-cyan-500/20 bg-slate-950/60 p-3">
            {summary.aiSessionHistory.map((entry, index) => (
              <div
                key={`${entry.at}-${index}`}
                className="rounded-xl border border-white/5 bg-white/[0.03] p-3 text-[11px] leading-relaxed text-slate-200"
              >
                <div className="mb-1 flex items-center justify-between gap-3 text-[10px] font-black uppercase tracking-wider">
                  <span className={entry.role === 'customer' ? 'text-white/80' : 'text-cyan-200'}>{entry.role === 'customer' ? 'Cliente' : 'IA'}</span>
                  <span className="text-slate-500">{formatDateTime(entry.at)}</span>
                </div>
                <p className="whitespace-pre-wrap text-slate-300">{entry.text}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm leading-relaxed text-cyan-100/80">
            Sem memoria automatica ativa no momento. Quando a conversa entra em handoff humano, esse contexto e encerrado.
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">IA</p>
        <div className="mt-3 grid gap-2 text-sm text-slate-300">
          <div>provider: <span className="font-bold text-white">{summary.latestAiLog?.provider || '-'}</span></div>
          <div>model: <span className="font-bold text-white">{summary.latestAiLog?.model || '-'}</span></div>
          <div>latency: <span className="font-bold text-white">{summary.latestAiLog?.latencyMs ?? '-'}</span></div>
          <div>input tokens: <span className="font-bold text-white">{summary.latestAiLog?.inputTokens ?? '-'}</span></div>
          <div>output tokens: <span className="font-bold text-white">{summary.latestAiLog?.outputTokens ?? '-'}</span></div>
          <div>total tokens: <span className="font-bold text-white">{summary.latestAiLog?.totalTokens ?? '-'}</span></div>
        </div>
      </div>

      {summary.handoffInternalNote ? (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-300/80">Nota interna</p>
          <p className="mt-2 text-sm leading-relaxed text-amber-100">{summary.handoffInternalNote}</p>
        </div>
      ) : null}

      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Metadata</p>
        <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl border border-white/5 bg-slate-950/70 p-3 text-[11px] leading-relaxed text-slate-300">
          {JSON.stringify(summary.metadata || {}, null, 2)}
        </pre>
      </div>
    </div>
  )
}

export default function WhatsAppOperatorModal({
  isOpen,
  onClose,
  storeId,
  initialPhone = null,
}: {
  isOpen: boolean
  onClose: () => void
  storeId: number
  initialPhone?: string | null
}) {
  const { openParcelaModal } = useModals()
  const [query, setQuery] = useState('')
  const [threads, setThreads] = useState<WhatsAppOperatorThreadListItem[]>([])
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null)
  const [selectedDetail, setSelectedDetail] = useState<WhatsAppOperatorThreadDetail | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)
  const [sendSuccess, setSendSuccess] = useState<string | null>(null)
  const [composerMode, setComposerMode] = useState<'real' | 'simulation'>('real')
  const [composerText, setComposerText] = useState('')
  const [controlMessage, setControlMessage] = useState<string | null>(null)
  const [retentionPreview, setRetentionPreview] = useState<WhatsAppRetentionPreview | null>(null)
  const [retentionError, setRetentionError] = useState<string | null>(null)
  const [retentionMessage, setRetentionMessage] = useState<string | null>(null)
  const [simulationByPhone, setSimulationByPhone] = useState<Record<string, SimulationEntry[]>>({})
  const [isPending, startTransition] = useTransition()
  const [isDetailPending, startDetailTransition] = useTransition()
  const [isSending, startSendTransition] = useTransition()
  const [isChangingControl, startControlTransition] = useTransition()
  const [isLoadingRetention, startRetentionTransition] = useTransition()
  const [isRunningRetention, startRetentionCleanupTransition] = useTransition()
  const conversationViewportRef = useRef<HTMLDivElement | null>(null)
  const conversationBottomRef = useRef<HTMLDivElement | null>(null)
  const composerRef = useRef<HTMLTextAreaElement | null>(null)

  const loadThreads = (search = query, preserveSelection = true, preferredPhone: string | null = null) => {
    setLoadError(null)

    startTransition(async () => {
      const result = await getWhatsAppOperatorThreads({
        storeId,
        query: search,
        limit: 40,
      })

      if (!result.success) {
        setLoadError(result.message)
        setThreads([])
        return
      }

      setThreads(result.threads)

      const nextSelectedPhone = preferredPhone
        || (preserveSelection && selectedPhone && result.threads.some((thread) => thread.remotePhone === selectedPhone)
          ? selectedPhone
          : result.threads[0]?.remotePhone || null)

      setSelectedPhone(nextSelectedPhone)
    })
  }

  const loadThreadDetail = (remotePhone: string) => {
    setDetailError(null)

    startDetailTransition(async () => {
      const result = await getWhatsAppOperatorThreadDetail({
        storeId,
        remotePhone,
      })

      if (!result.success || !result.data) {
        setSelectedDetail(null)
        setDetailError(result.message)
        return
      }

      setSelectedDetail(result.data)
      setThreads((current) => current.map((thread) =>
        thread.remotePhone === remotePhone
          ? {
              ...thread,
              ...result.data!.thread,
            }
          : thread
      ))
    })
  }

  const loadRetentionPreview = () => {
    setRetentionError(null)

    startRetentionTransition(async () => {
      const result = await getWhatsAppRetentionPreview({ storeId })
      if (!result.success || !result.data) {
        setRetentionPreview(null)
        setRetentionError(result.message)
        return
      }

      setRetentionPreview(result.data)
    })
  }

  const handleRunRetentionCleanup = () => {
    if (!retentionPreview || retentionPreview.candidates.total <= 0) return

    const confirmed = window.confirm(
      `Executar faxina de WhatsApp agora?\n\nEsta rodada remove no maximo 250 registros por tipo e protege humano persistente e handoff ativo.\n\nCandidatos atuais: ${retentionPreview.candidates.total}.`
    )
    if (!confirmed) return

    setRetentionError(null)
    setRetentionMessage(null)

    startRetentionCleanupTransition(async () => {
      const result = await runWhatsAppRetentionCleanup({
        storeId,
        confirmation: 'CONFIRMAR_FAXINA_WHATSAPP',
      })

      if (!result.success) {
        setRetentionError(result.message)
        return
      }

      setRetentionMessage(result.message)
      if (result.preview) setRetentionPreview(result.preview)
      loadThreads(query)
      if (selectedPhone) loadThreadDetail(selectedPhone)
    })
  }

  useEffect(() => {
    if (!isOpen) return
    const initialSearch = initialPhone || ''
    loadThreads(initialSearch, false, initialPhone)
    loadRetentionPreview()
    setQuery(initialSearch)
    setSelectedDetail(null)
    setSelectedPhone(initialPhone)
    setComposerText('')
    setComposerMode('real')
    setSendError(null)
    setSendSuccess(null)
    setControlMessage(null)
    setRetentionError(null)
    setRetentionMessage(null)
  }, [isOpen, initialPhone])

  useEffect(() => {
    if (!isOpen) return
    const timer = window.setTimeout(() => {
      loadThreads(query, false, query === initialPhone ? initialPhone : null)
    }, 250)

    return () => window.clearTimeout(timer)
  }, [query, initialPhone])

  useEffect(() => {
    if (!isOpen || !selectedPhone) return
    loadThreadDetail(selectedPhone)
    setSendError(null)
    setSendSuccess(null)
    setControlMessage(null)
  }, [isOpen, selectedPhone])

  const selectedThread = useMemo(
    () => threads.find((thread) => thread.remotePhone === selectedPhone) || selectedDetail?.thread || null,
    [threads, selectedPhone, selectedDetail]
  )
  const simulationEntries = selectedThread ? (simulationByPhone[selectedThread.remotePhone] || []) : []
  const messageRenderKey = useMemo(() => {
    const parts = [
      selectedPhone || '',
      selectedDetail?.messages.length || 0,
      selectedDetail?.messages[selectedDetail.messages.length - 1]?.id || '',
      simulationEntries.length,
      simulationEntries[simulationEntries.length - 1]?.id || '',
    ]

    return parts.join(':')
  }, [selectedPhone, selectedDetail, simulationEntries])

  useEffect(() => {
    if (!isOpen) return
    if (isDetailPending) return

    const bottom = conversationBottomRef.current
    const viewport = conversationViewportRef.current
    if (!bottom || !viewport) return

    let cancelled = false
    let timeoutId: number | null = null
    let frameId = 0

    const scrollToBottom = () => {
      if (cancelled) return
      bottom.scrollIntoView({ block: 'end' })
      viewport.scrollTop = viewport.scrollHeight
    }

    frameId = window.requestAnimationFrame(() => {
      scrollToBottom()
      timeoutId = window.setTimeout(scrollToBottom, 40)
    })

    return () => {
      cancelled = true
      window.cancelAnimationFrame(frameId)
      if (timeoutId !== null) window.clearTimeout(timeoutId)
    }
  }, [isOpen, isDetailPending, messageRenderKey])

  const handleChangeControlMode = (mode: WhatsAppCustomerControlMode) => {
    if (!selectedThread) return

    setControlMessage(null)

    startControlTransition(async () => {
      const result = await setWhatsAppCustomerControl({
        storeId,
        remotePhone: selectedThread.remotePhone,
        mode,
      })

      setControlMessage(result.message)

      if (result.success) {
        loadThreads(query)
        loadThreadDetail(selectedThread.remotePhone)
      }
    })
  }

  const handleSendRealMessage = () => {
    if (!selectedThread) return

    setSendError(null)
    setSendSuccess(null)

    startSendTransition(async () => {
      if (composerMode === 'simulation') {
        const result = await simulateWhatsAppOperatorMessage({
          storeId,
          remotePhone: selectedThread.remotePhone,
          messageText: composerText,
        })

        if (!result.success || !result.data) {
          setSendError(result.message)
          return
        }

        const simulationData = result.data

        setSimulationByPhone((current) => {
          const currentList = current[selectedThread.remotePhone] || []
          const nextEntry: SimulationEntry = {
            id: `simulation-${Date.now()}`,
            phone: selectedThread.remotePhone,
            messageText: composerText,
            result: simulationData,
            createdAt: new Date().toISOString(),
          }

          return {
            ...current,
            [selectedThread.remotePhone]: [...currentList, nextEntry],
          }
        })
        setComposerText('')
        setSendSuccess(result.message)
        return
      }

      const result = await sendWhatsAppOperatorMessage({
        storeId,
        remotePhone: selectedThread.remotePhone,
        messageText: composerText,
      })

      if (!result.success) {
        setSendError(result.message)
        return
      }

      setComposerText('')
      setSendSuccess(result.message)
      loadThreads(query)
      loadThreadDetail(selectedThread.remotePhone)
    })
  }

  const insertComposerLineBreak = () => {
    const textarea = composerRef.current
    if (!textarea) {
      setComposerText((current) => `${current}\n`)
      return
    }

    const start = textarea.selectionStart ?? composerText.length
    const end = textarea.selectionEnd ?? composerText.length
    const nextValue = `${composerText.slice(0, start)}\n${composerText.slice(end)}`
    setComposerText(nextValue)

    window.requestAnimationFrame(() => {
      const nextCursor = start + 1
      textarea.selectionStart = nextCursor
      textarea.selectionEnd = nextCursor
      textarea.focus()
    })
  }

  const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return

    if (event.ctrlKey || event.metaKey) {
      event.preventDefault()
      insertComposerLineBreak()
      return
    }

    if (!event.shiftKey) {
      event.preventDefault()
      handleSendRealMessage()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-3 backdrop-blur-md sm:p-5">
      <div className="flex h-[92vh] w-full max-w-[1500px] flex-col overflow-hidden rounded-[28px] border border-white/10 bg-slate-950 shadow-2xl shadow-black/50">
        <div className="flex items-center justify-between border-b border-white/10 bg-slate-900/80 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-2.5">
              <MessageCircle className="h-5 w-5 text-emerald-300" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white">WhatsApp Operacional</h2>
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">
                Historico real, pendencias e contexto tecnico
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => loadThreads(query)}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 text-xs font-black uppercase tracking-wider text-slate-300 transition hover:bg-white/10"
            >
              <RefreshCw className={`h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[340px_minmax(0,1fr)_360px]">
          <aside className="flex min-h-0 flex-col border-b border-white/10 xl:border-b-0 xl:border-r">
            <div className="shrink-0 border-b border-white/10 p-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar por nome ou telefone"
                  className="h-11 w-full rounded-xl border border-white/10 bg-black/20 pl-10 pr-4 text-sm font-bold text-slate-200 outline-none transition focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/10"
                />
              </div>
            </div>

            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-3 pr-2">
              <div className="space-y-2">
                {loadError ? (
                  <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
                    {loadError}
                  </div>
                ) : null}

                {threads.map((thread) => (
                  <button
                    key={thread.remotePhone}
                    type="button"
                    onClick={() => setSelectedPhone(thread.remotePhone)}
                    className={`w-full rounded-2xl border p-4 text-left transition ${
                      selectedPhone === thread.remotePhone
                        ? 'border-emerald-400/40 bg-emerald-500/10'
                        : 'border-white/5 bg-white/[0.03] hover:border-white/15 hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-white">
                          {thread.customer?.name || formatPhone(thread.remotePhone)}
                        </p>
                        <p className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
                          <Phone className="h-3.5 w-3.5" />
                          <span className="truncate">{formatPhone(thread.remotePhone)}</span>
                        </p>
                      </div>
                      <ThreadStateBadge thread={thread} />
                    </div>

                    <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-slate-300">
                      {thread.lastMessagePreview || 'Sem mensagens recentes.'}
                    </p>

                    <div className="mt-3 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      <span>{thread.messageCount} msg</span>
                      <span>{formatRelativeMinutes(thread.lastMessageAt) || '-'}</span>
                    </div>
                  </button>
                ))}

                {!isPending && threads.length === 0 && !loadError ? (
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-slate-400">
                    Nenhuma thread encontrada para esta busca.
                  </div>
                ) : null}

                {isPending ? (
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-slate-400">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Carregando conversas...
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </aside>

          <main className="flex min-h-0 flex-col border-b border-white/10 xl:border-b-0 xl:border-r">
            <div className="shrink-0 border-b border-white/10 p-4">
              {selectedThread ? (
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-black text-white">
                        {selectedThread.customer?.name || 'Conversa sem cliente vinculado'}
                      </h3>
                      <ThreadStateBadge thread={selectedThread} />
                    </div>
                    <p className="mt-1 flex items-center gap-2 text-sm text-slate-400">
                      <Phone className="h-4 w-4" />
                      {formatPhone(selectedThread.remotePhone)}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {(['auto', 'force_ai', 'force_human'] as WhatsAppCustomerControlMode[]).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => handleChangeControlMode(mode)}
                          disabled={isChangingControl}
                          title={controlModeTitle(mode)}
                          className={`rounded-xl px-3 py-2 text-[11px] font-black uppercase tracking-wider transition ${
                            selectedThread.overrideMode === mode
                              ? mode === 'force_human'
                                ? 'bg-amber-400 text-amber-950'
                                : mode === 'force_ai'
                                  ? 'bg-cyan-400 text-cyan-950'
                                  : 'bg-emerald-500 text-emerald-950'
                              : 'border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                          }`}
                        >
                          {controlModeLabel(mode)}
                        </button>
                      ))}
                    </div>
                    {selectedThread.overrideMode === 'force_ai' ? (
                      <p className="mt-2 text-[11px] font-semibold text-cyan-200/80">
                        IA armada para a proxima mensagem real. Depois disso, volta para automatico.
                      </p>
                    ) : selectedThread.overrideMode === 'force_human' ? (
                      <p className="mt-2 text-[11px] font-semibold text-amber-200/80">
                        Atendimento humano persistente ate alguem devolver para automatico.
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">
                      {selectedThread.latestIntent || 'sem intent'}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">
                      {selectedThread.latestOutboundType || 'sem outbound'}
                    </span>
                    {selectedThread.hasRecentAttachment ? (
                      <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-1 text-cyan-200">
                        anexo recente
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-400">Selecione uma conversa na lateral.</p>
              )}

              {controlMessage ? (
                <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200">
                  {controlMessage}
                </div>
              ) : null}
            </div>

            <div
              ref={conversationViewportRef}
              className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-4 pr-3"
            >
              {detailError ? (
                <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
                  {detailError}
                </div>
              ) : null}

              {isDetailPending ? (
                <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-slate-400">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Carregando thread...
                  </div>
                </div>
              ) : null}

              {!isDetailPending && selectedDetail ? (
                <div className="space-y-3">
                  {selectedDetail.messages.length > 0 ? (
                    <>
                      {selectedDetail.messages.map((message) => (
                        <MessageBubble key={message.id} message={message} />
                      ))}
                      {simulationEntries.map((entry) => (
                        <SimulationBubble key={entry.id} entry={entry} />
                      ))}
                    </>
                  ) : (
                    <>
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-slate-400">
                        Nenhuma mensagem encontrada para este numero.
                      </div>
                      {simulationEntries.map((entry) => (
                        <SimulationBubble key={entry.id} entry={entry} />
                      ))}
                    </>
                  )}
                  <div ref={conversationBottomRef} />
                </div>
              ) : null}
            </div>

            <div className="shrink-0 border-t border-white/10 bg-slate-900/60 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setComposerMode('real')}
                    className={`rounded-xl px-3 py-2 text-[11px] font-black uppercase tracking-wider transition ${
                      composerMode === 'real'
                        ? 'bg-emerald-500 text-emerald-950'
                        : 'border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    Real
                  </button>
                  <button
                    type="button"
                    onClick={() => setComposerMode('simulation')}
                    className={`rounded-xl px-3 py-2 text-[11px] font-black uppercase tracking-wider transition ${
                      composerMode === 'simulation'
                        ? 'bg-amber-400 text-amber-950'
                        : 'border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    Simulacao
                  </button>
                </div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  {composerMode === 'real' ? 'Envia ao cliente e pausa IA' : 'Entrara na Fase 4'}
                </p>
              </div>

              {sendError ? (
                <div className="mb-3 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                  {sendError}
                </div>
              ) : null}

              {sendSuccess ? (
                <div className="mb-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                  {sendSuccess}
                </div>
              ) : null}

              <div className="flex flex-col gap-3 lg:flex-row">
                <textarea
                  ref={composerRef}
                  value={composerText}
                  onChange={(event) => setComposerText(event.target.value)}
                  onKeyDown={handleComposerKeyDown}
                  placeholder={
                    selectedThread
                      ? composerMode === 'real'
                        ? 'Digite a mensagem que sera enviada ao cliente real...'
                        : 'A simulacao entra na proxima fase.'
                      : 'Selecione uma thread para responder.'
                  }
                  disabled={!selectedThread || isSending}
                  rows={3}
                  className="min-h-[88px] flex-1 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-200 outline-none transition focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/10 disabled:opacity-60"
                />

                <button
                  type="button"
                  onClick={handleSendRealMessage}
                  disabled={!selectedThread || !composerText.trim() || isSending}
                  className="inline-flex min-w-[160px] items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-5 py-4 text-sm font-black uppercase tracking-wider text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-50"
                >
                  {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
                  Enviar
                </button>
              </div>
            </div>
          </main>

          <aside className="custom-scrollbar min-h-0 overflow-y-auto p-4 pr-3">
            <div className="mb-4 flex items-center gap-2">
              <Bot className="h-4 w-4 text-cyan-300" />
              <h4 className="text-sm font-black text-white">Painel Tecnico</h4>
            </div>

            {selectedThread ? (
              <div className="mb-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                  <Wifi className="h-3.5 w-3.5" />
                  Operacional
                </div>
                <div className="mt-3 grid gap-2 text-sm text-slate-300">
                  <div>cliente: <span className="font-bold text-white">{selectedThread.customer?.name || '-'}</span></div>
                  <div>telefone: <span className="font-bold text-white">{formatPhone(selectedThread.remotePhone)}</span></div>
                  <div>ultima msg: <span className="font-bold text-white">{formatDateTime(selectedThread.lastMessageAt)}</span></div>
                  <div>estado: <span className="font-bold text-white">{selectedThread.currentState || '-'}</span></div>
                </div>

                {selectedThread.internalNote ? (
                  <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-100">
                    <div className="mb-1 flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-amber-300">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Handoff
                    </div>
                    {selectedThread.internalNote}
                  </div>
                ) : null}
              </div>
            ) : null}

            <TechnicalPanel
              summary={selectedDetail?.technicalSummary || null}
              onOpenInstallments={(installmentQuery) => openParcelaModal(installmentQuery || undefined)}
            />

            <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-slate-300" />
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Retencao</p>
                </div>
                <button
                  type="button"
                  onClick={loadRetentionPreview}
                  disabled={isLoadingRetention}
                  title="Atualizar previa de retencao"
                  className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:bg-white/10 disabled:opacity-50"
                >
                  {isLoadingRetention ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                </button>
              </div>

              {retentionError ? (
                <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                  {retentionError}
                </div>
              ) : null}

              {retentionMessage ? (
                <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                  {retentionMessage}
                </div>
              ) : null}

              {!retentionError && retentionPreview ? (
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
                      <p className="text-slate-500">logs IA</p>
                      <p className="mt-1 text-lg font-black text-white">{retentionPreview.candidates.aiLogs}</p>
                    </div>
                    <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
                      <p className="text-slate-500">estados</p>
                      <p className="mt-1 text-lg font-black text-white">{retentionPreview.candidates.expiredStates}</p>
                    </div>
                    <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
                      <p className="text-slate-500">inbound</p>
                      <p className="mt-1 text-lg font-black text-white">{retentionPreview.candidates.inboundMessages}</p>
                    </div>
                    <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
                      <p className="text-slate-500">outbound</p>
                      <p className="mt-1 text-lg font-black text-white">{retentionPreview.candidates.outboundMessages}</p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-3 text-xs text-cyan-50">
                    <div className="font-bold">Previa: {retentionPreview.candidates.total} registro(s) candidato(s)</div>
                    <div className="mt-1 text-cyan-100/75">
                      Protegidos: {retentionPreview.protectedThreads.totalUnique} thread(s), incluindo humano persistente e handoff ativo.
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleRunRetentionCleanup}
                    disabled={isRunningRetention || retentionPreview.candidates.total <= 0}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs font-black uppercase tracking-wider text-red-100 transition hover:bg-red-500/20 disabled:opacity-50"
                  >
                    {isRunningRetention ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Database className="h-3.5 w-3.5" />}
                    Executar faxina
                  </button>
                </div>
              ) : !retentionError ? (
                <p className="mt-3 text-sm text-slate-400">Carregando previa de retencao...</p>
              ) : null}
            </div>

            {simulationEntries.length > 0 ? (
              <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-300/80">Ultima simulacao</p>
                <div className="mt-3 space-y-2 text-sm text-amber-50">
                  <div>acao: <span className="font-bold">{simulationEntries[simulationEntries.length - 1].result.debug.action}</span></div>
                  <div>override: <span className="font-bold">{simulationEntries[simulationEntries.length - 1].result.debug.overrideMode}</span></div>
                  <div>resposta: <span className="font-bold">{simulationEntries[simulationEntries.length - 1].result.replyText || '[sem resposta automatica]'}</span></div>
                </div>
              </div>
            ) : null}
          </aside>
        </div>
      </div>
    </div>
  )
}
