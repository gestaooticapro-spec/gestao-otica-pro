'use client'

import { useEffect, useMemo, useState } from 'react'
import { X, Loader2, Glasses, Calendar, UserRound } from 'lucide-react'
import {
    getCustomerPrescriptionSummary,
    type PrescriptionSummaryGroup
} from '@/lib/actions/customer-history.actions'

type CustomerPrescriptionHistoryModalProps = {
    isOpen: boolean
    onClose: () => void
    customerId: number | null
    customerName: string
    storeId: number
}

const formatDate = (dateStr: string) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('pt-BR')
}

const deg = (value: string | null) => value || '-'

function PrescriptionGrid({
    title,
    values
}: {
    title: string
    values: {
        odEsf: string | null
        odCil: string | null
        odEixo: string | null
        oeEsf: string | null
        oeCil: string | null
        oeEixo: string | null
    }
}) {
    const hasAnyValue = Object.values(values).some(Boolean)

    if (!hasAnyValue) return null

    return (
        <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">{title}</p>
            <div className="grid grid-cols-7 gap-1 text-center text-xs">
                <div />
                <div className="col-span-2 text-[10px] font-bold text-slate-500">ESF</div>
                <div className="col-span-2 text-[10px] font-bold text-slate-500">CIL</div>
                <div className="col-span-2 text-[10px] font-bold text-slate-500">EIXO</div>

                <div className="font-bold text-sky-300">OD</div>
                <div className="col-span-2 rounded-lg border border-white/5 bg-black/20 py-1 font-semibold text-slate-200">{deg(values.odEsf)}</div>
                <div className="col-span-2 rounded-lg border border-white/5 bg-black/20 py-1 font-semibold text-slate-200">{deg(values.odCil)}</div>
                <div className="col-span-2 rounded-lg border border-white/5 bg-black/20 py-1 font-semibold text-slate-200">{deg(values.odEixo)}</div>

                <div className="font-bold text-sky-300">OE</div>
                <div className="col-span-2 rounded-lg border border-white/5 bg-black/20 py-1 font-semibold text-slate-200">{deg(values.oeEsf)}</div>
                <div className="col-span-2 rounded-lg border border-white/5 bg-black/20 py-1 font-semibold text-slate-200">{deg(values.oeCil)}</div>
                <div className="col-span-2 rounded-lg border border-white/5 bg-black/20 py-1 font-semibold text-slate-200">{deg(values.oeEixo)}</div>
            </div>
        </div>
    )
}

export default function CustomerPrescriptionHistoryModal({
    isOpen,
    onClose,
    customerId,
    customerName,
    storeId
}: CustomerPrescriptionHistoryModalProps) {
    const [isLoading, setIsLoading] = useState(false)
    const [groups, setGroups] = useState<PrescriptionSummaryGroup[]>([])
    const [selectedGroupId, setSelectedGroupId] = useState('titular')

    useEffect(() => {
        if (!isOpen || !customerId) return

        let isMounted = true

        const load = async () => {
            setIsLoading(true)
            try {
                const data = await getCustomerPrescriptionSummary(customerId, storeId)
                if (!isMounted) return
                setGroups(data)
                const preferredGroup = data.find(group => group.receitas.length > 0) || data[0]
                setSelectedGroupId(preferredGroup?.id || 'titular')
            } finally {
                if (isMounted) setIsLoading(false)
            }
        }

        load()

        return () => {
            isMounted = false
        }
    }, [isOpen, customerId, storeId])

    useEffect(() => {
        if (!isOpen) {
            setGroups([])
            setSelectedGroupId('titular')
        }
    }, [isOpen])

    useEffect(() => {
        if (!isOpen) return

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose()
        }

        window.addEventListener('keydown', handleEscape)
        return () => window.removeEventListener('keydown', handleEscape)
    }, [isOpen, onClose])

    const selectedGroup = useMemo(
        () => groups.find(group => group.id === selectedGroupId) || groups[0] || null,
        [groups, selectedGroupId]
    )
    const titularGroup = useMemo(
        () => groups.find(group => group.dependenteId === null) || null,
        [groups]
    )
    const dependenteGroups = useMemo(
        () => groups.filter(group => group.dependenteId !== null),
        [groups]
    )

    if (!isOpen || !customerId) return null

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md" onClick={onClose}>
            <div
                className="flex max-h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-950/95 shadow-2xl shadow-black/60"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-4 border-b border-white/10 bg-slate-900/80 px-5 py-4">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-sky-300">Historico de Graus</p>
                        <h3 className="mt-1 text-lg font-black text-white">{customerName || 'Cliente'}</h3>
                        <p className="mt-1 text-xs text-slate-400">Consulte o titular e os dependentes sem sair do cadastro.</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
                        title="Fechar"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="border-b border-white/10 bg-slate-900/40 px-5 py-3">
                    <div className="space-y-3">
                        <div>
                            <p className="mb-2 text-[10px] font-black uppercase tracking-[0.25em] text-slate-500">Titular</p>
                            {titularGroup ? (
                                <button
                                    type="button"
                                    onClick={() => setSelectedGroupId(titularGroup.id)}
                                    className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                                        selectedGroupId === titularGroup.id
                                            ? 'border-sky-400/40 bg-sky-500/20 text-sky-100'
                                            : 'border-white/10 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200'
                                    }`}
                                >
                                    {customerName || 'Titular'}
                                </button>
                            ) : (
                                <p className="text-xs text-slate-500">Sem historico do titular.</p>
                            )}
                        </div>

                        <div>
                            <p className="mb-2 text-[10px] font-black uppercase tracking-[0.25em] text-slate-500">Dependentes</p>
                            {dependenteGroups.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                    {dependenteGroups.map(group => (
                                        <button
                                            key={group.id}
                                            type="button"
                                            onClick={() => setSelectedGroupId(group.id)}
                                            className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                                                selectedGroupId === group.id
                                                    ? 'border-sky-400/40 bg-sky-500/20 text-sky-100'
                                                    : 'border-white/10 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200'
                                            }`}
                                        >
                                            {group.label}
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-xs text-slate-500">Nenhum dependente com historico de graus.</p>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4 custom-scrollbar">
                    {isLoading ? (
                        <div className="flex h-full min-h-[260px] flex-col items-center justify-center text-slate-400">
                            <Loader2 className="mb-3 h-8 w-8 animate-spin text-sky-400" />
                            <p className="text-sm font-medium">Carregando historico de graus...</p>
                        </div>
                    ) : selectedGroup?.receitas.length ? (
                        <div className="space-y-4">
                            {selectedGroup.receitas.map(rx => (
                                <div key={rx.id} className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                                    <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-3">
                                        <div className="space-y-1">
                                            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-bold text-white">
                                                <UserRound className="h-3.5 w-3.5 text-slate-400" />
                                                {selectedGroup.dependenteId === null ? customerName || 'Titular' : selectedGroup.label}
                                            </div>
                                            <div className="inline-flex items-center gap-2 rounded-full border border-sky-500/20 bg-sky-500/10 px-2.5 py-1 text-[11px] font-bold text-sky-200">
                                                <Calendar className="h-3.5 w-3.5" />
                                                {formatDate(rx.dataCompra)}
                                            </div>
                                            <p className="text-[11px] text-slate-500">OS #{rx.id}</p>
                                        </div>
                                        {rx.medico && (
                                            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-slate-300">
                                                <UserRound className="h-3.5 w-3.5 text-slate-500" />
                                                Dr(a). {rx.medico}
                                            </div>
                                        )}
                                    </div>

                                    <div className="space-y-4">
                                        <PrescriptionGrid
                                            title="Para Longe"
                                            values={{
                                                odEsf: rx.longeOdEsf,
                                                odCil: rx.longeOdCil,
                                                odEixo: rx.longeOdEixo,
                                                oeEsf: rx.longeOeEsf,
                                                oeCil: rx.longeOeCil,
                                                oeEixo: rx.longeOeEixo
                                            }}
                                        />

                                        <PrescriptionGrid
                                            title="Para Perto"
                                            values={{
                                                odEsf: rx.pertoOdEsf,
                                                odCil: rx.pertoOdCil,
                                                odEixo: rx.pertoOdEixo,
                                                oeEsf: rx.pertoOeEsf,
                                                oeCil: rx.pertoOeCil,
                                                oeEixo: rx.pertoOeEixo
                                            }}
                                        />

                                        {rx.adicao && (
                                            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
                                                Adicao: <strong>{rx.adicao}</strong>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex h-full min-h-[260px] flex-col items-center justify-center text-center text-slate-500">
                            <Glasses className="mb-3 h-10 w-10 opacity-50" />
                            <p className="text-sm font-semibold text-slate-300">
                                Nenhuma receita encontrada para {selectedGroup?.dependenteId === null ? customerName || 'o titular' : selectedGroup?.label || 'esta selecao'}.
                            </p>
                            <p className="mt-1 text-xs">As receitas aparecem aqui a partir das OSs salvas com campos de grau preenchidos.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
