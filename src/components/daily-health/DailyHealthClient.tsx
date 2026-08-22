'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, RefreshCw } from 'lucide-react'
import EmployeeAuthModal from '@/components/modals/EmployeeAuthModal'
import type { DailyHealthReport } from '@/lib/daily-store-health'

type Area = 'financeiro' | 'operacao' | 'relacionamento'

type Props = {
  storeId: number
  report: DailyHealthReport | null
  needsPin: boolean
  canConfigure: boolean
}

const areas: Array<{ id: Area; label: string }> = [
  { id: 'financeiro', label: 'Financeiro' },
  { id: 'operacao', label: 'Operacao' },
  { id: 'relacionamento', label: 'Relacionamento' },
]

function financialReading(report: DailyHealthReport) {
  const credit = report.metrics.creditAnalysis
  return {
    title: 'O parcelamento esta ajudando a vender ou aumentando o risco?',
    summary: report.metrics.areaNarratives?.financeiro || credit.narrative,
    concern: null,
    attention: credit.recommendation,
  }
}

function operationReading(report: DailyHealthReport) {
  const { overdueOrders, ordersWithoutLabRequest, readyForPickup } = report.metrics
  const facts: string[] = []
  if (overdueOrders > 0) facts.push(`${overdueOrders} pedido${overdueOrders === 1 ? '' : 's'} esta${overdueOrders === 1 ? '' : 'o'} alem do prazo prometido`)
  if (ordersWithoutLabRequest > 0) facts.push(`${ordersWithoutLabRequest} pedido${ordersWithoutLabRequest === 1 ? '' : 's'} aberto${ordersWithoutLabRequest === 1 ? '' : 's'} ainda nao foi enviado ao laboratorio`)
  if (readyForPickup > 0) facts.push(`${readyForPickup} pedido${readyForPickup === 1 ? '' : 's'} pronto${readyForPickup === 1 ? '' : 's'} aguarda${readyForPickup === 1 ? '' : 'm'} retirada`)

  if (!facts.length) {
    return {
      title: 'A operacao nao trouxe desvios relevantes hoje.',
      summary: report.metrics.areaNarratives?.operacao || 'Nao ha pedidos fora do prazo, sem envio ao laboratorio ou aguardando retirada nas fontes disponiveis.',
      concern: null,
      attention: null,
    }
  }

  return {
    title: 'Onde a experiencia do cliente pode travar hoje?',
    summary: report.metrics.areaNarratives?.operacao || `A operacao pede atencao porque ${facts.join('; ')}.`,
    concern: null,
    attention: overdueOrders > 0
      ? 'Prioridade do dia: verificar os pedidos que ultrapassaram a data combinada e alinhar uma resposta para cada cliente afetado.'
      : ordersWithoutLabRequest > 0
        ? 'Prioridade do dia: confirmar o envio ao laboratorio antes que os pedidos abertos virem atraso.'
        : 'Prioridade do dia: avisar os clientes com pedido pronto e organizar as retiradas pendentes.',
  }
}

function relationshipReading(report: DailyHealthReport) {
  const { pendingWhatsApp, pendingPostSales, postSalesCompletedYesterday, postSalesCompletedWeek } = report.metrics
  const postSale = report.metrics.postSaleAnalysis
  const facts: string[] = []
  const completedYesterday = Number.isFinite(Number(postSalesCompletedYesterday)) ? Number(postSalesCompletedYesterday) : 0
  const completedWeek = Number.isFinite(Number(postSalesCompletedWeek)) ? Number(postSalesCompletedWeek) : 0
  const performanceSummary = `Ontem foram concluidos ${completedYesterday} pos-venda${completedYesterday === 1 ? '' : 's'}; nos ultimos 7 dias, ${completedWeek}.`
  if (pendingWhatsApp > 0) facts.push(`${pendingWhatsApp} conversa${pendingWhatsApp === 1 ? '' : 's'} de WhatsApp aguarda${pendingWhatsApp === 1 ? '' : 'm'} continuidade humana`)
  if (pendingPostSales > 0) {
    if (postSale) {
      const deliveryFacts = [
        postSale.messageSent > 0 ? `${postSale.messageSent} tiveram mensagem registrada como enviada (${postSale.customerResponded} com resposta posterior, ${postSale.ratingsReceived} nota${postSale.ratingsReceived === 1 ? '' : 's'} registrada${postSale.ratingsReceived === 1 ? '' : 's'} e ${postSale.respondedWithoutRating} resposta${postSale.respondedWithoutRating === 1 ? '' : 's'} sem nota)` : '',
        postSale.messageScheduled > 0 ? `${postSale.messageScheduled} aguardam novo envio na fila` : '',
        postSale.messageFailed > 0 ? `${postSale.messageFailed} falharam no envio` : '',
        postSale.messageCancelled > 0 ? `${postSale.messageCancelled} ${postSale.messageCancelled === 1 ? 'foi cancelado' : 'foram cancelados'}` : '',
        postSale.noMessageAttempt > 0 ? `${postSale.noMessageAttempt} ${postSale.noMessageAttempt === 1 ? 'nao possui' : 'nao possuem'} tentativa registrada` : '',
      ].filter(Boolean)
      const phoneFact = postSale.noPhone > 0
        ? `${postSale.noPhone} estao sem telefone cadastrado`
        : 'todos possuem telefone cadastrado'
      facts.push(`${pendingPostSales} pos-vendas pendentes; ${phoneFact}. ${deliveryFacts.join('; ')}.`)
    } else {
      facts.push(`${pendingPostSales} pos-venda${pendingPostSales === 1 ? '' : 's'} ainda nao foi concluido${pendingPostSales === 1 ? '' : 's'}`)
    }
  }

  if (!facts.length) {
    return {
      title: 'O acompanhamento de clientes esta em dia.',
      summary: report.metrics.areaNarratives?.relacionamento || `${performanceSummary} Nao ha conversas transferidas aguardando resposta nem pos-vendas pendentes nas fontes disponiveis.`,
      concern: report.metrics.areaNarratives?.relacionamentoConcern || null,
      attention: null,
    }
  }

  return {
    title: 'Pos-venda e retorno dos clientes',
    summary: report.metrics.areaNarratives?.relacionamento || `${performanceSummary} Hoje, ${facts.join(' ')} ${postSale && postSale.complaintOrAdaptation > 0 ? `${postSale.complaintOrAdaptation} cliente${postSale.complaintOrAdaptation === 1 ? '' : 's'} sinalizaram reclamacao ou dificuldade de adaptacao; ${postSale.awaitingHumanReview} caso${postSale.awaitingHumanReview === 1 ? '' : 's'} permanece${postSale.awaitingHumanReview === 1 ? '' : 'm'} em revisao humana.` : ''}`,
    concern: report.metrics.areaNarratives?.relacionamentoConcern || (postSale && postSale.awaitingHumanReview > 0
      ? `Fiquei preocupado com ${postSale.awaitingHumanReview} caso${postSale.awaitingHumanReview === 1 ? '' : 's'} em revisao humana aberta. Eles pedem uma conferida da equipe antes de seguirmos com novos contatos.`
      : null),
    attention: pendingWhatsApp > 0
      ? 'Prioridade do dia: responder primeiro as conversas que ja foram transferidas para a equipe, antes de iniciar novos atendimentos.'
      : postSale && postSale.messageFailed > 0
        ? 'Prioridade do dia: revisar as falhas de envio e fazer contato por outro canal quando necessario; mensagem enviada nao significa resposta recebida.'
      : 'Prioridade do dia: concluir os pos-vendas pendentes para fechar o ciclo de atendimento.',
  }
}

export default function DailyHealthClient({ storeId, report, needsPin }: Props) {
  const router = useRouter()
  const [area, setArea] = useState<Area>('financeiro')
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [requeueing, setRequeueing] = useState(false)
  const [requeueMessage, setRequeueMessage] = useState<string | null>(null)
  const [requeueError, setRequeueError] = useState<string | null>(null)

  const refreshReport = async () => {
    setRefreshing(true)
    setRefreshError(null)
    try {
      const response = await fetch('/api/daily-health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Nao foi possivel refazer o resumo.')
      router.refresh()
    } catch (error) {
      setRefreshError(error instanceof Error ? error.message : 'Nao foi possivel refazer o resumo.')
    } finally {
      setRefreshing(false)
    }
  }

  const requeuePostSales = async () => {
    setRequeueing(true)
    setRequeueMessage(null)
    setRequeueError(null)
    try {
      const response = await fetch('/api/daily-health/post-sales/requeue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Nao foi possivel recolocar os pos-vendas na fila.')
      const result = data.result || {}
      const requeued = Number(result.requeuedFailures || 0)
      const scheduled = Number(result.scheduledMissingAttempts || 0)
      const skipped = Number(result.skipped || 0)
      setRequeueMessage(`${requeued + scheduled} caso${requeued + scheduled === 1 ? '' : 's'} foi${requeued + scheduled === 1 ? '' : 'ram'} recolocado${requeued + scheduled === 1 ? '' : 's'} na fila.${skipped > 0 ? ` ${skipped} foi${skipped === 1 ? '' : 'ram'} mantido${skipped === 1 ? '' : 's'} sem alteracao por nao atender aos criterios.` : ''}`)
      router.refresh()
    } catch (error) {
      setRequeueError(error instanceof Error ? error.message : 'Nao foi possivel recolocar os pos-vendas na fila.')
    } finally {
      setRequeueing(false)
    }
  }

  if (needsPin) {
    return (
      <main className="min-h-full p-6 text-white lg:p-10">
        <div className="mx-auto max-w-7xl">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-200">Central diaria</p>
          <h1 className="mt-2 text-3xl font-black">Saude da Loja</h1>
          <p className="mt-3 text-sm text-slate-300">Aguardando a confirmacao do PIN de um gerente.</p>
        </div>
        <EmployeeAuthModal
          storeId={storeId}
          isOpen
          onClose={() => router.back()}
          onSuccess={() => router.refresh()}
          title="Abrir Saude da Loja"
          description="Informe o PIN de um gerente para visualizar o resumo diario."
          purpose="daily_health_access"
        />
      </main>
    )
  }

  const referenceDate = report
    ? new Date(`${report.reportDate}T12:00:00`).toLocaleDateString('pt-BR')
    : null
  const reading = report
    ? area === 'financeiro'
      ? financialReading(report)
      : area === 'operacao'
        ? operationReading(report)
        : relationshipReading(report)
    : null
  const requeueCandidates = report?.metrics.postSaleAnalysis
    ? report.metrics.postSaleAnalysis.messageFailed + report.metrics.postSaleAnalysis.noMessageAttempt
    : 0

  return (
    <main className="min-h-full p-6 text-white lg:p-10">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-wrap items-start justify-between gap-5 border-b border-white/10 pb-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-200">Central diaria</p>
            <h1 className="mt-2 text-3xl font-black">Saude da Loja</h1>
            <p className="mt-1 text-sm text-slate-300">
              {referenceDate ? `Referencia: ${referenceDate}` : 'Resumo diario ainda nao gerado.'}
            </p>
          </div>
          <button
            type="button"
            onClick={refreshReport}
            disabled={refreshing}
            className="inline-flex h-10 items-center gap-2 border border-white/15 bg-white/5 px-3 text-sm font-semibold text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refazer
          </button>
        </header>

        {refreshError && <p className="mt-4 text-sm text-rose-200">{refreshError}</p>}

        <nav className="mt-6 grid max-w-2xl grid-cols-3 border border-white/10 bg-black/20 p-1" aria-label="Areas da central diaria">
          {areas.map((item) => {
            const selected = area === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setArea(item.id)}
                className={`h-11 text-sm font-semibold transition-colors ${selected ? 'bg-emerald-300 text-slate-950' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}
                aria-pressed={selected}
              >
                {item.label}
              </button>
            )
          })}
        </nav>

        <section className="mt-8 max-w-5xl border-l-4 border-emerald-300 bg-black/20 px-6 py-7 sm:px-8" aria-live="polite">
          {reading ? (
            <>
              <h2 className="text-xl font-bold leading-8 text-white sm:text-2xl">{reading.title}</h2>
              <p className="mt-5 text-lg leading-8 text-slate-100">{reading.summary}</p>
              {reading.concern && <p className="mt-5 border-t border-amber-300/25 pt-5 text-base font-medium leading-7 text-amber-100">{reading.concern}</p>}
              {reading.attention && <p className="mt-5 border-t border-white/10 pt-5 text-base font-medium leading-7 text-emerald-100">{reading.attention}</p>}
            </>
          ) : (
            <p className="text-lg leading-8 text-slate-300">O resumo sera exibido assim que a primeira geracao for concluida.</p>
          )}
        </section>

        {area === 'relacionamento' && requeueCandidates > 0 && (
          <div className="mt-5 flex max-w-5xl flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={requeuePostSales}
              disabled={requeueing}
              className="flex min-h-20 w-full max-w-3xl items-center justify-between gap-5 border border-emerald-300/40 bg-emerald-300/10 px-5 py-4 text-left text-emerald-50 transition-colors hover:bg-emerald-300 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span>
                <span className="block text-base font-bold leading-6">Vamos tentar alcançar novamente estes {requeueCandidates} pós-vendas?</span>
                <span className="mt-1 block text-sm leading-5 opacity-80">Eu recoloco os casos na fila e respeito o próximo horário comercial.</span>
              </span>
              {requeueing ? <Loader2 className="h-5 w-5 shrink-0 animate-spin" /> : <RefreshCw className="h-5 w-5 shrink-0" />}
            </button>
            {requeueMessage && <p className="text-sm text-emerald-100">{requeueMessage}</p>}
            {requeueError && <p className="text-sm text-rose-200">{requeueError}</p>}
          </div>
        )}
      </div>
    </main>
  )
}
