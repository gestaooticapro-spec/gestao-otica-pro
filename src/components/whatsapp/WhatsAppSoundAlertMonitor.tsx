'use client'

import { useEffect, useRef, useState } from 'react'
import { getWhatsAppLatestInboundMessage } from '@/lib/actions/whatsapp-operator.actions'

type BrowserAudioContext = AudioContext & { state: AudioContextState }

export const WHATSAPP_SOUND_ALERT_CHANGED = 'whatsapp-local-sound-alert-change'
// Desativação emergencial temporária; voltar para false após a janela de risco.
const TEMPORARILY_DISABLE_WHATSAPP_SOUND_ALERT = false
const VISIBLE_POLL_INTERVAL_MS = 30_000
const HIDDEN_POLL_INTERVAL_MS = 120_000

export function whatsappSoundAlertStorageKey(storeId: number) {
  return `whatsapp-local-sound-alert:${storeId}`
}

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
  if (!context || context.state !== 'running') return

  try {
    const sequenceGap = 0.72
    const groupGap = 1.2
    for (let sequence = 0; sequence < 6; sequence += 1) {
      const group = Math.floor(sequence / 3)
      const positionInGroup = sequence % 3
      const startAt = context.currentTime + group * (3 * sequenceGap + groupGap) + positionInGroup * sequenceGap
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
    // A notificacao visual abaixo continua disponivel quando o audio falhar.
  }
}

/** Mantem o alerta ativo enquanto o usuario navega dentro da mesma loja. */
export default function WhatsAppSoundAlertMonitor({ storeId }: { storeId: number }) {
  const [enabled, setEnabled] = useState(false)
  const latestMessageIdRef = useRef<number | null>(null)
  const isCheckingRef = useRef(false)
  const audioContextRef = useRef<BrowserAudioContext | null>(null)
  const [visibilityState, setVisibilityState] = useState<DocumentVisibilityState>('visible')

  useEffect(() => {
    if (TEMPORARILY_DISABLE_WHATSAPP_SOUND_ALERT) return
    const syncEnabled = () => setEnabled(window.localStorage.getItem(whatsappSoundAlertStorageKey(storeId)) === 'enabled')
    syncEnabled()
    window.addEventListener(WHATSAPP_SOUND_ALERT_CHANGED, syncEnabled)
    return () => window.removeEventListener(WHATSAPP_SOUND_ALERT_CHANGED, syncEnabled)
  }, [storeId])

  useEffect(() => {
    if (TEMPORARILY_DISABLE_WHATSAPP_SOUND_ALERT) return
    const unlockAudio = () => {
      if (!audioContextRef.current) audioContextRef.current = createBrowserAudioContext()
      if (audioContextRef.current?.state === 'suspended') void audioContextRef.current.resume().catch(() => undefined)
    }
    document.addEventListener('pointerdown', unlockAudio, { capture: true })
    return () => document.removeEventListener('pointerdown', unlockAudio, { capture: true })
  }, [])

  useEffect(() => {
    if (TEMPORARILY_DISABLE_WHATSAPP_SOUND_ALERT) return
    const syncVisibility = () => setVisibilityState(document.visibilityState)
    syncVisibility()
    document.addEventListener('visibilitychange', syncVisibility)
    return () => document.removeEventListener('visibilitychange', syncVisibility)
  }, [])

  useEffect(() => {
    if (TEMPORARILY_DISABLE_WHATSAPP_SOUND_ALERT) return
    if (!enabled) {
      latestMessageIdRef.current = null
      return
    }

    if (!audioContextRef.current) audioContextRef.current = createBrowserAudioContext()

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
          new Notification('Nova mensagem no WhatsApp', { body: 'Abra o Radar Operacional para atender.', tag: `whatsapp-inbound-${storeId}` })
        }
      } finally {
        isCheckingRef.current = false
      }
    }

    void checkForNewMessage()
    const timer = window.setInterval(
      checkForNewMessage,
      visibilityState === 'visible' ? VISIBLE_POLL_INTERVAL_MS : HIDDEN_POLL_INTERVAL_MS,
    )
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [enabled, storeId, visibilityState])

  return null
}
