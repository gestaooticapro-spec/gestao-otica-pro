'use client'

import { useEffect, useState, useTransition } from 'react'
import Image from 'next/image'
import {
  AlertTriangle,
  Bot,
  Cake,
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  HandCoins,
  Loader2,
  MessageCircle,
  MessageSquareText,
  PackageSearch,
  PartyPopper,
  QrCode,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Wifi,
  WifiOff,
} from 'lucide-react'
import {
  getWhatsAppChannel,
  getWhatsAppAutomationControlSettings,
  getWhatsAppInstallmentReminderSettings,
  getWhatsAppOsResponderSettings,
  refreshWhatsAppConnection,
  requestWhatsAppQrCode,
  saveWhatsAppAutomationControlSettings,
  saveWhatsAppInstallmentReminderSettings,
  saveWhatsAppOsResponderSettings,
  startWhatsAppActivation,
  type WhatsAppAutomationControlSettings,
  type WhatsAppChannel,
  type WhatsAppInstallmentReminderSettings,
  type WhatsAppOsResponderSettings,
} from '@/lib/actions/whatsapp.actions'

const statusLabels: Record<WhatsAppChannel['connection_status'], string> = {
  unknown: 'Aguardando ativacao',
  connecting: 'Aguardando leitura do QR Code',
  connected: 'Conectado',
  disconnected: 'Desconectado',
}

function qrImageSource(qrCodeBase64: string | null) {
  if (!qrCodeBase64) return null
  return qrCodeBase64.startsWith('data:image/')
    ? qrCodeBase64
    : `data:image/png;base64,${qrCodeBase64}`
}

const automationPlaceholders = [
  {
    id: 'os_status_proactive',
    title: 'Enviar status da OS',
    description: 'Atualizacoes ativas quando a OS muda de etapa.',
    placeholder: 'Ex.: Oi, {nome}! Seu oculos entrou em uma nova etapa e ja temos uma atualizacao para voce.',
    icon: PackageSearch,
  },
  {
    id: 'post_sale',
    title: 'Fazer pos-vendas',
    description: 'Acompanhamento depois da retirada ou entrega.',
    placeholder: 'Ex.: Oi, {nome}! Passando para saber como esta sua adaptacao com os oculos.',
    icon: Sparkles,
  },
  {
    id: 'collection',
    title: 'Fazer cobranca',
    description: 'Cobranca de parcelas em atraso com texto ajustavel.',
    placeholder: 'Ex.: Oi, {nome}! Identificamos uma parcela em aberto e estamos entrando em contato para ajudar na regularizacao.',
    icon: HandCoins,
  },
  {
    id: 'birthday_greeting',
    title: 'Enviar felicitacoes de aniversario',
    description: 'Mensagem de aniversario da loja para o cliente.',
    placeholder: 'Ex.: Oi, {nome}! Toda a equipe da loja deseja um aniversario cheio de saude e alegrias.',
    icon: Cake,
  },
  {
    id: 'ai_responder',
    title: 'Responder com IA',
    description: 'Canal conversacional mais amplo para perguntas gerais.',
    placeholder: 'Ex.: Responda de forma educada, objetiva e com foco no atendimento da loja, sem inventar informacoes.',
    icon: Bot,
  },
] as const

export default function WhatsAppChannelPanel({ storeId }: { storeId: number }) {
  const [channel, setChannel] = useState<WhatsAppChannel | null>(null)
  const [phoneNumber, setPhoneNumber] = useState('')
  const [acceptedRisk, setAcceptedRisk] = useState(false)
  const [qrCodeBase64, setQrCodeBase64] = useState<string | null>(null)
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [automationControlSettings, setAutomationControlSettings] = useState<WhatsAppAutomationControlSettings>({ enabled: true })
  const [osResponderSettings, setOsResponderSettings] = useState<WhatsAppOsResponderSettings | null>(null)
  const [installmentReminderSettings, setInstallmentReminderSettings] = useState<WhatsAppInstallmentReminderSettings | null>(null)
  const [automationDrafts, setAutomationDrafts] = useState(() =>
    automationPlaceholders.reduce<Record<string, { enabled: boolean; text: string }>>((acc, item) => {
      acc[item.id] = {
        enabled: false,
        text: item.placeholder,
      }
      return acc
    }, {})
  )
  const [isPending, startTransition] = useTransition()
  const [isLoading, setIsLoading] = useState(true)

  const applyChannel = (next: WhatsAppChannel | null) => {
    setChannel(next)
    setPhoneNumber(next?.phone_number ?? '')
  }

  const loadChannel = () => {
    setIsLoading(true)
    startTransition(async () => {
      const [channelResult, automationControlResult, osSettingsResult, installmentReminderResult] = await Promise.all([
        getWhatsAppChannel(storeId),
        getWhatsAppAutomationControlSettings(storeId),
        getWhatsAppOsResponderSettings(storeId),
        getWhatsAppInstallmentReminderSettings(storeId),
      ])

      if (channelResult.success) {
        applyChannel(channelResult.channel ?? null)
      } else {
        setMessage({ kind: 'error', text: channelResult.message })
      }

      if (automationControlResult.success) {
        setAutomationControlSettings(automationControlResult.settings ?? { enabled: true })
        if (channelResult.success) setMessage(null)
      } else if (!channelResult.success) {
        setMessage({ kind: 'error', text: automationControlResult.message })
      }

      if (osSettingsResult.success) {
        setOsResponderSettings(osSettingsResult.settings ?? null)
        if (channelResult.success) setMessage(null)
      } else if (!channelResult.success && !automationControlResult.success) {
        setMessage({ kind: 'error', text: osSettingsResult.message })
      }

      if (installmentReminderResult.success) {
        setInstallmentReminderSettings(installmentReminderResult.settings ?? null)
        if (channelResult.success && automationControlResult.success && osSettingsResult.success) setMessage(null)
      } else if (!channelResult.success && !automationControlResult.success && !osSettingsResult.success) {
        setMessage({ kind: 'error', text: installmentReminderResult.message })
      }
      setIsLoading(false)
    })
  }

  useEffect(() => {
    loadChannel()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId])

  useEffect(() => {
    if (channel?.connection_status !== 'connecting') return

    const timer = window.setInterval(() => {
      startTransition(async () => {
        const result = await refreshWhatsAppConnection(storeId)
        if (result.success) {
          applyChannel(result.channel ?? null)
          if (result.channel?.connection_status === 'connected') {
            setQrCodeBase64(null)
            setMessage({ kind: 'success', text: result.message })
          }
        }
      })
    }, 5000)

    return () => window.clearInterval(timer)
  }, [channel?.connection_status, storeId])

  const handleActivate = () => {
    setMessage(null)
    setQrCodeBase64(null)

    startTransition(async () => {
      const result = await startWhatsAppActivation({ storeId, phoneNumber, acceptedRisk })
      if (result.success) {
        applyChannel(result.channel ?? null)
        setQrCodeBase64(result.qrCodeBase64 ?? null)
        setMessage({ kind: 'success', text: result.message })
      } else {
        setMessage({ kind: 'error', text: result.message })
      }
    })
  }

  const handleRefreshStatus = () => {
    setMessage(null)

    startTransition(async () => {
      const result = await refreshWhatsAppConnection(storeId)
      if (result.success) {
        applyChannel(result.channel ?? null)
        if (result.channel?.connection_status === 'connected') setQrCodeBase64(null)
        setMessage({ kind: 'success', text: result.message })
      } else {
        setMessage({ kind: 'error', text: result.message })
      }
    })
  }

  const handleRefreshQr = () => {
    setMessage(null)

    startTransition(async () => {
      const result = await requestWhatsAppQrCode(storeId)
      if (result.success) {
        applyChannel(result.channel ?? null)
        setQrCodeBase64(result.qrCodeBase64 ?? null)
        setMessage({ kind: 'success', text: result.message })
      } else {
        setMessage({ kind: 'error', text: result.message })
      }
    })
  }

  const status = channel?.connection_status ?? 'unknown'
  const isConnected = status === 'connected'
  const qrSource = qrImageSource(qrCodeBase64)
  const automationEnabled = automationControlSettings?.enabled !== false

  const handleToggleAutomationFlow = (enabled: boolean) => {
    const previousSettings = automationControlSettings
    setAutomationControlSettings({ enabled })
    setMessage(null)

    startTransition(async () => {
      const result = await saveWhatsAppAutomationControlSettings({ storeId, enabled })
      if (result.success) {
        setAutomationControlSettings(result.settings ?? { enabled })
        setMessage({ kind: 'success', text: result.message })
      } else {
        setAutomationControlSettings(previousSettings)
        setMessage({ kind: 'error', text: result.message })
      }
    })
  }

  const handleSaveOsResponder = () => {
    if (!osResponderSettings) return
    setMessage(null)

    startTransition(async () => {
      const result = await saveWhatsAppOsResponderSettings({
        storeId,
        enabled: osResponderSettings.enabled,
        templates: osResponderSettings.templates,
      })

      if (result.success) {
        setOsResponderSettings(result.settings ?? null)
        setMessage({ kind: 'success', text: result.message })
      } else {
        setMessage({ kind: 'error', text: result.message })
      }
    })
  }

  const handleSaveInstallmentReminder = () => {
    if (!installmentReminderSettings) return
    setMessage(null)

    startTransition(async () => {
      const result = await saveWhatsAppInstallmentReminderSettings({
        storeId,
        enabled: installmentReminderSettings.enabled,
        template: installmentReminderSettings.template,
      })

      if (result.success) {
        setInstallmentReminderSettings(result.settings ?? null)
        setMessage({ kind: 'success', text: result.message })
      } else {
        setMessage({ kind: 'error', text: result.message })
      }
    })
  }

  const handleToggleOsResponder = (enabled: boolean) => {
    if (!osResponderSettings) return

    const previousSettings = osResponderSettings
    const nextSettings = { ...osResponderSettings, enabled }
    setOsResponderSettings(nextSettings)
    setMessage(null)

    startTransition(async () => {
      const result = await saveWhatsAppOsResponderSettings({
        storeId,
        enabled,
        templates: nextSettings.templates,
      })

      if (result.success) {
        setOsResponderSettings(result.settings ?? nextSettings)
        setMessage({ kind: 'success', text: result.message })
      } else {
        setOsResponderSettings(previousSettings)
        setMessage({ kind: 'error', text: result.message })
      }
    })
  }

  const handleToggleInstallmentReminder = (enabled: boolean) => {
    if (!installmentReminderSettings) return

    const previousSettings = installmentReminderSettings
    const nextSettings = { ...installmentReminderSettings, enabled }
    setInstallmentReminderSettings(nextSettings)
    setMessage(null)

    startTransition(async () => {
      const result = await saveWhatsAppInstallmentReminderSettings({
        storeId,
        enabled,
        template: nextSettings.template,
      })

      if (result.success) {
        setInstallmentReminderSettings(result.settings ?? nextSettings)
        setMessage({ kind: 'success', text: result.message })
      } else {
        setInstallmentReminderSettings(previousSettings)
        setMessage({ kind: 'error', text: result.message })
      }
    })
  }

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
                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-300/70">WhatsApp da loja</p>
                <h2 className="text-xl font-black text-white">Atendimento automatico por consulta de OS</h2>
              </div>
            </div>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-300">
              A loja conecta o proprio WhatsApp por QR Code. O sistema responde apenas quando encontra uma OS aberta para o telefone do cliente.
            </p>
          </div>

          <div className={`min-w-52 rounded-2xl border p-4 ${isConnected ? 'border-emerald-400/25 bg-emerald-400/10' : 'border-white/10 bg-black/20'}`}>
            <div className="flex items-center gap-3">
              {isConnected
                ? <Wifi className="h-5 w-5 text-emerald-300" />
                : <WifiOff className="h-5 w-5 text-slate-400" />}
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">Status</p>
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

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl backdrop-blur-xl">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 text-amber-300" />
            <div>
              <h3 className="text-sm font-black text-white">Antes de ativar</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">
                Esta integracao usa conexao por aparelho conectado e nao e uma API oficial da Meta. O uso excessivo,
                disparos em massa ou mensagens fora do contexto de atendimento podem aumentar o risco de bloqueio ou
                banimento do numero. Use apenas para responder consultas reais dos clientes sobre OS.
              </p>
            </div>
          </div>

          <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-amber-300/20 bg-amber-300/10 p-4 transition hover:bg-amber-300/15">
            <input
              type="checkbox"
              checked={acceptedRisk}
              onChange={(event) => setAcceptedRisk(event.target.checked)}
              disabled={isPending || isLoading || isConnected}
              className="mt-1 h-5 w-5 rounded border-amber-300/40 bg-slate-950 text-amber-400 focus:ring-amber-400"
            />
            <span className="text-sm font-bold leading-relaxed text-amber-100">
              Entendi que esta integracao nao e oficial do WhatsApp e quero continuar com a ativacao.
            </span>
          </label>

          <div className="mt-6">
            <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
              Numero do WhatsApp da loja
            </label>
            <input
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.target.value)}
              placeholder="(44) 99999-9999"
              className="h-11 w-full rounded-xl border border-white/10 bg-black/25 px-4 text-sm font-bold text-white outline-none transition focus:border-emerald-400/50 focus:ring-2 focus:ring-emerald-400/10"
              disabled={isPending || isLoading || isConnected}
            />
            <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
              Use o numero que sera conectado pelo QR Code.
            </p>
          </div>

          {channel?.instance_key && (
            <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Identificador tecnico</p>
              <p className="mt-2 break-all font-mono text-sm font-bold text-cyan-200">{channel.instance_key}</p>
            </div>
          )}

          {message && (
            <div className={`mt-5 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold ${
              message.kind === 'success'
                ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
                : 'border-red-400/20 bg-red-400/10 text-red-200'
            }`}>
              {message.kind === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              {message.text}
            </div>
          )}

          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={handleRefreshStatus}
              disabled={isPending || isLoading || !channel}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 text-xs font-black uppercase tracking-wider text-slate-300 transition hover:bg-white/10 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${isPending || isLoading ? 'animate-spin' : ''}`} />
              Verificar
            </button>
            <button
              type="button"
              onClick={handleActivate}
              disabled={isPending || isLoading || isConnected}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-500 px-5 text-xs font-black uppercase tracking-wider text-emerald-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400 disabled:opacity-50"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
              {channel ? 'Continuar ativacao' : 'Ativar WhatsApp'}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-6 shadow-xl">
          <div className="flex items-center gap-3">
            <QrCode className="h-5 w-5 text-cyan-300" />
            <div>
              <h3 className="text-sm font-black text-white">QR Code</h3>
              <p className="text-xs text-slate-500">Escaneie em Aparelhos conectados no WhatsApp.</p>
            </div>
          </div>

          <div className="mt-5 flex min-h-72 items-center justify-center rounded-xl border border-white/10 bg-white p-4">
            {qrSource ? (
              <Image
                src={qrSource}
                alt="QR Code para conectar o WhatsApp da loja"
                width={256}
                height={256}
                unoptimized
                className="h-64 w-64 object-contain"
              />
            ) : (
              <div className="max-w-56 text-center">
                <QrCode className="mx-auto h-10 w-10 text-slate-300" />
                <p className="mt-3 text-sm font-bold text-slate-500">
                  {isConnected ? 'WhatsApp conectado.' : 'O QR Code aparece aqui durante a ativacao.'}
                </p>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleRefreshQr}
            disabled={isPending || isLoading || !channel || isConnected}
            className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-4 text-xs font-black uppercase tracking-wider text-cyan-100 transition hover:bg-cyan-300/15 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
            Gerar novo QR Code
          </button>
        </div>
      </div>

      <div className={`rounded-2xl border p-5 shadow-xl ${
        automationEnabled
          ? 'border-emerald-400/20 bg-emerald-400/[0.06]'
          : 'border-rose-400/20 bg-rose-400/[0.06]'
      }`}>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Fluxo geral</p>
            <h3 className="mt-1 text-lg font-black text-white">
              {automationEnabled ? 'WhatsApp operando normalmente' : 'WhatsApp temporariamente pausado'}
            </h3>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-300">
              Este botao nao derruba a conexao nem exige novo QR Code. Ele apenas liga ou desliga o fluxo automatico da loja.
            </p>
          </div>

          <label className="inline-flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
            <span className={`text-sm font-black ${automationEnabled ? 'text-emerald-200' : 'text-rose-200'}`}>
              {automationEnabled ? 'Ligado' : 'Desligado'}
            </span>
            <input
              type="checkbox"
              checked={automationEnabled}
              onChange={(event) => handleToggleAutomationFlow(event.target.checked)}
              disabled={isPending || isLoading}
              className="h-5 w-5 rounded border-white/20 bg-slate-900 text-emerald-400 focus:ring-emerald-400"
            />
          </label>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-6 shadow-xl">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-fuchsia-300/20 bg-fuchsia-400/10">
                <PartyPopper className="h-5 w-5 text-fuchsia-200" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-fuchsia-200/70">Automacoes</p>
                <h3 className="text-lg font-black text-white">Placeholders das futuras automacoes</h3>
              </div>
            </div>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-300">
              Esta area serve como mapa visual do que ainda vamos implementar. Os toggles e textos abaixo ainda nao
              disparam nada de verdade, mas ajudam a loja a visualizar o que podera configurar no futuro.
            </p>
          </div>

          <div className="rounded-xl border border-fuchsia-300/20 bg-fuchsia-400/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-fuchsia-100">
            Em breve
          </div>
        </div>

        <section className="mt-6 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-300/20 bg-emerald-400/10">
                <MessageSquareText className="h-5 w-5 text-emerald-200" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-black text-white">So responder sobre OS</h4>
                  <span className="rounded-lg border border-emerald-300/20 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-100">
                    Ativo
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-300">
                  Este card controla a automacao que ja existe hoje. Aqui a loja define se quer responder consultas de OS e quais textos devem ser enviados em cada status.
                </p>
              </div>
            </div>

            <label className="inline-flex items-center">
              <input
                type="checkbox"
                checked={Boolean(osResponderSettings?.enabled)}
                onChange={(event) => handleToggleOsResponder(event.target.checked)}
                disabled={!osResponderSettings || isPending || isLoading || !automationEnabled}
                className="h-5 w-5 rounded border-white/20 bg-slate-900 text-emerald-400 focus:ring-emerald-400"
              />
            </label>
          </div>

          {osResponderSettings && (
            <>
              <div className="mt-5 grid gap-4 xl:grid-cols-2">
                {[
                  {
                    key: 'lens_in_production',
                    label: 'Lente em producao',
                  },
                  {
                    key: 'lens_arrived_needs_frame',
                    label: 'Lente chegou, aguardando armacao',
                  },
                  {
                    key: 'lens_arrived_assembling',
                    label: 'Lente chegou, fila da montagem',
                  },
                  {
                    key: 'ready_for_pickup',
                    label: 'Oculos pronto',
                  },
                ].map((item) => (
                  <div key={item.key} className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                      {item.label}
                    </label>
                    <textarea
                      value={osResponderSettings.templates[item.key as keyof typeof osResponderSettings.templates]}
                      onChange={(event) => {
                        const value = event.target.value
                        setOsResponderSettings((current) => current ? {
                          ...current,
                          templates: {
                            ...current.templates,
                            [item.key]: value,
                          },
                        } : current)
                      }}
                      rows={4}
                      className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm leading-relaxed text-slate-200 outline-none transition focus:border-emerald-300/40 focus:ring-2 focus:ring-emerald-300/10"
                    />
                  </div>
                ))}
              </div>

              <div className="mt-4 flex items-center justify-between gap-4">
                <p className="text-[11px] leading-relaxed text-slate-400">
                  Marcadores disponiveis: <span className="font-mono text-slate-200">{'{nome}'}</span> usa o primeiro nome do cliente.
                  {' '}<span className="font-mono text-slate-200">{'{paciente}'}</span> adiciona o nome do dependente quando a OS estiver em nome de outra pessoa.
                </p>
                <button
                  type="button"
                  onClick={handleSaveOsResponder}
                  disabled={isPending || isLoading}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-500 px-5 text-xs font-black uppercase tracking-wider text-emerald-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400 disabled:opacity-50"
                >
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
                  Salvar respostas
                </button>
              </div>
            </>
          )}
        </section>

        <section className="mt-6 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-300/20 bg-amber-400/10">
                <CreditCard className="h-5 w-5 text-amber-200" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-black text-white">Enviar aviso de vencimento</h4>
                  <span className="rounded-lg border border-amber-300/20 bg-amber-400/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.2em] text-amber-100">
                    Novo
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-300">
                  Envia um lembrete simpático 2 dias antes do vencimento da parcela, apenas em horário comercial e sem repetir a mesma parcela.
                </p>
              </div>
            </div>

            <label className="inline-flex items-center">
              <input
                type="checkbox"
                checked={Boolean(installmentReminderSettings?.enabled)}
                onChange={(event) => handleToggleInstallmentReminder(event.target.checked)}
                disabled={!installmentReminderSettings || isPending || isLoading || !automationEnabled}
                className="h-5 w-5 rounded border-white/20 bg-slate-900 text-amber-400 focus:ring-amber-400"
              />
            </label>
          </div>

          {installmentReminderSettings && (
            <>
              <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-4">
                <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                  Texto do lembrete
                </label>
                <textarea
                  value={installmentReminderSettings.template}
                  onChange={(event) => {
                    const value = event.target.value
                    setInstallmentReminderSettings((current) => current ? { ...current, template: value } : current)
                  }}
                  rows={5}
                  className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm leading-relaxed text-slate-200 outline-none transition focus:border-amber-300/40 focus:ring-2 focus:ring-amber-300/10"
                />
              </div>

              <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <p className="text-[11px] leading-relaxed text-slate-400">
                  Marcadores: <span className="font-mono text-slate-200">{'{nome}'}</span>, <span className="font-mono text-slate-200">{'{titular}'}</span>, <span className="font-mono text-slate-200">{'{paciente}'}</span>, <span className="font-mono text-slate-200">{'{numero_parcela}'}</span>, <span className="font-mono text-slate-200">{'{data_vencimento}'}</span> e <span className="font-mono text-slate-200">{'{valor_parcela}'}</span>.
                </p>
                <button
                  type="button"
                  onClick={handleSaveInstallmentReminder}
                  disabled={isPending || isLoading}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 text-xs font-black uppercase tracking-wider text-amber-950 shadow-lg shadow-amber-500/20 transition hover:bg-amber-300 disabled:opacity-50"
                >
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
                  Salvar lembrete
                </button>
              </div>
            </>
          )}
        </section>

        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {automationPlaceholders.map((item) => {
            const Icon = item.icon
            const draft = automationDrafts[item.id]

            return (
              <section
                key={item.id}
                className="rounded-xl border border-white/10 bg-white/[0.03] p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-black/20">
                      <Icon className="h-5 w-5 text-slate-200" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-white">{item.title}</h4>
                      <p className="mt-1 text-xs leading-relaxed text-slate-400">{item.description}</p>
                    </div>
                  </div>

                  <label className="inline-flex items-center">
                    <input
                      type="checkbox"
                      checked={draft.enabled}
                      onChange={(event) => {
                        const checked = event.target.checked
                        setAutomationDrafts((current) => ({
                          ...current,
                          [item.id]: {
                            ...current[item.id],
                            enabled: checked,
                          },
                        }))
                      }}
                      className="h-5 w-5 rounded border-white/20 bg-slate-900 text-fuchsia-400 focus:ring-fuchsia-400"
                    />
                  </label>
                </div>

                <div className="mt-4">
                  <label className="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                    Texto base
                  </label>
                  <textarea
                    value={draft.text}
                    onChange={(event) => {
                      const value = event.target.value
                      setAutomationDrafts((current) => ({
                        ...current,
                        [item.id]: {
                          ...current[item.id],
                          text: value,
                        },
                      }))
                    }}
                    rows={4}
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-relaxed text-slate-200 outline-none transition focus:border-fuchsia-300/40 focus:ring-2 focus:ring-fuchsia-300/10"
                  />
                </div>

                <div className="mt-4 flex items-center justify-between gap-3">
                  <span className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                    Placeholder
                  </span>
                  <span className="text-[10px] text-slate-500">
                    Configuracao visual por enquanto
                  </span>
                </div>
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
