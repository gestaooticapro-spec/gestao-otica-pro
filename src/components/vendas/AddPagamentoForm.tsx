//============================
//📄 ARQUIVO: src/components/vendas/AddPagamentoForm.tsx
//============================

'use client'

import { useState, useEffect, useRef } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import {
  addPagamento,
  type SavePagamentoResult,
} from '@/lib/actions/vendas.actions'
import { Loader2, DollarSign, X, AlertCircle, CheckCircle2, Wallet } from 'lucide-react'
import EmployeeAuthModal from '@/components/modals/EmployeeAuthModal'
import { Database } from '@/lib/database.types'

type Employee = Database['public']['Tables']['employees']['Row']

type AddPagamentoFormProps = {
  vendaId: number
  customerId: number
  storeId: number
  valorRestante: number
  onPaymentAdded: () => Promise<void>
  disabled: boolean
  isQuitado?: boolean
  isModal?: boolean 
}

const formatCurrency = (value: number | null | undefined): string => {
  return (value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
const getToday = (): string => new Date().toISOString().split('T')[0]

function SubmitFinalButton({ employeeName }: { employeeName: string | null }) {
    const { pending } = useFormStatus()
   
    return (
     <button
        type="submit"
        disabled={pending || !employeeName}
        className="flex items-center justify-center gap-2 w-full h-10 bg-white/20 hover:bg-white/30 text-white border border-white/40 rounded-xl shadow-sm backdrop-blur-sm transition-all font-bold uppercase tracking-wide text-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
        title={!employeeName ? "Autentique o vendedor" : `Registrar por: ${employeeName}`}
      >
         {pending ? <Loader2 className="h-5 w-5 animate-spin" /> 
         : <><CheckCircle2 className="h-5 w-5" /><span>CONFIRMAR</span></>}
      </button>
    )
}

export default function AddPagamentoForm({
  vendaId,
  customerId,
  storeId,
  valorRestante,
  onPaymentAdded,
  disabled,
  isQuitado = false,
  isModal = false,
}: AddPagamentoFormProps) {
  
  const formRef = useRef<HTMLFormElement>(null)
  const lastProcessedTs = useRef<number>(0)

  const initialState: SavePagamentoResult = { success: false, message: '' }
  const [saveState, dispatchSave] = useFormState(addPagamento, initialState)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [authedEmployee, setAuthedEmployee] = useState<Pick<Employee, 'id' | 'full_name'> | null>(null)
  
  const [valorPago, setValorPago] = useState(formatCurrency(valorRestante))
  const [formaPagamento, setFormaPagamento] = useState('PIX')
  const [parcelas, setParcelas] = useState(1)
  const [dataPagamento, setDataPagamento] = useState(getToday())
  const [obs, setObs] = useState<string>('')

  // LÓGICA DE CONTROLE DO CAMPO PARCELAS
  const isParcelable = formaPagamento === 'Cartão Crédito' || formaPagamento === 'Cheque-Pré'

  // Resetar para 1x se mudar para método não parcelável
  useEffect(() => {
    if (!isParcelable) {
        setParcelas(1)
    }
  }, [formaPagamento, isParcelable])

  useEffect(() => {
    if (saveState.success && saveState.timestamp && saveState.timestamp > lastProcessedTs.current) {
        lastProcessedTs.current = saveState.timestamp 
        setAuthedEmployee(null); 
        setObs(''); 
        onPaymentAdded(); 
    }
  }, [saveState, onPaymentAdded])
  
  useEffect(() => { setValorPago(formatCurrency(valorRestante)); }, [valorRestante])
  
  useEffect(() => {
    if (authedEmployee && formRef.current) {
        formRef.current.requestSubmit();
    }
  }, [authedEmployee])
  
  const handleAuthSuccess = (employee: Pick<Employee, 'id' | 'full_name'>) => {
    setAuthedEmployee(employee)
    setIsModalOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !authedEmployee) {
      e.preventDefault();
    }
  }

  const isBloqueado = disabled || isQuitado;

  const labelStyle = 'block text-[10px] font-bold text-emerald-100 mb-1 uppercase tracking-wider'
  const inputStyle = 'block w-full rounded-lg border-0 bg-white shadow-sm text-gray-800 h-10 text-sm px-3 focus:ring-2 focus:ring-emerald-300 focus:outline-none disabled:bg-gray-100 disabled:text-gray-400 placeholder:text-gray-400 transition-all'

  const containerClass = isModal 
    ? "bg-white p-4 h-full flex flex-col" 
    : "relative bg-gradient-to-br from-emerald-600 to-teal-600 p-5 rounded-2xl shadow-lg shadow-emerald-200 border border-white/20 flex flex-col";

  return (
    <div className={containerClass}>
      
      {!isModal && (
        <div className="flex items-center gap-2 mb-4 border-b border-white/20 pb-3">
            <div className="p-1.5 bg-white/20 rounded-lg text-white">
                <Wallet className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-bold text-white">
                Registrar Pagamento
            </h3>
        </div>
      )}
      
      {authedEmployee && (
        <div className="mb-4">
            <div className="text-xs font-bold p-2 bg-white/90 rounded-lg text-emerald-800 flex justify-between items-center animate-in fade-in slide-in-from-top-1 shadow-sm">
                <span>Autorizado por: {authedEmployee.full_name}</span>
                <button type="button" onClick={() => setAuthedEmployee(null)}><X className="h-4 w-4 hover:text-red-600" /></button>
            </div>
        </div>
      )}

      <form ref={formRef} action={dispatchSave} className="flex-1 flex flex-col space-y-4">
       <div className={`space-y-4 flex-1 ${isBloqueado ? 'opacity-50 pointer-events-none' : ''}`}>
          <input type="hidden" name="venda_id" value={vendaId} />
          <input type="hidden" name="customer_id" value={customerId} />
          <input type="hidden" name="employee_id" value={authedEmployee?.id ?? ''} />
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={isModal ? 'text-xs font-bold text-gray-500' : labelStyle}>Valor (R$)</label>
              <input
                name="valor_pago"
                type="text"
                value={valorPago}
                onChange={(e) => setValorPago(e.target.value)}
                onKeyDown={handleKeyDown}
                className={`${inputStyle} font-bold text-emerald-700 text-right text-lg`}
              />
            </div>
            <div>
              <label className={isModal ? 'text-xs font-bold text-gray-500' : labelStyle}>Forma</label>
              <select
                name="forma_pagamento"
                value={formaPagamento}
                onChange={(e) => setFormaPagamento(e.target.value)}
                className={`${inputStyle} font-bold cursor-pointer`}
              >
                <option value="PIX">PIX</option>
                <option value="Dinheiro">Dinheiro</option>
                <option value="Cartão Débito">Cartão Débito</option>
                <option value="Cartão Crédito">Cartão Crédito</option>
                <option value="Cheque-Pré">Cheque-Pré</option>
                <option value="Transferência">Transferência</option>
                <option value="Boleto">Boleto</option>
                <option value="Crédito em Loja">Crédito em Loja</option>
              </select>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={isModal ? 'text-xs font-bold text-gray-500' : labelStyle}>Parcelas</label>
              <select 
                name="parcelas"
                value={parcelas} 
                onChange={(e) => setParcelas(parseInt(e.target.value))} 
                // AQUI: Campo inativo se não for cartão ou cheque
                disabled={!isParcelable || isBloqueado}
                className={`${inputStyle} cursor-pointer ${!isParcelable ? 'bg-gray-100 text-gray-400' : ''}`}
              >
                {[...Array(12)].map((_, i) => <option key={i + 1} value={i + 1}>{i + 1}x</option>)}
              </select>
            </div>
          
            <div>
              <label className={isModal ? 'text-xs font-bold text-gray-500' : labelStyle}>Data</label>
              <input 
                type="date" 
                name="data_pagamento"
                value={dataPagamento} 
                onChange={(e) => setDataPagamento(e.target.value)} 
                className={inputStyle}
              />
            </div>
          </div>
          
          <div>
            <label className={isModal ? 'text-xs font-bold text-gray-500' : labelStyle}>Observação</label>
            <input 
                name="obs" 
                type="text" 
                value={obs} 
                onChange={(e) => setObs(e.target.value)} 
                onKeyDown={handleKeyDown}
                className={inputStyle}
                placeholder="Ex: Sinal óculos..."
            />
          </div>
       </div>

       {saveState.message && !saveState.success && (
           <div className="bg-red-500/20 border border-red-200/30 text-white text-xs font-bold p-3 rounded-xl flex items-center gap-2 animate-in fade-in backdrop-blur-sm">
               <AlertCircle className="h-4 w-4 flex-shrink-0" />
               {saveState.message}
           </div>
        )}

        <div className="pt-2">
            {isQuitado ? (
                <div className="flex items-center justify-center gap-2 px-4 py-3 text-sm rounded-xl w-full bg-white/20 text-white border border-white/30 font-bold">
                    <CheckCircle2 className="h-5 w-5" />
                    VENDA QUITADA
                </div>
            ) : disabled ? (
                <div className="text-sm text-center font-bold text-white/50 p-3 bg-black/10 rounded-xl border border-white/10">Venda Fechada</div>
            ) : !authedEmployee ? (
                <button 
                    type="button" 
                    onClick={() => setIsModalOpen(true)}
                    className="flex items-center justify-center gap-2 px-4 py-3 text-sm rounded-xl shadow-md w-full bg-white text-emerald-700 hover:bg-emerald-50 font-bold transition-all active:scale-95"
                   >
                    <DollarSign className="h-5 w-5" /> <span>AUTORIZAR E PAGAR</span>
                 </button>
            ) : (
                <SubmitFinalButton employeeName={authedEmployee.full_name} />
            )}
        </div>
     </form>
      
      {isModalOpen && <EmployeeAuthModal storeId={storeId} isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSuccess={handleAuthSuccess} title="Autorizar Pagamento" description="Confirme seu PIN." />}
    </div>
  )
}