'use client'

import React, { useState } from 'react'
import { Clock, Eye, Activity, ChevronRight, AlertCircle, X } from 'lucide-react'
import { OpticalEvaluationListItem } from '@/lib/actions/evaluation.actions'

type DateFilter = 'recent' | 'last_week' | 'this_month' | 'last_month'

interface EvaluationDashboardProps {
  employeeName: string
  evaluations: OpticalEvaluationListItem[]
  onSelectEvaluation: (evaluation: OpticalEvaluationListItem) => void
  onCloseEvaluation?: (evaluationId: number) => void
  isLoading: boolean
}

export function EvaluationDashboard({
  employeeName,
  evaluations,
  onSelectEvaluation,
  onCloseEvaluation,
  isLoading
}: EvaluationDashboardProps) {
  const [dateFilter, setDateFilter] = useState<DateFilter>('recent')

  const formatTimeAgo = (dateStr: string) => {
    const dates = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - dates.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 60) return `há ${diffMins} min`
    if (diffHours < 24) return `há ${diffHours}h`
    if (diffDays === 1) return 'ontem'
    if (diffDays < 7) return `há ${diffDays} dias`

    return dates.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
  }

  const filterEvaluations = (items: OpticalEvaluationListItem[]): OpticalEvaluationListItem[] => {
    if (dateFilter === 'recent') return items

    const now = new Date()
    let start: Date
    let end: Date = new Date(now)

    if (dateFilter === 'last_week') {
      const dayOfWeek = now.getDay()
      end = new Date(now)
      end.setDate(now.getDate() - dayOfWeek - 1) // último dia da semana passada (sábado)
      end.setHours(23, 59, 59, 999)
      start = new Date(end)
      start.setDate(end.getDate() - 6)
      start.setHours(0, 0, 0, 0)
    } else if (dateFilter === 'this_month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1)
      end = new Date(now)
    } else { // last_month
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)
    }

    return items.filter((ev) => {
      const d = new Date(ev.created_at)
      return d >= start && d <= end
    })
  }

  const filtered = filterEvaluations(evaluations)

  const filterButtons: { id: DateFilter; label: string }[] = [
    { id: 'recent', label: 'Recentes' },
    { id: 'last_week', label: 'Sem. passada' },
    { id: 'this_month', label: 'Este mês' },
    { id: 'last_month', label: 'Mês passado' },
  ]

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-900/40 rounded-3xl border border-white/5 backdrop-blur-3xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-2">
            <Activity className="h-5 w-5 text-indigo-400" />
            Oportunidades em Aberto
          </h2>
          <p className="text-xs text-slate-400 mt-1 uppercase tracking-widest font-black">
            Seus últimos atendimentos não finalizados
          </p>
        </div>
      </div>

      {/* Filtros temporais */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {filterButtons.map((btn) => (
          <button
            key={btn.id}
            onClick={() => setDateFilter(btn.id)}
            className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full border transition-all ${
              dateFilter === btn.id
                ? 'bg-indigo-500 border-indigo-500 text-white'
                : 'bg-white/5 border-white/10 text-slate-400 hover:border-indigo-500/40 hover:text-slate-200'
            }`}
          >
            {btn.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
        {isLoading ? (
          <div className="flex flex-col space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 rounded-2xl bg-white/5 animate-pulse border border-white/5" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center bg-white/[0.02] rounded-2xl border border-white/5 border-dashed">
            <div className="bg-indigo-500/10 p-4 rounded-full mb-3">
              <Eye className="h-6 w-6 text-indigo-400/50" />
            </div>
            <p className="text-sm font-semibold text-slate-300">Nenhum atendimento pendente</p>
            <p className="text-xs text-slate-500 max-w-[250px] mt-2">
              {dateFilter === 'recent'
                ? 'Você não possui avaliações pendentes. Procure por um paciente na busca para iniciar uma nova.'
                : 'Nenhum atendimento encontrado no período selecionado.'}
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {filtered.map((ev) => (
              <div key={ev.id} className="relative group">
                <button
                  onClick={() => onSelectEvaluation(ev)}
                  className="group/card relative flex items-center justify-between p-4 rounded-2xl bg-gradient-to-br from-slate-800/80 to-slate-900/80 border border-white/10 hover:border-indigo-500/50 hover:bg-slate-800 transition-all duration-300 text-left overflow-hidden w-full"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/0 via-indigo-500/0 to-indigo-500/5 opacity-0 group-hover/card:opacity-100 transition-opacity" />

                  <div className="relative z-10 flex gap-4 w-full">
                    <div className="flex-shrink-0 flex items-center justify-center w-12 h-12 rounded-xl bg-slate-950 border border-white/10 shadow-inner">
                      <div className="text-center">
                        <span className="block text-[10px] uppercase text-slate-500 font-bold leading-tight">Grau</span>
                        <span className="block text-xs font-black text-cyan-300 shrink-0">
                          {ev.receita_longe_od_esferico || '--'}
                        </span>
                      </div>
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                      <h3 className="text-sm font-black text-white uppercase tracking-tight truncate">
                        {ev.evaluated_patient_name || 'Paciente sem nome'}
                      </h3>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400 capitalize">
                          <Clock className="h-3 w-3" /> {formatTimeAgo(ev.created_at)}
                        </span>
                        {ev.recommended_lens_name && (
                          <span className="inline-flex items-center gap-1 text-[9px] uppercase tracking-widest font-black text-indigo-300 py-0.5 px-2 bg-indigo-500/10 rounded-full border border-indigo-500/20 truncate max-w-[150px]">
                            {ev.recommended_lens_name}
                          </span>
                        )}
                        {ev.panic_reason && (
                          <span className="inline-flex items-center gap-1 text-[9px] uppercase tracking-widest font-black text-orange-300 py-0.5 px-2 bg-orange-500/10 rounded-full border border-orange-500/20 truncate max-w-[150px]" title={ev.panic_reason}>
                            <AlertCircle className="h-3 w-3" /> {ev.panic_reason}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex-shrink-0 flex items-center justify-center px-2">
                      <div className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 text-slate-400 group-hover/card:bg-indigo-500 group-hover/card:text-white transition-colors">
                        <ChevronRight className="h-4 w-4" />
                      </div>
                    </div>
                  </div>
                </button>

                {/* Botão discreto de encerrar atendimento */}
                {onCloseEvaluation && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onCloseEvaluation(ev.id)
                    }}
                    title="Encerrar atendimento (venda perdida)"
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 flex items-center justify-center rounded-full bg-slate-700 hover:bg-red-500/80 text-slate-400 hover:text-white z-20"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
