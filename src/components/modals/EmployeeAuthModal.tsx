'use client'

import {
  useState,
  useEffect,
} from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { Loader2, X } from 'lucide-react'
import {
  autenticarFuncionarioPorPin,
  type AuthEmployeeResult,
} from '@/lib/actions/vendas.actions'
import { Database } from '@/lib/database.types'

type AuthedEmployee = Pick<
  Database['public']['Tables']['employees']['Row'],
  'id' | 'full_name' | 'role'
>

type EmployeeAuthModalProps = {
  storeId: number
  isOpen: boolean
  onClose: () => void
  onSuccess: (employee: AuthedEmployee) => void
  title?: string
  description?: string
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex w-full justify-center rounded-md border border-transparent bg-blue-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:bg-blue-400"
    >
      {pending ? (
        <Loader2 className="h-5 w-5 animate-spin mx-auto" />
      ) : (
        'Login'
      )}
    </button>
  )
}

export default function EmployeeAuthModal({
  storeId,
  isOpen,
  onClose,
  onSuccess,
  title = 'Autenticação de Funcionário',
  description = 'Por favor, insira seu PIN para continuar.',
}: EmployeeAuthModalProps) {
  
  const initialState: AuthEmployeeResult = { success: false, message: '' }
  const [state, dispatch] = useFormState(autenticarFuncionarioPorPin, initialState)
  
  const [pin, setPin] = useState('')

  useEffect(() => {
    if (state.success && state.employee) {
      onSuccess(state.employee) 
      onClose()
      setPin('')
    }
  }, [state, onSuccess, onClose])

  // LÓGICA DE KEYDOWN REMOVIDA: O formulário HTML já lida com o Enter nativamente

  if (!isOpen) return null

  const inputStyle = 'block w-full rounded-md border-gray-400 shadow-sm text-gray-900 h-10 text-lg text-center bg-white disabled:bg-gray-100'
  const labelStyle = 'text-sm font-medium text-gray-700'

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-70"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm p-6 bg-gray-200 rounded-lg shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-2 right-2 p-1 text-gray-500 hover:text-gray-800"
          title="Fechar"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="text-xl font-bold text-gray-800 text-center mb-4">
          {title}
        </h2>
        <p className="text-sm text-gray-600 mb-4 text-center">{description}</p>

        <form action={dispatch} className="space-y-4">
          <input type="hidden" name="store_id" value={storeId} />
          
          <div>
            <label htmlFor="auth_pin" className={labelStyle}>
              Senha (PIN)
            </label>
            <input
              id="auth_pin"
              name="pin"
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              // onKeyDown removido daqui
              className={inputStyle}
              required
              autoFocus
              maxLength={6}
              autoComplete="off"
            />
          </div>
          
          {state.message && !state.success && (
             <p className="text-sm text-red-600 text-center font-bold bg-red-100 p-2 rounded">{state.message}</p>
          )}

          <SubmitButton />
        </form>
      </div>
    </div>
  )
}