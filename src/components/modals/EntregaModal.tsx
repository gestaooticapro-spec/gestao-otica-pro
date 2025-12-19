'use client'

import { useState, useEffect, useTransition } from 'react'
import { createPortal } from 'react-dom' // <--- IMPORTAÇÃO NOVA
import { useRouter } from 'next/navigation'
import { Search, X, Loader2, Save, Truck, User, AlertCircle } from 'lucide-react'
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
    // Estado para controlar se a busca já foi feita (para exibir "Nenhum resultado" só na hora certa)
    const [hasSearched, setHasSearched] = useState(false) 
    
    const [selectedOS, setSelectedOS] = useState<LabOSResult | null>(null)
    const [employees, setEmployees] = useState<EmployeeSimple[]>([])
    const [isPending, startTransition] = useTransition()

    // Efeito para garantir que rodamos no cliente (Portal requirement)
    useEffect(() => {
        setMounted(true)
    }, [])

    // Reseta tudo quando o modal abre/fecha
    useEffect(() => {
        if (isOpen) {
            getEmployees(storeId).then(setEmployees)
            setStep('search')
            setQuery('')
            setResults([])
            setHasSearched(false) // Reset
            setSelectedOS(null)
        }
    }, [isOpen, storeId])

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault() // Impede reload da página
        if (!query.trim()) return
        
        // Limpa resultados anteriores antes de buscar
        setResults([])
        setHasSearched(false)

        startTransition(async () => {
            const data = await searchOSForLab(storeId, query)
            setResults(data)
            setHasSearched(true) // Marca que a busca terminou
        })
    }

    const handleSelect = (os: LabOSResult) => {
        if (os.status === 'Em Aberto') {
            onClose()
            if (os.venda_id) {
                router.push(`/dashboard/loja/${storeId}/vendas/${os.venda_id}`)
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

    // Se não estiver montado ou fechado, não renderiza nada
    if (!mounted || !isOpen) return null

    // --- PORTAL APLICADO ---
    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                
                <div className="bg-emerald-700 p-4 flex justify-between items-center text-white shrink-0">
                    <div className="flex items-center gap-2">
                        <Truck className="h-5 w-5 text-emerald-300" />
                        <h2 className="font-bold text-lg">
                            {step === 'search' ? 'Entrega de Óculos' : `Entregar OS #${selectedOS?.id}`}
                        </h2>
                    </div>
                    <button onClick={onClose} className="text-emerald-200 hover:text-white transition-colors">
                        <X className="h-6 w-6" />
                    </button>
                </div>

                {step === 'search' && (
                    <div className="p-6 flex-1 overflow-y-auto">
                        <form onSubmit={handleSearch} className="flex gap-2 mb-6">
                            <input 
                                autoFocus
                                type="text" 
                                placeholder="Nº OS, Nome Cliente ou Dependente..." 
                                className="flex-1 border-2 border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-700 focus:border-emerald-500 focus:outline-none"
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                            />
                            {/* type="submit" garante que o Enter funcione e chame handleSearch */}
                            <button type="submit" disabled={isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 rounded-xl font-bold transition-colors flex items-center gap-2">
                                {isPending ? <Loader2 className="h-5 w-5 animate-spin"/> : <Search className="h-5 w-5"/>}
                                Buscar
                            </button>
                        </form>

                        <div className="space-y-2">
                            {results.map(os => (
                                <button 
                                    key={os.id}
                                    onClick={() => handleSelect(os)}
                                    className="w-full text-left p-4 rounded-xl border border-slate-100 hover:border-emerald-200 hover:bg-emerald-50 transition-all group relative overflow-hidden"
                                >
                                    {os.status === 'Em Aberto' && (
                                        <div className="absolute right-0 top-0 bottom-0 w-1.5 bg-yellow-400" />
                                    )}

                                    <div className="flex justify-between items-center mb-1">
                                        <span className="font-black text-slate-700 text-lg group-hover:text-emerald-800">OS #{os.id}</span>
                                        <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded flex items-center gap-1 ${
                                            os.status === 'Fechada' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                                        }`}>
                                            {os.status === 'Em Aberto' && <AlertCircle className="h-3 w-3" />}
                                            {os.status}
                                        </span>
                                    </div>
                                    <div className="flex flex-col gap-1 text-slate-500 text-sm">
                                        <div className="flex items-center gap-2">
                                            <User className="h-4 w-4" />
                                            <span className="font-bold">{os.customer_name}</span>
                                        </div>
                                        {os.dependente_name && (
                                            <div className="flex items-center gap-2 pl-6 text-xs text-emerald-600 font-medium">
                                                <span>↳ Dep: {os.dependente_name}</span>
                                            </div>
                                        )}
                                    </div>
                                    
                                    <div className="mt-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                                            {os.status === 'Em Aberto' 
                                                ? 'Ir para pagamento →' 
                                                : 'Realizar entrega →'}
                                    </div>
                                </button>
                            ))}
                            
                            {/* Só exibe mensagem se JÁ buscou e não achou nada */}
                            {hasSearched && results.length === 0 && !isPending && (
                                <p className="text-center text-slate-400 py-8 font-medium">
                                    Nenhuma OS encontrada para "{query}".
                                </p>
                            )}
                        </div>
                    </div>
                )}

                {step === 'edit' && selectedOS && (
                    <form action={handleSave} className="flex flex-col h-full">
                        <div className="p-6 bg-slate-50 flex-1 overflow-y-auto">
                            
                            <div className="bg-emerald-600 rounded-xl p-5 shadow-lg text-white">
                                <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest mb-4 opacity-90 border-b border-emerald-400/50 pb-2">
                                    <Truck className="h-4 w-4" /> Confirmar Entrega
                                </h3>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4 opacity-70 hover:opacity-100 transition-opacity">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold uppercase opacity-80">Pedido Em</label>
                                        <input type="datetime-local" name="dt_pedido_em" defaultValue={formatForInput(selectedOS.dt_pedido_em)} className="w-full rounded-lg px-3 py-2 text-xs font-bold text-slate-800 shadow-sm outline-none" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold uppercase opacity-80">Pedido Por</label>
                                        <div className="relative text-slate-800">
                                            <User className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400 z-10" />
                                            <select name="lab_pedido_por_id" defaultValue={selectedOS.lab_pedido_por_id || ''} className="w-full rounded-lg pl-9 pr-3 py-2 text-xs font-bold bg-white text-slate-800 shadow-sm outline-none appearance-none cursor-pointer">
                                                <option value="">Selecione...</option>
                                                {employees.map(emp => (<option key={emp.id} value={emp.id}>{emp.name}</option>))}
                                            </select>
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold uppercase opacity-80">Laboratório</label>
                                        <input type="text" name="lab_nome" defaultValue={selectedOS.lab_nome || ''} className="w-full rounded-lg px-3 py-2 text-xs font-bold text-slate-800 shadow-sm outline-none" />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="space-y-1 opacity-70 hover:opacity-100">
                                        <label className="text-[10px] font-bold uppercase opacity-80">Lente Chegou</label>
                                        <input type="datetime-local" name="dt_lente_chegou" defaultValue={formatForInput(selectedOS.dt_lente_chegou)} className="w-full rounded-lg px-3 py-2 text-xs font-bold text-slate-800 shadow-sm outline-none" />
                                    </div>
                                    <div className="space-y-1 opacity-70 hover:opacity-100">
                                        <label className="text-[10px] font-bold uppercase opacity-80">Montado Em</label>
                                        <input type="datetime-local" name="dt_montado_em" defaultValue={formatForInput(selectedOS.dt_montado_em)} className="w-full rounded-lg px-3 py-2 text-xs font-bold text-slate-800 shadow-sm outline-none" />
                                    </div>

                                    <div className="space-y-1 scale-105 origin-left">
                                        <label className="text-[10px] font-bold uppercase text-white bg-emerald-800 px-2 py-0.5 rounded-full inline-block mb-1 shadow-sm">
                                            Entregue Cliente (Hoje)
                                        </label>
                                        <input 
                                            type="datetime-local" 
                                            name="dt_entregue_em"
                                            defaultValue={formatForInput(selectedOS.dt_entregue_em) || formatForInput(new Date().toISOString())}
                                            className="w-full rounded-lg px-3 py-2 text-sm font-black text-slate-800 shadow-lg ring-4 ring-emerald-400/30 focus:ring-emerald-300 outline-none" 
                                            autoFocus
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 shrink-0">
                            <button type="button" onClick={() => setStep('search')} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-200 rounded-lg transition-colors">Voltar</button>
                            <button disabled={isPending} className="px-6 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg shadow-lg flex items-center gap-2 transition-colors">
                                {isPending ? <Loader2 className="h-4 w-4 animate-spin"/> : <Save className="h-4 w-4" />}
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