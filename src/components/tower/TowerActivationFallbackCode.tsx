'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

type Props = {
  code: string
}

export default function TowerActivationFallbackCode({ code }: Props) {
  const [copied, setCopied] = useState(false)

  const copyCode = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <section className="mt-7 w-full max-w-[430px] rounded-2xl border border-white/10 bg-slate-900/80 p-5 text-left">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Codigo alternativo</p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <code className="text-2xl font-black tracking-[0.18em] text-white">{code}</code>
        <button
          type="button"
          onClick={copyCode}
          className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-slate-200 transition hover:bg-white/5"
        >
          {copied ? <Check className="mr-2 inline h-4 w-4 text-emerald-300" /> : <Copy className="mr-2 inline h-4 w-4" />}
          {copied ? 'Copiado' : 'Copiar codigo'}
        </button>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">
        Use este codigo somente se a camera nao conseguir ler o QR Code.
      </p>
    </section>
  )
}
