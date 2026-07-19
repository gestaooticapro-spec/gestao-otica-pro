'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { KeyRound, Loader2, ShieldCheck } from 'lucide-react'

export default function TowerRemotePinGate({ publicCode }: { publicCode: string }) {
  const router = useRouter()
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pin.length !== 6) return
    setBusy(true)
    setMessage('')
    try {
      const response = await fetch(`/api/tower/remote-config/${publicCode}/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      })
      const result = await response.json() as { success?: boolean; message?: string }
      if (response.ok && result.success) {
        setPin('')
        router.refresh()
      } else {
        setMessage(result.message || 'Nao foi possivel liberar o acesso.')
      }
    } catch {
      setMessage('Sem comunicacao com o servidor.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 px-5 py-10 text-white">
      <section className="w-full max-w-md rounded-3xl border border-cyan-300/20 bg-slate-900 p-7 shadow-2xl shadow-black/30">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-cyan-300/10 text-cyan-300"><KeyRound className="h-7 w-7" /></div>
        <p className="mt-6 text-xs font-black uppercase tracking-[.16em] text-cyan-300">Gestao Otica - Torre</p>
        <h1 className="mt-2 text-2xl font-black">Configuracao comercial</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">Informe o PIN comercial exibido na Torre. Nao e necessario usuario ou senha do MBoptical.</p>
        <form onSubmit={submit} className="mt-7">
          <label className="text-xs font-black uppercase tracking-wide text-slate-400">PIN comercial
            <input value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))} type="password" inputMode="numeric" autoComplete="one-time-code" autoFocus className="mt-2 min-h-16 w-full rounded-xl border border-white/10 bg-slate-950 px-4 text-center text-2xl tracking-[.35em] outline-none focus:border-cyan-300/50" />
          </label>
          <button disabled={busy || pin.length !== 6} className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-cyan-300 px-5 text-sm font-black text-slate-950 disabled:opacity-40">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}Entrar</button>
          {message && <p className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm font-bold text-amber-100">{message}</p>}
        </form>
        <p className="mt-6 text-xs leading-5 text-slate-500">Depois de cinco tentativas incorretas, este acesso fica bloqueado por quinze minutos.</p>
      </section>
    </main>
  )
}
