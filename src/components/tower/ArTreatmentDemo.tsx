'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Eye, MonitorUp, Sparkles } from 'lucide-react'
import { closeTowerClientScreen, openTowerClientScreen } from '@/lib/tower/client-screen'

type ArMessage =
  | { type: 'ar-comparison'; enabled: boolean }
  | { type: 'ar-split'; position: number }
  | { type: 'ar-client-ready' }

export default function ArTreatmentDemo({ storeId, clientMode = false }: { storeId: number; clientMode?: boolean }) {
  const channelName = `tower-ar-treatment-${storeId}`
  const channelRef = useRef<BroadcastChannel | null>(null)
  const cleanVideoRef = useRef<HTMLVideoElement | null>(null)
  const reflectionVideoRef = useRef<HTMLVideoElement | null>(null)
  const comparisonRef = useRef(true)
  const splitRef = useRef(50)
  const [comparisonEnabled, setComparisonEnabled] = useState(clientMode ? false : true)
  const [splitPosition, setSplitPosition] = useState(50)

  useEffect(() => {
    const channel = new BroadcastChannel(channelName)
    channelRef.current = channel

    channel.onmessage = (event: MessageEvent<ArMessage>) => {
      const data = event.data
      if (!data || typeof data !== 'object') return

      if (clientMode && data.type === 'ar-comparison') {
        setComparisonEnabled(data.enabled)
      }

      if (clientMode && data.type === 'ar-split') {
        setSplitPosition(data.position)
      }

      if (!clientMode && data.type === 'ar-client-ready') {
        channel.postMessage({ type: 'ar-comparison', enabled: comparisonRef.current } satisfies ArMessage)
        channel.postMessage({ type: 'ar-split', position: splitRef.current } satisfies ArMessage)
      }
    }

    if (clientMode) channel.postMessage({ type: 'ar-client-ready' } satisfies ArMessage)

    return () => {
      channel.close()
      channelRef.current = null
    }
  }, [channelName, clientMode])

  useEffect(() => {
    if (!clientMode) return

    const syncVideos = () => {
      const clean = cleanVideoRef.current
      const reflection = reflectionVideoRef.current
      if (!clean || !reflection) return

      if (Math.abs(clean.currentTime - reflection.currentTime) > 0.08) {
        reflection.currentTime = clean.currentTime
      }
      if (!clean.paused && reflection.paused) void reflection.play().catch(() => undefined)
    }

    const interval = window.setInterval(syncVideos, 180)
    return () => window.clearInterval(interval)
  }, [clientMode])

  function setComparison(enabled: boolean) {
    comparisonRef.current = enabled
    setComparisonEnabled(enabled)
    channelRef.current?.postMessage({ type: 'ar-comparison', enabled } satisfies ArMessage)
  }

  function setSplit(position: number) {
    splitRef.current = position
    setSplitPosition(position)
    channelRef.current?.postMessage({ type: 'ar-split', position } satisfies ArMessage)
  }

  function openClientScreen() {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    url.searchParams.set('client', '1')
    openTowerClientScreen(url.toString())
  }

  if (clientMode) {
    return (
      <main className="relative h-[100dvh] w-screen overflow-hidden bg-slate-950 text-white">
        <video ref={cleanVideoRef} className="absolute inset-0 h-full w-full object-cover" autoPlay loop muted playsInline>
          <source src="/rua.mp4" type="video/mp4" />
        </video>

        {comparisonEnabled && (
          <>
            <div className="pointer-events-none absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${splitPosition}%` }}>
              <video ref={reflectionVideoRef} className="absolute inset-0 h-[100dvh] w-screen max-w-none object-cover" autoPlay loop muted playsInline>
                <source src="/rua-ar.mp4" type="video/mp4" />
              </video>
            </div>
            <div className="pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-white shadow-[0_0_16px_rgba(255,255,255,0.95)]" style={{ left: `${splitPosition}%` }} />
            <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-between p-7 text-sm font-black uppercase tracking-[0.2em] sm:p-10 sm:text-lg">
              <span className="rounded-full bg-slate-950/70 px-4 py-2 text-amber-200 shadow-lg shadow-black/20">Sem AR</span>
              <span className="rounded-full bg-slate-950/70 px-4 py-2 text-emerald-300 shadow-lg shadow-black/20">Com AR</span>
            </div>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/85 via-slate-950/35 to-transparent px-7 pb-8 pt-24 sm:px-10 sm:pb-12">
              <p className="max-w-2xl text-lg font-semibold sm:text-2xl">O antirreflexo reduz os reflexos que aparecem na frente da visão.</p>
              <p className="mt-2 text-sm text-slate-200 sm:text-base">Demonstração visual do efeito do tratamento antirreflexo.</p>
            </div>
          </>
        )}
      </main>
    )
  }

  return (
    <main className="min-h-[100dvh] bg-slate-950 px-5 py-5 text-slate-100 sm:px-8 sm:py-8">
      <div className="mx-auto flex min-h-[calc(100dvh-2.5rem)] max-w-4xl flex-col justify-center sm:min-h-[calc(100dvh-4rem)]">
        <Link
          href={`/torre/${storeId}?menu=informacoes`}
          className="mb-7 flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white"
          aria-label="Voltar para a Torre"
        >
          <ArrowLeft size={19} />
        </Link>

        <div className="rounded-3xl border border-violet-300/20 bg-gradient-to-br from-violet-400/15 via-slate-900 to-slate-950 p-6 shadow-2xl shadow-black/30 sm:p-9">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-300 text-slate-950">
            <Sparkles size={25} strokeWidth={2.4} />
          </div>
          <p className="mt-6 text-xs font-black uppercase tracking-[0.2em] text-violet-300">Informações úteis</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">Tratamento AR</h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">
            Use a tela do cliente para comparar uma simulação com e sem tratamento antirreflexo.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={openClientScreen}
              className="flex min-h-28 flex-col items-start justify-between rounded-2xl bg-violet-300 p-5 text-left text-slate-950 transition hover:bg-violet-200 active:scale-[0.99]"
            >
              <MonitorUp size={25} />
              <span className="text-lg font-bold">Abrir tela do cliente</span>
            </button>
            <button
              type="button"
              onClick={() => setComparison(!comparisonEnabled)}
              className={`flex min-h-28 flex-col items-start justify-between rounded-2xl border p-5 text-left transition active:scale-[0.99] ${comparisonEnabled ? 'border-emerald-300/50 bg-emerald-400/15 text-emerald-100 hover:bg-emerald-400/20' : 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'}`}
            >
              <Eye size={25} />
              <span>
                <span className="block text-lg font-bold">{comparisonEnabled ? 'Comparação visível' : 'Comparação oculta'}</span>
                <span className="mt-1 block text-sm opacity-75">Toque para {comparisonEnabled ? 'ocultar' : 'mostrar'} na tela do cliente.</span>
              </span>
            </button>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-700 bg-slate-950/45 p-5">
            <div className="flex items-center justify-between gap-4 text-sm font-semibold">
              <span className="text-amber-200">Sem AR</span>
              <span className="text-emerald-300">Com AR</span>
            </div>
            <input
              type="range"
              min="5"
              max="95"
              value={splitPosition}
              onChange={(event) => setSplit(Number(event.target.value))}
              className="mt-3 w-full cursor-ew-resize accent-violet-300"
              aria-label="Divisória entre os vídeos"
            />
            <p className="mt-2 text-sm text-slate-400">Arraste a faixa para revelar mais do vídeo com reflexos ou do vídeo limpo na tela do cliente.</p>
          </div>
        </div>

        <button type="button" onClick={closeTowerClientScreen} className="mt-4 self-start rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-slate-800">
          Fechar tela do cliente
        </button>
      </div>
    </main>
  )
}
