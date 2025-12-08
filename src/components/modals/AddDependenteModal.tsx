// ARQUIVO: src/components/modals/AddDependenteModal.tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { Loader2, X, Save, UserPlus } from 'lucide-react'
import { saveDependente, type SaveDependenteResult } from '@/lib/actions/dependents.actions'
import { Database } from '@/lib/database.types'

type Dependente = Database['public']['Tables']['dependentes']['Row']

type AddDependenteModalProps = {
  isOpen: boolean
  onClose: () => void
  onSuccess: (newDep: Dependente) => void
  storeId: number
  customerId: number
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex w-full justify-center items-center gap-2 rounded-md bg-blue-600 py-2 px-4 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
      SALVAR DEPENDENTE
    </button>
  )
}

export default function AddDependenteModal({
  isOpen,
  onClose,
  onSuccess,
  storeId,
  customerId
}: AddDependenteModalProps) {
  const initialState: SaveDependenteResult = { success: false, message: '' }
  const [state, dispatch] = useFormState(saveDependente, initialState)
  const formRef = useRef<HTMLFormElement>(null)

  // Fecha e notifica sucesso
  useEffect(() => {
    if (state.success && state.data) {
      onSuccess(state.data)
      onClose()
      // Limpa o estado para a próxima abertura (opcional, pois o modal será desmontado se condicional)
    }
  }, [state, onSuccess, onClose])

  if (!isOpen) return null

  const inputStyle = "block w-full rounded-md border-gray-300 shadow-sm h-9 text-sm px-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900"
  const labelStyle = "block text-xs font-bold text-gray-700 mb-1"

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div 
        className="relative w-full max-w-md bg-gray-100 rounded-lg shadow-xl border border-gray-300 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center px-4 py-3 bg-white border-b border-gray-200">
          <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-blue-600" />
            Novo Dependente / Paciente
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-red-500">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form action={dispatch} ref={formRef} className="p-5 space-y-4">
          <input type="hidden" name="store_id" value={storeId} />
          <input type="hidden" name="customer_id" value={customerId} />

          <div>
            <label className={labelStyle}>Nome Completo *</label>
            <input type="text" name="nome_completo" required className={inputStyle} placeholder="Ex: João Silva Jr." />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelStyle}>Parentesco *</label>
              <select name="parentesco" className={inputStyle}>
                <option value="Filho(a)">Filho(a)</option>
                <option value="Cônjuge">Cônjuge</option>
                <option value="Pai/Mãe">Pai/Mãe</option>
                <option value="Outro">Outro</option>
              </select>
            </div>
            <div>
              <label className={labelStyle}>Data Nasc.</label>
              <input type="date" name="data_nascimento" className={inputStyle} />
            </div>
          </div>

          {state.message && !state.success && (
            <div className="p-2 bg-red-100 border border-red-200 text-red-700 text-xs rounded">
              {state.message}
            </div>
          )}

          <div className="pt-2">
            <SubmitButton />
          </div>
        </form>
      </div>
    </div>
  )
}