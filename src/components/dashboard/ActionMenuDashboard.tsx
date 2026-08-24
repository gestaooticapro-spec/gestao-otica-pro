'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Zap, DollarSign,
  HeartHandshake, Megaphone, Search, Printer,
  ArrowRight, BellRing, AlertCircle, FileText, Wallet, CheckCircle2,
  X, MessageCircle,
} from 'lucide-react'
import AniversariantesWidget from '@/components/consultas/AniversariantesWidget'
import { WidgetEntregas, WidgetLaboratorio } from '@/components/consultas/PaineisAlertas'
import WidgetVencimentos from '@/components/consultas/WidgetVencimentos'
import RetornosCobrancaWidget from '@/components/consultas/RetornosCobrancaWidget'
import { AlertaEntrega, AlertaLaboratorio, Aniversariante, VencimentoProximo, WhatsAppPendencia } from '@/lib/actions/consultas.actions'
import { RetornoCobranca } from '@/lib/actions/collection.actions'
import ParcelaSearchModal from '@/components/modals/ParcelaSearchModal'
import WidgetWhatsAppPendencias from '@/components/consultas/WidgetWhatsAppPendencias'
import WhatsAppOperatorModal from '@/components/modals/WhatsAppOperatorModal'
import { useStoreModules } from '@/lib/contexts/StoreModulesContext'
import { runDashboardWhatsAppWakePing, type DashboardWhatsAppWakePingResult } from '@/lib/actions/whatsapp.actions'
import WhatsAppStatusContextModal from '@/components/modals/WhatsAppStatusContextModal'

interface Props {
  storeId: number
  storeName: string
  deliveryDateEnabled?: boolean
  isWhatsAppAutomationEnabled: boolean
  isWhatsAppChannelConfigured: boolean
  isWhatsAppConnected: boolean
  alerts: {
    entregas: AlertaEntrega[]
    laboratorio: AlertaLaboratorio[]
    vendasEmAberto: number
  }
  birthdays: Aniversariante[]
  vencimentos: VencimentoProximo[]
  retornos: RetornoCobranca[]
  whatsAppPendencias: WhatsAppPendencia[]
  whatsAppHumanOverrides: number
  whatsAppStatusContextsPending: number
}

const WA_WAKE_PING_MAX_PER_DAY = 2
const WA_WAKE_PING_MIN_INTERVAL_MS = 6 * 60 * 60 * 1000

type WakePingAuditFlag = {
  status: DashboardWhatsAppWakePingResult['status']
  message: string
  success: boolean
  checkedAt: string
}

function getWakePingStorageKey(storeId: number) {
  const today = new Date().toISOString().slice(0, 10)
  return `wa-vps-wake-ping:${storeId}:${today}`
}

function getWakePingAuditStorageKey(storeId: number) {
  return `wa-vps-wake-ping-audit:${storeId}`
}

function shouldRunWakePing(storeId: number) {
  if (typeof window === 'undefined') return false

  const key = getWakePingStorageKey(storeId)
  const raw = window.localStorage.getItem(key)
  if (!raw) return true

  try {
    const parsed = JSON.parse(raw) as { attempts?: number; lastAt?: number }
    const attempts = Number(parsed.attempts || 0)
    const lastAt = Number(parsed.lastAt || 0)
    if (attempts >= WA_WAKE_PING_MAX_PER_DAY) return false
    return Date.now() - lastAt >= WA_WAKE_PING_MIN_INTERVAL_MS
  } catch {
    return true
  }
}

function recordWakePingAttempt(storeId: number, status: DashboardWhatsAppWakePingResult['status']) {
  if (typeof window === 'undefined') return

  const key = getWakePingStorageKey(storeId)
  const raw = window.localStorage.getItem(key)
  let attempts = 0
  try {
    attempts = raw ? Number((JSON.parse(raw) as { attempts?: number }).attempts || 0) : 0
  } catch {
    attempts = 0
  }

  window.localStorage.setItem(key, JSON.stringify({
    attempts: attempts + 1,
    lastAt: Date.now(),
    status,
  }))
}

function readWakePingAuditFlag(storeId: number): WakePingAuditFlag | null {
  if (typeof window === 'undefined' || storeId !== 1) return null

  const raw = window.localStorage.getItem(getWakePingAuditStorageKey(storeId))
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as WakePingAuditFlag
    if (!parsed?.status || !parsed?.checkedAt) return null
    return parsed
  } catch {
    return null
  }
}

function writeWakePingAuditFlag(storeId: number, result: DashboardWhatsAppWakePingResult) {
  if (typeof window === 'undefined' || storeId !== 1) return null

  const flag: WakePingAuditFlag = {
    status: result.status,
    message: result.message,
    success: result.success,
    checkedAt: new Date().toISOString(),
  }
  window.localStorage.setItem(getWakePingAuditStorageKey(storeId), JSON.stringify(flag))
  return flag
}

function clearWakePingAuditFlag(storeId: number) {
  if (typeof window === 'undefined' || storeId !== 1) return
  window.localStorage.removeItem(getWakePingAuditStorageKey(storeId))
}

function wakePingAuditStatusLabel(status: DashboardWhatsAppWakePingResult['status']) {
  const labels: Record<DashboardWhatsAppWakePingResult['status'], string> = {
    connected: 'Conectado',
    connecting: 'Conectando',
    disconnected: 'Desconectado',
    automation_disabled: 'Automacao desligada',
    not_configured: 'Nao configurado',
    unreachable: 'VPS sem resposta',
  }
  return labels[status]
}

export default function ActionMenuDashboard({
  storeId,
  storeName,
  deliveryDateEnabled = true,
  isWhatsAppAutomationEnabled,
  isWhatsAppChannelConfigured,
  isWhatsAppConnected,
  alerts,
  birthdays,
  vencimentos,
  retornos,
  whatsAppPendencias,
  whatsAppHumanOverrides,
  whatsAppStatusContextsPending,
}: Props) {
  const [isParcelaModalOpen, setIsParcelaModalOpen] = useState(false)
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false)
  const [isStatusContextModalOpen, setIsStatusContextModalOpen] = useState(false)
  const [pendingStatusContexts, setPendingStatusContexts] = useState(whatsAppStatusContextsPending)
  const [effectiveWhatsAppConnected, setEffectiveWhatsAppConnected] = useState(isWhatsAppConnected)
  const [whatsAppWakeWarning, setWhatsAppWakeWarning] = useState<string | null>(
    isWhatsAppAutomationEnabled && isWhatsAppChannelConfigured && !isWhatsAppConnected
      ? 'WhatsApp da VPS ainda nao respondeu como conectado.'
      : null
  )
  const [wakePingAuditFlag, setWakePingAuditFlag] = useState<WakePingAuditFlag | null>(null)
  const router = useRouter()
  const modules = useStoreModules()

  useEffect(() => {
    if (storeId !== 1) return

    const timer = window.setTimeout(() => {
      setWakePingAuditFlag(readWakePingAuditFlag(storeId))
    }, 0)

    return () => window.clearTimeout(timer)
  }, [storeId])

  useEffect(() => {
    if (!isWhatsAppAutomationEnabled || !isWhatsAppChannelConfigured) return
    if (!shouldRunWakePing(storeId)) return

    let cancelled = false

    runDashboardWhatsAppWakePing(storeId).then((result) => {
      if (cancelled) return
      recordWakePingAttempt(storeId, result.status)
      setWakePingAuditFlag(writeWakePingAuditFlag(storeId, result))

      if (result.status === 'automation_disabled' || result.status === 'not_configured') {
        setWhatsAppWakeWarning(null)
        return
      }

      if (result.status === 'connected') {
        setEffectiveWhatsAppConnected(true)
        setWhatsAppWakeWarning(null)
        if (!isWhatsAppConnected) router.refresh()
        return
      }

      setEffectiveWhatsAppConnected(false)
      setWhatsAppWakeWarning(
        result.status === 'unreachable'
          ? 'A automacao do WhatsApp esta ligada, mas a VPS nao respondeu agora.'
          : 'A automacao do WhatsApp esta ligada, mas o canal nao voltou conectado.'
      )
    }).catch(() => {
      if (cancelled) return
      const result: DashboardWhatsAppWakePingResult = {
        success: false,
        status: 'unreachable',
        message: 'Nao foi possivel consultar a VPS do WhatsApp.',
      }
      recordWakePingAttempt(storeId, result.status)
      setWakePingAuditFlag(writeWakePingAuditFlag(storeId, result))
      setEffectiveWhatsAppConnected(false)
      setWhatsAppWakeWarning('A automacao do WhatsApp esta ligada, mas a VPS nao respondeu agora.')
    })

    return () => {
      cancelled = true
    }
  }, [isWhatsAppAutomationEnabled, isWhatsAppChannelConfigured, isWhatsAppConnected, router, storeId])

  useEffect(() => {
    if (!isWhatsAppAutomationEnabled || !isWhatsAppChannelConfigured || !isWhatsAppConnected) return

    // O radar precisa acompanhar novos handoffs sem depender da abertura da central operacional.
    const interval = window.setInterval(() => {
      router.refresh()
    }, 30_000)

    return () => window.clearInterval(interval)
  }, [isWhatsAppAutomationEnabled, isWhatsAppChannelConfigured, isWhatsAppConnected, router])

  useEffect(() => {
    const refreshDashboard = () => router.refresh()
    window.addEventListener('installment-payment-recorded', refreshDashboard)
    return () => window.removeEventListener('installment-payment-recorded', refreshDashboard)
  }, [router])

  // LINHA 1: ATENDIMENTO (Frente de Loja)
  const topRow = [
    {
      title: "Venda de Grau",
      desc: "Receituário Completo",
      icon: FileText,
      href: `/dashboard/loja/${storeId}/atendimento`,
      // Cores convertidas para gradients translúcidos/glass
      gradient: "from-blue-600/80 to-blue-900/80",
      border: "border-blue-400/30",
      image: null // Futuro: '/buttons/atendimento.jpg'
    },
    {
      title: "Venda Rápida",
      desc: "Solar / Acessórios",
      icon: Zap,
      href: `/dashboard/loja/${storeId}/pdv-express`,
      gradient: "from-violet-600/80 to-violet-900/80",
      border: "border-violet-400/30",
      image: null
    },
    {
      title: "Entrega / Baixa",
      desc: "Finalizar OS",
      icon: CheckCircle2,
      href: `/dashboard/loja/${storeId}/entrega`,
      gradient: "from-amber-500/80 to-amber-800/80",
      border: "border-amber-400/30",
      image: null
    },
    {
      title: "Baixa Parcelas",
      desc: "Receber Dinheiro/Pix",
      icon: DollarSign,
      action: () => setIsParcelaModalOpen(true),
      gradient: "from-emerald-600/80 to-emerald-900/80",
      border: "border-emerald-400/30",
      image: null
    }
  ].filter((item) => {
    if (item.href?.includes('/pdv-express')) return modules.quickSale
    if (item.action) return modules.installments
    return true
  })

  // LINHA 2: RETAGUARDA (Loja Vazia)
  const bottomRow = [
    {
      title: "Livro Caixa",
      icon: Wallet,
      href: `/dashboard/loja/${storeId}/financeiro/caixa`,
      color: "hover:bg-cyan-500/20 hover:border-cyan-500/50 hover:text-cyan-200"
    },
    {
      title: "Cobrança",
      icon: Megaphone,
      href: `/dashboard/loja/${storeId}/cobranca`,
      color: "hover:bg-orange-500/20 hover:border-orange-500/50 hover:text-orange-200"
    },
    {
      title: "Pós-Venda",
      icon: HeartHandshake,
      href: `/dashboard/loja/${storeId}/pos-venda`,
      color: "hover:bg-pink-500/20 hover:border-pink-500/50 hover:text-pink-200"
    },
    {
      title: "Rastrear Lentes",
      icon: Search,
      href: `/dashboard/loja/${storeId}/laboratorio`,
      color: "hover:bg-blue-500/20 hover:border-blue-500/50 hover:text-blue-200"
    },
    {
      title: "Etiquetas",
      icon: Printer,
      href: `/dashboard/loja/${storeId}/estoque/etiquetas`,
      color: "hover:bg-teal-500/20 hover:border-teal-500/50 hover:text-teal-200"
    }
  ].filter((item) => {
    if (item.href.includes('/cobranca')) return modules.installments
    if (item.href.includes('/pos-venda')) return modules.postSales
    if (item.href.includes('/estoque/etiquetas')) return modules.labels
    return true
  })

  const visibleTopRow = topRow
  const visibleBottomRow = bottomRow

  return (
    <div className="h-full overflow-hidden relative font-sans">
      <div className="relative z-10 h-full overflow-y-auto custom-scrollbar">
        <div className="max-w-7xl mx-auto w-full p-4 lg:p-8 space-y-8">

          {/* CABEÇALHO DA LOJA */}
          <div className="flex items-center justify-between mb-2">
            <div className="space-y-1">
              <h2 className="text-3xl font-black text-white tracking-tight drop-shadow-md">
                {storeName}
              </h2>
              <div className="text-slate-400 text-sm font-medium uppercase tracking-widest flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)] animate-pulse" />
                Operação de Loja
              </div>
            </div>
          </div>

          {/* 0. ALERTAS CRÍTICOS */}
          {alerts.vendasEmAberto > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 backdrop-blur-md shadow-lg animate-in slide-in-from-top-2">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-amber-500/20 text-amber-500 rounded-xl shadow-inner border border-amber-500/20">
                  <AlertCircle className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-bold text-amber-200 text-sm">⚠️ Vendas Paradas há +21 dias</p>
                  <p className="text-amber-100/80 text-xs mt-0.5">
                    <strong className="text-amber-300 underline underline-offset-2">{alerts.vendasEmAberto} vendas</strong> estão em aberto há mais de 21 dias. Possível esquecimento ou problema.
                  </p>
                </div>
              </div>
              <Link
                href={`/dashboard/loja/${storeId}/vendas`}
                className="whitespace-nowrap px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-amber-950 text-xs font-black rounded-lg shadow-lg shadow-amber-900/20 transition-all transform hover:-translate-y-0.5 flex items-center gap-2"
              >
                VERIFICAR AGORA <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          )}

          <div className="flex flex-col xl:flex-row gap-8">

            {/* --- COLUNA ESQUERDA: AÇÃO (MESA DE CONTROLE) --- */}
            <div className="flex-1 space-y-8">

              <div>
                <h1 className="text-xl font-bold text-slate-200 tracking-tight flex items-center gap-3 mb-6 opacity-90">
                  <div className="p-2 bg-white/5 rounded-lg border border-white/10">
                    <Zap className="h-5 w-5 text-cyan-400" />
                  </div>
                  Ações Rápidas
                </h1>

                {/* GRADE 1: ATENDIMENTO (Grandes) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {visibleTopRow.map((item, idx) => {
                    const content = (
                      <div className={`
                                    group h-40 rounded-3xl p-6 relative overflow-hidden transition-all duration-300 
                                    hover:-translate-y-1 hover:shadow-2xl hover:shadow-cyan-500/10 cursor-pointer flex flex-col justify-between
                                    bg-gradient-to-br ${item.gradient} border ${item.border} backdrop-blur-md
                                `}>

                        {/* Imagem de Fundo (Se houver) */}
                        {item.image && (
                          <div className="absolute inset-0 w-full h-full z-0">
                            <img src={item.image} alt={item.title} className="w-full h-full object-cover opacity-50 group-hover:scale-105 transition-transform duration-700" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/10" />
                          </div>
                        )}

                        {/* Ícone Decorativo Fundo */}
                        {!item.image && (
                          <div className="absolute -top-4 -right-4 p-4 opacity-10 group-hover:opacity-20 transition-opacity transform scale-[2.5] rotate-12">
                            <item.icon className="w-24 h-24 text-white" />
                          </div>
                        )}

                        <div className="relative z-10">
                          <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center mb-4 border border-white/10 group-hover:bg-white/20 transition-colors shadow-lg">
                            <item.icon className="w-6 h-6 text-white" />
                          </div>
                          <h3 className="text-2xl font-black leading-none text-white drop-shadow-md tracking-tight">{item.title}</h3>
                        </div>
                        <div className="relative z-10 flex items-center justify-between mt-2">
                          <p className="text-xs font-semibold text-white/70 uppercase tracking-widest">{item.desc}</p>
                          <ArrowRight className="w-4 h-4 text-white/50 group-hover:text-white group-hover:translate-x-1 transition-all" />
                        </div>
                      </div>
                    )

                    return item.action ? (
                      <div key={idx} onClick={item.action}>{content}</div>
                    ) : (
                      <Link key={idx} href={item.href!}>{content}</Link>
                    )
                  })}
                </div>
              </div>

              {/* GRADE 2: RETAGUARDA (Menores) */}
              <div>
                <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 px-1 flex items-center gap-2">
                  <span className="w-8 h-[1px] bg-slate-700"></span>
                  Gestão & Retaguarda
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {visibleBottomRow.map((item, idx) => (
                    <Link key={idx} href={item.href} className={`
                      group flex flex-col items-center justify-center text-center p-6 rounded-2xl 
                      bg-black/20 border border-white/5 backdrop-blur-sm
                      transition-all duration-200 hover:-translate-y-1 hover:bg-black/40
                      ${item.color}
                    `}>
                      <item.icon className="h-7 w-7 mb-3 opacity-60 group-hover:opacity-100 transition-opacity" />
                      <span className="text-xs font-bold text-slate-300 group-hover:text-white transition-colors">{item.title}</span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            {/* --- COLUNA DIREITA: RADAR --- */}
            <div className="w-full xl:w-96 flex flex-col gap-6 shrink-0">
              <div className="flex items-center gap-2 text-slate-400 uppercase text-xs font-bold tracking-widest px-1 mb-2">
                <BellRing className="h-4 w-4" /> Radar Operacional
              </div>

              <div className="space-y-6">
                {storeId === 1 && wakePingAuditFlag && (
                  <div className="rounded-2xl border border-cyan-300/25 bg-cyan-300/10 p-4 text-cyan-50 shadow-xl shadow-black/10">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">Auditoria ping WA VPS</p>
                        <p className="mt-1 text-sm font-bold">
                          Resultado: {wakePingAuditStatusLabel(wakePingAuditFlag.status)}
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-cyan-100/75">
                          {wakePingAuditFlag.message} Verificado em {new Date(wakePingAuditFlag.checkedAt).toLocaleString('pt-BR')}.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          clearWakePingAuditFlag(storeId)
                          setWakePingAuditFlag(null)
                        }}
                        aria-label="Fechar auditoria do ping WhatsApp"
                        className="rounded-lg border border-cyan-100/20 bg-cyan-100/10 p-1.5 text-cyan-100 transition hover:bg-cyan-100/20"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Widget WhatsApp Pendências */}
                {whatsAppWakeWarning && (
                  <div className="rounded-2xl border border-amber-400/25 bg-amber-400/10 p-4 text-amber-100 shadow-xl shadow-black/10">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-200">WhatsApp VPS</p>
                        <p className="mt-1 text-sm font-bold">{whatsAppWakeWarning}</p>
                        <p className="mt-1 text-xs leading-relaxed text-amber-100/75">
                          A loja marcou o fluxo geral como ligado. Se o aviso persistir, abra Configuracoes &gt; WhatsApp para conferir a conexao.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {effectiveWhatsAppConnected && (
                  <>
                    {pendingStatusContexts > 0 && (
                      <button
                        type="button"
                        onClick={() => setIsStatusContextModalOpen(true)}
                        className="flex w-full items-center justify-between rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-left shadow-xl shadow-black/10 transition hover:border-emerald-300/50 hover:bg-emerald-400/15"
                      >
                        <div className="flex items-center gap-3">
                          <div className="rounded-xl bg-emerald-400/15 p-2.5 text-emerald-300">
                            <MessageCircle className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-300">Novo Status detectado</p>
                            <p className="mt-1 text-xs text-emerald-100/70">Explique o objetivo para liberar respostas automáticas.</p>
                          </div>
                        </div>
                        <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-emerald-400 px-2 text-xs font-black text-emerald-950">{pendingStatusContexts}</span>
                      </button>
                    )}
                    <div className="rounded-3xl overflow-hidden shadow-2xl shadow-black/20 ring-1 ring-white/10">
                      <WidgetWhatsAppPendencias
                        storeId={storeId}
                        pendencias={whatsAppPendencias}
                        humanOverrides={whatsAppHumanOverrides}
                        onOpen={() => setIsWhatsAppModalOpen(true)}
                      />
                    </div>
                  </>
                )}
                {modules.installments && (
                  <>
                {/* Widget Vencimentos */}
                <div className="rounded-3xl overflow-hidden shadow-2xl shadow-black/20 ring-1 ring-white/10">
                  <WidgetVencimentos dados={vencimentos} storeName={storeName} storeId={storeId} />
                </div>

                {/* Widget Retornos Cobrança */}
                <div className="rounded-3xl overflow-hidden shadow-2xl shadow-black/20 ring-1 ring-white/10">
                  <RetornosCobrancaWidget retornos={retornos} />
                </div>

                  </>
                )}

                {/* Widget Aniversariantes */}
                <div className="rounded-3xl overflow-hidden shadow-2xl shadow-black/20 ring-1 ring-white/10">
                  <AniversariantesWidget clientes={birthdays} storeId={storeId} />
                </div>

                {/* Widget Entregas */}
                {deliveryDateEnabled && (
                  <div className="rounded-3xl overflow-hidden shadow-2xl shadow-black/20 ring-1 ring-white/10">
                    <WidgetEntregas data={alerts.entregas} storeId={storeId} />
                  </div>
                )}

                {/* Widget Laboratório */}
                <div className="rounded-3xl overflow-hidden shadow-2xl shadow-black/20 ring-1 ring-white/10">
                  <WidgetLaboratorio data={alerts.laboratorio} storeId={storeId} />
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Footer discreto */}
        <div className="py-6 text-center">
          <p className="text-[10px] text-slate-600 font-medium tracking-widest uppercase">MBOptical • {storeName}</p>
        </div>
      </div>

      <ParcelaSearchModal
        isOpen={isParcelaModalOpen}
        onClose={() => setIsParcelaModalOpen(false)}
        storeId={storeId}
      />

      {effectiveWhatsAppConnected && (
        <>
          <WhatsAppOperatorModal
            isOpen={isWhatsAppModalOpen}
            onClose={() => setIsWhatsAppModalOpen(false)}
            storeId={storeId}
          />
          <WhatsAppStatusContextModal
            isOpen={isStatusContextModalOpen}
            onClose={() => setIsStatusContextModalOpen(false)}
            storeId={storeId}
            onRemainingChange={setPendingStatusContexts}
          />
        </>
      )}
    </div>
  )
}
