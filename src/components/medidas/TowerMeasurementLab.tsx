'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Camera, Maximize2, MonitorUp, Play, ScanLine, Square, Wand2 } from 'lucide-react'

type Landmark = { x: number; y: number; z?: number }
type MediaPipeModule = typeof import('@mediapipe/tasks-vision')
type FaceLandmarkerInstance = Awaited<ReturnType<MediaPipeModule['FaceLandmarker']['createFromOptions']>>
type LensType = 'surfacada' | 'bifocal' | 'pronto'

type PointKey =
  | 'calibA'
  | 'calibB'
  | 'pupilR'
  | 'pupilL'
  | 'bridgeR'
  | 'bridgeL'
  | 'mountR'
  | 'mountL'
  | 'lensLeft'
  | 'lensRight'
  | 'lensTop'
  | 'lensBottom'
  | 'diagA'
  | 'diagB'
  | 'palpebraR'
  | 'palpebraL'

type Pt = { x: number; y: number }
type Handles = Record<PointKey, Pt>
type CameraSettings = { width?: number; height?: number; frameRate?: number }
type CapturePayload = {
  dataUrl: string
  width: number
  height: number
  landmarks?: Landmark[]
  cameraSettings?: CameraSettings
  capturedAt: string
}

type TowerMessage =
  | { type: 'command'; command: 'startCamera' | 'stopCamera' | 'capture' | 'fullscreen' }
  | { type: 'capture'; capture: CapturePayload }
  | { type: 'report'; cameraOn: boolean; status: string; cameraSettings?: CameraSettings }

type ImageCaptureCtor = new (track: MediaStreamTrack) => { takePhoto: () => Promise<Blob> }

const CARD_MM = 85.6
const BLANKS = [60, 65, 70, 75, 80, 85]
const RIGHT_IRIS = 468
const LEFT_IRIS = 473
const RIGHT_EYE_OUTER = 33
const NOSE_BRIDGE = 6
const RIGHT_EYE_BOTTOM = 145
const LEFT_EYE_BOTTOM = 374

const POINT_STYLE: Record<PointKey, { label: string; color: string }> = {
  calibA: { label: 'R1', color: '#e5e7eb' },
  calibB: { label: 'R2', color: '#e5e7eb' },
  pupilR: { label: 'OD', color: '#38bdf8' },
  pupilL: { label: 'OE', color: '#38bdf8' },
  bridgeR: { label: 'P1', color: '#22c55e' },
  bridgeL: { label: 'P2', color: '#22c55e' },
  mountR: { label: 'AOD', color: '#fb923c' },
  mountL: { label: 'AOE', color: '#fb923c' },
  lensLeft: { label: 'A1', color: '#f87171' },
  lensRight: { label: 'A2', color: '#f87171' },
  lensTop: { label: 'B1', color: '#a78bfa' },
  lensBottom: { label: 'B2', color: '#a78bfa' },
  diagA: { label: 'D1', color: '#facc15' },
  diagB: { label: 'D2', color: '#facc15' },
  palpebraR: { label: 'PR', color: '#2dd4bf' },
  palpebraL: { label: 'PL', color: '#2dd4bf' },
}

const MEASURE_GROUPS: Array<{ label: string; keys: PointKey[] }> = [
  { label: 'Referencia', keys: ['calibA', 'calibB'] },
  { label: 'Pupilas', keys: ['pupilR', 'pupilL'] },
  { label: 'Ponte', keys: ['bridgeR', 'bridgeL'] },
  { label: 'Alturas', keys: ['mountR', 'mountL'] },
  { label: 'Aro', keys: ['lensLeft', 'lensRight', 'lensTop', 'lensBottom', 'diagA', 'diagB'] },
  { label: 'Palpebra', keys: ['palpebraR', 'palpebraL'] },
]

interface TowerMeasurementLabProps {
  storeId: number
  clientMode?: boolean
}

export default function TowerMeasurementLab({ storeId, clientMode = false }: TowerMeasurementLabProps) {
  const channelName = `tower-measurement-lab-${storeId}`
  const channelRef = useRef<BroadcastChannel | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const stageRef = useRef<HTMLElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const landmarkerRef = useRef<FaceLandmarkerInstance | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const draggingRef = useRef<PointKey | null>(null)
  const statusRef = useRef(clientMode ? 'Aguardando painel' : 'Tela cliente aguardando')

  const [capture, setCapture] = useState<CapturePayload | null>(null)
  const [handles, setHandles] = useState<Handles | null>(null)
  const [activeKeys, setActiveKeys] = useState<PointKey[]>(MEASURE_GROUPS[0].keys)
  const [lensType, setLensType] = useState<LensType>('surfacada')
  const [referenceMm, setReferenceMm] = useState(CARD_MM)
  const [cameraOn, setCameraOn] = useState(false)
  const [status, setStatus] = useState(clientMode ? 'Aguardando painel' : 'Tela cliente aguardando')
  const [cameraSettings, setCameraSettings] = useState<CameraSettings | undefined>()
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    statusRef.current = status
  }, [status])

  useEffect(() => {
    const channel = new BroadcastChannel(channelName)
    channelRef.current = channel

    channel.onmessage = (event: MessageEvent<TowerMessage>) => {
      const message = event.data
      if (!message) return

      if (clientMode && message.type === 'command') {
        if (message.command === 'startCamera') void startCamera()
        if (message.command === 'stopCamera') stopCamera('Camera desligada')
        if (message.command === 'capture') void captureFrame()
        if (message.command === 'fullscreen') void toggleFullscreen()
        return
      }

      if (!clientMode && message.type === 'capture') {
        setCapture(message.capture)
        setHandles(createInitialHandles(message.capture))
        setStatus('Foto recebida')
        setCameraSettings(message.capture.cameraSettings)
      }

      if (!clientMode && message.type === 'report') {
        setCameraOn(message.cameraOn)
        setStatus(message.status)
        setCameraSettings(message.cameraSettings)
      }
    }

    return () => {
      channel.close()
      channelRef.current = null
    }
    // Command handlers intentionally read the latest local refs/state when messages arrive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName, clientMode])

  useEffect(() => () => stopCamera('Camera desligada'), [])

  useEffect(() => {
    if (!clientMode) return
    publishReport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraOn, cameraSettings, clientMode, status])

  const measurements = useMemo(() => {
    if (!handles) return null
    return calculateMeasurements(handles, referenceMm)
  }, [handles, referenceMm])

  function sendCommand(command: TowerMessage extends infer T ? T extends { type: 'command'; command: infer C } ? C : never : never) {
    channelRef.current?.postMessage({ type: 'command', command } satisfies TowerMessage)
  }

  function openClientScreen() {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    url.searchParams.set('client', '1')
    window.open(url.toString(), 'tower-measurement-client', 'popup=yes,width=1080,height=1920')
  }

  async function ensureLandmarker() {
    if (landmarkerRef.current) return landmarkerRef.current
    setStatus('Carregando leitura facial')
    const vision = (await import('@mediapipe/tasks-vision')) as MediaPipeModule
    const wasm = await vision.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm')
    landmarkerRef.current = await vision.FaceLandmarker.createFromOptions(wasm, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
      },
      runningMode: 'IMAGE',
      numFaces: 1,
      minFaceDetectionConfidence: 0.45,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
    })
    return landmarkerRef.current
  }

  async function startCamera() {
    try {
      setStatus('Abrindo camera')
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'user' },
          width: { ideal: 3840 },
          height: { ideal: 2160 },
          frameRate: { ideal: 30, max: 30 },
        },
      })

      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = stream
      const settings = stream.getVideoTracks()[0]?.getSettings()
      setCameraSettings({
        width: settings?.width,
        height: settings?.height,
        frameRate: settings?.frameRate,
      })

      const video = videoRef.current
      if (video) {
        video.srcObject = stream
        await video.play()
      }
      setCameraOn(true)
      setStatus('Camera ativa')
    } catch {
      setCameraOn(false)
      setStatus('Nao foi possivel acessar a camera')
    }
  }

  function stopCamera(nextStatus = 'Camera desligada') {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.srcObject = null
    }
    setCameraOn(false)
    setStatus(nextStatus)
  }

  async function captureFrame() {
    const file = await takeCameraPhoto()
    if (!file) return

    setStatus('Processando foto')
    const dataUrl = await readFileAsDataUrl(file)
    const image = await loadImage(dataUrl)
    const landmarks = await detectLandmarks(image)

    const payload: CapturePayload = {
      dataUrl,
      width: image.naturalWidth,
      height: image.naturalHeight,
      landmarks,
      cameraSettings,
      capturedAt: new Date().toISOString(),
    }
    channelRef.current?.postMessage({ type: 'capture', capture: payload } satisfies TowerMessage)
    setCapture(payload)
    setHandles(createInitialHandles(payload))
    setStatus(landmarks?.length ? 'Foto enviada com rosto detectado' : 'Foto enviada')
  }

  async function takeCameraPhoto() {
    const stream = streamRef.current
    const track = stream?.getVideoTracks()[0]
    const imageCaptureCtor = (window as Window & { ImageCapture?: ImageCaptureCtor }).ImageCapture

    if (track && imageCaptureCtor) {
      try {
        const blob = await new imageCaptureCtor(track).takePhoto()
        return new File([blob], `torre-${Date.now()}.jpg`, { type: blob.type || 'image/jpeg' })
      } catch {
        // Fall through to video frame capture.
      }
    }

    const video = videoRef.current
    if (!video || !video.videoWidth || !video.videoHeight) return null

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const context = canvas.getContext('2d')
    if (!context) return null
    context.drawImage(video, 0, 0, canvas.width, canvas.height)

    return new Promise<File | null>((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) return resolve(null)
        resolve(new File([blob], `torre-${Date.now()}.jpg`, { type: 'image/jpeg' }))
      }, 'image/jpeg', 0.94)
    })
  }

  async function detectLandmarks(image: HTMLImageElement) {
    try {
      const landmarker = await ensureLandmarker()
      const result = landmarker.detect(image)
      return result.faceLandmarks?.[0] as Landmark[] | undefined
    } catch {
      return undefined
    }
  }

  async function toggleFullscreen() {
    const stage = stageRef.current
    if (!stage) return
    if (document.fullscreenElement === stage) {
      await document.exitFullscreen?.()
      setIsFullscreen(false)
      return
    }
    await stage.requestFullscreen?.()
    setIsFullscreen(true)
  }

  function publishReport() {
    channelRef.current?.postMessage({
      type: 'report',
      cameraOn,
      status: statusRef.current,
      cameraSettings,
    } satisfies TowerMessage)
  }

  function applyAutoHandles() {
    if (!capture) return
    setHandles(createInitialHandles(capture))
  }

  function updateHandle(key: PointKey, point: Pt) {
    setHandles((current) => (current ? { ...current, [key]: point } : current))
  }

  function pointFromPointer(event: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current
    const matrix = svg?.getScreenCTM()
    if (!svg || !matrix) return null
    const point = svg.createSVGPoint()
    point.x = event.clientX
    point.y = event.clientY
    const transformed = point.matrixTransform(matrix.inverse())
    return {
      x: clamp(transformed.x, 0, capture?.width ?? 0),
      y: clamp(transformed.y, 0, capture?.height ?? 0),
    }
  }

  if (clientMode) {
    return (
      <main ref={stageRef} className="relative h-screen w-screen overflow-hidden bg-black text-white">
        <video ref={videoRef} className="h-full w-full object-contain" playsInline muted />
        {!cameraOn && (
          <div className="absolute inset-0 grid place-items-center bg-neutral-950">
            <div className="text-center">
              <Camera className="mx-auto h-12 w-12 text-white/70" />
              <div className="mt-4 text-sm font-black uppercase tracking-wide text-white/60">{status}</div>
            </div>
          </div>
        )}
        <div className="absolute left-4 top-4 rounded-md border border-white/15 bg-black/50 px-4 py-3 text-xs font-black uppercase tracking-wide backdrop-blur">
          <div>{status}</div>
          {cameraSettings && (
            <div className="mt-1 text-white/65">
              CAM {cameraSettings.width ?? '-'}x{cameraSettings.height ?? '-'}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={toggleFullscreen}
          className="absolute right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-md border border-white/15 bg-black/50 text-white backdrop-blur"
          aria-label={isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
        >
          <Maximize2 className="h-5 w-5" />
        </button>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_20%_0%,rgba(34,211,238,0.14),transparent_28%),linear-gradient(135deg,#020617_0%,#0f172a_48%,#111827_100%)] text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-5">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <Link
            href={`/dashboard/loja/${storeId}`}
            className="inline-flex items-center gap-2 text-sm font-bold text-slate-400 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Link>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={openClientScreen} className={buttonClass('light')}>
              <MonitorUp className="h-4 w-4" />
              Tela cliente
            </button>
            <button type="button" onClick={() => sendCommand('startCamera')} className={buttonClass('dark')}>
              <Play className="h-4 w-4" />
              Camera
            </button>
            <button type="button" onClick={() => sendCommand('capture')} className={buttonClass('dark')}>
              <ScanLine className="h-4 w-4" />
              Capturar
            </button>
            <button type="button" onClick={() => sendCommand('stopCamera')} className={buttonClass('light')}>
              <Square className="h-4 w-4" />
              Parar
            </button>
          </div>
        </header>

        <section className="grid flex-1 gap-5 py-5 xl:grid-cols-[1fr_380px]">
          <div className="relative min-h-[560px] overflow-hidden rounded-lg border border-white/10 bg-black/35 shadow-2xl shadow-black/25 backdrop-blur">
            {capture && handles ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={capture.dataUrl} alt="" className="absolute inset-0 h-full w-full object-contain" />
                <svg
                  ref={svgRef}
                  viewBox={`0 0 ${capture.width} ${capture.height}`}
                  preserveAspectRatio="xMidYMid meet"
                  className="absolute inset-0 h-full w-full touch-none"
                  onPointerMove={(event) => {
                    const key = draggingRef.current
                    if (!key) return
                    const point = pointFromPointer(event)
                    if (point) updateHandle(key, point)
                  }}
                  onPointerUp={() => {
                    draggingRef.current = null
                  }}
                  onPointerLeave={() => {
                    draggingRef.current = null
                  }}
                >
                  <MeasurementLines handles={handles} lensType={lensType} />
                  {(Object.keys(handles) as PointKey[]).map((key) => {
                    const point = handles[key]
                    const style = POINT_STYLE[key]
                    const active = activeKeys.includes(key)
                    return (
                      <g
                        key={key}
                        transform={`translate(${point.x} ${point.y})`}
                        onPointerDown={(event) => {
                          draggingRef.current = key
                          event.currentTarget.setPointerCapture(event.pointerId)
                        }}
                        className="cursor-grab"
                      >
                        <circle r={active ? 22 : 15} fill="rgba(0,0,0,0.72)" stroke={style.color} strokeWidth={active ? 5 : 3} />
                        <text y={5} textAnchor="middle" className="select-none fill-white text-[18px] font-black">
                          {style.label}
                        </text>
                      </g>
                    )
                  })}
                </svg>
              </>
            ) : (
              <div className="grid h-full min-h-[560px] place-items-center text-center text-white/65">
                <div>
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-lg border border-cyan-400/30 bg-cyan-400/10">
                    <Camera className="h-8 w-8 text-cyan-100" />
                  </div>
                  <div className="mt-4 text-sm font-black uppercase tracking-wide text-slate-300">{status}</div>
                </div>
              </div>
            )}
          </div>

          <aside className="flex flex-col gap-4">
            <Panel title="Controle">
              <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm font-semibold text-slate-200">{status}</div>
              {cameraSettings && (
                <div className="mt-3 text-xs font-black uppercase tracking-wide text-cyan-200/80">
                  CAM {cameraSettings.width ?? '-'}x{cameraSettings.height ?? '-'} {Math.round(cameraSettings.frameRate ?? 0) || '-'}FPS
                </div>
              )}
              <button type="button" onClick={() => sendCommand('fullscreen')} className={`${buttonClass('light')} mt-4 w-full justify-center`}>
                <Maximize2 className="h-4 w-4" />
                Tela cheia
              </button>
            </Panel>

            <Panel title="Calibracao">
              <label className="block text-xs font-black uppercase tracking-wide text-slate-400">Referencia em mm</label>
              <input
                value={referenceMm}
                type="number"
                step="0.1"
                onChange={(event) => setReferenceMm(Number(event.target.value) || CARD_MM)}
                className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-black/25 px-3 text-sm font-bold text-slate-100 outline-none focus:border-cyan-400/60"
              />
              <button type="button" onClick={applyAutoHandles} disabled={!capture} className={`${buttonClass('light')} mt-3 w-full justify-center disabled:opacity-40`}>
                <Wand2 className="h-4 w-4" />
                Reposicionar
              </button>
            </Panel>

            <Panel title="Ajuste fino">
              <div className="grid grid-cols-2 gap-2">
                {MEASURE_GROUPS.map((group) => (
                  <button
                    key={group.label}
                    type="button"
                    onClick={() => setActiveKeys(group.keys)}
                    className={`rounded-lg border px-3 py-2 text-xs font-black uppercase tracking-wide transition-colors ${
                      activeKeys === group.keys ? 'border-cyan-300/50 bg-cyan-400/15 text-cyan-50' : 'border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    {group.label}
                  </button>
                ))}
              </div>
              <select
                value={lensType}
                onChange={(event) => setLensType(event.target.value as LensType)}
                className="mt-3 h-11 w-full rounded-lg border border-white/10 bg-black/25 px-3 text-sm font-bold text-slate-100 outline-none focus:border-cyan-400/60"
              >
                <option value="surfacada">Surfacada</option>
                <option value="bifocal">Bifocal</option>
                <option value="pronto">Pronto</option>
              </select>
            </Panel>

            <Panel title="Medidas">
              {measurements ? (
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <Metric label="DNP OD" value={measurements.dnpOD} />
                  <Metric label="DNP OE" value={measurements.dnpOE} />
                  <Metric label="Alt OD" value={measurements.altOD} />
                  <Metric label="Alt OE" value={measurements.altOE} />
                  <Metric label="Ponte" value={measurements.ponte} />
                  <Metric label="A" value={measurements.horizontal} />
                  <Metric label="B" value={measurements.vertical} />
                  <Metric label="D" value={measurements.diagonal} />
                  <Metric label="Diam OD" value={measurements.diamOD} />
                  <Metric label="Diam OE" value={measurements.diamOE} />
                  {lensType === 'bifocal' && (
                    <>
                      <Metric label="Palp OD" value={measurements.palpebraOD} />
                      <Metric label="Palp OE" value={measurements.palpebraOE} />
                    </>
                  )}
                </div>
              ) : (
                <div className="text-sm font-semibold text-slate-500">Sem foto capturada</div>
              )}
            </Panel>
          </aside>
        </section>
      </div>
    </main>
  )
}

function MeasurementLines({ handles, lensType }: { handles: Handles; lensType: LensType }) {
  const lines: Array<[PointKey, PointKey, string]> = [
    ['calibA', 'calibB', '#e5e7eb'],
    ['pupilR', 'bridgeR', '#38bdf8'],
    ['pupilL', 'bridgeL', '#38bdf8'],
    ['bridgeR', 'bridgeL', '#22c55e'],
    ['mountR', 'pupilR', '#fb923c'],
    ['mountL', 'pupilL', '#fb923c'],
    ['lensLeft', 'lensRight', '#f87171'],
    ['lensTop', 'lensBottom', '#a78bfa'],
    ['diagA', 'diagB', '#facc15'],
  ]
  if (lensType === 'bifocal') {
    lines.push(['mountR', 'palpebraR', '#2dd4bf'], ['mountL', 'palpebraL', '#2dd4bf'])
  }

  return (
    <>
      {lines.map(([from, to, color]) => (
        <line
          key={`${from}-${to}`}
          x1={handles[from].x}
          y1={handles[from].y}
          x2={handles[to].x}
          y2={handles[to].y}
          stroke={color}
          strokeWidth={4}
          strokeLinecap="round"
          opacity={0.82}
        />
      ))}
    </>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.045] p-4 shadow-2xl shadow-black/10 backdrop-blur-md">
      <div className="mb-3 text-xs font-black uppercase tracking-wide text-slate-400">{title}</div>
      {children}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-1">
      <span className="font-semibold text-slate-400">{label}</span>
      <span className="font-mono font-black text-slate-50">{value.toFixed(1)}</span>
    </div>
  )
}

function createInitialHandles(capture: CapturePayload): Handles {
  const w = capture.width
  const h = capture.height
  const cx = w / 2
  const cy = h / 2
  const lm = capture.landmarks
  const toPx = (landmark: Landmark | undefined, fallback: Pt): Pt =>
    landmark ? { x: landmark.x * w, y: landmark.y * h } : fallback

  const pupilR = toPx(lm?.[RIGHT_IRIS], { x: cx - w * 0.12, y: cy - h * 0.06 })
  const pupilL = toPx(lm?.[LEFT_IRIS], { x: cx + w * 0.12, y: cy - h * 0.06 })
  const bridge = toPx(lm?.[NOSE_BRIDGE], { x: cx, y: cy })
  const eyeOuter = toPx(lm?.[RIGHT_EYE_OUTER], { x: pupilR.x - w * 0.08, y: pupilR.y })
  const pxPerMm = Math.max(distance(pupilR, pupilL) / 63, 1)
  const lensRightX = bridge.x - 8.5 * pxPerMm
  const lensLeftX = Math.min(pupilR.x - 26 * pxPerMm, eyeOuter.x - 4 * pxPerMm)

  return {
    calibA: { x: cx - w * 0.11, y: h * 0.12 },
    calibB: { x: cx + w * 0.11, y: h * 0.12 },
    pupilR,
    pupilL,
    bridgeR: { x: lensRightX, y: bridge.y },
    bridgeL: { x: bridge.x + 8.5 * pxPerMm, y: bridge.y },
    mountR: { x: pupilR.x, y: pupilR.y + 18 * pxPerMm },
    mountL: { x: pupilL.x, y: pupilL.y + 18 * pxPerMm },
    lensLeft: { x: lensLeftX, y: pupilR.y },
    lensRight: { x: lensRightX, y: pupilR.y },
    lensTop: { x: pupilR.x, y: pupilR.y - 12 * pxPerMm },
    lensBottom: { x: pupilR.x, y: pupilR.y + 18 * pxPerMm },
    diagA: { x: lensLeftX, y: pupilR.y - 12 * pxPerMm },
    diagB: { x: lensRightX, y: pupilR.y + 18 * pxPerMm },
    palpebraR: toPx(lm?.[RIGHT_EYE_BOTTOM], { x: pupilR.x, y: pupilR.y + 6 * pxPerMm }),
    palpebraL: toPx(lm?.[LEFT_EYE_BOTTOM], { x: pupilL.x, y: pupilL.y + 6 * pxPerMm }),
  }
}

function calculateMeasurements(handles: Handles, referenceMm: number) {
  const mmpp = referenceMm / Math.max(distance(handles.calibA, handles.calibB), 0.0001)
  const bridgeCenterX = (handles.bridgeR.x + handles.bridgeL.x) / 2
  const horizontal = distance(handles.lensLeft, handles.lensRight) * mmpp
  const vertical = distance(handles.lensTop, handles.lensBottom) * mmpp
  const ponte = distance(handles.bridgeR, handles.bridgeL) * mmpp
  const dnpOD = Math.abs(handles.pupilR.x - bridgeCenterX) * mmpp
  const dnpOE = Math.abs(handles.pupilL.x - bridgeCenterX) * mmpp
  const altOD = Math.abs(handles.mountR.y - handles.pupilR.y) * mmpp
  const altOE = Math.abs(handles.mountL.y - handles.pupilL.y) * mmpp
  const diam = (dnp: number, alt: number) => {
    const dH = Math.abs(horizontal / 2 + ponte / 2 - dnp)
    const dV = Math.abs(alt - vertical / 2)
    return nextBlank(distance({ x: 0, y: 0 }, { x: dH, y: dV }) * 2 + distance(handles.diagA, handles.diagB) * mmpp + 2)
  }

  return {
    dnpOD,
    dnpOE,
    altOD,
    altOE,
    ponte,
    horizontal,
    vertical,
    diagonal: distance(handles.diagA, handles.diagB) * mmpp,
    diamOD: diam(dnpOD, altOD),
    diamOE: diam(dnpOE, altOE),
    palpebraOD: Math.abs(handles.mountR.y - handles.palpebraR.y) * mmpp,
    palpebraOE: Math.abs(handles.mountL.y - handles.palpebraL.y) * mmpp,
  }
}

function buttonClass(tone: 'dark' | 'light') {
  return `inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-black transition-colors ${
    tone === 'dark'
      ? 'bg-cyan-500 text-slate-950 hover:bg-cyan-400'
      : 'border border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/10 hover:text-white'
  }`
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = src
  })
}

function nextBlank(value: number) {
  return BLANKS.find((blank) => blank >= value) ?? 85
}

function distance(a: Pt, b: Pt) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
