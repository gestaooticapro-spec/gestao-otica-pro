'use client'

import { useEffect, useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { useRouter } from 'next/navigation'
import { KeyRound, Loader2, Smartphone } from 'lucide-react'
import { authorizePixMachine, type PixMachineAccessResult } from '@/lib/actions/pix-maquininha.actions'

function SubmitButton() {
  const { pending } = useFormStatus()
  return <button type="submit" disabled={pending} className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-3 font-black uppercase tracking-wider text-slate-950 disabled:opacity-50">{pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <><KeyRound className="h-5 w-5" /> Abrir maquininha</>}</button>
}

export default function PixMaquininhaAccessGate({ storeId, storeName }: { storeId: number; storeName: string }) {
  const router = useRouter()
  const [pin, setPin] = useState('')
  const [state, dispatch] = useFormState(authorizePixMachine, { success: false, message: '' } as PixMachineAccessResult)

  useEffect(() => {
    if (state.success) router.refresh()
  }, [router, state.success])

  return <main className="min-h-screen bg-slate-950 px-5 py-6 text-white sm:px-10"><section className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-md items-center justify-center"><div className="w-full rounded-[2rem] border border-cyan-400/25 bg-slate-900 p-7 text-center shadow-[0_0_80px_rgba(34,211,238,0.14)]"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-500/15 text-cyan-300"><Smartphone className="h-8 w-8" /></div><p className="mt-5 text-xs font-black uppercase tracking-[0.2em] text-cyan-300">Modo Maquininha Pix</p><h1 className="mt-2 text-2xl font-black">{storeName}</h1><p className="mt-3 text-sm text-slate-400">Informe o PIN de um funcionario ativo para exibir os QR Codes desta loja.</p><form action={dispatch} className="mt-7 space-y-4"><input type="hidden" name="store_id" value={storeId} /><input id="pix-machine-pin" name="pin" type="password" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={pin} onChange={(event) => setPin(event.target.value)} placeholder="PIN" className="w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-3 text-center text-xl font-black tracking-[0.3em] outline-none ring-cyan-400 focus:ring-2" required autoFocus />{state.message && !state.success ? <p className="text-sm font-bold text-red-300">{state.message}</p> : null}<SubmitButton /></form><button type="button" onClick={() => router.push(`/tablet/${storeId}`)} className="mt-5 text-sm font-bold text-slate-400 underline-offset-4 hover:text-white hover:underline">Voltar ao menu</button></div></section></main>
}
