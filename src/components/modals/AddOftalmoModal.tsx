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
      className="flex w-full justify-center items-center gap-2 rounded-md bg-blue-600/90 py-2 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-blue-500 disabled:opacity-50"
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

  const inputStyle = "block w-full rounded-md border border-white/30 shadow-sm h-9 text-sm px-2 focus:ring-2 focus:ring-blue-400/70 focus:border-blue-300 bg-white/50 text-slate-900 placeholder:text-slate-500 backdrop-blur-sm"
  const labelStyle = "block text-xs font-bold text-slate-700 mb-1"

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/55 backdrop-blur-md p-4" onClick={onClose}>
      <div
        className="relative w-full max-w-md rounded-lg border border-white/25 bg-white/35 shadow-2xl backdrop-blur-xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center px-4 py-3 bg-white/20 border-b border-white/25">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Stethoscope className="h-5 w-5 text-blue-500" />
            Novo Médico
          </h3>
          <button onClick={onClose} className="text-slate-500 transition hover:text-red-500">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form action={dispatch} ref={formRef} className="p-5 space-y-4 bg-white/10">
          <div>
            <label className={labelStyle}>Nome Completo *</label>
            <input type="text" name="nome_completo" required className={inputStyle} placeholder="Ex: Dra. Maria Silva" />
          </div>

          <div>
            <label className={labelStyle}>CRM</label>
            <input type="text" name="crm" className={inputStyle} placeholder="Ex: 12345-SP" />
          </div>

          {state.message && !state.success && (
            <div className="p-2 bg-red-500/15 border border-red-300/50 text-red-800 text-xs rounded backdrop-blur-sm">
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
