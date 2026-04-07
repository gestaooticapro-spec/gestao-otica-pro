'use client'

import { useEffect, useRef } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { Loader2, Save, UserPlus, X } from 'lucide-react'
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
      className="flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
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
  const handledDependenteIdRef = useRef<number | null>(null)

  useEffect(() => {
    if (!isOpen || !state.success || !state.data) return
    if (handledDependenteIdRef.current === state.data.id) return

    handledDependenteIdRef.current = state.data.id
    formRef.current?.reset()
    onSuccess(state.data)
    onClose()
  }, [isOpen, state, onSuccess, onClose])

  useEffect(() => {
    if (isOpen) return
    handledDependenteIdRef.current = null
  }, [isOpen])

  if (!isOpen) return null

  const inputStyle =
    'block w-full rounded-md border-gray-300 bg-white px-2 text-sm text-gray-900 shadow-sm h-9 focus:border-blue-500 focus:ring-blue-500'
  const labelStyle = 'mb-1 block text-xs font-bold text-gray-700'

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md overflow-hidden rounded-lg border border-gray-300 bg-gray-100 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-bold text-gray-800">
            <UserPlus className="h-5 w-5 text-blue-600" />
            Novo Dependente / Paciente
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-red-500">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form action={dispatch} ref={formRef} className="space-y-4 p-5">
          <input type="hidden" name="store_id" value={storeId} />
          <input type="hidden" name="customer_id" value={customerId} />

          <div>
            <label className={labelStyle}>Nome Completo *</label>
            <input
              type="text"
              name="nome_completo"
              required
              className={inputStyle}
              placeholder="Ex: Joao Silva Jr."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelStyle}>Parentesco *</label>
              <select name="parentesco" className={inputStyle}>
                <option value="Filho(a)">Filho(a)</option>
                <option value="Conjuge">Conjuge</option>
                <option value="Pai/Mae">Pai/Mae</option>
                <option value="Outro">Outro</option>
              </select>
            </div>
            <div>
              <label className={labelStyle}>Data Nasc.</label>
              <input type="date" name="data_nascimento" className={inputStyle} />
            </div>
          </div>

          {state.message && !state.success && (
            <div className="rounded border border-red-200 bg-red-100 p-2 text-xs text-red-700">
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
