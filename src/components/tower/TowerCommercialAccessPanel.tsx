'use client'

import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Copy, KeyRound, Loader2, RefreshCw, Smartphone } from 'lucide-react'

type Access = {
  configured: boolean
  url?: string
  updatedAt?: string
}

export default function TowerCommercialAccessPanel() {
  const [access, setAccess] = useState<Access | null>(null)
  const [commercialPin, setCommercialPin] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const result = await window.towerDesktop?.getRemoteConfigAccess()
      if (cancelled) return
      if (result?.success) {
        setAccess({ configured: Boolean(result.configured), url: result.url, updatedAt: result.updatedAt })
      } else {
        setMessage(result?.message || 'Nao foi possivel consultar o acesso comercial.')
      }
      setBusy(false)
    }
    void load()
    return () => { cancelled = true }
  }, [])

  async function rotate() {
    setBusy(true)
    setMessage('')
    setCommercialPin(null)
    const result = await window.towerDesktop?.rotateRemoteConfigAccess()
    if (result?.success && result.url && result.commercialPin) {
      setAccess({ configured: true, url: result.url })
      setCommercialPin(result.commercialPin)
      setMessage(result.message || 'Acesso comercial criado.')
    } else {
      setMessage(result?.message || 'Nao foi possivel criar o acesso comercial.')
    }
    setBusy(false)
  }

  async function copyUrl() {
    if (!access?.url) return
    await navigator.clipboard.writeText(access.url)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <section className="mt-8 rounded-3xl border border-cyan-300/20 bg-cyan-300/[0.055] p-6 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[.16em] text-cyan-300"><Smartphone className="h-4 w-4" /> Configuracao comercial remota</p>
          <h2 className="mt-2 text-xl font-black">Abra no celular ou computador</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">O link permanece o mesmo para as proximas alteracoes. O PIN comercial e separado do PIN administrativo desta Torre.</p>
        </div>
        <button type="button" disabled={busy} onClick={() => void rotate()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-cyan-300 px-4 text-sm font-black text-slate-950 disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : access?.configured ? <RefreshCw className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}
          {access?.configured ? 'Regenerar acesso' : 'Gerar QR e PIN'}
        </button>
      </div>

      {message && <p className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm font-bold text-amber-100">{message}</p>}
      {access?.url && <div className="mt-6 grid gap-5 md:grid-cols-[210px_1fr]">
        <div className="rounded-2xl bg-white p-3"><QRCodeSVG value={access.url} size={184} level="H" marginSize={1} className="h-auto w-full" /></div>
        <div className="space-y-4">
          <div><p className="text-xs font-black uppercase tracking-wide text-slate-500">Endereco permanente</p><div className="mt-2 flex gap-2"><div className="min-w-0 flex-1 break-all rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-cyan-100">{access.url}</div><button type="button" onClick={() => void copyUrl()} className="rounded-xl border border-white/10 px-4 text-sm font-black"><Copy className="h-4 w-4" /><span className="sr-only">{copied ? 'Copiado' : 'Copiar'}</span></button></div></div>
          {commercialPin ? <div className="rounded-2xl border border-amber-300/25 bg-amber-300/10 p-4"><p className="text-xs font-black uppercase tracking-wide text-amber-200">PIN comercial - exibido somente agora</p><p className="mt-2 font-mono text-4xl font-black tracking-[.28em] text-white">{commercialPin}</p><p className="mt-3 text-xs leading-5 text-amber-100/75">Guarde este PIN separado do QR. Se ele for perdido, regenere o acesso; o link anterior deixara de funcionar.</p></div> : <p className="text-sm leading-6 text-slate-400">O PIN existente nao pode ser exibido novamente. Se ele foi perdido, use <strong className="text-white">Regenerar acesso</strong>.</p>}
        </div>
      </div>}
    </section>
  )
}
