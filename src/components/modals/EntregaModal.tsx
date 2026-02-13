'use client'

import { useState, useEffect, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Search, X, Loader2, Save, Truck, User, AlertCircle, Calendar, CheckCircle2, Microscope, Wrench } from 'lucide-react'
import { searchOSForLab, updateLabTracking, getEmployees, LabOSResult, EmployeeSimple } from '@/lib/actions/lab.actions'

interface Props {
    isOpen: boolean
    onClose: () => void
    storeId: number
}

export default function EntregaModal({ isOpen, onClose, storeId }: Props) {
    const router = useRouter()

    // --- ESTADO PARA O PORTAL ---
    const [mounted, setMounted] = useState(false)

    const [step, setStep] = useState<'search' | 'edit'>('search')
    const [query, setQuery] = useState('')
    const [results, setResults] = useState<LabOSResult[]>([])
    // Estado para controlar se a busca já foi feita
    const [hasSearched, setHasSearched] = useState(false)

    const [selectedOS, setSelectedOS] = useState<LabOSResult | null>(null)
    const [employees, setEmployees] = useState<EmployeeSimple[]>([])
    const [isPending, startTransition] = useTransition()

    useEffect(() => {
        setMounted(true)
    }, [])

    useEffect(() => {
        if (isOpen) {
            getEmployees(storeId).then(setEmployees)
            setStep('search')
            setQuery('')
            setResults([])
            setHasSearched(false)
            setSelectedOS(null)
        }
    }, [isOpen, storeId])

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!query.trim()) return

        setResults([])
        setHasSearched(false)

        startTransition(async () => {
            const data = await searchOSForLab(storeId, query)
            setResults(data)
            setHasSearched(true)
        })
    }

    const handleSelect = (os: LabOSResult) => {
        if (os.status === 'Em Aberto') {
            onClose()
            if (os.venda_id) {
                router.push(`/dashboard/loja/${storeId}/vendas/${os.venda_id}/experimental`)
            } else {
                router.push(`/dashboard/loja/${storeId}/vendas`)
            }
            return
        }

        setSelectedOS(os)
        setStep('edit')
    }

    const handleSave = async (formData: FormData) => {
        if (!selectedOS) return
        startTransition(async () => {
            const res = await updateLabTracking(selectedOS.id, storeId, formData)
            if (res.success) {
                onClose()
            } else {
                alert("Erro ao salvar.")
            }
        })
    }

    const formatForInput = (isoString: string | null) => {
        if (!isoString) return ''
        return new Date(isoString).toISOString().slice(0, 16)
    }

    if (!mounted || !isOpen) return null

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-slate-950 w-full max-w-2xl rounded-2xl shadow-2xl border border-white/10 overflow-hidden flex flex-col max-h-[90vh]">

                {/* HEADER EMERALD (Contexto de Entrega/Sucesso) */}
                <div className="bg-emerald-950/30 border-b border-emerald-500/20 p-4 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                            <Truck className="h-5 w-5 text-emerald-400" />
                        </div>
                        <div>
                            <h2 className="font-bold text-lg text-emerald-100">
                                {step === 'search' ? 'Entrega de Óculos' : `Entregar OS #${selectedOS?.id}`}
                            </h2>
                            <p className="text-[10px] uppercase tracking-wider text-emerald-500/60 font-bold">
                                {step === 'search' ? 'Localizar Ordem de Serviço' : 'Confirmação de Recebimento'}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full text-slate-400 hover:text-white transition-colors">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {step === 'search' && (
                    <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
                        <form onSubmit={handleSearch} className="flex gap-2 mb-6">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
                                <input
                                    autoFocus
                                    type="text"
                                    placeholder="Nº OS, Protocolo, Nome Cliente..."
                                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 font-medium text-slate-200 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 focus:outline-none placeholder:text-slate-600 transition-all"
                                    value={query}
                                    onChange={e => setQuery(e.target.value)}
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={isPending}
                                className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 rounded-xl font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-900/20 active:scale-95 flex items-center gap-2"
                            >
                                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                                Buscar
                            </button>
                        </form>

                        <div className="space-y-2">
                            {results.map(os => (
                                <button
                                    key={os.id}
                                    onClick={() => handleSelect(os)}
                                    className="w-full text-left p-4 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-emerald-500/5 hover:border-emerald-500/20 transition-all group relative overflow-hidden"
                                >
                                    {os.status === 'Em Aberto' && (
                                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500/50" />
                                    )}
                                    {os.status === 'Fechada' && (
                                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500/50" />
                                    )}

                                    <div className="flex justify-between items-start mb-2 pl-2">
                                        <div className="flex items-center gap-3">
                                            <span className="font-black text-slate-200 text-lg group-hover:text-emerald-400 transition-colors">OS #{os.id}</span>
                                            {os.protocolo_fisico && (
                                                <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-white/5 font-mono">
                                                    P: {os.protocolo_fisico}
                                                </span>
                                            )}
                                        </div>
                                        <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded flex items-center gap-1.5 border backdrop-blur-md ${os.status === 'Fechada'
                                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                            : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                            }`}>
                                            {os.status === 'Em Aberto' && <AlertCircle className="h-3 w-3" />}
                                            {os.status === 'Fechada' && <CheckCircle2 className="h-3 w-3" />}
                                            {os.status}
                                        </span>
                                    </div>

                                    <div className="flex flex-col gap-1 pl-2">
                                        <div className="flex items-center gap-2 text-slate-400">
                                            <User className="h-3.5 w-3.5 text-slate-500" />
                                            <span className="font-medium text-sm">{os.customer_name}</span>
                                        </div>
                                        {os.dependente_name && (
                                            <div className="flex items-center gap-2 pl-5 text-xs text-slate-500 group-hover:text-slate-400 transition-colors">
                                                <span>↳ Dep: {os.dependente_name}</span>
                                            </div>
                                        )}
                                    </div>

                                    <div className="mt-3 pl-2 text-[10px] font-bold uppercase tracking-wide text-slate-500 group-hover:text-emerald-500/70 transition-colors flex items-center justify-end">
                                        {os.status === 'Em Aberto'
                                            ? 'Ir para pagamento →'
                                            : 'Realizar entrega →'}
                                    </div>
                                </button>
                            ))}

                            {hasSearched && results.length === 0 && !isPending && (
                                <div className="text-center py-12 flex flex-col items-center gap-3">
                                    <div className="p-4 bg-white/5 rounded-full">
                                        <Search className="h-8 w-8 text-slate-600" />
                                    </div>
                                    <p className="text-slate-400 font-medium">Nenhuma OS encontrada.</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {step === 'edit' && selectedOS && (
                    <form action={handleSave} className="flex flex-col h-full">
                        <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">

                            <div className="bg-emerald-900/20 border border-emerald-500/20 rounded-xl p-5 mb-6 text-emerald-100 relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-4 opacity-10">
                                    <Truck className="h-24 w-24 text-emerald-500" />
                                </div>

                                <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest mb-4 opacity-90 pb-2 border-b border-emerald-500/20">
                                    <CheckCircle2 className="h-4 w-4 text-emerald-400" /> Confirmar Entrega
                                </h3>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 relative z-10">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold uppercase text-emerald-500/70 flex items-center gap-1.5">
                                            <Calendar className="h-3 w-3" /> Pedido Em
                                        </label>
                                        <input
                                            type="datetime-local"
                                            name="dt_pedido_em"
                                            defaultValue={formatForInput(selectedOS.dt_pedido_em)}
                                            className="w-full bg-emerald-950/40 border border-emerald-500/20 rounded-lg px-3 py-2 text-xs font-bold text-emerald-100 shadow-sm focus:border-emerald-400/50 outline-none transition-colors"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold uppercase text-emerald-500/70 flex items-center gap-1.5">
                                            <User className="h-3 w-3" /> Pedido Por
                                        </label>
                                        <div className="relative">
                                            <select
                                                name="lab_pedido_por_id"
                                                defaultValue={selectedOS.lab_pedido_por_id || ''}
                                                className="w-full bg-emerald-950/40 border border-emerald-500/20 rounded-lg px-3 py-2 text-xs font-bold text-emerald-100 shadow-sm focus:border-emerald-400/50 outline-none appearance-none cursor-pointer"
                                            >
                                                <option value="" className="bg-slate-900 text-slate-400">Selecione...</option>
                                                {employees.map(emp => (
                                                    <option key={emp.id} value={emp.id} className="bg-slate-900 text-white">{emp.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold uppercase text-emerald-500/70 flex items-center gap-1.5">
                                            <Microscope className="h-3 w-3" /> Laboratório
                                        </label>
                                        <input
                                            type="text"
                                            name="lab_nome"
                                            defaultValue={selectedOS.lab_nome || ''}
                                            className="w-full bg-emerald-950/40 border border-emerald-500/20 rounded-lg px-3 py-2 text-xs font-bold text-emerald-100 shadow-sm focus:border-emerald-400/50 outline-none"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 relative z-10">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold uppercase text-emerald-500/70 flex items-center gap-1.5">
                                            <Calendar className="h-3 w-3" /> Lente Chegou
                                        </label>
                                        <input
                                            type="datetime-local"
                                            name="dt_lente_chegou"
                                            defaultValue={formatForInput(selectedOS.dt_lente_chegou)}
                                            className="w-full bg-emerald-950/40 border border-emerald-500/20 rounded-lg px-3 py-2 text-xs font-bold text-emerald-100 shadow-sm outline-none focus:border-emerald-400/50"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold uppercase text-emerald-500/70 flex items-center gap-1.5">
                                            <Wrench className="h-3 w-3" /> Montado Em
                                        </label>
                                        <input
                                            type="datetime-local"
                                            name="dt_montado_em"
                                            defaultValue={formatForInput(selectedOS.dt_montado_em)}
                                            className="w-full bg-emerald-950/40 border border-emerald-500/20 rounded-lg px-3 py-2 text-xs font-bold text-emerald-100 shadow-sm outline-none focus:border-emerald-400/50"
                                        />
                                    </div>

                                    <div className="space-y-1.5 scale-105 origin-left">
                                        <label className="text-[10px] font-black uppercase text-emerald-300 bg-emerald-500/20 border border-emerald-500/30 px-2 py-0.5 rounded-full inline-block mb-1 shadow-sm flex items-center gap-1.5 w-fit">
                                            <CheckCircle2 className="h-3 w-3" /> Entregue Cliente
                                        </label>
                                        <input
                                            type="datetime-local"
                                            name="dt_entregue_em"
                                            defaultValue={formatForInput(selectedOS.dt_entregue_em) || formatForInput(new Date().toISOString())}
                                            className="w-full bg-emerald-950 border border-emerald-400/50 rounded-lg px-3 py-2 text-sm font-black text-emerald-300 shadow-lg shadow-emerald-900/50 focus:ring-2 focus:ring-emerald-500/50 outline-none"
                                            autoFocus
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 border-t border-white/10 bg-white/5 flex justify-end gap-3 shrink-0">
                            <button
                                type="button"
                                onClick={() => setStep('search')}
                                className="px-4 py-2 text-slate-400 font-bold hover:bg-white/5 hover:text-white rounded-lg transition-colors text-sm uppercase tracking-wide"
                            >
                                Voltar
                            </button>
                            <button
                                disabled={isPending}
                                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg shadow-lg shadow-emerald-900/30 flex items-center gap-2 transition-all active:scale-95 text-sm uppercase tracking-wide"
                            >
                                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                Confirmar Entrega
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>,
        document.body
    )
}