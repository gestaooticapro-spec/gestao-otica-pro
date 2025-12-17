'use client'

import { useState, useEffect, useTransition } from 'react'
import { Search, X, Loader2, Save, Truck, User, Microscope } from 'lucide-react'
import { searchOSForLab, updateLabTracking, getEmployees, LabOSResult, EmployeeSimple } from '@/lib/actions/lab.actions'

interface Props {
    isOpen: boolean
    onClose: () => void
    storeId: number
}

export default function LabTrackingModal({ isOpen, onClose, storeId }: Props) {
    const [step, setStep] = useState<'search' | 'edit'>('search')
    const [query, setQuery] = useState('')
    const [results, setResults] = useState<LabOSResult[]>([])
    const [selectedOS, setSelectedOS] = useState<LabOSResult | null>(null)
    const [employees, setEmployees] = useState<EmployeeSimple[]>([]) // Lista de Funcionários
    const [isPending, startTransition] = useTransition()

    // Carrega funcionários ao abrir o modal
    useEffect(() => {
        if (isOpen) {
            getEmployees(storeId).then(setEmployees)
        }
    }, [isOpen, storeId])

    if (!isOpen) return null

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
        setStep('edit')
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

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                
                {/* HEADER */}
                <div className="bg-slate-800 p-4 flex justify-between items-center text-white shrink-0">
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
                                className="flex-1 border-2 border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-700 focus:border-orange-500 focus:outline-none"
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                            />
                            <button disabled={isPending} className="bg-orange-500 hover:bg-orange-600 text-white px-6 rounded-xl font-bold transition-colors flex items-center gap-2">
                                {isPending ? <Loader2 className="h-5 w-5 animate-spin"/> : <Search className="h-5 w-5"/>}
                                Buscar
                            </button>
                        </form>

                        <div className="space-y-2">
                            {results.map(os => (
                                <button 
                                    key={os.id}
                                    onClick={() => handleSelect(os)}
                                    className="w-full text-left p-4 rounded-xl border border-slate-100 hover:border-orange-200 hover:bg-orange-50 transition-all group"
                                >
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="font-black text-slate-700 text-lg group-hover:text-orange-700">OS #{os.id}</span>
                                        <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded ${
                                            os.status === 'Fechada' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                                        }`}>
                                            {os.status}
                                        </span>
                                    </div>
                                    <div className="flex flex-col gap-1 text-slate-500 text-sm">
                                        <div className="flex items-center gap-2">
                                            <User className="h-4 w-4" />
                                            <span className="font-bold">{os.customer_name}</span>
                                        </div>
                                        {os.dependente_name && (
                                            <div className="flex items-center gap-2 pl-6 text-xs text-orange-600 font-medium">
                                                <span>↳ Dep: {os.dependente_name}</span>
                                            </div>
                                        )}
                                    </div>
                                </button>
                            ))}
                            {query && results.length === 0 && !isPending && (
                                <p className="text-center text-slate-400 py-8">Nenhuma OS encontrada com estes dados.</p>
                            )}
                        </div>
                    </div>
                )}

                {/* PASSO 2: EDIÇÃO */}
                {step === 'edit' && selectedOS && (
                    <form action={handleSave} className="flex flex-col h-full">
                        <div className="p-6 bg-slate-50 flex-1 overflow-y-auto">
                            
                            <div className="bg-orange-500 rounded-xl p-5 shadow-lg text-white">
                                <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest mb-4 opacity-90 border-b border-orange-400/50 pb-2">
                                    <Truck className="h-4 w-4" /> Atualizar Status
                                </h3>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                                    {/* PEDIDO EM */}
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold uppercase opacity-80">Pedido Em</label>
                                        <input 
                                            type="datetime-local" 
                                            name="dt_pedido_em"
                                            defaultValue={formatForInput(selectedOS.dt_pedido_em)}
                                            className="w-full rounded-lg px-3 py-2 text-xs font-bold text-slate-800 shadow-sm focus:ring-2 focus:ring-orange-300 outline-none" 
                                        />
                                    </div>

                                    {/* PEDIDO POR (AGORA É UM SELECT) */}
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold uppercase opacity-80">Pedido Por</label>
                                        <div className="relative text-slate-800">
                                            <User className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400 z-10" />
                                            <select 
                                                name="lab_pedido_por_id"
                                                defaultValue={selectedOS.lab_pedido_por_id || ''}
                                                className="w-full rounded-lg pl-9 pr-3 py-2 text-xs font-bold bg-white text-slate-800 shadow-sm focus:ring-2 focus:ring-orange-300 outline-none appearance-none cursor-pointer"
                                            >
                                                <option value="">Selecione...</option>
                                                {employees.map(emp => (
                                                    <option key={emp.id} value={emp.id}>
                                                        {emp.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    {/* LABORATÓRIO */}
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold uppercase opacity-80">Laboratório</label>
                                        <div className="relative text-slate-800">
                                            <Microscope className="absolute left-2.5 top-2 h-4 w-4 text-slate-400" />
                                            <input 
                                                type="text" 
                                                name="lab_nome"
                                                placeholder="Ex: Hoya"
                                                defaultValue={selectedOS.lab_nome || ''}
                                                className="w-full rounded-lg pl-9 pr-3 py-2 text-xs font-bold shadow-sm focus:ring-2 focus:ring-orange-300 outline-none" 
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold uppercase opacity-80">Lente Chegou</label>
                                        <input 
                                            type="datetime-local" 
                                            name="dt_lente_chegou"
                                            defaultValue={formatForInput(selectedOS.dt_lente_chegou)}
                                            className="w-full rounded-lg px-3 py-2 text-xs font-bold text-slate-800 shadow-sm focus:ring-2 focus:ring-orange-300 outline-none" 
                                        />
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold uppercase opacity-80">Montado Em</label>
                                        <input 
                                            type="datetime-local" 
                                            name="dt_montado_em"
                                            defaultValue={formatForInput(selectedOS.dt_montado_em)}
                                            className="w-full rounded-lg px-3 py-2 text-xs font-bold text-slate-800 shadow-sm focus:ring-2 focus:ring-orange-300 outline-none" 
                                        />
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold uppercase opacity-80">Entregue Cliente</label>
                                        <input 
                                            type="datetime-local" 
                                            name="dt_entregue_em"
                                            defaultValue={formatForInput(selectedOS.dt_entregue_em)}
                                            className="w-full rounded-lg px-3 py-2 text-xs font-bold text-slate-800 shadow-sm focus:ring-2 focus:ring-orange-300 outline-none" 
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 shrink-0">
                            <button 
                                type="button"
                                onClick={() => setStep('search')}
                                className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-200 rounded-lg transition-colors"
                            >
                                Voltar
                            </button>
                            <button 
                                disabled={isPending}
                                className="px-6 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-lg shadow-lg flex items-center gap-2 transition-colors"
                            >
                                {isPending ? <Loader2 className="h-4 w-4 animate-spin"/> : <Save className="h-4 w-4" />}
                                Salvar
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    )
}