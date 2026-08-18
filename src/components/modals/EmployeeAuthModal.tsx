'use client'

import { createPortal } from 'react-dom'
import {
  useState,
  useEffect,
  useRef,
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
> & {
  authorization_token?: string
}

type EmployeeAuthModalProps = {
  storeId: number
  isOpen: boolean
  onClose: () => void
  onSuccess: (employee: AuthedEmployee) => void
  title?: string
  description?: string
  purpose?: 'evaluation_unlink' | 'installment_receipt_reversal' | 'pix_charge_create' | 'pix_charge_cancel' | 'pix_charge_recover'
  authorizationContext?: string
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex w-full justify-center rounded-xl bg-cyan-500/20 py-3.5 px-4 text-sm font-black uppercase tracking-widest text-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.2)] border border-cyan-500/20 hover:bg-cyan-500/40 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 disabled:opacity-50 disabled:bg-cyan-500/10 transition-all active:scale-95"
    >
      {pending ? (
        <Loader2 className="h-5 w-5 animate-spin mx-auto" />
      ) : (
        'Autorizar'
      )}
    </button>
  )
}

function EmployeeAuthForm({
  storeId,
  onClose,
  onSuccess,
  title,
  description,
  purpose,
  authorizationContext,
}: Omit<EmployeeAuthModalProps, 'isOpen'>) {
  const initialState: AuthEmployeeResult = { success: false, message: '' }
  const [state, dispatch] = useFormState(autenticarFuncionarioPorPin, initialState)

  const [pin, setPin] = useState('')
  const handledSuccessRef = useRef(false)

  useEffect(() => {
    if (state.success && state.employee && !handledSuccessRef.current) {
      handledSuccessRef.current = true
      onSuccess(state.employee)
      onClose()
    }
  }, [state, onSuccess, onClose])

  const inputStyle = 'block w-full rounded-xl border border-white/10 bg-white/5 text-white h-11 text-center text-xl tracking-[0.2em] focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 focus:outline-none font-bold transition-all placeholder:font-normal placeholder:text-slate-500 placeholder:tracking-normal backdrop-blur-md'
  const labelStyle = 'block text-[10px] font-black text-slate-400 uppercase tracking-[0.1em] text-center mb-1.5'

  return (
    <div className="relative z-10">
      <h2 className="text-xl md:text-2xl font-black text-white text-center mb-2 tracking-tight">
        {title}
      </h2>
      <p className="text-sm text-slate-400 font-bold mb-6 text-center">{description}</p>

      <form action={dispatch} className="space-y-6">
        <input type="hidden" name="store_id" value={storeId} />
        {purpose && <input type="hidden" name="authorization_purpose" value={purpose} />}
        {authorizationContext && <input type="hidden" name="authorization_context" value={authorizationContext} />}

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
            className={inputStyle}
            required
            autoFocus
            maxLength={6}
            autoComplete="one-time-code"
            data-lpignore="true"
            data-1p-ignore="true"
            placeholder="******"
          />
        </div>

        {state.message && !state.success && (
          <p className="text-xs text-red-400 text-center font-black uppercase tracking-widest bg-red-500/10 border border-red-500/20 p-2.5 rounded-xl">{state.message}</p>
        )}

        <SubmitButton />
      </form>
    </div>
  )
}

export default function EmployeeAuthModal({
  storeId,
  isOpen,
  onClose,
  onSuccess,
  title = 'Autorizar Pagamento',
  description = 'Insira seu PIN para confirmar o recebimento.',
  purpose,
  authorizationContext,
}: EmployeeAuthModalProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!isOpen || !mounted) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[110] grid place-items-center bg-slate-950/80 backdrop-blur-md p-4 overflow-y-auto custom-scrollbar animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm p-6 md:p-8 bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-[2rem] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute top-0 right-0 w-48 h-48 bg-cyan-500/10 blur-[60px] rounded-full pointer-events-none" />

        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-full transition-colors z-20"
          title="Fechar"
        >
          <X className="h-5 w-5" />
        </button>

        <EmployeeAuthForm 
          storeId={storeId}
          onClose={onClose}
          onSuccess={onSuccess}
          title={title}
          description={description}
          purpose={purpose}
          authorizationContext={authorizationContext}
        />
      </div>
    </div>,
    document.body
  )
}
