'use client'

import React, { useState } from 'react'
import { Clock, Eye, Activity, ChevronRight, AlertCircle, X } from 'lucide-react'
import { OpticalEvaluationListItem } from '@/lib/actions/evaluation.actions'

type DateFilter = 'today' | 'last_3_days' | 'last_7_days'

interface EvaluationDashboardProps {
  employeeName: string
  evaluations: OpticalEvaluationListItem[]
  onSelectEvaluation: (evaluation: OpticalEvaluationListItem) => void
  onCloseEvaluation?: (evaluationId: number) => void
  isLoading: boolean
  title?: string
  subtitle?: string
}

export function EvaluationDashboard({
  employeeName,
  evaluations,
  onSelectEvaluation,
  onCloseEvaluation,
  isLoading,
  title = 'Oportunidades em Aberto',
  subtitle = 'Seus atendimentos recentes prontos para retomada',
}: EvaluationDashboardProps) {
  const [dateFilter, setDateFilter] = useState<DateFilter>('last_7_days')

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
    const now = new Date()
    const start = new Date(now)

    if (dateFilter === 'today') {
      start.setHours(0, 0, 0, 0)
    } else if (dateFilter === 'last_3_days') {
      start.setDate(now.getDate() - 3)
    } else {
      start.setDate(now.getDate() - 7)
    }

    return items.filter((ev) => {
      const referenceDate = new Date(ev.updated_at || ev.created_at)
      return referenceDate >= start && referenceDate <= now
    })
  }

  const filtered = filterEvaluations(evaluations)

  const filterButtons: { id: DateFilter; label: string }[] = [
    { id: 'today', label: 'Hoje' },
    { id: 'last_3_days', label: '3 dias' },
    { id: 'last_7_days', label: '7 dias' },
  ]

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-white/5 bg-slate-900/40 p-6 backdrop-blur-3xl">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-black uppercase tracking-tight text-white">
            <Activity className="h-5 w-5 text-indigo-400" />
            {title}
          </h2>
          <p className="mt-1 text-xs font-black uppercase tracking-widest text-slate-400">
            {subtitle}
          </p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {filterButtons.map((btn) => (
          <button
            key={btn.id}
            onClick={() => setDateFilter(btn.id)}
            className={`rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all ${
              dateFilter === btn.id
                ? 'border-indigo-500 bg-indigo-500 text-white'
                : 'border-white/10 bg-white/5 text-slate-400 hover:border-indigo-500/40 hover:text-slate-200'
            }`}
          >
            {btn.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
        {isLoading ? (
          <div className="flex flex-col space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl border border-white/5 bg-white/5" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-white/5 bg-white/[0.02] text-center">
            <div className="mb-3 rounded-full bg-indigo-500/10 p-4">
              <Eye className="h-6 w-6 text-indigo-400/50" />
            </div>
            <p className="text-sm font-semibold text-slate-300">Nenhuma retomada nesse recorte</p>
            <p className="mt-2 max-w-[250px] text-xs text-slate-500">
              {dateFilter === 'last_7_days'
                ? 'Você não possui retomadas abertas nos últimos 7 dias. Procure um paciente na busca para iniciar ou continuar um atendimento.'
                : 'Nenhum atendimento encontrado no período selecionado.'}
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {filtered.map((ev) => (
              <div key={ev.id} className="group relative">
                <button
                  onClick={() => onSelectEvaluation(ev)}
                  className="group/card relative flex w-full items-center justify-between overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-slate-800/80 to-slate-900/80 p-4 text-left transition-all duration-300 hover:border-indigo-500/50 hover:bg-slate-800"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/0 via-indigo-500/0 to-indigo-500/5 opacity-0 transition-opacity group-hover/card:opacity-100" />

                  <div className="relative z-10 flex w-full gap-4">
                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl border border-white/10 bg-slate-950 shadow-inner">
                      <div className="text-center">
                        <span className="block text-[10px] font-bold uppercase leading-tight text-slate-500">Grau</span>
                        <span className="block shrink-0 text-xs font-black text-cyan-300">
                          {ev.receita_longe_od_esferico || '--'}
                        </span>
                      </div>
                    </div>

                    <div className="flex min-w-0 flex-1 flex-col justify-center">
                      <h3 className="truncate text-sm font-black uppercase tracking-tight text-white">
                        {ev.evaluated_patient_name || 'Paciente sem nome'}
                      </h3>
                      <div className="mt-1.5 flex items-center gap-3">
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold capitalize text-slate-400">
                          <Clock className="h-3 w-3" /> {formatTimeAgo(ev.updated_at || ev.created_at)}
                        </span>
                        {ev.recommended_lens_name && (
                          <span className="inline-flex max-w-[150px] truncate rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-indigo-300">
                            {ev.recommended_lens_name}
                          </span>
                        )}
                        {ev.panic_reason && (
                          <span
                            className="inline-flex max-w-[150px] truncate rounded-full border border-orange-500/20 bg-orange-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-orange-300"
                            title={ev.panic_reason}
                          >
                            <AlertCircle className="mr-1 h-3 w-3" /> {ev.panic_reason}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-shrink-0 items-center justify-center px-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-slate-400 transition-colors group-hover/card:bg-indigo-500 group-hover/card:text-white">
                        <ChevronRight className="h-4 w-4" />
                      </div>
                    </div>
                  </div>
                </button>

                {onCloseEvaluation && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onCloseEvaluation(ev.id)
                    }}
                    title="Encerrar atendimento (venda perdida)"
                    className="absolute right-2 top-2 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-slate-700 text-slate-400 opacity-0 transition-opacity hover:bg-red-500/80 hover:text-white group-hover:opacity-100"
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
