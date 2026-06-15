'use client'

import { useEffect, useState, useTransition } from 'react'
import { CheckCircle2, Loader2, MessageCircle, RefreshCw, Save, Wifi, WifiOff } from 'lucide-react'
import {
  getWhatsAppChannel,
  saveWhatsAppChannel,
  type WhatsAppChannel,
} from '@/lib/actions/whatsapp.actions'

const statusLabels: Record<WhatsAppChannel['connection_status'], string> = {
  unknown: 'Aguardando informação',
  connecting: 'Conectando',
  connected: 'Conectado',
  disconnected: 'Desconectado',
}

export default function WhatsAppChannelPanel({ storeId }: { storeId: number }) {
  const [channel, setChannel] = useState<WhatsAppChannel | null>(null)
  const [instanceKey, setInstanceKey] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [isActive, setIsActive] = useState(false)
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isLoading, setIsLoading] = useState(true)

  const applyChannel = (next: WhatsAppChannel | null) => {
    setChannel(next)
    setInstanceKey(next?.instance_key ?? '')
    setPhoneNumber(next?.phone_number ?? '')
    setIsActive(next?.is_active ?? false)
  }

  const loadChannel = () => {
    setIsLoading(true)
    startTransition(async () => {
      const result = await getWhatsAppChannel(storeId)
      if (result.success) {
        applyChannel(result.channel ?? null)
        setMessage(null)
      } else {
        setMessage({ kind: 'error', text: result.message })
      }
      setIsLoading(false)
    })
  }

  useEffect(() => {
    loadChannel()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId])

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage(null)

    startTransition(async () => {
      const result = await saveWhatsAppChannel({ storeId, instanceKey, phoneNumber, isActive })
      if (result.success) {
        applyChannel(result.channel ?? null)
        setMessage({ kind: 'success', text: result.message })
      } else {
        setMessage({ kind: 'error', text: result.message })
      }
    })
  }

  const status = channel?.connection_status ?? 'unknown'
  const isConnected = status === 'connected'

  return (
    <div className="mx-auto max-w-4xl animate-in fade-in space-y-5">
      <div className="relative overflow-hidden rounded-2xl border border-emerald-400/20 bg-gradient-to-br from-emerald-950/80 via-slate-950/90 to-cyan-950/70 p-6 shadow-2xl">
        <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-300/20 bg-emerald-400/15">
                <MessageCircle className="h-6 w-6 text-emerald-300" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-300/70">Evolution API</p>
                <h2 className="text-xl font-black text-white">Canal automatizado da loja</h2>
              </div>
            </div>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-300">
              Este número recebe consultas de clientes e responde somente quando encontra uma OS aberta vinculada ao telefone.
            </p>
          </div>

          <div className={`min-w-48 rounded-2xl border p-4 ${isConnected ? 'border-emerald-400/25 bg-emerald-400/10' : 'border-white/10 bg-black/20'}`}>
            <div className="flex items-center gap-3">
              {isConnected
                ? <Wifi className="h-5 w-5 text-emerald-300" />
                : <WifiOff className="h-5 w-5 text-slate-400" />}
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">Conexão</p>
                <p className={`text-sm font-black ${isConnected ? 'text-emerald-200' : 'text-slate-300'}`}>
                  {statusLabels[status]}
                </p>
              </div>
            </div>
            {channel?.last_connection_at && (
              <p className="mt-2 text-[10px] text-slate-500">
                Atualizado em {new Date(channel.last_connection_at).toLocaleString('pt-BR')}
              </p>
            )}
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl backdrop-blur-xl">
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
              Número do WhatsApp
            </label>
            <input
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.target.value)}
              placeholder="(11) 99999-9999"
              className="h-11 w-full rounded-xl border border-white/10 bg-black/25 px-4 text-sm font-bold text-white outline-none transition focus:border-emerald-400/50 focus:ring-2 focus:ring-emerald-400/10"
              disabled={isPending || isLoading}
            />
            <p className="mt-2 text-[10px] leading-relaxed text-slate-500">Número conectado à instância da Evolution para esta loja.</p>
          </div>

          <div>
            <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
              Identificador da instância
            </label>
            <input
              value={instanceKey}
              onChange={(event) => setInstanceKey(event.target.value)}
              placeholder={`loja-${storeId}`}
              className="h-11 w-full rounded-xl border border-white/10 bg-black/25 px-4 font-mono text-sm font-bold text-cyan-200 outline-none transition focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/10"
              disabled={isPending || isLoading}
            />
            <p className="mt-2 text-[10px] leading-relaxed text-slate-500">Deve ser exatamente o nome configurado na Evolution API.</p>
          </div>
        </div>

        <label className="mt-6 flex cursor-pointer items-center justify-between rounded-2xl border border-white/10 bg-black/20 p-4 transition hover:bg-white/5">
          <div>
            <p className="text-sm font-black text-white">Ativar respostas automáticas</p>
            <p className="mt-1 text-xs text-slate-400">Quando desligado, mensagens recebidas por este canal não serão processadas.</p>
          </div>
          <input
            type="checkbox"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
            disabled={isPending || isLoading}
            className="h-5 w-5 rounded border-white/20 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
          />
        </label>

        {message && (
          <div className={`mt-5 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold ${
            message.kind === 'success'
              ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
              : 'border-red-400/20 bg-red-400/10 text-red-200'
          }`}>
            {message.kind === 'success' && <CheckCircle2 className="h-4 w-4" />}
            {message.text}
          </div>
        )}

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={loadChannel}
            disabled={isPending || isLoading}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 text-xs font-black uppercase tracking-wider text-slate-300 transition hover:bg-white/10 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
          <button
            type="submit"
            disabled={isPending || isLoading}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-500 px-5 text-xs font-black uppercase tracking-wider text-emerald-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400 disabled:opacity-50"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar canal
          </button>
        </div>
      </form>
    </div>
  )
}
