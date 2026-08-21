'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, BellOff, BellRing, ChevronDown, ChevronUp, MessageSquareText } from 'lucide-react'
import { WhatsAppPendencia } from '@/lib/actions/consultas.actions'
import { getWhatsAppLatestInboundMessage } from '@/lib/actions/whatsapp-operator.actions'

type LocalAlertState = 'active' | 'inactive' | 'blocked' | 'unsupported'

function storageKey(storeId: number) {
  return `whatsapp-local-sound-alert:${storeId}`
}

type BrowserAudioContext = AudioContext & { state: AudioContextState }

function createBrowserAudioContext() {
  const AudioContextConstructor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextConstructor) return null

  try {
    return new AudioContextConstructor() as BrowserAudioContext
  } catch {
    return null
  }
}

function playIncomingSound(context: BrowserAudioContext | null) {
  if (!context) return

  try {
    const sequenceGap = 0.72
    const groupGap = 1.2
    for (let sequence = 0; sequence < 6; sequence += 1) {
      const group = Math.floor(sequence / 3)
      const positionInGroup = sequence % 3
      const startAt = context.currentTime
        + group * (3 * sequenceGap + groupGap)
        + positionInGroup * sequenceGap
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = 'triangle'
      oscillator.frequency.setValueAtTime(740, startAt)
      oscillator.frequency.setValueAtTime(1046, startAt + 0.16)
      oscillator.frequency.setValueAtTime(880, startAt + 0.34)
      gain.gain.setValueAtTime(0.0001, startAt)
      gain.gain.exponentialRampToValueAtTime(0.28, startAt + 0.025)
      gain.gain.setValueAtTime(0.28, startAt + 0.18)
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.58)
      oscillator.connect(gain)
      gain.connect(context.destination)
      oscillator.start(startAt)
      oscillator.stop(startAt + 0.6)
    }
  } catch {
    // Audio can be restricted by the browser; the visual notification remains available.
  }
}

export default function WidgetWhatsAppPendencias({
  pendencias,
  humanOverrides = 0,
  isConnected = true,
  storeId,
  onOpen,
}: {
  pendencias: WhatsAppPendencia[]
  humanOverrides?: number
  isConnected?: boolean
  storeId: number
  onOpen: () => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [alertState, setAlertState] = useState<LocalAlertState>('inactive')
  const latestMessageIdRef = useRef<number | null>(null)
  const isCheckingRef = useRef(false)
  const audioContextRef = useRef<BrowserAudioContext | null>(null)
  const attachmentPendingCount = pendencias.filter((item) => item.origin === 'attachment').length
  const pendingCount = pendencias.length
  const totalActions = pendingCount + humanOverrides
  const [renderNow] = useState(() => Date.now())
  const oldestUpdate = pendencias
    .map((item) => new Date(item.handoff_at).getTime())
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b)[0]

  const waitMinutes = oldestUpdate
    ? Math.max(0, Math.floor((renderNow - oldestUpdate) / 60000))
    : 0

  useEffect(() => {
    if (!('Notification' in window)) {
      setAlertState('unsupported')
      return
    }

    const enabled = window.localStorage.getItem(storageKey(storeId)) === 'enabled'
    setAlertState(Notification.permission === 'denied' ? 'blocked' : enabled ? 'active' : 'inactive')
  }, [storeId])

  useEffect(() => {
    if (alertState !== 'active' || !isConnected) return

    let cancelled = false
    const checkForNewMessage = async () => {
      if (isCheckingRef.current) return
      isCheckingRef.current = true
      try {
        const result = await getWhatsAppLatestInboundMessage(storeId)
        if (cancelled || !result.success || result.latestMessageId === null) return

        if (latestMessageIdRef.current === null) {
          latestMessageIdRef.current = result.latestMessageId
          return
        }
        if (result.latestMessageId <= latestMessageIdRef.current) return

        latestMessageIdRef.current = result.latestMessageId
        playIncomingSound(audioContextRef.current)
        if (document.visibilityState !== 'visible' && Notification.permission === 'granted') {
          new Notification('Nova mensagem no WhatsApp', {
            body: 'Abra o Radar Operacional para atender.',
            tag: `whatsapp-inbound-${storeId}`,
          })
        }
      } finally {
        isCheckingRef.current = false
      }
    }

    void checkForNewMessage()
    const timer = window.setInterval(checkForNewMessage, 5_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [alertState, isConnected, storeId])

  const toggleLocalAlert = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    if (alertState === 'unsupported') return

    if (alertState === 'active') {
      window.localStorage.setItem(storageKey(storeId), 'disabled')
      setAlertState('inactive')
      latestMessageIdRef.current = null
      return
    }

    if (Notification.permission === 'denied') {
      setAlertState('blocked')
      return
    }

    // Criar/liberar o contexto dentro do clique evita que o navegador bloqueie
    // o áudio posteriormente, quando a mensagem chegar sem interação humana.
    if (!audioContextRef.current) audioContextRef.current = createBrowserAudioContext()
    if (audioContextRef.current?.state === 'suspended') {
      await audioContextRef.current.resume().catch(() => undefined)
    }

    const permission = Notification.permission === 'default'
      ? await Notification.requestPermission()
      : Notification.permission
    if (permission !== 'granted') {
      setAlertState('blocked')
      return
    }

    window.localStorage.setItem(storageKey(storeId), 'enabled')
    latestMessageIdRef.current = null
    setAlertState('active')
    playIncomingSound(audioContextRef.current)
  }

  const alertLabel = alertState === 'active'
    ? 'Alertas sonoros ativos'
    : alertState === 'blocked'
      ? 'Permissao de notificacao bloqueada'
      : alertState === 'unsupported'
        ? 'Notificacoes indisponiveis neste navegador'
        : 'Ativar notificacao sonora local'

  return (
    <div className="group bg-white/5 hover:bg-white/10 rounded-xl border border-white/5 hover:border-green-500/30 transition-all duration-300 overflow-hidden">
      <div
        className="p-4 flex items-center justify-between cursor-pointer"
        onClick={() => setIsOpen((current) => !current)}
      >
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-green-500/20 text-green-300 flex items-center justify-center transition-colors shadow-lg">
            <MessageSquareText className="w-5 h-5" />
          </div>
          <div>
            <span className="text-slate-200 font-bold text-sm block group-hover:text-white transition-colors">WhatsApp</span>
            <span className={`text-[10px] uppercase font-bold ${isConnected ? 'text-slate-500' : 'text-amber-400'}`}>
              {isConnected ? 'Central Operacional' : 'Canal desconectado'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {totalActions > 0 ? (
            <span className="px-2 py-1 rounded-md text-xs font-bold bg-green-500/20 text-green-300 shadow-lg">
              {totalActions}
            </span>
          ) : null}
          {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>
      </div>

      {isOpen ? (
        <div className="bg-black/20 p-4 border-t border-white/5 space-y-3 animate-in slide-in-from-top-2">
          <div className="flex items-start justify-between gap-3 rounded-lg bg-white/5 border border-white/5 p-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-slate-200">
                {!isConnected
                  ? 'WhatsApp indisponível no momento'
                  : totalActions > 0
                    ? `${totalActions} ${totalActions === 1 ? 'ação' : 'ações'} no radar`
                    : 'Sem ações de WhatsApp agora'}
              </p>
              <p className="mt-1 text-[10px] text-slate-400">
                {!isConnected
                  ? 'Verifique a conexão do canal nas configurações da loja.'
                  : pendingCount > 0
                  ? `Conversa mais antiga aguardando há ${waitMinutes} min`
                  : 'Central pronta para busca, histórico e debug.'}
              </p>
            </div>

            {totalActions > 0 ? (
              <div className={`shrink-0 px-1 py-2 ${pendingCount > 0 ? 'text-amber-200' : 'text-cyan-200'}`}>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-[10px] font-black uppercase tracking-wider">
                    {pendingCount > 0 ? 'Atenção' : 'Revisar'}
                  </span>
                </div>
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-lg bg-white/5 border border-white/5 px-3 py-3 text-[11px]">
              <span className="text-slate-300">Pendências</span>
              <span className="font-bold text-white">{pendingCount}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-white/5 border border-white/5 px-3 py-3 text-[11px]">
              <span className="text-slate-300">Dessas, por PDF/imagem</span>
              <span className="font-bold text-slate-300">{attachmentPendingCount}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-white/5 border border-white/5 px-3 py-3 text-[11px]">
              <span className="text-slate-300">Em humano</span>
              <span className="font-bold text-white">{humanOverrides}</span>
            </div>
          </div>

          <div className={`rounded-lg border p-3 ${alertState === 'active' ? 'border-emerald-400/25 bg-emerald-400/10' : 'border-white/5 bg-white/5'}`}>
            <button
              type="button"
              onClick={toggleLocalAlert}
              disabled={alertState === 'unsupported'}
              className={`flex w-full items-center justify-between gap-3 rounded-md border px-2 py-1.5 text-left text-[11px] font-black transition disabled:cursor-not-allowed disabled:text-slate-500 ${alertState === 'active' ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-200 hover:bg-emerald-300/20' : alertState === 'blocked' ? 'border-amber-300/30 bg-amber-300/10 text-amber-200 hover:bg-amber-300/15' : 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'}`}
            >
              <span className="flex items-center gap-2">
                {alertState === 'active' ? <BellRing className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
                {alertLabel}
              </span>
              <span className="text-[10px] uppercase tracking-wider">{alertState === 'active' ? 'Desativar' : 'Ativar'}</span>
            </button>
            {alertState === 'blocked' ? (
              <p className="mt-2 text-[10px] leading-relaxed text-amber-100/75">
                O navegador bloqueou as notificacoes. O aviso em segundo plano nao funcionara ate liberar a permissao nas configuracoes deste site.
              </p>
            ) : (
              <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
                Enquanto este sistema estiver aberto, novas mensagens recebem um sinal sonoro. Em segundo plano, o navegador tambem exibira uma notificacao quando permitido.
              </p>
            )}
          </div>

          <button
            type="button"
            disabled={!isConnected}
            onClick={(event) => {
              event.stopPropagation()
              if (!isConnected) return
              onOpen()
            }}
            className="w-full rounded-lg bg-green-500/20 text-green-300 hover:bg-green-500 hover:text-white transition-all shadow-sm border border-green-500/20 px-4 py-3 text-[11px] font-black uppercase tracking-wider disabled:cursor-not-allowed disabled:border-slate-600/30 disabled:bg-slate-700/30 disabled:text-slate-500"
          >
            {isConnected ? 'Entrar' : 'Canal desconectado'}
          </button>

          {isConnected && totalActions === 0 ? (
            <p className="text-center text-xs text-slate-400 py-3 font-medium">
              Nenhuma pendência de WhatsApp agora.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
