// ARQUIVO: src/components/modals/AddOftalmoModal.tsx
'use client'

import { useEffect, useRef } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { Loader2, X, Save, Stethoscope } from 'lucide-react'
import { saveOftalmo, type CatalogActionResult } from '@/lib/actions/catalog.actions'
import { Database } from '@/lib/database.types'

type Oftalmo = Database['public']['Tables']['oftalmologistas']['Row']

type AddOftalmoModalProps = {
  isOpen: boolean
  onClose: () => void
  onSuccess: (newDoc: Oftalmo) => void
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
      SALVAR MÉDICO
    </button>
  )
}

export default function AddOftalmoModal({ isOpen, onClose, onSuccess }: AddOftalmoModalProps) {
  const initialState: CatalogActionResult = { success: false, message: '' }
  const [state, dispatch] = useFormState(saveOftalmo, initialState)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state.success && state.data) {
      onSuccess(state.data as Oftalmo)
      onClose()
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
        <div className="flex justify-between items-center px-4 py-3 bg-white border-b border-gray-200">
          <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
            <Stethoscope className="h-5 w-5 text-blue-600" />
            Novo Médico
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-red-500">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form action={dispatch} ref={formRef} className="p-5 space-y-4">
          <div>
            <label className={labelStyle}>Nome Completo *</label>
            <input type="text" name="nome_completo" required className={inputStyle} placeholder="Ex: Dra. Maria Silva" />
          </div>

          <div>
            <label className={labelStyle}>CRM</label>
            <input type="text" name="crm" className={inputStyle} placeholder="Ex: 12345-SP" />
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
