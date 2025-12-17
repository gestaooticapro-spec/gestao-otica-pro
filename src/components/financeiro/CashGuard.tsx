// ARQUIVO: src/components/financeiro/CashGuard.tsx
'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, Unlock, AlertTriangle, X, Loader2 } from 'lucide-react'
import { verificarStatusCaixa, abrirCaixa } from '@/lib/actions/cashflow.actions'

export default function CashGuard({ storeId }: { storeId: number }) {
    const router = useRouter()
    
    // O Guard começa "invisível" até checarmos o status
    const [isVisible, setIsVisible] = useState(false)
    const [isPending, startTransition] = useTransition()
    
    // Checagem inicial ao carregar a página
    useEffect(() => {
        const check = async () => {
            const caixaAberto = await verificarStatusCaixa(storeId)
            // Se NÃO estiver aberto, mostramos o Guard
            if (!caixaAberto) {
                setIsVisible(true)
            }
        }
        check()
    }, [storeId])

    const handleAbrir = async (formData: FormData) => {
        startTransition(async () => {
            const res = await abrirCaixa(null, formData)
            if (res.success) {
                setIsVisible(false) // Fecha o modal
                router.refresh()    // Atualiza a tela
            } else {
                alert(res.message)
            }
        })
    }

    const handlePular = () => {
        if (confirm("Tem certeza? O caixa continuará fechado e as movimentações não serão registradas corretamente.")) {
            setIsVisible(false)
        }
    }

    if (!isVisible) return null

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/90 backdrop-blur-md p-4 animate-in fade-in duration-500">
            <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden relative">
                
                {/* Botão de Fechar discreto (Pular) */}
                <button 
                    onClick={handlePular}
                    className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
                    title="Pular abertura (Emergência)"
                >
                    <X className="h-6 w-6" />
                </button>

                <div className="p-8 text-center">
                    <div className="w-20 h-20 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
                        <Lock className="h-10 w-10" />
                    </div>
                    
                    <h2 className="text-2xl font-black text-slate-800 mb-2">Caixa Fechado</h2>
                    <p className="text-slate-500 mb-8">
                        Bom dia! Antes de começar a vender, precisamos abrir o caixa.
                    </p>

                    <form action={handleAbrir} className="space-y-4 text-left">
                        <input type="hidden" name="store_id" value={storeId} />
                        
                        <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase mb-1 ml-1">Fundo de Troco (Dinheiro)</label>
                            <div className="relative">
                                <span className="absolute left-4 top-3.5 text-slate-400 font-bold">R$</span>
                                <input 
                                    name="saldo_inicial" 
                                    type="number" 
                                    step="0.01" 
                                    className="w-full h-14 pl-12 rounded-xl border-2 border-slate-200 text-2xl font-black text-slate-800 focus:border-amber-500 focus:ring-amber-500 transition-all"
                                    placeholder="0.00"
                                    autoFocus
                                    required
                                />
                            </div>
                        </div>

                        <button 
                            disabled={isPending}
                            className="w-full py-4 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold shadow-lg shadow-amber-200 flex items-center justify-center gap-2 transition-transform active:scale-95 disabled:opacity-70"
                        >
                            {isPending ? <Loader2 className="h-6 w-6 animate-spin"/> : <Unlock className="h-6 w-6" />}
                            ABRIR CAIXA AGORA
                        </button>
                    </form>

                    <button 
                        onClick={handlePular}
                        className="mt-6 text-xs font-bold text-slate-400 hover:text-red-500 flex items-center justify-center gap-1 mx-auto transition-colors"
                    >
                        <AlertTriangle className="h-3 w-3" />
                        Pular abertura (Atender emergência)
                    </button>
                </div>
            </div>
        </div>
    )
}