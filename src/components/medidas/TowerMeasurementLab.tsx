'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { ArrowLeft, Bot, Camera, Loader2, Maximize2, MonitorUp, Play, ScanLine, Square, Wand2, ZoomIn, ZoomOut } from 'lucide-react'
import { locateTowerMeasurementPointsWithAiAction } from '@/lib/actions/tower-measurement-ai.actions'

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
type CropRect = { x: number; y: number; width: number; height: number }
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
type LensShape = {
  left: number
  right: number
  top: number
  bottom: number
  diagA: Pt
  diagB: Pt
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
const RIGHT_EYE_INNER = 133
const RIGHT_EYE_TOP = 159
const NOSE_BRIDGE = 6
const RIGHT_EYE_BOTTOM = 145
const LEFT_EYE_INNER = 362
const LEFT_EYE_OUTER = 263
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
const SNAP_KEYS = new Set<PointKey>(['bridgeR', 'bridgeL', 'lensLeft', 'lensRight', 'lensTop', 'lensBottom', 'diagA', 'diagB'])

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
  const cropDragRef = useRef<'move' | 'nw' | 'ne' | 'sw' | 'se' | null>(null)
  const cropMoveOffsetRef = useRef<Pt>({ x: 0, y: 0 })
  const snapImageDataRef = useRef<ImageData | null>(null)
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
  const [operatorZoom, setOperatorZoom] = useState(1)
  const [aiCrop, setAiCrop] = useState<CropRect | null>(null)
  const [isAiPending, startAiTransition] = useTransition()

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
        void applyCapture(message.capture)
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
  const operatorViewBox = capture ? buildZoomViewBox(capture.width, capture.height, operatorZoom) : ''

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
    void applyCapture(payload)
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
    void applyCapture(capture)
  }

  async function applyCapture(nextCapture: CapturePayload) {
    setCapture(nextCapture)
    snapImageDataRef.current = null
    const fallbackHandles = createInitialHandles(nextCapture)
    setHandles(fallbackHandles)
    setAiCrop(buildAiCropRect(nextCapture, fallbackHandles))
    setOperatorZoom(1)
    setStatus('Foto recebida')
    setCameraSettings(nextCapture.cameraSettings)

    try {
      const image = await loadImage(nextCapture.dataUrl)
      snapImageDataRef.current = createImageData(image)
      const nextHandles = createInitialHandles(nextCapture, image)
      setHandles(nextHandles)
      setAiCrop(buildAiCropRect(nextCapture, nextHandles))
    } catch {
      snapImageDataRef.current = null
      // The proportional fallback above is enough when pixel inspection is unavailable.
    }
  }

  function updateHandle(key: PointKey, point: Pt) {
    const nextPoint = SNAP_KEYS.has(key) ? snapToDarkEdge(snapImageDataRef.current, point, 18) : point
    setHandles((current) => (current ? { ...current, [key]: nextPoint } : current))
  }

  function locateWithAi() {
    if (!capture || !handles) return
    setStatus('IA localizando armacao...')
    startAiTransition(() => {
      void (async () => {
        const crop = await createAiCrop(capture, aiCrop ?? buildAiCropRect(capture, handles))
        const result = await locateTowerMeasurementPointsWithAiAction({
          dataUrl: crop.dataUrl,
          width: crop.width,
          height: crop.height,
          crop: crop.rect,
          existingHandles: remapHandlesForCrop(handles, crop.rect),
        })

        if (!result.success || !result.handles) {
          setStatus(result.error ? `IA falhou: ${result.error}` : 'IA nao retornou pontos validos')
          return
        }

        setHandles((current) => {
          if (!current) return current
          const remapped = remapHandlesFromCrop(result.handles ?? {}, crop.rect)
          return { ...current, ...remapped }
        })
        setStatus(`IA aplicada: ${result.model ?? result.provider ?? 'modelo vision'} (${Object.keys(result.handles).length} pontos)`)
      })()
    })
  }

  function pointFromPointer(event: React.PointerEvent<SVGSVGElement>) {
    return pointFromClient(event.clientX, event.clientY)
  }

  function pointFromClient(clientX: number, clientY: number) {
    const svg = svgRef.current
    const matrix = svg?.getScreenCTM()
    if (!svg || !matrix) return null
    const point = svg.createSVGPoint()
    point.x = clientX
    point.y = clientY
    const transformed = point.matrixTransform(matrix.inverse())
    return {
      x: clamp(transformed.x, 0, capture?.width ?? 0),
      y: clamp(transformed.y, 0, capture?.height ?? 0),
    }
  }

  function updateAiCropFromPointer(event: React.PointerEvent<SVGSVGElement>) {
    if (!capture || !aiCrop || !cropDragRef.current) return
    const point = pointFromPointer(event)
    if (!point) return

    setAiCrop((current): CropRect | null => {
      if (!current || !capture || !cropDragRef.current) return current
      const minSize = Math.max(80, Math.min(capture.width, capture.height) * 0.08)

      if (cropDragRef.current === 'move') {
        const x = clamp(point.x - cropMoveOffsetRef.current.x, 0, capture.width - current.width)
        const y = clamp(point.y - cropMoveOffsetRef.current.y, 0, capture.height - current.height)
        return { ...current, x, y }
      }

      const left = current.x
      const right = current.x + current.width
      const top = current.y
      const bottom = current.y + current.height
      const nextLeft = cropDragRef.current.includes('w') ? clamp(point.x, 0, right - minSize) : left
      const nextRight = cropDragRef.current.includes('e') ? clamp(point.x, left + minSize, capture.width) : right
      const nextTop = cropDragRef.current.includes('n') ? clamp(point.y, 0, bottom - minSize) : top
      const nextBottom = cropDragRef.current.includes('s') ? clamp(point.y, top + minSize, capture.height) : bottom

      return {
        x: nextLeft,
        y: nextTop,
        width: nextRight - nextLeft,
        height: nextBottom - nextTop,
      }
    })
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
                <div className="absolute left-4 top-4 z-20 flex items-center gap-2 rounded-lg border border-white/10 bg-slate-950/85 p-2 shadow-lg backdrop-blur">
                  <button
                    type="button"
                    onClick={() => setOperatorZoom((zoom) => Math.max(1, Math.round((zoom - 0.25) * 100) / 100))}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-white/10 text-white hover:bg-white/15"
                    aria-label="Diminuir zoom"
                    title="Diminuir zoom"
                  >
                    <ZoomOut className="h-4 w-4" />
                  </button>
                  <div className="min-w-14 text-center font-mono text-xs font-black text-slate-200">{Math.round(operatorZoom * 100)}%</div>
                  <button
                    type="button"
                    onClick={() => setOperatorZoom((zoom) => Math.min(4, Math.round((zoom + 0.25) * 100) / 100))}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-white/10 text-white hover:bg-white/15"
                    aria-label="Aumentar zoom"
                    title="Aumentar zoom"
                  >
                    <ZoomIn className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setOperatorZoom(1)}
                    className="rounded-md bg-white/10 px-3 py-2 text-xs font-black text-white hover:bg-white/15"
                  >
                    100%
                  </button>
                </div>
                <svg
                  ref={svgRef}
                  viewBox={operatorViewBox}
                  preserveAspectRatio="xMidYMid meet"
                  className="absolute inset-0 h-full w-full touch-none"
                  onPointerMove={(event) => {
                    if (cropDragRef.current) {
                      updateAiCropFromPointer(event)
                      return
                    }
                    const key = draggingRef.current
                    if (!key) return
                    const point = pointFromPointer(event)
                    if (point) updateHandle(key, point)
                  }}
                  onPointerUp={() => {
                    draggingRef.current = null
                    cropDragRef.current = null
                  }}
                  onPointerLeave={() => {
                    draggingRef.current = null
                    cropDragRef.current = null
                  }}
                >
                  <image href={capture.dataUrl} x={0} y={0} width={capture.width} height={capture.height} preserveAspectRatio="none" />
                  {aiCrop && <AiCropOverlay crop={aiCrop} />}
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
                  {aiCrop && (
                    <g>
                      <rect
                        x={aiCrop.x}
                        y={aiCrop.y}
                        width={aiCrop.width}
                        height={aiCrop.height}
                        fill="transparent"
                        stroke="#22d3ee"
                        strokeWidth={5}
                        strokeDasharray="18 12"
                        className="cursor-move"
                        onPointerDown={(event) => {
                          const point = pointFromClient(event.clientX, event.clientY)
                          if (!point) return
                          cropDragRef.current = 'move'
                          cropMoveOffsetRef.current = { x: point.x - aiCrop.x, y: point.y - aiCrop.y }
                          event.currentTarget.setPointerCapture(event.pointerId)
                        }}
                      />
                      {cropHandles(aiCrop).map(({ key, point }) => (
                        <g
                          key={key}
                          transform={`translate(${point.x} ${point.y})`}
                          className="cursor-grab"
                          onPointerDown={(event) => {
                            cropDragRef.current = key
                            event.currentTarget.setPointerCapture(event.pointerId)
                          }}
                        >
                          <rect x={-19} y={-19} width={38} height={38} rx={8} fill="#020617" stroke="#67e8f9" strokeWidth={4} />
                        </g>
                      ))}
                    </g>
                  )}
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
              <button
                type="button"
                onClick={() => {
                  if (capture && handles) setAiCrop(buildAiCropRect(capture, handles))
                }}
                disabled={!capture || !handles}
                className={`${buttonClass('light')} mt-3 w-full justify-center disabled:opacity-40`}
              >
                Resetar recorte IA
              </button>
              <button
                type="button"
                onClick={locateWithAi}
                disabled={!capture || !handles || isAiPending}
                className={`${buttonClass('dark')} mt-3 w-full justify-center disabled:opacity-40`}
              >
                {isAiPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
                IA localizar armacao
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

function AiCropOverlay({ crop }: { crop: CropRect }) {
  return (
    <g pointerEvents="none">
      <rect x={0} y={0} width="100%" height={crop.y} fill="rgba(2,6,23,0.34)" />
      <rect x={0} y={crop.y + crop.height} width="100%" height="100%" fill="rgba(2,6,23,0.34)" />
      <rect x={0} y={crop.y} width={crop.x} height={crop.height} fill="rgba(2,6,23,0.34)" />
      <rect x={crop.x + crop.width} y={crop.y} width="100%" height={crop.height} fill="rgba(2,6,23,0.34)" />
      <text x={crop.x + 18} y={crop.y + 34} className="fill-cyan-100 text-[24px] font-black">
        RECORTE IA
      </text>
    </g>
  )
}

function cropHandles(crop: CropRect): Array<{ key: 'nw' | 'ne' | 'sw' | 'se'; point: Pt }> {
  return [
    { key: 'nw', point: { x: crop.x, y: crop.y } },
    { key: 'ne', point: { x: crop.x + crop.width, y: crop.y } },
    { key: 'sw', point: { x: crop.x, y: crop.y + crop.height } },
    { key: 'se', point: { x: crop.x + crop.width, y: crop.y + crop.height } },
  ]
}

async function createAiCrop(capture: CapturePayload, rect: CropRect) {
  const image = await loadImage(capture.dataUrl)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(rect.width)
  canvas.height = Math.round(rect.height)
  const context = canvas.getContext('2d')
  if (!context) {
    return { dataUrl: capture.dataUrl, width: capture.width, height: capture.height, rect: { x: 0, y: 0, width: capture.width, height: capture.height } }
  }
  context.drawImage(image, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height)
  return {
    dataUrl: canvas.toDataURL('image/jpeg', 0.88),
    width: canvas.width,
    height: canvas.height,
    rect: { x: rect.x, y: rect.y, width: canvas.width, height: canvas.height },
  }
}

function buildAiCropRect(capture: CapturePayload, handles: Handles) {
  const points = [
    handles.pupilR,
    handles.pupilL,
    handles.bridgeR,
    handles.bridgeL,
    handles.lensLeft,
    handles.lensRight,
    handles.lensTop,
    handles.lensBottom,
    handles.diagA,
    handles.diagB,
  ]
  const minX = Math.min(...points.map((point) => point.x))
  const maxX = Math.max(...points.map((point) => point.x))
  const minY = Math.min(...points.map((point) => point.y))
  const maxY = Math.max(...points.map((point) => point.y))
  const width = Math.max(maxX - minX, distance(handles.pupilR, handles.pupilL) * 1.85, capture.width * 0.34)
  const height = Math.max(maxY - minY, width * 0.42, capture.height * 0.18)
  const padX = width * 0.42
  const padTop = height * 0.72
  const padBottom = height * 0.62
  const x = clamp(Math.round(minX - padX), 0, capture.width - 1)
  const y = clamp(Math.round(minY - padTop), 0, capture.height - 1)
  const right = clamp(Math.round(maxX + padX), x + 1, capture.width)
  const bottom = clamp(Math.round(maxY + padBottom), y + 1, capture.height)

  return {
    x,
    y,
    width: right - x,
    height: bottom - y,
  }
}

function remapHandlesForCrop(handles: Handles, crop: { x: number; y: number }) {
  return Object.fromEntries(
    (Object.entries(handles) as Array<[PointKey, Pt]>).map(([key, point]) => [
      key,
      { x: point.x - crop.x, y: point.y - crop.y },
    ]),
  ) as Partial<Handles>
}

function remapHandlesFromCrop(handles: Partial<Handles>, crop: { x: number; y: number }) {
  return Object.fromEntries(
    (Object.entries(handles) as Array<[PointKey, Pt]>).map(([key, point]) => [
      key,
      { x: point.x + crop.x, y: point.y + crop.y },
    ]),
  ) as Partial<Handles>
}

function createInitialHandles(capture: CapturePayload, image?: HTMLImageElement): Handles {
  const w = capture.width
  const h = capture.height
  const cx = w / 2
  const cy = h / 2
  const lm = capture.landmarks
  const toPx = (landmark: Landmark | undefined, fallback: Pt): Pt =>
    landmark ? { x: landmark.x * w, y: landmark.y * h } : fallback

  const rightEyeCenter = midpoint(
    toPx(lm?.[RIGHT_EYE_OUTER], { x: cx - w * 0.18, y: cy - h * 0.06 }),
    toPx(lm?.[RIGHT_EYE_INNER], { x: cx - w * 0.06, y: cy - h * 0.06 }),
  )
  const leftEyeCenter = midpoint(
    toPx(lm?.[LEFT_EYE_INNER], { x: cx + w * 0.06, y: cy - h * 0.06 }),
    toPx(lm?.[LEFT_EYE_OUTER], { x: cx + w * 0.18, y: cy - h * 0.06 }),
  )
  const pupilR = toPx(lm?.[RIGHT_IRIS], rightEyeCenter)
  const pupilL = toPx(lm?.[LEFT_IRIS], leftEyeCenter)
  const bridge = toPx(lm?.[NOSE_BRIDGE], { x: cx, y: cy })
  const pxPerMm = Math.max(distance(pupilR, pupilL) / 63, 1)
  const rightEyeOuter = toPx(lm?.[RIGHT_EYE_OUTER], { x: pupilR.x - 17 * pxPerMm, y: pupilR.y })
  const rightEyeTop = toPx(lm?.[RIGHT_EYE_TOP], { x: pupilR.x, y: pupilR.y - 5 * pxPerMm })
  const rightEyeBottom = toPx(lm?.[RIGHT_EYE_BOTTOM], { x: pupilR.x, y: pupilR.y + 5 * pxPerMm })

  const fallbackLens = {
    left: Math.min(pupilR.x - 28 * pxPerMm, rightEyeOuter.x - 7 * pxPerMm),
    right: Math.min(bridge.x - 5 * pxPerMm, pupilR.x + 28 * pxPerMm),
    top: Math.min(rightEyeTop.y - 11 * pxPerMm, pupilR.y - 18 * pxPerMm),
    bottom: Math.max(rightEyeBottom.y + 13 * pxPerMm, pupilR.y + 20 * pxPerMm),
  }
  const detectedLens = image ? detectLensShape(image, pupilR, fallbackLens, pxPerMm) : fallbackLensToShape(fallbackLens)
  const lensLeftX = detectedLens.left
  const lensRightX = detectedLens.right
  const lensTopY = detectedLens.top
  const lensBottomY = detectedLens.bottom
  const lensCenterY = (lensTopY + lensBottomY) / 2
  const bridgeHalf = Math.max(7.5 * pxPerMm, (pupilL.x - pupilR.x) * 0.08)
  const bridgeY = clamp(bridge.y - 1.5 * pxPerMm, lensTopY, lensBottomY)

  return {
    calibA: { x: Math.max(0, cx - w * 0.11), y: h * 0.12 },
    calibB: { x: Math.min(w, cx + w * 0.11), y: h * 0.12 },
    pupilR,
    pupilL,
    bridgeR: { x: Math.min(lensRightX, bridge.x - bridgeHalf), y: bridgeY },
    bridgeL: { x: bridge.x + bridgeHalf, y: bridgeY },
    mountR: { x: pupilR.x, y: clamp(pupilR.y + 18 * pxPerMm, lensTopY, lensBottomY) },
    mountL: { x: pupilL.x, y: pupilL.y + 18 * pxPerMm },
    lensLeft: { x: lensLeftX, y: lensCenterY },
    lensRight: { x: lensRightX, y: lensCenterY },
    lensTop: { x: pupilR.x, y: lensTopY },
    lensBottom: { x: pupilR.x, y: lensBottomY },
    diagA: detectedLens.diagA,
    diagB: detectedLens.diagB,
    palpebraR: rightEyeBottom,
    palpebraL: toPx(lm?.[LEFT_EYE_BOTTOM], { x: pupilL.x, y: pupilL.y + 6 * pxPerMm }),
  }
}

function detectLensShape(
  image: HTMLImageElement,
  pupil: Pt,
  fallback: { left: number; right: number; top: number; bottom: number },
  pxPerMm: number,
): LensShape {
  const imageData = createImageData(image)
  if (!imageData) return fallbackLensToShape(fallback)
  const sampleRadius = Math.max(3, Math.round(pxPerMm * 0.65))
  const horizontalBand = Math.max(14, Math.round(pxPerMm * 3.2))
  const verticalBand = Math.max(12, Math.round(pxPerMm * 2.8))
  const minScore = 0.26

  const left = findDarkRimX(imageData, pupil, -1, fallback.left, fallback.right, sampleRadius)
  const right = findDarkRimX(imageData, pupil, 1, fallback.left, fallback.right, sampleRadius)
  const top = findDarkRimY(imageData, pupil, -1, fallback.top, fallback.bottom, horizontalBand)
  const bottom = findDarkRimY(imageData, pupil, 1, fallback.top, fallback.bottom, verticalBand)
  const rays = scanLensRays(imageData, pupil, fallback, pxPerMm)
  const box = detectLensBox(imageData, pupil, fallback, pxPerMm)

  const next: LensShape = box ?? {
    left: rays.left
      ? blendNumber(left.score >= minScore ? left.value : fallback.left, rays.left.x, 0.72)
      : left.score >= minScore
        ? left.value
        : fallback.left,
    right: rays.right
      ? blendNumber(right.score >= minScore ? right.value : fallback.right, rays.right.x, 0.72)
      : right.score >= minScore
        ? right.value
        : fallback.right,
    top: rays.top
      ? blendNumber(top.score >= minScore ? top.value : fallback.top, rays.top.y, 0.72)
      : top.score >= minScore
        ? top.value
        : fallback.top,
    bottom: rays.bottom
      ? blendNumber(bottom.score >= minScore ? bottom.value : fallback.bottom, rays.bottom.y, 0.72)
      : bottom.score >= minScore
        ? bottom.value
        : fallback.bottom,
    diagA: rays.diagA ?? { x: fallback.left, y: fallback.top },
    diagB: rays.diagB ?? { x: fallback.right, y: fallback.bottom },
  }

  if (next.right - next.left < 34 * pxPerMm || next.bottom - next.top < 22 * pxPerMm) {
    return fallbackLensToShape(fallback)
  }
  if (!rays.diagA) next.diagA = { x: next.left, y: next.top }
  if (!rays.diagB) next.diagB = { x: next.right, y: next.bottom }
  return next
}

function detectLensBox(
  imageData: ImageData,
  pupil: Pt,
  fallback: { left: number; right: number; top: number; bottom: number },
  pxPerMm: number,
): LensShape | null {
  const xMin = clamp(Math.round(fallback.left - 12 * pxPerMm), 0, imageData.width - 1)
  const xMax = clamp(Math.round(fallback.right + 10 * pxPerMm), 0, imageData.width - 1)
  const yMin = clamp(Math.round(fallback.top - 7 * pxPerMm), 0, imageData.height - 1)
  const yMax = clamp(Math.round(fallback.bottom + 8 * pxPerMm), 0, imageData.height - 1)
  const width = xMax - xMin + 1
  const height = yMax - yMin + 1
  if (width < 30 || height < 24) return null

  const colCounts = new Array(width).fill(0) as number[]
  const rowCounts = new Array(height).fill(0) as number[]
  let candidateCount = 0

  for (let y = yMin; y <= yMax; y += 1) {
    for (let x = xMin; x <= xMax; x += 1) {
      if (!isFrameCandidate(imageData, x, y)) continue
      colCounts[x - xMin] += 1
      rowCounts[y - yMin] += 1
      candidateCount += 1
    }
  }

  if (candidateCount < width * height * 0.015) return null

  const smoothedCols = smoothCounts(colCounts, Math.max(2, Math.round(pxPerMm * 0.32)))
  const smoothedRows = smoothCounts(rowCounts, Math.max(2, Math.round(pxPerMm * 0.32)))
  const colThreshold = Math.max(5, height * 0.075)
  const rowThreshold = Math.max(5, width * 0.08)

  const leftIndex = firstStrongIndex(smoothedCols, colThreshold, 0, Math.round(width * 0.48))
  const rightIndex = lastStrongIndex(smoothedCols, colThreshold, Math.round(width * 0.42), width - 1)
  const topIndex = firstStrongIndex(smoothedRows, rowThreshold, 0, Math.round(height * 0.48))
  const bottomIndex = lastStrongIndex(smoothedRows, rowThreshold, Math.round(height * 0.42), height - 1)

  if (leftIndex === null || rightIndex === null || topIndex === null || bottomIndex === null) return null

  const left = xMin + leftIndex
  const right = xMin + rightIndex
  const top = yMin + topIndex
  const bottom = yMin + bottomIndex
  const minWidth = 36 * pxPerMm
  const minHeight = 22 * pxPerMm
  if (right - left < minWidth || bottom - top < minHeight) return null

  return {
    left,
    right,
    top,
    bottom,
    diagA: nearestFrameCandidate(imageData, { x: left, y: top }, 18) ?? { x: left, y: top },
    diagB: nearestFrameCandidate(imageData, { x: right, y: bottom }, 18) ?? { x: right, y: bottom },
  }
}

function createImageData(image: HTMLImageElement) {
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return null
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return context.getImageData(0, 0, canvas.width, canvas.height)
}

function snapToDarkEdge(imageData: ImageData | null, point: Pt, radius: number): Pt {
  if (!imageData) return point
  return nearestFrameCandidate(imageData, point, radius) ?? point
}

function nearestFrameCandidate(imageData: ImageData, point: Pt, radius: number): Pt | null {
  let best: { point: Pt; score: number } | null = null
  const centerX = Math.round(point.x)
  const centerY = Math.round(point.y)

  for (let y = centerY - radius; y <= centerY + radius; y += 1) {
    if (y < 1 || y >= imageData.height - 1) continue
    for (let x = centerX - radius; x <= centerX + radius; x += 1) {
      if (x < 1 || x >= imageData.width - 1) continue
      if (!isFrameCandidate(imageData, x, y)) continue
      const closeness = 1 - Math.min(distance(point, { x, y }) / radius, 1)
      const darkness = 1 - Math.min(pixelLuminance(imageData, x, y) / 130, 1)
      const score = darkness * 0.7 + closeness * 0.3
      if (!best || score > best.score) best = { point: { x, y }, score }
    }
  }

  return best?.point ?? null
}

function findDarkRimX(
  imageData: ImageData,
  pupil: Pt,
  direction: -1 | 1,
  fallbackLeft: number,
  fallbackRight: number,
  radius: number,
) {
  const { width, height } = imageData
  const start = Math.round(pupil.x + direction * 8)
  const limit = direction < 0 ? Math.round(fallbackLeft - 24) : Math.round(fallbackRight + 24)
  let best = { value: direction < 0 ? fallbackLeft : fallbackRight, score: 0 }

  for (let x = start; direction < 0 ? x >= limit : x <= limit; x += direction) {
    if (x < 0 || x >= width) continue
    let dark = 0
    let total = 0
    for (let y = Math.round(pupil.y - radius * 2); y <= Math.round(pupil.y + radius * 2); y += 1) {
      if (y < 0 || y >= height) continue
      if (isDarkPixel(imageData, x, y)) dark += 1
      total += 1
    }
    const score = total ? dark / total : 0
    if (score > best.score) best = { value: x, score }
  }

  return best
}

function findDarkRimY(
  imageData: ImageData,
  pupil: Pt,
  direction: -1 | 1,
  fallbackTop: number,
  fallbackBottom: number,
  halfBand: number,
) {
  const { width, height } = imageData
  const start = Math.round(pupil.y + direction * 8)
  const limit = direction < 0 ? Math.round(fallbackTop - 18) : Math.round(fallbackBottom + 18)
  let best = { value: direction < 0 ? fallbackTop : fallbackBottom, score: 0 }

  for (let y = start; direction < 0 ? y >= limit : y <= limit; y += direction) {
    if (y < 0 || y >= height) continue
    let dark = 0
    let total = 0
    for (let x = Math.round(pupil.x - halfBand); x <= Math.round(pupil.x + halfBand); x += 2) {
      if (x < 0 || x >= width) continue
      if (isDarkPixel(imageData, x, y)) dark += 1
      total += 1
    }
    const score = total ? dark / total : 0
    if (score > best.score) best = { value: y, score }
  }

  return best
}

function scanLensRays(
  imageData: ImageData,
  pupil: Pt,
  fallback: { left: number; right: number; top: number; bottom: number },
  pxPerMm: number,
) {
  const start = Math.max(9, Math.round(pxPerMm * 6))
  const maxRadius =
    Math.max(distance(pupil, { x: fallback.left, y: fallback.top }), distance(pupil, { x: fallback.right, y: fallback.bottom })) + 32
  const angles = {
    left: rangeAngles(166, 204, 4),
    right: rangeAngles(-18, 24, 4),
    top: rangeAngles(-116, -64, 4),
    bottom: rangeAngles(58, 122, 4),
    diagA: rangeAngles(-148, -116, 4),
    diagB: rangeAngles(34, 66, 4),
  }

  return {
    left: bestRayHit(imageData, pupil, angles.left, start, maxRadius, (point, best) => !best || point.x < best.x),
    right: bestRayHit(imageData, pupil, angles.right, start, maxRadius, (point, best) => !best || point.x > best.x),
    top: bestRayHit(imageData, pupil, angles.top, start, maxRadius, (point, best) => !best || point.y < best.y),
    bottom: bestRayHit(imageData, pupil, angles.bottom, start, maxRadius, (point, best) => !best || point.y > best.y),
    diagA: bestRayHit(imageData, pupil, angles.diagA, start, maxRadius, (point, best) => !best || point.x + point.y < best.x + best.y),
    diagB: bestRayHit(imageData, pupil, angles.diagB, start, maxRadius, (point, best) => !best || point.x + point.y > best.x + best.y),
  }
}

function bestRayHit(
  imageData: ImageData,
  origin: Pt,
  angles: number[],
  start: number,
  maxRadius: number,
  isBetter: (point: Pt, best: Pt | null) => boolean,
) {
  let best: Pt | null = null
  for (const angle of angles) {
    const hit = scanRayForDarkCluster(imageData, origin, angle, start, maxRadius)
    if (hit && isBetter(hit, best)) best = hit
  }
  return best
}

function scanRayForDarkCluster(imageData: ImageData, origin: Pt, degrees: number, start: number, maxRadius: number) {
  const radians = (degrees * Math.PI) / 180
  const dx = Math.cos(radians)
  const dy = Math.sin(radians)
  let streak = 0

  for (let radius = start; radius <= maxRadius; radius += 2) {
    const x = Math.round(origin.x + dx * radius)
    const y = Math.round(origin.y + dy * radius)
    if (x < 1 || y < 1 || x >= imageData.width - 1 || y >= imageData.height - 1) break

    if (isDarkPixel(imageData, x, y) || hasLocalDarkEdge(imageData, x, y)) {
      streak += 1
      if (streak >= 2) return { x, y }
    } else {
      streak = 0
    }
  }

  return null
}

function hasLocalDarkEdge(imageData: ImageData, x: number, y: number) {
  const center = pixelLuminance(imageData, x, y)
  const left = pixelLuminance(imageData, x - 1, y)
  const right = pixelLuminance(imageData, x + 1, y)
  const top = pixelLuminance(imageData, x, y - 1)
  const bottom = pixelLuminance(imageData, x, y + 1)
  return center < 112 && Math.max(Math.abs(center - left), Math.abs(center - right), Math.abs(center - top), Math.abs(center - bottom)) > 42
}

function isFrameCandidate(imageData: ImageData, x: number, y: number) {
  return isDarkPixel(imageData, x, y) || hasLocalDarkEdge(imageData, x, y)
}

function smoothCounts(values: number[], radius: number) {
  return values.map((_, index) => {
    let total = 0
    let count = 0
    for (let cursor = index - radius; cursor <= index + radius; cursor += 1) {
      if (cursor < 0 || cursor >= values.length) continue
      total += values[cursor]
      count += 1
    }
    return count ? total / count : 0
  })
}

function firstStrongIndex(values: number[], threshold: number, from: number, to: number) {
  let streak = 0
  for (let index = from; index <= to; index += 1) {
    if (values[index] >= threshold) {
      streak += 1
      if (streak >= 2) return index - 1
    } else {
      streak = 0
    }
  }
  return null
}

function lastStrongIndex(values: number[], threshold: number, from: number, to: number) {
  let streak = 0
  for (let index = to; index >= from; index -= 1) {
    if (values[index] >= threshold) {
      streak += 1
      if (streak >= 2) return index + 1
    } else {
      streak = 0
    }
  }
  return null
}

function rangeAngles(from: number, to: number, step: number) {
  const values: number[] = []
  for (let value = from; value <= to; value += step) values.push(value)
  return values
}

function fallbackLensToShape(fallback: { left: number; right: number; top: number; bottom: number }): LensShape {
  return {
    ...fallback,
    diagA: { x: fallback.left, y: fallback.top },
    diagB: { x: fallback.right, y: fallback.bottom },
  }
}

function blendNumber(a: number, b: number, amount: number) {
  return a + (b - a) * amount
}

function isDarkPixel(imageData: ImageData, x: number, y: number) {
  const index = (y * imageData.width + x) * 4
  const red = imageData.data[index]
  const green = imageData.data[index + 1]
  const blue = imageData.data[index + 2]
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue
  const contrast = Math.max(red, green, blue) - Math.min(red, green, blue)
  return luminance < 78 && contrast < 74
}

function pixelLuminance(imageData: ImageData, x: number, y: number) {
  const index = (y * imageData.width + x) * 4
  return 0.2126 * imageData.data[index] + 0.7152 * imageData.data[index + 1] + 0.0722 * imageData.data[index + 2]
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

function buildZoomViewBox(width: number, height: number, zoom: number) {
  const safeZoom = clamp(zoom, 1, 4)
  const viewWidth = width / safeZoom
  const viewHeight = height / safeZoom
  const x = (width - viewWidth) / 2
  const y = (height - viewHeight) / 2
  return `${x} ${y} ${viewWidth} ${viewHeight}`
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

function midpoint(a: Pt, b: Pt) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
