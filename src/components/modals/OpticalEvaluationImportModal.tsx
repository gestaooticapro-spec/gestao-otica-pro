'use client'

import { useEffect, useState } from 'react'
import { Calendar, ExternalLink, History, Import, Loader2, Sparkles, User, X } from 'lucide-react'
import {
  getOpticalEvaluationsForServiceOrderImport,
  type OpticalEvaluationImportOption
} from '@/lib/actions/evaluation.actions'

type OpticalEvaluationImportModalProps = {
  isOpen: boolean
  onClose: () => void
  onSelect: (evaluation: OpticalEvaluationImportOption) => void
  storeId: number
  customerId: number
  dependenteId: number | null
  serviceOrderId: number | null
  patientName: string
}

const formatDate = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })

const formatDegree = (value: string | null | undefined) => {
  if (!value?.trim()) return '-'

  const parsed = Number(value.replace(',', '.').replace('+', '').trim())
  if (Number.isNaN(parsed)) return value

  return `${parsed >= 0 ? '+' : '-'}${Math.abs(parsed).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`
}

export default function OpticalEvaluationImportModal({
  isOpen,
  onClose,
  onSelect,
  storeId,
  customerId,
  dependenteId,
  serviceOrderId,
  patientName
}: OpticalEvaluationImportModalProps) {
  const [items, setItems] = useState<OpticalEvaluationImportOption[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isOpen) return

    let cancelled = false

    const load = async () => {
      setLoading(true)
      try {
        const data = await getOpticalEvaluationsForServiceOrderImport({
          storeId,
          customerId,
          dependenteId,
          serviceOrderId
        })

        if (!cancelled) {
          setItems(data)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [isOpen, storeId, customerId, dependenteId, serviceOrderId])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="relative w-full max-w-4xl overflow-hidden rounded-2xl border border-white/10 bg-slate-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-white/10 bg-white/5 px-5 py-4">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-black text-white">
              <History className="h-5 w-5 text-cyan-300" />
              Importar de Avaliação
            </h3>
            <p className="mt-1 flex items-center gap-1 text-xs text-slate-400">
              <User className="h-3 w-3" />
              Paciente atual: <span className="font-bold text-cyan-200">{patientName}</span>
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-white/10 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[75vh] overflow-y-auto p-5 custom-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Loader2 className="mb-3 h-8 w-8 animate-spin text-cyan-300" />
              <p className="text-sm">Buscando avaliações elegíveis...</p>
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-10 text-center text-slate-400">
              Nenhuma avaliação disponível para este paciente.
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item) => (
                <div key={item.id} className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-lg">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.15em] text-cyan-200">
                          <Calendar className="h-3 w-3" />
                          {formatDate(item.created_at)}
                        </span>
                        <span className="rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-[10px] font-black uppercase tracking-[0.15em] text-slate-300">
                          {item.source_system}
                        </span>
                        {item.source_exam_type && (
                          <span className="rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-[10px] font-bold text-slate-400">
                            {item.source_exam_type}
                          </span>
                        )}
                      </div>

                      <div>
                        <p className="font-black text-white">{item.evaluated_patient_name || 'Paciente'}</p>
                        <p className="text-xs font-bold text-slate-500">
                          OS origem: {item.source_os_number || 'N/A'}
                        </p>
                      </div>

                      <div className="grid grid-cols-1 gap-2 text-xs font-bold text-slate-300 md:grid-cols-2">
                        <div className="rounded-xl border border-white/5 bg-black/20 px-3 py-2">
                          OD {formatDegree(item.receita_longe_od_esferico)} {formatDegree(item.receita_longe_od_cilindrico)} {item.receita_longe_od_eixo || '-'}
                        </div>
                        <div className="rounded-xl border border-white/5 bg-black/20 px-3 py-2">
                          OE {formatDegree(item.receita_longe_oe_esferico)} {formatDegree(item.receita_longe_oe_cilindrico)} {item.receita_longe_oe_eixo || '-'}
                        </div>
                      </div>

                      {(item.receita_adicao || item.recommended_lens_name) && (
                        <div className="flex flex-wrap gap-3 text-xs">
                          {item.receita_adicao && (
                            <span className="font-bold text-emerald-300">Adição {formatDegree(item.receita_adicao)}</span>
                          )}
                          {item.recommended_lens_name && (
                            <span className="text-slate-400">Sugestão: {item.recommended_lens_name}</span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 gap-2">
                      {item.source_document_url && (
                        <a
                          href={item.source_document_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-black uppercase tracking-[0.15em] text-cyan-200 transition-colors hover:bg-cyan-500/20"
                        >
                          <ExternalLink className="h-4 w-4" />
                          Ver PDF
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => onSelect(item)}
                        className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-black uppercase tracking-[0.15em] text-emerald-200 transition-colors hover:bg-emerald-500/20"
                      >
                        <Import className="h-4 w-4" />
                        Usar esta
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-white/10 bg-white/5 px-5 py-3">
          <p className="flex items-center gap-2 text-[11px] text-slate-500">
            <Sparkles className="h-3.5 w-3.5 text-cyan-300" />
            A avaliação preenche a OS, mas a aplicação só fica persistida quando a OS for salva.
          </p>
          <button onClick={onClose} className="text-sm font-bold text-slate-400 transition-colors hover:text-white">
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
