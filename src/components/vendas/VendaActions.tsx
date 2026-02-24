// ARQUIVO: src/components/vendas/VendaActions.tsx
'use client'

import { useState, useTransition } from 'react'
import { useFormStatus } from 'react-dom'
import { updateVendaStatus } from '@/lib/actions/vendas.actions'
import { Database } from '@/lib/database.types'
import { Loader2, Check, X, Printer, RefreshCcw, CheckCircle2, Lock, Unlock, FileText } from 'lucide-react'
import ReturnModal from '@/components/modals/ReturnModal'
import EmployeeAuthModal from '@/components/modals/EmployeeAuthModal'
// import FiscalEmissionModal from '@/components/modals/FiscalEmissionModal'

type Venda = Database['public']['Tables']['vendas']['Row']
type VendaItem = Database['public']['Tables']['venda_itens']['Row']
type Employee = Database['public']['Tables']['employees']['Row']
type Customer = Database['public']['Tables']['customers']['Row'] // Importando Customer

interface VendaActionsProps {
    venda: Venda
    vendaItens: VendaItem[]
    customer: Customer | null // Adicionando prop customer
    onStatusChange: () => Promise<void>
    isVendaFechada: boolean
    onPrint: () => void
}

export default function VendaActions({
    venda,
    vendaItens,
    customer, // Recebendo prop
    onStatusChange,
    isVendaFechada,
    onPrint,
}: VendaActionsProps) {

    const [isReturnModalOpen, setIsReturnModalOpen] = useState(false)
    const [isAuthOpen, setIsAuthOpen] = useState(false)
    // const [isFiscalModalOpen, setIsFiscalModalOpen] = useState(false)
    const [authAction, setAuthAction] = useState<'Finalizar' | 'Reabrir' | null>(null)

    const [isPending, startTransition] = useTransition()

    const isSameDay = new Date(venda.created_at).toDateString() === new Date().toDateString()

    const hasRemaining = (venda.valor_restante ?? 0) > 0.01
    const hasFinance = !!venda.financiamento_id
    const isLocked = hasRemaining && !hasFinance

    const handleActionClick = (action: 'Finalizar' | 'Reabrir') => {
        setAuthAction(action)
        setIsAuthOpen(true)
    }

    const handleAuthSuccess = (employee: Pick<Employee, 'id' | 'full_name' | 'role'>) => {
        setIsAuthOpen(false)
        if (!authAction) return

        if (authAction === 'Reabrir') {
            const isOwner = employee.id === venda.employee_id
            const userRole = employee.role as string
            const isManager = userRole === 'gerente' || userRole === 'admin'

            if (!isOwner && !isManager) {
                alert(`Acesso Negado: Apenas o Vendedor original (${venda.employee_id}) ou um Gerente podem reabrir esta venda.`)
                return
            }
        }

        startTransition(async () => {
            const newStatus = authAction === 'Finalizar' ? 'Fechada' : 'Em Aberto'

            const result = await updateVendaStatus(
                venda.id,
                venda.store_id,
                newStatus,
                employee.id
            )

            if (result.success) {
                setTimeout(async () => {
                    await onStatusChange()
                    alert(result.message)
                }, 500)
            } else {
                alert(`Erro: ${result.message}`)
            }
        })
    }

    return (
        <div className="flex items-center gap-3">

            {/* GRUPO 1: BOTÕES DE AÇÃO DE STATUS */}

            {/* CASO: VENDA EM ABERTO */}
            {!isVendaFechada && venda.status !== 'Cancelada' && (
                <div className="flex gap-3">
                    <button
                        type="button"
                        disabled={isPending}
                        onClick={async () => {
                            if (confirm("Tem certeza que deseja cancelar esta venda?")) {
                                const res = await updateVendaStatus(venda.id, venda.store_id, 'Cancelada', 0)
                                if (res.success) onStatusChange()
                            }
                        }}
                        className="flex items-center gap-2 px-4 h-9 text-sm rounded-lg border border-red-500/50 text-red-400 hover:bg-red-500/10 font-bold transition-colors uppercase tracking-wide"
                    >
                        <X className="h-4 w-4" /> Cancelar
                    </button>

                    {isLocked ? (
                        <div className="flex items-center gap-2 px-4 h-9 text-sm rounded-lg bg-white/5 text-slate-500 font-bold cursor-not-allowed border border-white/10 uppercase tracking-wide" title="Zere o saldo ou gere um carnê para finalizar.">
                            <Lock className="h-4 w-4" />
                            <span>Falta Destinar</span>
                        </div>
                    ) : (
                        <button
                            type="button"
                            disabled={isPending}
                            onClick={() => handleActionClick('Finalizar')}
                            className="flex items-center gap-2 px-6 h-9 text-sm rounded-lg shadow-lg shadow-emerald-900/20 bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-transform active:scale-95 uppercase tracking-wide"
                        >
                            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                            <span>Finalizar Venda</span>
                        </button>
                    )}
                </div>
            )}

            {/* CASO: VENDA FECHADA */}
            {isVendaFechada && (
                <div className="flex gap-3 items-center">

                    <div className="flex items-center gap-2 text-emerald-400 bg-emerald-500/10 px-3 h-9 rounded-lg text-sm font-bold border border-emerald-500/20 cursor-default uppercase tracking-wide">
                        <CheckCircle2 className="h-4 w-4" /> Finalizada
                    </div>

                    {isSameDay && (
                        <button
                            type="button"
                            disabled={isPending}
                            onClick={() => handleActionClick('Reabrir')}
                            className="flex items-center gap-2 px-4 h-9 text-sm rounded-lg bg-amber-500/10 border border-amber-500/50 text-amber-500 hover:bg-amber-500/20 font-bold transition-colors uppercase tracking-wide"
                            title="Reabrir para correções (Estorna comissões)"
                        >
                            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlock className="h-4 w-4" />}
                            <span>Reabrir</span>
                        </button>
                    )}

                    <button
                        type="button"
                        onClick={() => setIsReturnModalOpen(true)}
                        className="flex items-center gap-2 px-4 h-9 text-sm rounded-lg bg-red-500/10 border border-red-500/50 text-red-500 hover:bg-red-500/20 font-bold transition-colors uppercase tracking-wide"
                    >
                        <RefreshCcw className="h-4 w-4" />
                        <span>Devolução</span>
                    </button>
                </div>
            )}

            {/* BOTÃO IMPRIMIR (AGORA GLOBAL / SEMPRE VISÍVEL) */}
            <button
                type="button"
                onClick={onPrint}
                className="flex items-center gap-2 px-4 h-9 text-sm rounded-lg bg-slate-700 text-white hover:bg-slate-600 font-bold transition-colors shadow-lg shadow-black/30 uppercase tracking-wide"
                title="Imprimir Recibos de Pagamento"
            >
                <Printer className="h-4 w-4" />
                <span>Imprimir</span>
            </button>

            {/* BOTÃO NFC-e (TEMPORARIAMENTE BLOQUEADO) */}
            <button
                type="button"
                disabled
                className="flex items-center gap-2 px-4 h-9 text-sm rounded-lg bg-white/5 text-slate-500 font-bold transition-colors border border-white/10 cursor-not-allowed uppercase tracking-wide"
                title="Funcionalidade em desenvolvimento"
            >
                <FileText className="h-4 w-4 opacity-50" />
                <div className="flex flex-col items-start leading-none justify-center h-full">
                    <span className="opacity-50">NFC-e</span>
                    <span className="text-[8px] text-amber-500/80 font-black tracking-widest mt-0.5">EM BREVE</span>
                </div>
            </button>

            {/* MODAIS */}
            {isReturnModalOpen && (
                <ReturnModal
                    isOpen={isReturnModalOpen}
                    onClose={() => setIsReturnModalOpen(false)}
                    vendaId={venda.id}
                    storeId={venda.store_id}
                    customerId={venda.customer_id}
                    itens={vendaItens}
                />
            )}

            {isAuthOpen && (
                <EmployeeAuthModal
                    isOpen={isAuthOpen}
                    onClose={() => setIsAuthOpen(false)}
                    onSuccess={handleAuthSuccess}
                    storeId={venda.store_id}
                    title={authAction === 'Finalizar' ? "Confirmar Fechamento" : "Autorizar Reabertura"}
                    description="Insira seu PIN para confirmar a operação."
                />
            )}

            {/* MODAL FISCAL (NOVO) */}
            {/* isFiscalModalOpen && (
                <FiscalEmissionModal
                    isOpen={isFiscalModalOpen}
                    onClose={() => setIsFiscalModalOpen(false)}
                    venda={venda}
                    vendaItens={vendaItens}
                    customer={customer} // Passando customer corretamente
                    onSuccess={() => {
                        onStatusChange()
                    }}
                />
            ) */}
        </div>
    )
}