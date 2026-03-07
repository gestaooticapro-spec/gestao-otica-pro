'use client'

import { useState, useEffect, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { Search, X, Loader2, Save, Truck, User, Microscope, MessageCircle } from 'lucide-react'
import {
    searchOSForLab,
    updateLabTracking,
    getEmployees,
    updateCustomerPhone, // <--- ADICIONADO
    LabOSResult,
    EmployeeSimple
} from '@/lib/actions/lab.actions'

interface Props {
    isOpen: boolean
    onClose: () => void
    storeId: number
}

export default function LabTrackingModal({ isOpen, onClose, storeId }: Props) {
    // --- ESTADO PARA O PORTAL ---
    const [mounted, setMounted] = useState(false)

    const [step, setStep] = useState<'search' | 'edit'>('search')
    const [query, setQuery] = useState('')
    const [results, setResults] = useState<LabOSResult[]>([])
    const [selectedOS, setSelectedOS] = useState<LabOSResult | null>(null)
    const [employees, setEmployees] = useState<EmployeeSimple[]>([]) // Lista de Funcionários
    const [isPending, startTransition] = useTransition()

    // --- ESTADOS PARA WHATSAPP ---
    const [isEditingPhone, setIsEditingPhone] = useState(false)
    const [newPhone, setNewPhone] = useState('')
    const [updatingPhone, setUpdatingPhone] = useState(false)
    const [tempPhone, setTempPhone] = useState<string | null>(null)

    // Efeito para garantir que rodamos no cliente (Portal requirement)
    useEffect(() => {
        setMounted(true)
    }, [])

    // Carrega funcionários ao abrir o modal
    useEffect(() => {
        if (isOpen) {
            getEmployees(storeId).then(setEmployees)
        }
    }, [isOpen, storeId])

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!query.trim()) return
        startTransition(async () => {
            const data = await searchOSForLab(storeId, query)
            setResults(data)
        })
    }

    const handleSelect = (os: LabOSResult) => {
        setSelectedOS(os)
        setTempPhone(null) // Reset ao trocar de OS
        setIsEditingPhone(false)
        setNewPhone('')
        setStep('edit')
    }

    const handleUpdatePhone = async () => {
        if (!selectedOS?.customer_id || !newPhone.trim()) return
        setUpdatingPhone(true)
        const res = await updateCustomerPhone(selectedOS.customer_id, storeId, newPhone)
        if (res.success) {
            setTempPhone(newPhone)
            setIsEditingPhone(false)
        } else {
            alert("Erro ao atualizar telefone.")
        }
        setUpdatingPhone(false)
    }

    const handleSave = async (formData: FormData) => {
        if (!selectedOS) return
        startTransition(async () => {
            const res = await updateLabTracking(selectedOS.id, storeId, formData)
            if (res.success) {
                onClose()
                setStep('search')
                setQuery('')
                setResults([])
                setSelectedOS(null)
            } else {
                alert("Erro ao salvar.")
            }
        })
    }

    const formatForInput = (isoString: string | null) => {
        if (!isoString) return ''
        return new Date(isoString).toISOString().slice(0, 16)
    }

    // Se não estiver montado ou fechado, não renderiza nada
    if (!mounted || !isOpen) return null

    // Telefone atual (do banco ou o que acabou de ser digitado)
    const currentPhone = tempPhone || selectedOS?.customer_phone

    // --- PORTAL APLICADO ---
    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-in fade-in">
            <div className="bg-slate-900/95 backdrop-blur-xl w-full max-w-2xl rounded-2xl shadow-2xl shadow-black/50 overflow-hidden flex flex-col max-h-[90vh] border border-white/10">

                {/* HEADER */}
                <div className="bg-slate-800/60 backdrop-blur-md p-4 flex justify-between items-center text-white shrink-0 border-b border-white/10">
                    <div className="flex items-center gap-2">
                        <Truck className="h-5 w-5 text-orange-400" />
                        <h2 className="font-bold text-lg">
                            {step === 'search' ? 'Rastrear Lentes' : `OS #${selectedOS?.id}`}
                        </h2>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                        <X className="h-6 w-6" />
                    </button>
                </div>

                {/* PASSO 1: BUSCA */}
                {step === 'search' && (
                    <div className="p-6 flex-1 overflow-y-auto">
                        <form onSubmit={handleSearch} className="flex gap-2 mb-6">
                            <input
                                autoFocus
                                type="text"
                                placeholder="Nº OS, Nome Cliente ou Dependente..."
                                className="flex-1 border border-white/10 bg-black/20 rounded-xl px-4 py-3 font-bold text-white placeholder:text-slate-500 focus:ring-1 focus:ring-orange-500/50 focus:border-orange-500/50 outline-none backdrop-blur-sm"
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                            />
                            <button disabled={isPending} className="bg-orange-600 hover:bg-orange-500 text-white px-6 rounded-xl font-bold transition-colors flex items-center gap-2 border border-white/10 shadow-lg shadow-orange-500/20">
                                {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
                                Buscar
                            </button>
                        </form>

                        <div className="space-y-2">
                            {results.map(os => (
                                <button
                                    key={os.id}
                                    onClick={() => handleSelect(os)}
                                    className="w-full text-left p-4 rounded-xl border border-white/5 bg-white/5 hover:border-orange-500/30 hover:bg-orange-500/10 transition-all group"
                                >
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="font-black text-slate-200 text-lg group-hover:text-orange-400">OS #{os.id}</span>
                                        <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded border ${os.status === 'Fechada' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/20' : 'bg-white/10 text-slate-400 border-white/10'
                                            }`}>
                                            {os.status}
                                        </span>
                                    </div>
                                    <div className="flex flex-col gap-1 text-slate-400 text-sm">
                                        <div className="flex items-center gap-2">
                                            <User className="h-4 w-4" />
                                            <span className="font-bold">{os.customer_name}</span>
                                        </div>
                                        {os.dependente_name && (
                                            <div className="flex items-center gap-2 pl-6 text-xs text-orange-400 font-medium">
                                                <span>↳ Dep: {os.dependente_name}</span>
                                            </div>
                                        )}
                                    </div>
                                </button>
                            ))}
                            {query && results.length === 0 && !isPending && (
                                <p className="text-center text-slate-500 py-8">Nenhuma OS encontrada com estes dados.</p>
                            )}
                        </div>
                    </div>
                )}

                {/* PASSO 2: EDIÇÃO */}
                {step === 'edit' && selectedOS && (
                    <form action={handleSave} className="flex flex-col h-full">
                        <div className="p-6 bg-transparent flex-1 overflow-y-auto">

                            <div className="bg-orange-500/20 backdrop-blur-md rounded-xl p-5 shadow-lg text-white border border-orange-500/30">
                                <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest mb-4 opacity-90 border-b border-orange-500/30 pb-2 text-orange-300">
                                    <Truck className="h-4 w-4" /> Atualizar Status
                                </h3>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                                    {/* PEDIDO EM */}
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold uppercase opacity-80 text-orange-200">Pedido Em</label>
                                        <input
                                            type="datetime-local"
                                            name="dt_pedido_em"
                                            defaultValue={formatForInput(selectedOS.dt_pedido_em)}
                                            className="w-full rounded-lg px-3 py-2 text-xs font-bold bg-black/20 border border-orange-500/20 text-white shadow-inner focus:ring-1 focus:ring-orange-500/50 outline-none"
                                        />
                                    </div>

                                    {/* PEDIDO POR (AGORA É UM SELECT) */}
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold uppercase opacity-80 text-orange-200">Pedido Por</label>
                                        <div className="relative text-white">
                                            <User className="absolute left-2.5 top-2.5 h-4 w-4 text-orange-300 z-10" />
                                            <select
                                                name="lab_pedido_por_id"
                                                defaultValue={selectedOS.lab_pedido_por_id || ''}
                                                className="w-full rounded-lg pl-9 pr-3 py-2 text-xs font-bold bg-black/20 border border-orange-500/20 text-white shadow-inner focus:ring-1 focus:ring-orange-500/50 outline-none appearance-none cursor-pointer"
                                            >
                                                <option value="" className="bg-slate-800">Selecione...</option>
                                                {employees.map(emp => (
                                                    <option key={emp.id} value={emp.id} className="bg-slate-800">
                                                        {emp.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    {/* LABORATÓRIO */}
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold uppercase opacity-80 text-orange-200">Laboratório</label>
                                        <div className="relative text-white">
                                            <Microscope className="absolute left-2.5 top-2 h-4 w-4 text-orange-300" />
                                            <input
                                                type="text"
                                                name="lab_nome"
                                                placeholder="Ex: Hoya"
                                                defaultValue={selectedOS.lab_nome || ''}
                                                className="w-full rounded-lg pl-9 pr-3 py-2 text-xs font-bold bg-black/20 border border-orange-500/20 text-white shadow-inner focus:ring-1 focus:ring-orange-500/50 outline-none placeholder:text-orange-500/30"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold uppercase opacity-80 text-orange-200">Lente Chegou</label>
                                        <input
                                            type="datetime-local"
                                            name="dt_lente_chegou"
                                            defaultValue={formatForInput(selectedOS.dt_lente_chegou)}
                                            className="w-full rounded-lg px-3 py-2 text-xs font-bold bg-black/20 border border-orange-500/20 text-white shadow-inner focus:ring-1 focus:ring-orange-500/50 outline-none"
                                        />
                                    </div>

                                    <div className="space-y-1">
                                        <div className="flex justify-between items-center h-4">
                                            <label className="text-[10px] font-bold uppercase opacity-80 text-orange-200">Montado Em</label>

                                            {/* SEÇÃO WHATSAPP DINÂMICA */}
                                            {selectedOS.dt_montado_em && (
                                                <div className="flex items-center gap-1">
                                                    {currentPhone ? (
                                                        <a
                                                            href={`https://wa.me/55${currentPhone.replace(/\D/g, '')}?text=${encodeURIComponent(`Olá ${selectedOS.customer_name.split(' ')[0]}! 👋 Passando para avisar que seus óculos já ficaram prontos! Quando quiser, pode vir fazer a retirada. Ficamos à disposição!`)}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="flex items-center gap-1 text-[9px] font-black uppercase text-emerald-400 hover:text-emerald-300 transition-colors bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20"
                                                        >
                                                            <MessageCircle className="h-2.5 w-2.5" />
                                                            Avisar Cliente
                                                        </a>
                                                    ) : isEditingPhone ? (
                                                        <div className="flex items-center gap-1 animate-in slide-in-from-right-2">
                                                            <input
                                                                autoFocus
                                                                type="text"
                                                                placeholder="Número WA..."
                                                                className="w-24 h-5 px-1 bg-emerald-950/50 border border-emerald-500/40 rounded text-[9px] text-emerald-200 placeholder:text-emerald-700 outline-none focus:ring-1 focus:ring-emerald-500"
                                                                value={newPhone}
                                                                onChange={e => setNewPhone(e.target.value)}
                                                                onKeyDown={e => e.key === 'Enter' && handleUpdatePhone()}
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={handleUpdatePhone}
                                                                disabled={updatingPhone}
                                                                className="h-5 px-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[9px] font-bold"
                                                            >
                                                                {updatingPhone ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : 'OK'}
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            onClick={() => setIsEditingPhone(true)}
                                                            className="flex items-center gap-1 text-[9px] font-black uppercase text-orange-400 hover:text-orange-300 transition-colors bg-orange-500/10 px-1.5 py-0.5 rounded border border-orange-500/20"
                                                        >
                                                            <MessageCircle className="h-2.5 w-2.5" />
                                                            Cadastrar WA
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        <input
                                            type="datetime-local"
                                            name="dt_montado_em"
                                            value={formatForInput(selectedOS.dt_montado_em)}
                                            onChange={e => setSelectedOS({ ...selectedOS, dt_montado_em: e.target.value || null })}
                                            className="w-full rounded-lg px-3 py-2 text-xs font-bold bg-black/20 border border-orange-500/20 text-white shadow-inner focus:ring-1 focus:ring-orange-500/50 outline-none"
                                        />
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold uppercase opacity-80 text-orange-200">Entregue Cliente</label>
                                        <input
                                            type="datetime-local"
                                            name="dt_entregue_em"
                                            defaultValue={formatForInput(selectedOS.dt_entregue_em)}
                                            className="w-full rounded-lg px-3 py-2 text-xs font-bold bg-black/20 border border-orange-500/20 text-white shadow-inner focus:ring-1 focus:ring-orange-500/50 outline-none"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 border-t border-white/10 bg-slate-800/60 backdrop-blur-md flex justify-end gap-3 shrink-0">
                            <button
                                type="button"
                                onClick={() => setStep('search')}
                                className="px-4 py-2 text-slate-400 font-bold hover:bg-white/10 rounded-lg transition-colors"
                            >
                                Voltar
                            </button>
                            <button
                                disabled={isPending}
                                className="px-6 py-2 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-lg shadow-lg flex items-center gap-2 transition-colors border border-white/10"
                            >
                                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                Salvar
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>,
        document.body
    )
}