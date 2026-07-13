'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Eye, MonitorUp, Wind } from 'lucide-react'
import { closeTowerClientScreen, openTowerClientScreen } from '@/lib/tower/client-screen'

type OptiFogMessage =
  | { type: 'optifog-fog'; enabled: boolean }
  | { type: 'optifog-split'; position: number }
  | { type: 'optifog-client-ready' }

export default function OptiFogDemo({ storeId, clientMode = false }: { storeId: number; clientMode?: boolean }) {
  const channelName = `tower-optifog-${storeId}`
  const channelRef = useRef<BroadcastChannel | null>(null)
  const fogRef = useRef(true)
  const splitRef = useRef(50)
  const [fogEnabled, setFogEnabled] = useState(clientMode ? false : true)
  const [splitPosition, setSplitPosition] = useState(50)

  useEffect(() => {
    const channel = new BroadcastChannel(channelName)
    channelRef.current = channel

    channel.onmessage = (event: MessageEvent<OptiFogMessage>) => {
      const data = event.data
      if (!data || typeof data !== 'object') return

      if (clientMode && data.type === 'optifog-fog') setFogEnabled(data.enabled)
      if (clientMode && data.type === 'optifog-split') setSplitPosition(data.position)
      if (!clientMode && data.type === 'optifog-client-ready') {
        channel.postMessage({ type: 'optifog-fog', enabled: fogRef.current } satisfies OptiFogMessage)
        channel.postMessage({ type: 'optifog-split', position: splitRef.current } satisfies OptiFogMessage)
      }
    }

    if (clientMode) channel.postMessage({ type: 'optifog-client-ready' } satisfies OptiFogMessage)

    return () => {
      channel.close()
      channelRef.current = null
    }
  }, [channelName, clientMode])

  function setFog(enabled: boolean) {
    fogRef.current = enabled
    setFogEnabled(enabled)
    channelRef.current?.postMessage({ type: 'optifog-fog', enabled } satisfies OptiFogMessage)
  }

  function setSplit(position: number) {
    splitRef.current = position
    setSplitPosition(position)
    channelRef.current?.postMessage({ type: 'optifog-split', position } satisfies OptiFogMessage)
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
        <video className="absolute inset-0 h-full w-full object-cover" autoPlay loop muted playsInline>
          <source src="/cha.mp4" type="video/mp4" />
        </video>

        <div className={`pointer-events-none absolute inset-y-0 left-0 overflow-hidden transition-[width,opacity] ${fogEnabled ? 'opacity-100 delay-[750ms] duration-[2800ms] ease-out' : 'opacity-0 delay-0 duration-[700ms] ease-in'}`} style={{ width: `${splitPosition}%` }}>
          <div
            className="absolute inset-0 h-[100dvh] w-screen max-w-none"
            style={{
              background: 'radial-gradient(ellipse 72% 58% at 24% 28%, rgba(255,255,255,0.48), transparent 72%), radial-gradient(ellipse 82% 62% at 78% 68%, rgba(226,232,240,0.5), transparent 76%), linear-gradient(135deg, rgba(241,245,249,0.32), rgba(148,163,184,0.18))',
              backdropFilter: 'blur(7px) brightness(1.02) contrast(0.72) saturate(0.68)',
            }}
          >
            <div className="absolute -left-[15%] top-[4%] h-[55%] w-[82%] rounded-full bg-white/25 blur-3xl" />
            <div className="absolute -right-[18%] bottom-[2%] h-[62%] w-[86%] rounded-full bg-slate-100/30 blur-3xl" />
          </div>
        </div>

        {fogEnabled && <div className="pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-white shadow-[0_0_16px_rgba(255,255,255,0.95)]" style={{ left: `${splitPosition}%` }} />}

        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-between p-7 text-sm font-black uppercase tracking-[0.2em] sm:p-10 sm:text-lg">
          <span className="rounded-full bg-slate-950/70 px-4 py-2 text-amber-200 shadow-lg shadow-black/20">Sem Opti Fog</span>
          <span className="rounded-full bg-slate-950/70 px-4 py-2 text-emerald-300 shadow-lg shadow-black/20">Com Opti Fog</span>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/85 via-slate-950/35 to-transparent px-7 pb-8 pt-24 sm:px-10 sm:pb-12">
          <p className="max-w-2xl text-lg font-semibold sm:text-2xl">O embaçamento reduz a nitidez da imagem.</p>
          <p className="mt-2 text-sm text-slate-200 sm:text-base">Demonstração visual do tratamento antiembaçante.</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-[100dvh] bg-slate-950 px-5 py-5 text-slate-100 sm:px-8 sm:py-8">
      <div className="mx-auto flex min-h-[calc(100dvh-2.5rem)] max-w-4xl flex-col justify-center sm:min-h-[calc(100dvh-4rem)]">
        <Link href={`/torre/${storeId}?menu=informacoes`} className="mb-7 flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white" aria-label="Voltar para a Torre">
          <ArrowLeft size={19} />
        </Link>

        <div className="rounded-3xl border border-teal-300/20 bg-gradient-to-br from-teal-400/15 via-slate-900 to-slate-950 p-6 shadow-2xl shadow-black/30 sm:p-9">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-300 text-slate-950">
            <Wind size={25} strokeWidth={2.4} />
          </div>
          <p className="mt-6 text-xs font-black uppercase tracking-[0.2em] text-teal-300">Informações úteis</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">Opti Fog</h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">Mostre como o embaçamento prejudica a visão e como o tratamento antiembaçante mantém a imagem nítida.</p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={openClientScreen} className="flex min-h-28 flex-col items-start justify-between rounded-2xl bg-teal-300 p-5 text-left text-slate-950 transition hover:bg-teal-200 active:scale-[0.99]">
              <MonitorUp size={25} />
              <span className="text-lg font-bold">Abrir tela do cliente</span>
            </button>
            <button
              type="button"
              onClick={() => setFog(!fogEnabled)}
              className={`flex min-h-28 flex-col items-start justify-between rounded-2xl border p-5 text-left transition active:scale-[0.99] ${fogEnabled ? 'border-amber-300/50 bg-amber-400/15 text-amber-100 hover:bg-amber-400/20' : 'border-emerald-300/50 bg-emerald-400/15 text-emerald-100 hover:bg-emerald-400/20'}`}
            >
              <Eye size={25} />
              <span>
                <span className="block text-lg font-bold">{fogEnabled ? 'Comparação visível' : 'Comparação oculta'}</span>
                <span className="mt-1 block text-sm opacity-75">Toque para {fogEnabled ? 'ocultar' : 'mostrar'} a comparação na tela do cliente.</span>
              </span>
            </button>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-700 bg-slate-950/45 p-5">
            <div className="flex items-center justify-between gap-4 text-sm font-semibold">
              <span className="text-amber-200">Sem Opti Fog</span>
              <span className="text-emerald-300">Com Opti Fog</span>
            </div>
            <input
              type="range"
              min="5"
              max="95"
              value={splitPosition}
              onChange={(event) => setSplit(Number(event.target.value))}
              className="mt-3 w-full cursor-ew-resize accent-teal-300"
              aria-label="Divisória entre visão embaçada e nítida"
            />
            <p className="mt-2 text-sm text-slate-400">Arraste a faixa para comparar a visão embaçada com a visão nítida na tela do cliente.</p>
          </div>
        </div>

        <button type="button" onClick={closeTowerClientScreen} className="mt-4 self-start rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-slate-800">
          Fechar tela do cliente
        </button>
      </div>
    </main>
  )
}
