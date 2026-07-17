'use client'

import { useState } from 'react'
import { Check, Copy, KeyRound } from 'lucide-react'

type Props = {
  pin: string
}

export default function TowerActivationAdminPin({ pin }: Props) {
  const [copied, setCopied] = useState(false)

  const copyPin = async () => {
    await navigator.clipboard.writeText(pin)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <section className="mt-5 w-full max-w-[430px] rounded-2xl border border-violet-300/20 bg-violet-300/[.07] p-5 text-left">
      <div className="flex items-center gap-2 text-violet-100">
        <KeyRound className="h-4 w-4" />
        <p className="text-xs font-black uppercase tracking-[0.14em]">PIN administrativo provisório</p>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <code className="text-2xl font-black tracking-[0.18em] text-white">{pin}</code>
        <button
          type="button"
          onClick={copyPin}
          className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-slate-200 transition hover:bg-white/5"
        >
          {copied ? <Check className="mr-2 inline h-4 w-4 text-emerald-300" /> : <Copy className="mr-2 inline h-4 w-4" />}
          {copied ? 'Copiado' : 'Copiar PIN'}
        </button>
      </div>
      <p className="mt-3 text-xs leading-5 text-violet-100/70">
        Use no primeiro acesso às configurações da Torre. A troca do PIN será obrigatória.
      </p>
    </section>
  )
}
