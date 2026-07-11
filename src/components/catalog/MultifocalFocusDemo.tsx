'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Camera, Maximize2, Minimize2, MonitorUp, Play, Square } from 'lucide-react'
import { closeTowerClientScreen, openTowerClientScreen } from '@/lib/tower/client-screen'

type Landmark = { x: number; y: number; z?: number }
type MediaPipeModule = typeof import('@mediapipe/tasks-vision')
type FaceLandmarkerInstance = Awaited<ReturnType<MediaPipeModule['FaceLandmarker']['createFromOptions']>>
type DemoPhase = 'idle' | 'calibrating' | 'running'
type FocusMetrics = {
  faceDetected: boolean
  eyeX: number
  eyeY: number
  headX: number
  headY: number
}
type FocusReport = {
  type: 'report'
  phase: DemoPhase
  status: string
  faceDetected: boolean
  blurPx: number
  clarity: number
  calibrationLeft: number
  metrics: FocusMetrics
}
type FocusCommand = {
  type: 'command'
  command: 'toggle'
}

const IMAGE_SRC = '/lens-demo/foto1.png'
const CALIBRATION_MS = 2600
const RIGHT_IRIS = 468
const LEFT_IRIS = 473
const RIGHT_EYE_OUTER = 33
const RIGHT_EYE_INNER = 133
const LEFT_EYE_INNER = 362
const LEFT_EYE_OUTER = 263
const RIGHT_EYE_TOP = 386
const RIGHT_EYE_BOTTOM = 374
const LEFT_EYE_TOP = 159
const LEFT_EYE_BOTTOM = 145
const NOSE = 1
const FOREHEAD = 10
const CHIN = 152

const ZERO_METRICS: FocusMetrics = {
  faceDetected: false,
  eyeX: 0,
  eyeY: 0,
  headX: 0,
  headY: 0,
}

interface MultifocalFocusDemoProps {
  storeId: number
  clientMode?: boolean
  backHref?: string
  towerMode?: boolean
}

export default function MultifocalFocusDemo({
  storeId,
  clientMode = false,
  backHref = `/dashboard/loja/${storeId}/recomendacao-lentes`,
  towerMode = false,
}: MultifocalFocusDemoProps) {
  const channelName = `multifocal-focus-demo-${storeId}`
  const channelRef = useRef<BroadcastChannel | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const clientStageRef = useRef<HTMLElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const landmarkerRef = useRef<FaceLandmarkerInstance | null>(null)
  const animationRef = useRef<number | null>(null)
  const phaseRef = useRef<DemoPhase>('idle')
  const metricsRef = useRef<FocusMetrics>(ZERO_METRICS)
  const baselineRef = useRef<FocusMetrics>({ ...ZERO_METRICS, faceDetected: true })
  const calibrationSamplesRef = useRef<FocusMetrics[]>([])
  const calibrationTimerRef = useRef<number | null>(null)
  const calibrationStartedAtRef = useRef(0)
  const blurRef = useRef(0)
  const statusRef = useRef(clientMode ? 'Aguardando inicio no painel' : 'Tela cliente aguardando')
  const startDemoRef = useRef<() => void>(() => {})
  const stopDemoRef = useRef<(status?: string) => void>(() => {})
  const publishReportRef = useRef<() => void>(() => {})
  const lastDetectionStatusRef = useRef('')

  const [phase, setPhase] = useState<DemoPhase>('idle')
  const [status, setStatus] = useState(clientMode ? 'Aguardando inicio no painel' : 'Tela cliente aguardando')
  const [faceDetected, setFaceDetected] = useState(false)
  const [blurPx, setBlurPx] = useState(0)
  const [clarity, setClarity] = useState(100)
  const [calibrationLeft, setCalibrationLeft] = useState(0)
  const [metrics, setMetrics] = useState<FocusMetrics>(ZERO_METRICS)
  const [isFullscreen, setIsFullscreen] = useState(false)

  startDemoRef.current = () => {
    void startDemo()
  }
  stopDemoRef.current = stopDemo
  publishReportRef.current = publishReport

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  useEffect(() => {
    statusRef.current = status
  }, [status])

  useEffect(() => {
    const channel = new BroadcastChannel(channelName)
    channelRef.current = channel

    channel.onmessage = (event: MessageEvent<FocusReport | FocusCommand>) => {
      const data = event.data
      if (!data || typeof data !== 'object') return

      if (clientMode && data.type === 'command' && data.command === 'toggle') {
        if (phaseRef.current === 'idle') {
          startDemoRef.current()
        } else {
          stopDemoRef.current('Sessao pausada pelo painel.')
        }
      }

      if (!clientMode && data.type === 'report') {
        setPhase(data.phase)
        setStatus(data.status)
        setFaceDetected(data.faceDetected)
        setBlurPx(data.blurPx)
        setClarity(data.clarity)
        setCalibrationLeft(data.calibrationLeft)
        setMetrics(data.metrics)
      }
    }

    return () => {
      channel.close()
      channelRef.current = null
    }
  }, [channelName, clientMode])

  useEffect(() => {
    if (!clientMode) return
    publishReportRef.current()
    const timer = window.setInterval(() => publishReportRef.current(), 180)
    return () => window.clearInterval(timer)
  }, [clientMode])

  useEffect(() => {
    return () => {
      cleanupTracking()
      landmarkerRef.current?.close?.()
    }
  }, [])

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === clientStageRef.current)
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  function publishReport() {
    channelRef.current?.postMessage({
      type: 'report',
      phase: phaseRef.current,
      status: statusRef.current,
      faceDetected: metricsRef.current.faceDetected,
      blurPx: blurRef.current,
      clarity: Math.round(100 - (blurRef.current / 14) * 100),
      calibrationLeft,
      metrics: metricsRef.current,
    } satisfies FocusReport)
  }

  function sendToggleCommand() {
    channelRef.current?.postMessage({ type: 'command', command: 'toggle' } satisfies FocusCommand)
  }

  function openClientScreen() {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    url.searchParams.set('client', '1')
    openTowerClientScreen(url.toString(), 'popup=yes,width=1080,height=1920')
  }

  async function toggleClientFullscreen() {
    const stage = clientStageRef.current
    if (!stage) return

    if (document.fullscreenElement === stage) {
      await document.exitFullscreen?.()
      return
    }

    await stage.requestFullscreen?.()
  }

  async function ensureLandmarker() {
    if (landmarkerRef.current) return landmarkerRef.current

    setStatus('Carregando modelo facial...')
    const vision = (await import('@mediapipe/tasks-vision')) as MediaPipeModule
    const wasm = await vision.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm')

    landmarkerRef.current = await vision.FaceLandmarker.createFromOptions(wasm, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
      },
      runningMode: 'VIDEO',
      numFaces: 1,
      minFaceDetectionConfidence: 0.55,
      minFacePresenceConfidence: 0.55,
      minTrackingConfidence: 0.55,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
    })

    return landmarkerRef.current
  }

  async function startDemo() {
    try {
      setStatus('Abrindo camera e preparando calibracao...')
      setPhase('calibrating')
      calibrationSamplesRef.current = []
      blurRef.current = 0
      setBlurPx(0)
      setClarity(100)
      setCalibrationLeft(Math.ceil(CALIBRATION_MS / 1000))

      const landmarker = await ensureLandmarker()
      await startCamera()
      startTrackingLoop(landmarker)

      setStatus('Calibrando centro: olhe para a imagem com a cabeca reta.')
      calibrationStartedAtRef.current = performance.now()
      calibrationTimerRef.current = window.setTimeout(() => {
        const samples = calibrationSamplesRef.current.filter((sample) => sample.faceDetected)
        if (samples.length < 8) {
          stopDemo('Nao houve leitura suficiente. Aproxime o rosto e tente de novo.')
          return
        }

        baselineRef.current = averageMetrics(samples)
        setPhase('running')
        setCalibrationLeft(0)
        setStatus('Sessao ativa')
      }, CALIBRATION_MS)
    } catch (error) {
      console.error(error)
      stopDemo('Nao foi possivel acessar a camera.')
    }
  }

  async function startCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30, max: 30 },
      },
    })

    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = stream

    const video = videoRef.current
    if (!video) return
    video.srcObject = stream
    await video.play()
  }

  function startTrackingLoop(landmarker: FaceLandmarkerInstance) {
    if (animationRef.current) cancelAnimationFrame(animationRef.current)

    const loop = () => {
      const video = videoRef.current
      if (!video || video.readyState < 2) {
        animationRef.current = requestAnimationFrame(loop)
        return
      }

      const now = performance.now()
      const result = landmarker.detectForVideo(video, now)
      const landmarks = result.faceLandmarks?.[0] as Landmark[] | undefined
      const nextMetrics = landmarks ? computeFocusMetrics(landmarks) : ZERO_METRICS
      metricsRef.current = nextMetrics

      if (phaseRef.current !== 'idle') {
        const secondsLeft =
          phaseRef.current === 'calibrating'
            ? Math.max(0, Math.ceil((CALIBRATION_MS - (now - calibrationStartedAtRef.current)) / 1000))
            : 0
        setCalibrationLeft(secondsLeft)

        const nextStatus = nextMetrics.faceDetected
          ? phaseRef.current === 'calibrating'
            ? `Rosto encontrado. Calibrando: ${secondsLeft}s`
            : 'Sessao ativa'
          : phaseRef.current === 'calibrating'
            ? `Procurando rosto... calibracao ${secondsLeft}s`
            : `Procurando rosto... camera ${video.videoWidth || '-'}x${video.videoHeight || '-'}`
        if (lastDetectionStatusRef.current !== nextStatus) {
          lastDetectionStatusRef.current = nextStatus
          setStatus(nextStatus)
        }
      }

      if (phaseRef.current === 'calibrating' && nextMetrics.faceDetected) {
        calibrationSamplesRef.current.push(nextMetrics)
      }

      if (phaseRef.current === 'running' && nextMetrics.faceDetected) {
        const nextBlur = computeBlur(nextMetrics, baselineRef.current)
        blurRef.current = lerp(blurRef.current, nextBlur, 0.24)
      } else if (phaseRef.current !== 'running') {
        blurRef.current = lerp(blurRef.current, 0, 0.18)
      }

      setFaceDetected(nextMetrics.faceDetected)
      setMetrics(nextMetrics)
      setBlurPx(blurRef.current)
      setClarity(Math.round(100 - (blurRef.current / 14) * 100))

      animationRef.current = requestAnimationFrame(loop)
    }

    animationRef.current = requestAnimationFrame(loop)
  }

  function stopDemo(nextStatus = 'Sessao parada.') {
    cleanupTracking()
    blurRef.current = 0
    metricsRef.current = ZERO_METRICS
    setPhase('idle')
    setStatus(nextStatus)
    setFaceDetected(false)
    setMetrics(ZERO_METRICS)
    setBlurPx(0)
    setClarity(100)
    setCalibrationLeft(0)
  }

  function cleanupTracking() {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }
    if (calibrationTimerRef.current) {
      window.clearTimeout(calibrationTimerRef.current)
      calibrationTimerRef.current = null
    }
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.srcObject = null
    }
  }

  if (clientMode) {
    return (
      <main ref={clientStageRef} className="relative h-screen w-screen overflow-hidden bg-zinc-950 text-white">
        <Image
          src={IMAGE_SRC}
          alt=""
          fill
          priority
          sizes="100vw"
          className="h-full w-full object-cover transition-[filter,transform] duration-150"
          style={{ filter: `blur(${blurPx.toFixed(2)}px)`, transform: `scale(${1 + blurPx * 0.003})` }}
        />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,_transparent_35%,_rgba(0,0,0,0.14)_100%)]" />
        <div className="absolute left-5 top-5 rounded-md border border-white/15 bg-black/45 px-4 py-3 text-xs font-semibold uppercase tracking-wide backdrop-blur">
          <div>{phaseLabel(phase)}</div>
          <div className="mt-1 text-white/70">Nitidez {clarity}%</div>
        </div>
        {phase === 'calibrating' && (
          <div className="absolute left-1/2 top-5 -translate-x-1/2 rounded-md border border-white/15 bg-black/45 px-5 py-3 text-center backdrop-blur">
            <div className="text-[10px] font-black uppercase tracking-wide text-white/60">Calibracao</div>
            <div className="mt-1 font-mono text-3xl font-black">{calibrationLeft}s</div>
          </div>
        )}
        <button
          type="button"
          onClick={toggleClientFullscreen}
          className="absolute right-5 top-5 inline-flex h-12 w-12 items-center justify-center rounded-md border border-white/15 bg-black/45 text-white backdrop-blur transition hover:bg-black/65"
          aria-label={isFullscreen ? 'Sair da tela cheia' : 'Entrar em tela cheia'}
          title={isFullscreen ? 'Sair da tela cheia' : 'Entrar em tela cheia'}
        >
          {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
        </button>
        <div className="absolute bottom-5 right-5 overflow-hidden rounded-md border border-white/15 bg-black/45 p-1 backdrop-blur">
          <video
            ref={videoRef}
            playsInline
            muted
            className="h-28 w-40 scale-x-[-1] rounded object-cover opacity-80"
          />
          <div className="mt-1 px-1 text-[10px] font-black uppercase tracking-wide text-white/70">
            {faceDetected ? 'Rosto detectado' : 'Buscando rosto'}
          </div>
        </div>
      </main>
    )
  }

  const isRunning = phase === 'calibrating' || phase === 'running'

  if (towerMode) {
    return (
      <main className="flex h-[100dvh] flex-col overflow-hidden bg-slate-950 px-5 py-4 text-white sm:px-7 sm:py-5">
        <header className="flex shrink-0 items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href={backHref}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
              title="Voltar"
              aria-label="Voltar"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-300">Torre de experiência</p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-white">Seu Jeito de Olhar</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={closeTowerClientScreen} className="min-h-10 rounded-xl border border-slate-700 bg-slate-950/80 px-3 text-xs font-bold text-slate-300 transition hover:bg-slate-800">
              Fechar tela
            </button>
            <button
              type="button"
              onClick={openClientScreen}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-600 bg-slate-900/80 px-3 text-sm font-semibold text-slate-100 backdrop-blur transition hover:bg-slate-800"
            >
              <MonitorUp className="h-4 w-4" />
              <span className="hidden sm:inline">Tela cliente</span>
            </button>
          </div>
        </header>

        <section className="relative mt-4 min-h-0 flex-1 overflow-hidden rounded-3xl border border-white/10 bg-slate-900 shadow-2xl shadow-black/30">
          <Image
            src={IMAGE_SRC}
            alt="Prévia da experiência exibida ao cliente"
            fill
            priority
            sizes="100vw"
            className="object-cover transition-[filter,transform] duration-150"
            style={{ filter: `blur(${blurPx.toFixed(2)}px)`, transform: `scale(${1 + blurPx * 0.003})` }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/35 via-transparent to-black/20" />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent px-5 pb-5 pt-20 sm:px-6 sm:pb-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">Prévia da tela cliente</p>
            <p className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">{clarity}% nítida</p>
          </div>

          <div className="absolute right-3 top-3 w-[min(310px,calc(100%-1.5rem))] space-y-3 sm:right-5 sm:top-5">
            <div className="rounded-2xl border border-white/15 bg-slate-950/70 p-4 shadow-xl backdrop-blur-md">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">Controle da Torre</p>
              <button
                type="button"
                onClick={sendToggleCommand}
                className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-sky-400 px-4 text-base font-bold text-slate-950 transition hover:bg-sky-300 active:scale-[0.98]"
              >
                {isRunning ? <Square className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                {isRunning ? 'Parar experiência' : 'Iniciar experiência'}
              </button>
              <p className="mt-3 rounded-lg bg-white/10 px-3 py-2 text-sm font-medium text-slate-100">{status}</p>
              {phase === 'calibrating' && (
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-amber-200">
                    <span>Calibração</span>
                    <span>{calibrationLeft}s</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/15">
                    <div
                      className="h-full rounded-full bg-amber-400 transition-all duration-150"
                      style={{
                        width: `${clamp(
                          ((CALIBRATION_MS / 1000 - calibrationLeft) / (CALIBRATION_MS / 1000)) * 100,
                          0,
                          100,
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-white/15 bg-slate-950/70 p-4 shadow-xl backdrop-blur-md">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">Leitura ao vivo</p>
                <span className={faceDetected ? 'text-xs font-bold text-emerald-300' : 'text-xs font-bold text-rose-300'}>
                  {faceDetected ? 'Rosto detectado' : 'Buscando rosto'}
                </span>
              </div>
              <MetricBar label="Nitidez" value={clarity} max={100} tone="dark" />
              <MetricBar label="Blur" value={Math.round(blurPx * 10) / 10} max={14} suffix="px" tone="dark" />
              <MetricBar label="Olhos horizontal" value={Math.abs(metrics.eyeX).toFixed(2)} max={1.4} tone="dark" />
              <MetricBar label="Cabeça horizontal" value={Math.abs(metrics.headX).toFixed(2)} max={1.4} tone="dark" />
              <MetricBar label="Olhos vertical" value={metrics.eyeY.toFixed(2)} max={1.4} tone="dark" />
              <MetricBar label="Cabeça vertical" value={metrics.headY.toFixed(2)} max={1.4} tone="dark" />
            </div>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#eef2ed] text-zinc-950">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-5">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-300 pb-4">
          <Link
            href={backHref}
            className="inline-flex items-center gap-2 text-sm font-bold text-zinc-600 hover:text-zinc-950"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Link>
          <button
            type="button"
            onClick={openClientScreen}
            className="inline-flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-black text-zinc-800 shadow-sm hover:bg-zinc-50"
          >
            <MonitorUp className="h-4 w-4" />
            Tela cliente
          </button>
        </header>

        <section className="grid flex-1 gap-5 py-5 lg:grid-cols-[1fr_360px]">
          <div className="relative min-h-[520px] overflow-hidden rounded-md border border-zinc-300 bg-zinc-950">
            <Image
              src={IMAGE_SRC}
              alt=""
              fill
              priority
              sizes="(min-width: 1024px) 70vw, 100vw"
              className="h-full min-h-[520px] w-full object-cover transition-[filter,transform] duration-150"
              style={{ filter: `blur(${blurPx.toFixed(2)}px)`, transform: `scale(${1 + blurPx * 0.003})` }}
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-5 text-white">
              <div className="text-sm font-semibold uppercase tracking-wide text-white/70">Previa da tela cliente</div>
              <div className="mt-1 text-4xl font-black">{clarity}% nitida</div>
            </div>
          </div>

          <aside className="flex flex-col gap-4">
            <div className="rounded-md border border-zinc-300 bg-white p-5 shadow-sm">
              <div className="text-xs font-black uppercase tracking-wide text-zinc-500">Controle da torre</div>
              <button
                type="button"
                onClick={sendToggleCommand}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-zinc-950 px-5 py-4 text-base font-black text-white hover:bg-zinc-800"
              >
                {isRunning ? <Square className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                {isRunning ? 'Parar' : 'Iniciar'}
              </button>
              <div className="mt-4 rounded-md bg-zinc-100 p-3 text-sm font-semibold text-zinc-700">{status}</div>
              {phase === 'calibrating' && (
                <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3">
                  <div className="flex items-center justify-between text-xs font-black uppercase tracking-wide text-amber-800">
                    <span>Calibracao</span>
                    <span className="font-mono text-base">{calibrationLeft}s</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-amber-100">
                    <div
                      className="h-full rounded-full bg-amber-500 transition-all duration-150"
                      style={{
                        width: `${clamp(
                          ((CALIBRATION_MS / 1000 - calibrationLeft) / (CALIBRATION_MS / 1000)) * 100,
                          0,
                          100,
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-md border border-zinc-300 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="text-xs font-black uppercase tracking-wide text-zinc-500">Leitura</div>
                <span className={faceDetected ? 'text-sm font-black text-emerald-700' : 'text-sm font-black text-rose-700'}>
                  {faceDetected ? 'Rosto detectado' : 'Sem rosto'}
                </span>
              </div>
              <MetricBar label="Nitidez" value={clarity} max={100} />
              <MetricBar label="Blur" value={Math.round(blurPx * 10) / 10} max={14} suffix="px" />
              <MetricBar label="Olhos horizontal" value={Math.abs(metrics.eyeX).toFixed(2)} max={1.4} />
              <MetricBar label="Cabeca horizontal" value={Math.abs(metrics.headX).toFixed(2)} max={1.4} />
              <MetricBar label="Olhos vertical" value={metrics.eyeY.toFixed(2)} max={1.4} />
              <MetricBar label="Cabeca vertical" value={metrics.headY.toFixed(2)} max={1.4} />
            </div>

            <div className="rounded-md border border-zinc-300 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-black text-zinc-800">
                <Camera className="h-4 w-4" />
                Orientacao
              </div>
              <p className="mt-2 text-sm leading-6 text-zinc-600">
                A tela se adapta ao monitor horizontal de hoje e ao formato vertical da torre. O tracking fica na janela
                do cliente, onde a camera estara instalada.
              </p>
            </div>
          </aside>
        </section>
      </div>
    </main>
  )
}

function MetricBar({
  label,
  value,
  max,
  suffix = '',
  tone = 'light',
}: {
  label: string
  value: number | string
  max: number
  suffix?: string
  tone?: 'light' | 'dark'
}) {
  const numericValue = typeof value === 'number' ? value : Number(value)
  const percent = clamp((Math.abs(numericValue) / max) * 100, 0, 100)
  const isDark = tone === 'dark'

  return (
    <div className="mt-4">
      <div className={`mb-1 flex justify-between text-xs font-black uppercase tracking-wide ${isDark ? 'text-slate-300' : 'text-zinc-500'}`}>
        <span>{label}</span>
        <span className={`font-mono ${isDark ? 'text-white' : 'text-zinc-700'}`}>
          {value}
          {suffix}
        </span>
      </div>
      <div className={`h-2 overflow-hidden rounded-full ${isDark ? 'bg-white/15' : 'bg-zinc-200'}`}>
        <div className={`h-full rounded-full ${isDark ? 'bg-sky-300' : 'bg-emerald-600'}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}

function computeFocusMetrics(landmarks: Landmark[]): FocusMetrics {
  const rightOuter = landmarks[RIGHT_EYE_OUTER]
  const rightInner = landmarks[RIGHT_EYE_INNER]
  const leftInner = landmarks[LEFT_EYE_INNER]
  const leftOuter = landmarks[LEFT_EYE_OUTER]
  const rightTop = landmarks[RIGHT_EYE_TOP]
  const rightBottom = landmarks[RIGHT_EYE_BOTTOM]
  const leftTop = landmarks[LEFT_EYE_TOP]
  const leftBottom = landmarks[LEFT_EYE_BOTTOM]
  const nose = landmarks[NOSE]
  const forehead = landmarks[FOREHEAD]
  const chin = landmarks[CHIN]

  if (
    !rightOuter ||
    !rightInner ||
    !leftInner ||
    !leftOuter ||
    !rightTop ||
    !rightBottom ||
    !leftTop ||
    !leftBottom ||
    !nose ||
    !forehead ||
    !chin
  ) {
    return ZERO_METRICS
  }

  const rightIris = landmarks[RIGHT_IRIS] ?? midpoint(rightOuter, rightInner, rightTop, rightBottom)
  const leftIris = landmarks[LEFT_IRIS] ?? midpoint(leftOuter, leftInner, leftTop, leftBottom)
  const rightAxis = landmarks[RIGHT_IRIS] ? computeEyeAxis(rightIris, rightOuter, rightInner, rightTop, rightBottom) : { x: 0, y: 0 }
  const leftAxis = landmarks[LEFT_IRIS] ? computeEyeAxis(leftIris, leftOuter, leftInner, leftTop, leftBottom) : { x: 0, y: 0 }
  const rightEyeCenter = midpoint(rightOuter, rightInner, rightTop, rightBottom)
  const leftEyeCenter = midpoint(leftOuter, leftInner, leftTop, leftBottom)
  const eyeCenter = {
    x: (rightEyeCenter.x + leftEyeCenter.x) / 2,
    y: (rightEyeCenter.y + leftEyeCenter.y) / 2,
  }
  const eyeDistance = Math.max(distance(rightEyeCenter, leftEyeCenter), 0.0001)
  const faceHeight = Math.max(Math.abs(chin.y - forehead.y), 0.0001)

  return {
    faceDetected: true,
    eyeX: (rightAxis.x + leftAxis.x) / 2,
    eyeY: (rightAxis.y + leftAxis.y) / 2,
    headX: clamp((nose.x - eyeCenter.x) / (eyeDistance * 0.5), -1.4, 1.4),
    headY: clamp(((nose.y - eyeCenter.y) / faceHeight - 0.08) * 3.2, -1.4, 1.4),
  }
}

function computeBlur(metrics: FocusMetrics, baseline: FocusMetrics) {
  const eyeX = clamp(metrics.eyeX - baseline.eyeX, -1.4, 1.4)
  const eyeY = clamp(metrics.eyeY - baseline.eyeY, -1.4, 1.4)
  const headX = clamp(metrics.headX - baseline.headX, -1.4, 1.4)
  const headY = clamp(metrics.headY - baseline.headY, -1.4, 1.4)

  const horizontalEyeOnly = Math.max(0, Math.abs(eyeX) - Math.abs(headX) * 0.72 - 0.12)
  const downWithHead = Math.max(0, headY - Math.max(eyeY, 0) * 0.38 - 0.1)
  const blurScore = clamp(Math.max(horizontalEyeOnly / 0.72, downWithHead / 0.62), 0, 1)

  return blurScore * 14
}

function averageMetrics(samples: FocusMetrics[]): FocusMetrics {
  return samples.reduce(
    (acc, sample) => ({
      faceDetected: true,
      eyeX: acc.eyeX + sample.eyeX / samples.length,
      eyeY: acc.eyeY + sample.eyeY / samples.length,
      headX: acc.headX + sample.headX / samples.length,
      headY: acc.headY + sample.headY / samples.length,
    }),
    { ...ZERO_METRICS, faceDetected: true },
  )
}

function computeEyeAxis(iris: Landmark, cornerA: Landmark, cornerB: Landmark, top: Landmark, bottom: Landmark) {
  const minX = Math.min(cornerA.x, cornerB.x)
  const maxX = Math.max(cornerA.x, cornerB.x)
  const minY = Math.min(top.y, bottom.y)
  const maxY = Math.max(top.y, bottom.y)
  const width = Math.max(0.0001, maxX - minX)
  const height = Math.max(0.0001, maxY - minY)

  return {
    x: clamp(((iris.x - minX) / width - 0.5) * 2, -1.4, 1.4),
    y: clamp(((iris.y - minY) / height - 0.5) * 2, -1.4, 1.4),
  }
}

function midpoint(outer: Landmark, inner: Landmark, top: Landmark, bottom: Landmark) {
  return {
    x: (outer.x + inner.x) / 2,
    y: (top.y + bottom.y) / 2,
  }
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function phaseLabel(phase: DemoPhase) {
  if (phase === 'calibrating') return 'Calibrando'
  if (phase === 'running') return 'Ativo'
  return 'Aguardando'
}
