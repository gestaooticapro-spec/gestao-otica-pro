// ARQUIVO: src/components/vendas/VendaActions.tsx
'use client'

import { useState, useTransition } from 'react'
import { useFormStatus } from 'react-dom'
import { updateVendaStatus } from '@/lib/actions/vendas.actions'
import { Database } from '@/lib/database.types'
import { Loader2, Check, X, Printer, RefreshCcw, CheckCircle2, Lock, Unlock } from 'lucide-react'
import ReturnModal from '@/components/modals/ReturnModal'
import EmployeeAuthModal from '@/components/modals/EmployeeAuthModal'

type Venda = Database['public']['Tables']['vendas']['Row']
type VendaItem = Database['public']['Tables']['venda_itens']['Row']
type Employee = Database['public']['Tables']['employees']['Row']

interface VendaActionsProps {
  venda: Venda
  vendaItens: VendaItem[]
  onStatusChange: () => Promise<void>
  isVendaFechada: boolean
  onPrint: () => void 
}

export default function VendaActions({
  venda,
  vendaItens,
  onStatusChange,
  isVendaFechada,
  onPrint,
}: VendaActionsProps) {
  
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false)
  const [isAuthOpen, setIsAuthOpen] = useState(false)
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
          // CORREÇÃO: Cast 'as string' para permitir a comparação com 'admin' sem erro de tipagem
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
                      if(confirm("Tem certeza que deseja cancelar esta venda?")) {
                          const res = await updateVendaStatus(venda.id, venda.store_id, 'Cancelada', 0)
                          if(res.success) onStatusChange()
                      }
                  }}
                  className="flex items-center gap-2 px-4 py-2.5 h-10 text-sm rounded-lg border border-red-200 text-red-600 hover:bg-red-50 font-bold transition-colors"
              >
                  <X className="h-4 w-4" /> Cancelar
              </button>

              {isLocked ? (
                  <div className="flex items-center gap-2 px-4 py-2.5 h-10 text-sm rounded-lg bg-gray-100 text-gray-400 font-bold cursor-not-allowed border border-gray-200" title="Zere o saldo ou gere um carnê para finalizar.">
                      <Lock className="h-4 w-4" />
                      <span>Falta Destinar</span>
                  </div>
              ) : (
                  <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleActionClick('Finalizar')}
                      className="flex items-center gap-2 px-6 py-2.5 h-10 text-sm rounded-lg shadow-md bg-green-600 hover:bg-green-700 text-white font-bold transition-transform active:scale-95"
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
            
            <div className="flex items-center gap-2 text-green-700 bg-green-50 px-3 py-1 rounded text-sm font-bold border border-green-200 cursor-default">
                <CheckCircle2 className="h-4 w-4" /> Finalizada
            </div>

            {isSameDay && (
                <button 
                    type="button" 
                    disabled={isPending}
                    onClick={() => handleActionClick('Reabrir')}
                    className="flex items-center gap-2 px-4 py-2.5 h-10 text-sm rounded-lg bg-orange-50 border border-orange-200 text-orange-700 hover:bg-orange-100 font-bold transition-colors"
                    title="Reabrir para correções (Estorna comissões)"
                >
                    {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlock className="h-4 w-4" />}
                    <span>Reabrir</span>
                </button>
            )}

            <button 
                type="button" 
                onClick={() => setIsReturnModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 h-10 text-sm rounded-lg bg-white border border-red-200 text-red-600 hover:bg-red-50 font-bold transition-colors"
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
          className="flex items-center gap-2 px-4 py-2.5 h-10 text-sm rounded-lg bg-slate-700 text-white hover:bg-slate-800 font-bold transition-colors shadow-md"
          title="Imprimir Recibos de Pagamento"
      >
          <Printer className="h-4 w-4" />
          <span>Imprimir</span>
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
    </div>
  )
}