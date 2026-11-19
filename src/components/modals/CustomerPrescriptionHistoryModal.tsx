'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { X, Loader2, Glasses, Calendar, UserRound, Pencil, Trash2 } from 'lucide-react'
import ManualPrescriptionForm from '@/components/ManualPrescriptionForm'
import { deleteManualPrescription, getManualPrescriptionHistory } from '@/lib/actions/manual-prescriptions.actions'
import type { ManualPrescription } from '@/lib/manual-prescriptions'
import {
    getCustomerPrescriptionSummary,
    type PrescriptionSummaryGroup, type PrescriptionSummary
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
    // Datas de receita sao datas civis (DATE no banco). Interpretar
    // `YYYY-MM-DD` como UTC faz o fuso brasileiro mostrar o dia anterior.
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
    if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`
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
    const [historyGroups, setGroups] = useState<PrescriptionSummaryGroup[]>([])
    const [selectedGroupId, setSelectedGroupId] = useState('titular')
    const [manual, setManual] = useState<Awaited<ReturnType<typeof getManualPrescriptionHistory>> | null>(null)
    const [manualError, setManualError] = useState('')
    const [historyError, setHistoryError] = useState('')
    const [form, setForm] = useState<'new' | ManualPrescription | null>(null)
    const [reload, setReload] = useState(0)
    const [deletingId, setDeletingId] = useState<number | null>(null)
    const [deleteError, setDeleteError] = useState('')
    const deleteRequest = useRef(0)

    useEffect(() => {
        setDeletingId(null)
        setDeleteError('')
        return () => { deleteRequest.current++ }
    }, [isOpen, customerId, storeId])

    useEffect(() => {
        if (!isOpen || !customerId) return

        let isMounted = true

        const load = async () => {
            setIsLoading(true)
            setManualError('')
            setHistoryError('')
            try {
                const [history, available] = await Promise.allSettled([
                    getCustomerPrescriptionSummary(customerId, storeId),
                    getManualPrescriptionHistory(storeId, customerId),
                ])
                if (!isMounted) return
                if (history.status === 'fulfilled') setGroups(history.value)
                else setHistoryError('Não foi possível carregar o histórico das OSs.')
                if (available.status === 'fulfilled') setManual(available.value)
                else setManualError('Não foi possível carregar os graus avulsos.')
            } finally {
                if (isMounted) setIsLoading(false)
            }
        }

        load()

        return () => {
            isMounted = false
        }
    }, [isOpen, customerId, storeId, reload])

    useEffect(() => {
        if (!isOpen) {
            setGroups([])
            setManual(null)
            setSelectedGroupId('titular')
            setForm(null)
        }
    }, [isOpen])

    const groups = useMemo(() => {
        const byId = new Map(historyGroups.map(group => [group.id, { ...group, receitas: [...group.receitas] }]))
        if (!byId.has('titular')) {
            byId.set('titular', { id: 'titular', label: 'Titular', dependenteId: null, receitas: [] })
        }
        for (const dep of manual?.dependents ?? []) {
            const id = `dependente-${dep.id}`
            if (!byId.has(id)) byId.set(id, { id, label: dep.nome, dependenteId: dep.id, receitas: [] })
        }
        for (const rx of manual?.recipes ?? []) {
            const group = byId.get(rx.dependente_id === null ? 'titular' : `dependente-${rx.dependente_id}`)
            group?.receitas.push({
                id: rx.id, origem: 'avulso', dataCompra: rx.data_receita, descricaoServico: rx.obs_os,
                medico: manual?.doctors.find(doctor => doctor.id === rx.oftalmologista_id)?.nome ?? null,
                longeOdEsf: rx.receita_longe_od_esferico, longeOdCil: rx.receita_longe_od_cilindrico, longeOdEixo: rx.receita_longe_od_eixo,
                longeOeEsf: rx.receita_longe_oe_esferico, longeOeCil: rx.receita_longe_oe_cilindrico, longeOeEixo: rx.receita_longe_oe_eixo,
                pertoOdEsf: rx.receita_perto_od_esferico, pertoOdCil: rx.receita_perto_od_cilindrico, pertoOdEixo: rx.receita_perto_od_eixo,
                pertoOeEsf: rx.receita_perto_oe_esferico, pertoOeCil: rx.receita_perto_oe_cilindrico, pertoOeEixo: rx.receita_perto_oe_eixo,
                adicao: rx.receita_adicao,
                medidas: [
                    ['DNP OD', rx.medida_dnp_od], ['DNP OE', rx.medida_dnp_oe],
                    ['Altura OD', rx.medida_altura_od], ['Altura OE', rx.medida_altura_oe],
                ],
            })
        }
        for (const group of byId.values()) {
            group.receitas.sort((a, b) => b.dataCompra.localeCompare(a.dataCompra))
        }
        return [...byId.values()]
    }, [historyGroups, manual])

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

    const originLabel = (rx: PrescriptionSummary) =>
        rx.origem === 'avulso' ? 'Grau avulso' : rx.origem === 'legado' ? 'Sistema anterior' : `OS #${rx.id}`

    async function handleDelete(rx: PrescriptionSummary, patient: string) {
        if (!customerId || rx.origem !== 'avulso' || deletingId !== null) return
        if (!window.confirm(`Apagar permanentemente o grau avulso de ${patient}, de ${formatDate(rx.dataCompra)}?`)) return

        const request = ++deleteRequest.current
        setDeletingId(rx.id)
        setDeleteError('')
        try {
            const result = await deleteManualPrescription(storeId, customerId, rx.id)
            if (request !== deleteRequest.current) return
            if (result.success) {
                setManual(previous => previous && {
                    ...previous, recipes: previous.recipes.filter(recipe => recipe.id !== rx.id),
                })
            } else {
                setDeleteError(result.message || 'Não foi possível apagar a receita avulsa.')
            }
        } catch {
            if (request === deleteRequest.current) {
                setDeleteError('Não foi possível confirmar a exclusão. Confira o histórico antes de tentar novamente.')
            }
        } finally {
            if (request === deleteRequest.current) setDeletingId(null)
        }
    }

    if (!isOpen || !customerId) return null

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
            <div className="flex max-h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-950/95 shadow-2xl shadow-black/60">
                <div className="flex items-start justify-between gap-4 border-b border-white/10 bg-slate-900/80 px-5 py-4">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-sky-300">Historico de Graus</p>
                        <h3 className="mt-1 text-lg font-black text-white">{customerName || 'Cliente'}</h3>
                        <p className="mt-1 text-xs text-slate-400">Consulte o titular e os dependentes sem sair do cadastro.</p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                    {manual && !isLoading && !form && (
                        <button type="button" onClick={() => setForm('new')} disabled={deletingId !== null}
                            className="rounded-xl border border-sky-400/30 bg-sky-500/15 px-3 py-2 text-xs font-bold text-sky-100 hover:bg-sky-500/25 disabled:opacity-50">
                            Cadastrar grau
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
                        title="Fechar"
                    >
                        <X className="h-5 w-5" />
                    </button>
                    </div>
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
                                <p className="text-xs text-slate-500">Nenhum dependente cadastrado.</p>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4 custom-scrollbar">
                    {manualError && <p role="alert" className="mb-3 text-xs text-rose-300">{manualError}</p>}
                    {deleteError && <p role="alert" className="mb-3 text-xs text-rose-300">{deleteError}</p>}
                    {historyError && <p role="alert" className="mb-3 text-xs text-rose-300">{historyError}</p>}
                    {isLoading ? (
                        <div className="flex h-full min-h-[260px] flex-col items-center justify-center text-slate-400">
                            <Loader2 className="mb-3 h-8 w-8 animate-spin text-sky-400" />
                            <p className="text-sm font-medium">Carregando historico de graus...</p>
                        </div>
                    ) : form && manual ? (
                        <ManualPrescriptionForm key={form === 'new' ? 'new' : form.id}
                            storeId={storeId} customerId={customerId} customerName={customerName}
                            dependents={manual.dependents} doctors={manual.doctors}
                            selectedDependentId={selectedGroup?.dependenteId ?? null}
                            recipe={form === 'new' ? undefined : form}
                            onCancel={() => setForm(null)}
                            onSaved={id => {
                                setSelectedGroupId(id === null ? 'titular' : `dependente-${id}`)
                                setForm(null)
                                setReload(value => value + 1)
                            }} />
                    ) : selectedGroup?.receitas.length ? (
                        <div className="space-y-4">
                            {selectedGroup.receitas.map(rx => (
                                <div key={`${rx.origem ?? 'os'}-${rx.id}`} className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
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
                                            <p className="text-[11px] text-slate-500">
                                                {originLabel(rx)}
                                            </p>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            {rx.medico && (
                                                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-slate-300">
                                                    <UserRound className="h-3.5 w-3.5 text-slate-500" />
                                                    Dr(a). {rx.medico}
                                                </div>
                                            )}
                                            {rx.origem === 'avulso' && !manualError && (
                                                <>
                                                    <button type="button" disabled={deletingId !== null} onClick={() => {
                                                        const recipe = manual?.recipes.find(item => item.id === rx.id)
                                                        if (recipe) setForm(recipe)
                                                    }} className="inline-flex items-center gap-1.5 rounded-lg border border-sky-400/30 px-2.5 py-1.5 text-xs font-bold text-sky-200 hover:bg-sky-500/15 disabled:opacity-50">
                                                        <Pencil className="h-3.5 w-3.5" />
                                                        Editar
                                                    </button>
                                                    <button type="button" disabled={deletingId !== null}
                                                        onClick={() => handleDelete(rx, selectedGroup.dependenteId === null ? customerName || 'Titular' : selectedGroup.label)}
                                                        className="inline-flex items-center gap-1.5 rounded-lg border border-rose-400/30 px-2.5 py-1.5 text-xs font-bold text-rose-200 hover:bg-rose-500/15 disabled:opacity-50">
                                                        {deletingId === rx.id
                                                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                            : <Trash2 className="h-3.5 w-3.5" />}
                                                        {deletingId === rx.id ? 'Apagando…' : 'Apagar'}
                                                    </button>
                                                </>
                                            )}
                                        </div>
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

                                        {rx.medidas?.some(([, value]) => value) && (
                                            <div className="flex flex-wrap gap-3 text-xs text-slate-300">
                                                {rx.medidas.map(([label, value]) => value && (
                                                    <span key={label}><strong>{label}</strong> {value}</span>
                                                ))}
                                            </div>
                                        )}
                                        {rx.descricaoServico && (
                                            <p className="border-t border-dashed border-white/10 pt-3 text-xs text-slate-300">
                                                <strong>Observação:</strong> {rx.descricaoServico}
                                            </p>
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
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
