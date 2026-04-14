// ARQUIVO: src/components/vendas/VendaActions.tsx
'use client'

import { useState, useTransition } from 'react'
import { updateVendaStatus } from '@/lib/actions/vendas.actions'
import { Database } from '@/lib/database.types'
import { Loader2, Check, X, Printer, RefreshCcw, CheckCircle2, Lock, Unlock, FileText } from 'lucide-react'
import ReturnModal from '@/components/modals/ReturnModal'
import EmployeeAuthModal from '@/components/modals/EmployeeAuthModal'
import AbandonoModal from '@/components/modals/AbandonoModal'
import FiscalEmissionModal from '@/components/modals/FiscalEmissionModal'

type Venda = Database['public']['Tables']['vendas']['Row']
type VendaWithMeta = Venda & { data_fechamento?: string | null }
type VendaItem = Database['public']['Tables']['venda_itens']['Row']
type Employee = Database['public']['Tables']['employees']['Row']
type Customer = Database['public']['Tables']['customers']['Row'] // Importando Customer

interface VendaActionsProps {
    venda: Venda
    vendaItens: VendaItem[]
    customer: Customer | null
    onStatusChange: () => Promise<void>
    isVendaFechada: boolean
    onPrint: () => void
    nfEmitida: boolean
    onNFCeSuccess: () => Promise<void>
}

export default function VendaActions({
    venda,
    vendaItens,
    customer,
    onStatusChange,
    isVendaFechada,
    onPrint,
    nfEmitida,
    onNFCeSuccess,
}: VendaActionsProps) {
    const [isReturnModalOpen, setIsReturnModalOpen] = useState(false)
    const [isAuthOpen, setIsAuthOpen] = useState(false)
    const [isAbandonoModalOpen, setIsAbandonoModalOpen] = useState(false)
    const [isFiscalModalOpen, setIsFiscalModalOpen] = useState(false)
    const [authAction, setAuthAction] = useState<'Finalizar' | 'Reabrir' | null>(null)

    const [isPending, startTransition] = useTransition()

    const today = new Date().toDateString()
    const isSameDayCreated = new Date(venda.created_at).toDateString() === today
    const vendaWithMeta = venda as VendaWithMeta
    const isSameDayClosed = vendaWithMeta.data_fechamento ? new Date(vendaWithMeta.data_fechamento).toDateString() === today : false
    const canReopen = isSameDayCreated || isSameDayClosed

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
        <div className="flex items-center gap-4">

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

                    <button
                        type="button"
                        disabled={isPending}
                        onClick={() => setIsAbandonoModalOpen(true)}
                        className="flex items-center gap-2 px-4 h-9 text-sm rounded-lg border border-orange-500/50 text-orange-400 hover:bg-orange-500/10 font-bold transition-colors uppercase tracking-wide whitespace-nowrap"
                        title="Marcar pedido como abandonado pelo cliente"
                    >
                        Abandonada
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

                    {venda.status === 'Fechada' ? (
                        <div className="flex items-center gap-2 text-emerald-400 bg-emerald-500/10 px-3 h-9 rounded-lg text-sm font-bold border border-emerald-500/20 cursor-default uppercase tracking-wide">
                            <CheckCircle2 className="h-4 w-4" /> Finalizada
                        </div>
                    ) : venda.status === 'Cancelada' ? (
                        <div className="flex items-center gap-2 text-red-400 bg-red-500/10 px-3 h-9 rounded-lg text-sm font-bold border border-red-500/20 cursor-default uppercase tracking-wide">
                            <X className="h-4 w-4" /> Cancelada
                        </div>
                    ) : null}

                    {canReopen && (
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
                <span>Recibos</span>
            </button>

            {/* BOTÃO NFC-e */}
            <button
                type="button"
                onClick={() => setIsFiscalModalOpen(true)}
                className={`flex items-center gap-2.5 px-3 h-9 text-sm rounded-lg border font-bold transition-all uppercase tracking-wide ${
                    nfEmitida
                        ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-400 shadow-[0_0_16px_rgba(16,185,129,0.15)]'
                        : 'bg-blue-600/20 border-blue-500/40 text-blue-400 hover:bg-blue-600/30'
                }`}
                title={nfEmitida ? "NFC-e emitida — clique para ver detalhes" : "Emitir NFC-e"}
            >
                <FileText className="h-4 w-4" />
                <div className="flex flex-col items-start leading-none">
                    <span className="text-[10px]">NFC-e</span>
                    <span className={`text-[7px] font-black tracking-widest mt-0.5 ${nfEmitida ? 'text-emerald-500' : 'text-blue-600'}`}>
                        {nfEmitida ? 'EMITIDA' : 'PENDENTE'}
                    </span>
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

            {isAbandonoModalOpen && (
                <AbandonoModal
                    isOpen={isAbandonoModalOpen}
                    onClose={() => setIsAbandonoModalOpen(false)}
                    vendaId={venda.id}
                    onSuccess={onStatusChange}
                />
            )}

            {/* MODAL FISCAL */}
            {isFiscalModalOpen && (
                <FiscalEmissionModal
                    isOpen={isFiscalModalOpen}
                    onClose={() => setIsFiscalModalOpen(false)}
                    venda={venda}
                    vendaItens={vendaItens}
                    customer={customer}
                    onSuccess={async () => {
                        setIsFiscalModalOpen(false)
                        await onNFCeSuccess()
                    }}
                />
            )}
        </div>
    )
}
