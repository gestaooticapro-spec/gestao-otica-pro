'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react'
import { AlertTriangle, ArrowLeft, Bot, Camera, CheckCircle2, ImageUp, Loader2, Maximize2, MonitorUp, Play, ScanLine, Square, Wand2, ZoomIn, ZoomOut } from 'lucide-react'
import { locateTowerMeasurementPointsWithAiAction } from '@/lib/actions/tower-measurement-ai.actions'
import { saveTowerMeasurementResult } from '@/lib/actions/tower-measurement.actions'

type Landmark = { x: number; y: number; z?: number }
type MediaPipeModule = typeof import('@mediapipe/tasks-vision')
type FaceLandmarkerInstance = Awaited<ReturnType<MediaPipeModule['FaceLandmarker']['createFromOptions']>>
type LensType = 'surfacada' | 'bifocal' | 'pronto'
type DetectionPreset = 'standard' | 'transparent' | 'closedContour' | 'closedContourText'
type MeasurementStage = 'front' | 'rightProfile'

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
type SidePointKey = 'referenceA' | 'referenceB' | 'cornea' | 'lensPlaneTop' | 'lensPlaneBottom'
type SideHandles = Record<SidePointKey, Pt>
type CameraSettings = { width?: number; height?: number; frameRate?: number }
type CapturePayload = {
  dataUrl: string
  width: number
  height: number
  landmarks?: Landmark[]
  cameraSettings?: CameraSettings
  capturedAt: string
  source?: 'camera' | 'upload'
  cropMode?: 'guide' | 'original'
}
type LensShape = {
  left: number
  right: number
  top: number
  bottom: number
  diagA: Pt
  diagB: Pt
}

type FrontMeasurements = {
  dp: number
  dnpOD: number
  dnpOE: number
  altOD: number
  altOE: number
  ponte: number
  horizontal: number
  vertical: number
  diagonal: number
  diamOD: number
  diamOE: number
  palpebraOD: number
  palpebraOE: number
}

type ProfileMeasurements = {
  vertexDistance: number
  pantoscopicAngle: number
}

type MeasurementAttention = {
  code: 'low_fitting_height' | 'high_vertex_distance' | 'high_pantoscopic_angle' | 'dnp_difference'
  title: string
  message: string
  clientMessage: string
}

type MeasurementPresentation = {
  lensMode: 'multifocal' | 'bifocal'
  front: { capture: CapturePayload; handles: Handles; measurements: FrontMeasurements }
  profile: { capture: CapturePayload; handles: SideHandles; axisAngle: number; measurements: ProfileMeasurements }
  attentions: MeasurementAttention[]
  presentedAt: string
}

type TowerMessage =
  | { type: 'command'; command: 'startCamera' | 'stopCamera' | 'captureFront' | 'captureRightProfile' | 'prepareFront' | 'prepareRightProfile' | 'fullscreen' }
  | { type: 'capture'; capture: CapturePayload; stage: MeasurementStage }
  | { type: 'report'; cameraOn: boolean; status: string; cameraSettings?: CameraSettings }
  | { type: 'measurementResult'; result: MeasurementPresentation }

type ImageCaptureCtor = new (track: MediaStreamTrack) => { takePhoto: () => Promise<Blob> }

const CARD_MM = 85.6
const CAPTURE_GUIDE_ASPECT = 4 / 5
const CAPTURE_GUIDE_HEIGHT_RATIO = 0.78
const MEASUREMENT_ATTENTION_LIMITS = {
  lowFittingHeightMm: 14,
  highVertexDistanceMm: 20,
  highPantoscopicAngleDegrees: 20,
  dnpDifferenceReviewMm: 5,
} as const
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
const DETECTION_PRESETS: Array<{ key: DetectionPreset; label: string }> = [
  { key: 'standard', label: 'Padrao' },
  { key: 'transparent', label: 'Aro transparente' },
  { key: 'closedContour', label: 'Contorno fechado' },
  { key: 'closedContourText', label: 'Contorno com texto' },
]
const SIDE_POINT_STYLE: Record<SidePointKey, { label: string; color: string }> = {
  referenceA: { label: 'R1', color: '#e5e7eb' },
  referenceB: { label: 'R2', color: '#e5e7eb' },
  cornea: { label: 'C', color: '#38bdf8' },
  lensPlaneTop: { label: 'L1', color: '#22c55e' },
  lensPlaneBottom: { label: 'L2', color: '#22c55e' },
}
const SIDE_MEASURE_GROUPS: Array<{ label: string; keys: SidePointKey[] }> = [
  { label: 'Referencia', keys: ['referenceA', 'referenceB'] },
  { label: 'Cornea', keys: ['cornea'] },
  { label: 'Plano da lente', keys: ['lensPlaneTop', 'lensPlaneBottom'] },
]

interface TowerMeasurementLabProps {
  storeId: number
  clientMode?: boolean
  towerMode?: boolean
  backHref?: string
  sessionId?: string
}

export default function TowerMeasurementLab({
  storeId,
  clientMode = false,
  towerMode = false,
  backHref,
  sessionId,
}: TowerMeasurementLabProps) {
  const channelName = `tower-measurement-lab-${sessionId ?? storeId}`
  const channelRef = useRef<BroadcastChannel | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const clientScreenRef = useRef<Window | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const stageRef = useRef<HTMLElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const landmarkerRef = useRef<FaceLandmarkerInstance | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const draggingRef = useRef<PointKey | null>(null)
  const operatorPanRef = useRef<{ clientX: number; clientY: number; pan: Pt } | null>(null)
  const sideSvgRef = useRef<SVGSVGElement | null>(null)
  const sideDraggingRef = useRef<SidePointKey | null>(null)
  const axisDraggingRef = useRef(false)
  const snapImageDataRef = useRef<ImageData | null>(null)
  const statusRef = useRef(clientMode ? 'Aguardando painel' : 'Tela cliente aguardando')

  const [capture, setCapture] = useState<CapturePayload | null>(null)
  const [handles, setHandles] = useState<Handles | null>(null)
  const [rightProfileCapture, setRightProfileCapture] = useState<CapturePayload | null>(null)
  const [rightProfileHandles, setRightProfileHandles] = useState<SideHandles | null>(null)
  const [rightProfileAxisAngle, setRightProfileAxisAngle] = useState(0)
  const [clientCapturedStages, setClientCapturedStages] = useState<MeasurementStage[]>([])
  const [measurementStage, setMeasurementStage] = useState<MeasurementStage>('front')
  const [activeKeys, setActiveKeys] = useState<PointKey[]>(MEASURE_GROUPS[0].keys)
  const [activeSideKeys, setActiveSideKeys] = useState<SidePointKey[]>(SIDE_MEASURE_GROUPS[0].keys)
  const [lensType, setLensType] = useState<LensType>('surfacada')
  const [detectionPreset, setDetectionPreset] = useState<DetectionPreset>('standard')
  const [referenceMm, setReferenceMm] = useState(CARD_MM)
  const [cameraOn, setCameraOn] = useState(false)
  const [status, setStatus] = useState(clientMode ? 'Aguardando painel' : 'Tela cliente aguardando')
  const [cameraSettings, setCameraSettings] = useState<CameraSettings | undefined>()
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [operatorZoom, setOperatorZoom] = useState(1)
  const [operatorPan, setOperatorPan] = useState<Pt>({ x: 0, y: 0 })
  const [rightProfileZoom, setRightProfileZoom] = useState(1)
  const [reviewMode, setReviewMode] = useState(false)
  const [clientScreenOpen, setClientScreenOpen] = useState(false)
  const [presentedResult, setPresentedResult] = useState<MeasurementPresentation | null>(null)
  const [resultPresented, setResultPresented] = useState(false)
  const [measurementSaveMessage, setMeasurementSaveMessage] = useState<string | null>(null)
  const [isAiPending, startAiTransition] = useTransition()
  const [isPresentingResult, startPresentationTransition] = useTransition()

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
        if (message.command === 'captureFront') void captureFrame('front')
        if (message.command === 'captureRightProfile') void captureFrame('rightProfile')
        if (message.command === 'prepareFront') setMeasurementStage('front')
        if (message.command === 'prepareRightProfile') setMeasurementStage('rightProfile')
        if (message.command === 'fullscreen') void toggleFullscreen()
        return
      }

      if (clientMode && message.type === 'measurementResult') {
        stopCamera('Medidas concluídas')
        setPresentedResult(message.result)
        return
      }

      if (!clientMode && message.type === 'capture') {
        void applyCapture(message.capture, detectionPreset, message.stage)
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

  useEffect(() => () => {
    stopCamera('Camera desligada')
    clientScreenRef.current?.close()
  }, [])

  useEffect(() => {
    if (!clientMode) return
    publishReport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraOn, cameraSettings, clientMode, status])

  const measurements = useMemo(() => {
    if (!handles) return null
    return calculateMeasurements(handles, referenceMm)
  }, [handles, referenceMm])
  const operatorViewBox = capture ? buildZoomViewBox(capture.width, capture.height, operatorZoom, operatorPan) : ''
  const rightProfileViewBox = rightProfileCapture ? buildZoomViewBox(rightProfileCapture.width, rightProfileCapture.height, rightProfileZoom) : ''
  const sideMeasurements = useMemo(() => {
    if (!rightProfileHandles) return null
    return calculateRightProfileMeasurements(rightProfileHandles, referenceMm, rightProfileAxisAngle)
  }, [referenceMm, rightProfileAxisAngle, rightProfileHandles])
  const captureWorkflowComplete = Boolean(capture && rightProfileCapture)
  const clientCaptureComplete = clientCapturedStages.includes('front') && clientCapturedStages.includes('rightProfile')
  const measurementAttentions = useMemo(
    () => measurements && sideMeasurements ? buildMeasurementAttentions(measurements, sideMeasurements, lensType) : [],
    [lensType, measurements, sideMeasurements],
  )
  const operatorBackHref = backHref ?? (towerMode ? `/torre/${storeId}?menu=experiencias${sessionId ? `&session=${sessionId}` : ''}` : `/dashboard/loja/${storeId}`)

  function selectMeasurementStage(stage: MeasurementStage) {
    setReviewMode(false)
    setMeasurementStage(stage)
    sendCommand(stage === 'front' ? 'prepareFront' : 'prepareRightProfile')
  }

  function presentMeasurementResult() {
    if (!sessionId || !capture || !handles || !measurements || !rightProfileCapture || !rightProfileHandles || !sideMeasurements) return

    if (resultPresented && presentedResult) {
      channelRef.current?.postMessage({ type: 'measurementResult', result: presentedResult } satisfies TowerMessage)
      setMeasurementSaveMessage('Resultado apresentado novamente ao cliente.')
      return
    }

    const result: MeasurementPresentation = {
      lensMode: lensType === 'bifocal' ? 'bifocal' : 'multifocal',
      front: { capture, handles, measurements },
      profile: { capture: rightProfileCapture, handles: rightProfileHandles, axisAngle: rightProfileAxisAngle, measurements: sideMeasurements },
      attentions: measurementAttentions,
      presentedAt: new Date().toISOString(),
    }

    setMeasurementSaveMessage(null)
    startPresentationTransition(() => {
      void (async () => {
        const saved = await saveTowerMeasurementResult({
          storeId,
          towerSessionId: sessionId,
          lensMode: result.lensMode,
          referenceMm,
          frontMeasurements: result.front.measurements,
          profileMeasurements: result.profile.measurements,
          attentionCodes: result.attentions.map((attention) => attention.code),
          algorithmVersion: 'tower-measurement-v1',
        })
        if (!saved.success) {
          setMeasurementSaveMessage(saved.message)
          return
        }
        setPresentedResult(result)
        channelRef.current?.postMessage({ type: 'measurementResult', result } satisfies TowerMessage)
        setResultPresented(true)
        setMeasurementSaveMessage('Medidas salvas e apresentadas ao cliente.')
      })()
    })
  }

  function sendCommand(command: TowerMessage extends infer T ? T extends { type: 'command'; command: infer C } ? C : never : never) {
    channelRef.current?.postMessage({ type: 'command', command } satisfies TowerMessage)
  }

  function openClientScreen() {
    if (typeof window === 'undefined') return
    if (clientScreenRef.current && !clientScreenRef.current.closed) {
      clientScreenRef.current.focus()
      setClientScreenOpen(true)
      return
    }
    const url = new URL(window.location.href)
    url.searchParams.set('client', '1')
    const clientWindow = window.open(url.toString(), 'tower-measurement-client', 'popup=yes,width=1080,height=1920')
    if (!clientWindow) return
    clientScreenRef.current = clientWindow
    setClientScreenOpen(true)
    window.setTimeout(() => sendCommand(measurementStage === 'front' ? 'prepareFront' : 'prepareRightProfile'), 500)
    if (presentedResult) {
      window.setTimeout(() => channelRef.current?.postMessage({ type: 'measurementResult', result: presentedResult } satisfies TowerMessage), 800)
    }
  }

  function closeClientScreen() {
    clientScreenRef.current?.close()
    clientScreenRef.current = null
    setClientScreenOpen(false)
  }

  function toggleClientScreen() {
    if (clientScreenRef.current && !clientScreenRef.current.closed) {
      closeClientScreen()
      return
    }
    openClientScreen()
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

  async function captureFrame(stage: MeasurementStage) {
    const file = await takeCameraPhoto()
    if (!file) return

    await processPhotoFile(file, 'Processando foto', stage === 'front' ? 'Foto frontal recortada e enviada' : 'Perfil direito recortado e enviado', stage, true)
    setClientCapturedStages((current) => (current.includes(stage) ? current : [...current, stage]))
    if (stage === 'rightProfile') stopCamera('Capturas concluídas')
  }

  async function processPhotoFile(file: File, processingStatus: string, successPrefix: string, stage: MeasurementStage, cropToGuide = false) {
    setStatus(processingStatus)
    const originalDataUrl = await readFileAsDataUrl(file)
    const originalImage = await loadImage(originalDataUrl)
    const dataUrl = cropToGuide ? cropImageToMeasurementGuide(originalImage, stage) : originalDataUrl
    const image = cropToGuide ? await loadImage(dataUrl) : originalImage
    const landmarks = await detectLandmarks(image)

    const payload: CapturePayload = {
      dataUrl,
      width: image.naturalWidth,
      height: image.naturalHeight,
      landmarks,
      cameraSettings,
      capturedAt: new Date().toISOString(),
      source: cropToGuide ? 'camera' : 'upload',
      cropMode: cropToGuide ? 'guide' : 'original',
    }
    channelRef.current?.postMessage({ type: 'capture', capture: payload, stage } satisfies TowerMessage)
    void applyCapture(payload, detectionPreset, stage)
    setStatus(landmarks?.length ? `${successPrefix} com rosto detectado` : successPrefix)
  }

  async function handleUploadedPhoto(file: File | null, stage: MeasurementStage) {
    if (!file) return
    await processPhotoFile(file, 'Processando foto carregada', stage === 'front' ? 'Foto frontal carregada' : 'Perfil direito carregado', stage)
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
    if (measurementStage === 'rightProfile') {
      if (!rightProfileCapture) return
      const initialHandles = createInitialRightProfileHandles(rightProfileCapture)
      setRightProfileHandles(initialHandles)
      setRightProfileAxisAngle(0)
      setRightProfileZoom(1)
      setStatus('Pontos laterais reposicionados')
      void (async () => {
        try {
          const image = await loadImage(rightProfileCapture.dataUrl)
          const imageData = createImageData(image)
          if (imageData) setRightProfileHandles(refineRightProfileLensPlane(imageData, initialHandles))
        } catch {
          // The initial points remain available for manual adjustment.
        }
      })()
      return
    }
    if (!capture) return
    void applyCapture(capture)
  }

  function updateDetectionPreset(nextPreset: DetectionPreset) {
    setDetectionPreset(nextPreset)
    if (capture) void applyCapture(capture, nextPreset)
  }

  function cycleDetectionPreset() {
    const currentIndex = DETECTION_PRESETS.findIndex((preset) => preset.key === detectionPreset)
    const nextPreset = DETECTION_PRESETS[(currentIndex + 1) % DETECTION_PRESETS.length]?.key ?? 'standard'
    updateDetectionPreset(nextPreset)
  }

  async function ensureCameraCaptureIsGuided(nextCapture: CapturePayload, stage: MeasurementStage) {
    const isLegacyCameraCapture = !nextCapture.source
    const mustCropOnOperator = !clientMode
      && (nextCapture.source === 'camera' || isLegacyCameraCapture)
      && nextCapture.cropMode !== 'guide'

    if (!mustCropOnOperator) return nextCapture

    const sourceImage = await loadImage(nextCapture.dataUrl)
    const croppedDataUrl = cropImageToMeasurementGuide(sourceImage, stage)
    const croppedImage = await loadImage(croppedDataUrl)
    const landmarks = await detectLandmarks(croppedImage)

    return {
      ...nextCapture,
      dataUrl: croppedDataUrl,
      width: croppedImage.naturalWidth,
      height: croppedImage.naturalHeight,
      landmarks,
      cropMode: 'guide' as const,
    }
  }

  async function applyCapture(nextCapture: CapturePayload, preset = detectionPreset, stage: MeasurementStage = 'front') {
    const captureForStage = await ensureCameraCaptureIsGuided(nextCapture, stage)
    if (stage === 'rightProfile') {
      setRightProfileCapture(captureForStage)
      const initialHandles = createInitialRightProfileHandles(captureForStage)
      setRightProfileHandles(initialHandles)
      setRightProfileAxisAngle(0)
      setMeasurementStage('rightProfile')
      setRightProfileZoom(1)
      setStatus(
        nextCapture.landmarks?.length
          ? 'Perfil direito recebido: pupila sugerida; confirme cornea e plano da lente'
          : 'Perfil direito recebido: ajuste a referencia, cornea e plano da lente',
      )
      setCameraSettings(captureForStage.cameraSettings)
      try {
        const image = await loadImage(captureForStage.dataUrl)
        const imageData = createImageData(image)
        if (imageData) setRightProfileHandles(refineRightProfileLensPlane(imageData, initialHandles))
      } catch {
        // The cornea-relative line remains the safe fallback when pixels cannot be inspected.
      }
      return
    }
    setCapture(captureForStage)
    snapImageDataRef.current = null
    const fallbackHandles = createInitialHandles(captureForStage, undefined, preset)
    setHandles(fallbackHandles)
    setOperatorZoom(1)
    setOperatorPan({ x: 0, y: 0 })
    setStatus('Foto recebida')
    setCameraSettings(captureForStage.cameraSettings)

    try {
      const image = await loadImage(captureForStage.dataUrl)
      snapImageDataRef.current = createImageData(image)
      const nextHandles = createInitialHandles(captureForStage, image, preset)
      setHandles(nextHandles)
    } catch {
      snapImageDataRef.current = null
      // The proportional fallback above is enough when pixel inspection is unavailable.
    }
  }

  function updateHandle(key: PointKey, point: Pt) {
    const nextPoint = SNAP_KEYS.has(key) ? snapToLensBoundary(snapImageDataRef.current, point, 18) : point
    setHandles((current) => {
      if (!current) return current
      const next = { ...current, [key]: nextPoint }
      return ['pupilR', 'pupilL', 'bridgeR', 'bridgeL'].includes(key) ? alignBridgeHandlesToPupilAxis(next) : next
    })
  }

  function updateRightProfileHandle(key: SidePointKey, point: Pt) {
    setRightProfileHandles((current) => (current ? { ...current, [key]: point } : current))
  }

  function locateWithAi() {
    if (!capture || !handles) return
    setStatus('IA localizando lente...')
    startAiTransition(() => {
      void (async () => {
        const result = await locateTowerMeasurementPointsWithAiAction({
          dataUrl: capture.dataUrl,
          width: capture.width,
          height: capture.height,
          existingHandles: handles,
        })

        if (!result.success || !result.handles) {
          setStatus(result.error ? `IA falhou: ${result.error}` : 'IA nao retornou pontos validos')
          return
        }

        setHandles((current) => {
          if (!current) return current
          return stabilizeBridgeHandlesToPupilAxis({ ...current, ...(result.handles ?? {}) }, estimatePxPerMmFromPupils(current))
        })
        setStatus(`IA aplicada: ${result.model ?? result.provider ?? 'modelo vision'} (${Object.keys(result.handles).length} pontos)`)
      })()
    })
  }

  function pointFromPointer(event: React.PointerEvent<SVGSVGElement>) {
    return pointFromClient(event.clientX, event.clientY)
  }

  function startOperatorPan(event: React.PointerEvent<SVGSVGElement>) {
    if (!capture || operatorZoom <= 1) return
    operatorPanRef.current = { clientX: event.clientX, clientY: event.clientY, pan: operatorPan }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function updateOperatorPan(event: React.PointerEvent<SVGSVGElement>) {
    const start = operatorPanRef.current
    const svg = svgRef.current
    if (!start || !svg || !capture) return false

    const bounds = svg.getBoundingClientRect()
    const viewWidth = capture.width / operatorZoom
    const viewHeight = capture.height / operatorZoom
    const maxPanX = (capture.width - viewWidth) / 2
    const maxPanY = (capture.height - viewHeight) / 2
    const deltaX = ((event.clientX - start.clientX) / Math.max(bounds.width, 1)) * viewWidth
    const deltaY = ((event.clientY - start.clientY) / Math.max(bounds.height, 1)) * viewHeight
    setOperatorPan({
      x: clamp(start.pan.x - deltaX, -maxPanX, maxPanX),
      y: clamp(start.pan.y - deltaY, -maxPanY, maxPanY),
    })
    return true
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

  function pointFromRightProfileClient(clientX: number, clientY: number) {
    const svg = sideSvgRef.current
    const matrix = svg?.getScreenCTM()
    if (!svg || !matrix) return null
    const point = svg.createSVGPoint()
    point.x = clientX
    point.y = clientY
    const transformed = point.matrixTransform(matrix.inverse())
    return {
      x: clamp(transformed.x, 0, rightProfileCapture?.width ?? 0),
      y: clamp(transformed.y, 0, rightProfileCapture?.height ?? 0),
    }
  }

  if (clientMode && presentedResult) {
    return <ClientMeasurementResult result={presentedResult} />
  }

  if (clientMode && clientCaptureComplete && !cameraOn) {
    return (
      <main className="grid h-screen w-screen place-items-center overflow-hidden bg-[radial-gradient(circle_at_50%_20%,rgba(34,211,238,0.16),transparent_38%),#020617] p-8 text-white">
        <div className="max-w-xl text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl border border-emerald-300/25 bg-emerald-400/10 text-emerald-200">
            <CheckCircle2 className="h-10 w-10" />
          </div>
          <p className="mt-7 text-xs font-black uppercase tracking-[0.24em] text-cyan-200">Capturas concluídas</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight">Você já pode relaxar.</h1>
          <p className="mx-auto mt-4 max-w-lg text-lg leading-8 text-slate-300">O funcionário está conferindo as medidas. Quando estiver tudo pronto, o resultado aparecerá nesta tela.</p>
        </div>
      </main>
    )
  }

  if (clientMode) {
    return (
      <main ref={stageRef} className="relative h-screen w-screen overflow-hidden bg-black text-white">
        <video ref={videoRef} className="h-full w-full -scale-x-100 object-contain" playsInline muted />
        {cameraOn && (
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-1/2 top-[47%] w-[min(36vw,64vh)] min-w-[220px] -translate-x-1/2 -translate-y-1/2 aspect-[4/5] rounded-[32px] border-4 border-cyan-200/90 bg-cyan-300/[0.03] shadow-[0_0_0_9999px_rgba(2,6,23,0.48),inset_0_0_40px_rgba(34,211,238,0.12)]">
              <div className="absolute left-1/2 top-4 bottom-4 w-px -translate-x-1/2 bg-cyan-100/65 shadow-[0_0_8px_rgba(165,243,252,0.45)]" />
              <div className="absolute left-4 right-4 top-1/2 h-px -translate-y-1/2 bg-cyan-100/65 shadow-[0_0_8px_rgba(165,243,252,0.45)]" />
              <div className="absolute left-1/2 top-4 -translate-x-1/2 whitespace-nowrap rounded-full border border-cyan-100/30 bg-slate-950/75 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-100 backdrop-blur">
                Encaixe rosto e óculos aqui
              </div>
            </div>
          </div>
        )}
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
        <div className="absolute bottom-5 left-1/2 w-[min(92vw,560px)] -translate-x-1/2 rounded-xl border border-white/15 bg-black/65 p-4 text-center backdrop-blur">
          <div className="text-[11px] font-black uppercase tracking-[0.22em] text-cyan-200">Captura de medidas</div>
          <div className="mt-2 text-lg font-black">{measurementStage === 'front' ? '1. Olhe de frente para a camera' : '2. Mostre o perfil direito'}</div>
          <div className="mt-1 text-sm text-white/75">
            {measurementStage === 'front' ? 'Mantenha o rosto reto e os oculos na posicao natural.' : 'Vire o nariz para a sua esquerda e mostre o lado direito do rosto.'}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-bold uppercase tracking-wide">
            <div className={`rounded-md px-3 py-2 ${measurementStage === 'front' ? 'bg-cyan-400 text-slate-950' : 'bg-white/10 text-white/65'}`}>
              {clientCapturedStages.includes('front') ? 'Frontal pronta' : 'Frontal'}
            </div>
            <div className={`rounded-md px-3 py-2 ${measurementStage === 'rightProfile' ? 'bg-cyan-400 text-slate-950' : 'bg-white/10 text-white/65'}`}>
              {clientCapturedStages.includes('rightProfile') ? 'Perfil pronto' : 'Perfil direito'}
            </div>
          </div>
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
    <main className={`${towerMode ? 'min-h-[100dvh] md:h-[100dvh] md:overflow-hidden' : 'min-h-screen'} bg-[radial-gradient(circle_at_20%_0%,rgba(34,211,238,0.14),transparent_28%),linear-gradient(135deg,#020617_0%,#0f172a_48%,#111827_100%)] text-slate-100`}>
      <div className={`mx-auto flex w-full max-w-7xl flex-col px-5 py-5 ${towerMode ? 'min-h-[100dvh] md:h-full md:min-h-0' : 'min-h-screen'}`}>
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href={operatorBackHref}
              className={towerMode
                ? 'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 transition-colors hover:bg-white/10 hover:text-white'
                : 'inline-flex items-center gap-2 text-sm font-bold text-slate-400 transition-colors hover:text-white'}
              title="Voltar"
              aria-label="Voltar"
            >
              <ArrowLeft className="h-4 w-4" />
              {!towerMode && 'Voltar'}
            </Link>
            {towerMode && (
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300">Torre de experiência</p>
                <h1 className="truncate text-xl font-black tracking-tight text-white">Medidas</h1>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null
                void handleUploadedPhoto(file, measurementStage)
                event.currentTarget.value = ''
              }}
            />
            <button type="button" onClick={toggleClientScreen} className={towerMode ? 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-cyan-300/25 bg-cyan-400/10 px-4 text-sm font-black text-cyan-100 transition hover:bg-cyan-400/20' : buttonClass('light')}>
              <MonitorUp className="h-4 w-4" />
              {clientScreenOpen ? 'Fechar tela cliente' : towerMode ? 'Abrir tela cliente' : 'Tela cliente'}
            </button>
            {!towerMode && <button type="button" onClick={() => fileInputRef.current?.click()} className={buttonClass('light')}>
              <ImageUp className="h-4 w-4" />
              Carregar foto
            </button>}
            {!towerMode && <button type="button" onClick={() => sendCommand('startCamera')} className={buttonClass('dark')}>
              <Play className="h-4 w-4" />
              Camera
            </button>}
            {!towerMode && <button type="button" onClick={() => sendCommand(measurementStage === 'front' ? 'captureFront' : 'captureRightProfile')} className={buttonClass('dark')}>
              <ScanLine className="h-4 w-4" />
              Capturar {measurementStage === 'front' ? 'frontal' : 'perfil'}
            </button>}
            {!towerMode && <button type="button" onClick={() => sendCommand('stopCamera')} className={buttonClass('light')}>
              <Square className="h-4 w-4" />
              Parar
            </button>}
          </div>
        </header>

        <div className={`mt-5 grid gap-2 rounded-2xl border border-white/10 bg-black/20 p-2 ${towerMode ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
          {([
            { stage: 'front' as const, title: '1. Medidas frontais', detail: capture ? 'Foto pronta para validar' : 'Capture ou carregue a foto de frente', complete: Boolean(capture) },
            { stage: 'rightProfile' as const, title: '2. Perfil direito', detail: rightProfileCapture ? 'Foto pronta para calibrar' : 'Lado direito voltado para a câmera', complete: Boolean(rightProfileCapture) },
          ]).map(({ stage, title, detail, complete }) => (
            <button
              key={stage}
              type="button"
              onClick={() => selectMeasurementStage(stage)}
              className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                !reviewMode && measurementStage === stage ? 'border-cyan-300/50 bg-cyan-400/15 text-cyan-50' : 'border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/10'
              }`}
            >
              <div className="text-sm font-black uppercase tracking-wide">{title}</div>
              <div className="mt-1 flex items-center justify-between gap-3 text-xs font-semibold text-slate-400">
                <span>{detail}</span>
                <span className={complete ? 'font-black uppercase text-emerald-300' : 'font-black uppercase text-slate-500'}>{complete ? 'Pronta' : 'Pendente'}</span>
              </div>
            </button>
          ))}
          {towerMode && (
            <button
              type="button"
              onClick={() => captureWorkflowComplete && setReviewMode(true)}
              disabled={!captureWorkflowComplete}
              className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                reviewMode
                  ? 'border-emerald-300/50 bg-emerald-400/15 text-emerald-50'
                  : captureWorkflowComplete
                    ? 'border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/10'
                    : 'cursor-not-allowed border-white/5 bg-white/[0.02] text-slate-600'
              }`}
            >
              <div className="text-sm font-black uppercase tracking-wide">3. Revisão</div>
              <div className="mt-1 flex items-center justify-between gap-3 text-xs font-semibold">
                <span>{captureWorkflowComplete ? 'Confira os resultados' : 'Aguarda as duas fotos'}</span>
                <span className={captureWorkflowComplete ? 'font-black uppercase text-emerald-300' : 'font-black uppercase text-slate-600'}>
                  {captureWorkflowComplete ? 'Disponível' : 'Pendente'}
                </span>
              </div>
            </button>
          )}
        </div>

        <section className={`grid min-h-0 flex-1 gap-5 py-5 ${towerMode ? 'md:grid-cols-[minmax(0,1fr)_300px]' : 'xl:grid-cols-[1fr_380px]'}`}>
          <div className={`relative overflow-hidden rounded-2xl border border-white/10 bg-black/35 shadow-2xl shadow-black/25 backdrop-blur ${towerMode ? 'min-h-[360px]' : 'min-h-[560px]'}`}>
            {measurementStage === 'front' && capture && handles ? (
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
                    onClick={() => {
                      setOperatorZoom(1)
                      setOperatorPan({ x: 0, y: 0 })
                    }}
                    className="rounded-md bg-white/10 px-3 py-2 text-xs font-black text-white hover:bg-white/15"
                  >
                    100%
                  </button>
                  <button
                    type="button"
                    onClick={cycleDetectionPreset}
                    className="inline-flex items-center gap-1.5 rounded-md bg-cyan-400/15 px-3 py-2 text-xs font-black text-cyan-100 transition hover:bg-cyan-400/25"
                    title="Alternar posicionamento dos pinos"
                  >
                    <Wand2 className="h-3.5 w-3.5" />
                    Pinos
                  </button>
                </div>
                <svg
                  ref={svgRef}
                  viewBox={operatorViewBox}
                  preserveAspectRatio="xMidYMid meet"
                  className={`absolute inset-0 h-full w-full touch-none ${operatorZoom > 1 ? 'cursor-grab' : ''}`}
                  onPointerDown={startOperatorPan}
                  onPointerMove={(event) => {
                    if (updateOperatorPan(event)) return
                    const key = draggingRef.current
                    if (!key) return
                    const point = pointFromPointer(event)
                    if (point) updateHandle(key, point)
                  }}
                  onPointerUp={() => {
                    draggingRef.current = null
                    operatorPanRef.current = null
                  }}
                  onPointerLeave={() => {
                    draggingRef.current = null
                    operatorPanRef.current = null
                  }}
                >
                  <image href={capture.dataUrl} x={0} y={0} width={capture.width} height={capture.height} preserveAspectRatio="none" />
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
                          event.stopPropagation()
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
            ) : measurementStage === 'rightProfile' && rightProfileCapture && rightProfileHandles ? (
              <>
                <div className="absolute left-4 top-4 z-20 flex items-center gap-2 rounded-lg border border-white/10 bg-slate-950/85 p-2 shadow-lg backdrop-blur">
                  <button
                    type="button"
                    onClick={() => setRightProfileZoom((zoom) => Math.max(1, Math.round((zoom - 0.25) * 100) / 100))}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-white/10 text-white hover:bg-white/15"
                    aria-label="Diminuir zoom do perfil"
                  >
                    <ZoomOut className="h-4 w-4" />
                  </button>
                  <div className="min-w-14 text-center font-mono text-xs font-black text-slate-200">{Math.round(rightProfileZoom * 100)}%</div>
                  <button
                    type="button"
                    onClick={() => setRightProfileZoom((zoom) => Math.min(4, Math.round((zoom + 0.25) * 100) / 100))}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-white/10 text-white hover:bg-white/15"
                    aria-label="Aumentar zoom do perfil"
                  >
                    <ZoomIn className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => setRightProfileZoom(1)} className="rounded-md bg-white/10 px-3 py-2 text-xs font-black text-white hover:bg-white/15">
                    100%
                  </button>
                </div>
                <div className="absolute bottom-4 left-4 z-20 max-w-sm rounded-lg border border-cyan-300/25 bg-slate-950/85 p-3 text-xs font-semibold text-slate-200 shadow-lg backdrop-blur">
                  Perfil direito: arraste R1/R2 sobre a referencia, C para a cornea e L1/L2 sobre o plano interno. Arraste o marcador do EIXO 0 para compensar a inclinacao da cabeca.
                </div>
                <svg
                  ref={sideSvgRef}
                  viewBox={rightProfileViewBox}
                  preserveAspectRatio="xMidYMid meet"
                  className="absolute inset-0 h-full w-full touch-none"
                  onPointerMove={(event) => {
                    if (axisDraggingRef.current) {
                      const point = pointFromRightProfileClient(event.clientX, event.clientY)
                      if (point && rightProfileHandles) {
                        // The handle is above the cornea, so invert the horizontal delta
                        // to make the rendered axis follow the mouse direction.
                        const angle = (Math.atan2(rightProfileHandles.cornea.x - point.x, rightProfileHandles.cornea.y - point.y) * 180) / Math.PI
                        setRightProfileAxisAngle(clamp(angle, -45, 45))
                      }
                      return
                    }
                    const key = sideDraggingRef.current
                    if (!key) return
                    const point = pointFromRightProfileClient(event.clientX, event.clientY)
                    if (point) updateRightProfileHandle(key, point)
                  }}
                  onPointerUp={() => {
                    sideDraggingRef.current = null
                    axisDraggingRef.current = false
                  }}
                  onPointerLeave={() => {
                    sideDraggingRef.current = null
                    axisDraggingRef.current = false
                  }}
                >
                  <image href={rightProfileCapture.dataUrl} x={0} y={0} width={rightProfileCapture.width} height={rightProfileCapture.height} preserveAspectRatio="none" />
                  <RightProfileLines
                    handles={rightProfileHandles}
                    height={rightProfileCapture.height}
                    width={rightProfileCapture.width}
                    axisAngle={rightProfileAxisAngle}
                    onAxisPointerDown={(event) => {
                      axisDraggingRef.current = true
                      event.currentTarget.setPointerCapture(event.pointerId)
                    }}
                  />
                  {(Object.keys(rightProfileHandles) as SidePointKey[]).map((key) => {
                    const point = rightProfileHandles[key]
                    const style = SIDE_POINT_STYLE[key]
                    const active = activeSideKeys.includes(key)
                    return (
                      <g
                        key={key}
                        transform={`translate(${point.x} ${point.y})`}
                        onPointerDown={(event) => {
                          sideDraggingRef.current = key
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
              <div className={`grid h-full place-items-center text-center text-white/65 ${towerMode ? 'min-h-[360px]' : 'min-h-[560px]'}`}>
                <div>
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-lg border border-cyan-400/30 bg-cyan-400/10">
                    <Camera className="h-8 w-8 text-cyan-100" />
                  </div>
                  <div className="mt-4 text-sm font-black uppercase tracking-wide text-slate-300">{status}</div>
                </div>
              </div>
            )}
          </div>

          {towerMode ? (
            <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
              <div className="rounded-[24px] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.14),_transparent_48%),rgba(15,23,42,0.86)] p-5 shadow-xl shadow-black/20">
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${reviewMode ? 'bg-emerald-300' : cameraOn ? 'bg-emerald-300' : 'bg-slate-500'}`} />
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-200">
                    {reviewMode ? 'Revisão das medidas' : measurementStage === 'front' ? 'Etapa 1 de 2' : 'Etapa 2 de 2'}
                  </p>
                </div>

                {reviewMode ? (
                  <>
                    <h2 className="mt-4 text-2xl font-black leading-tight text-white">As duas capturas estão prontas.</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-300">Confira os valores e volte a uma foto se precisar ajustar algum ponto.</p>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => selectMeasurementStage('front')} className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-left text-xs font-black text-slate-200 transition hover:bg-white/10">
                        Foto frontal
                        <span className="mt-1 block text-emerald-300">Revisar pontos</span>
                      </button>
                      <button type="button" onClick={() => selectMeasurementStage('rightProfile')} className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-left text-xs font-black text-slate-200 transition hover:bg-white/10">
                        Perfil direito
                        <span className="mt-1 block text-emerald-300">Revisar pontos</span>
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <h2 className="mt-4 text-2xl font-black leading-tight text-white">
                      {measurementStage === 'front' ? 'Posicione o cliente de frente.' : 'Agora capture o perfil direito.'}
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-slate-300">
                      {measurementStage === 'front'
                        ? 'Rosto reto, postura natural e óculos na posição habitual de uso.'
                        : 'Peça para o cliente virar o nariz para a sua esquerda e mostrar o lado direito do rosto.'}
                    </p>
                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={() => cameraOn
                          ? sendCommand(measurementStage === 'front' ? 'captureFront' : 'captureRightProfile')
                          : sendCommand('startCamera')}
                        className={`inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-black transition ${
                          cameraOn
                            ? 'bg-cyan-400 text-slate-950 hover:bg-cyan-300'
                            : 'border border-white/10 bg-slate-900 text-slate-100 hover:bg-slate-800'
                        }`}
                      >
                        {cameraOn ? <ScanLine className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
                        {cameraOn
                          ? `Capturar ${measurementStage === 'front' ? 'foto frontal' : 'perfil direito'}`
                          : 'Ativar Camera'}
                      </button>
                    </div>
                  </>
                )}
              </div>

              {measurementStage === 'front' && (
                <div className="rounded-2xl border border-white/10 bg-slate-900/65 p-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">Tipo de lente</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setLensType('surfacada')} className={`rounded-lg px-3 py-2 text-xs font-black transition ${lensType !== 'bifocal' ? 'bg-cyan-400 text-slate-950' : 'bg-white/5 text-slate-300 hover:bg-white/10'}`}>
                      Multifocal
                    </button>
                    <button type="button" onClick={() => setLensType('bifocal')} className={`rounded-lg px-3 py-2 text-xs font-black transition ${lensType === 'bifocal' ? 'bg-cyan-400 text-slate-950' : 'bg-white/5 text-slate-300 hover:bg-white/10'}`}>
                      Bifocal
                    </button>
                  </div>
                </div>
              )}

              <Panel title="Medidas desta etapa">
                {measurementStage === 'rightProfile' ? (
                  sideMeasurements ? (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      <Metric label="Dist. vértice" value={sideMeasurements.vertexDistance} />
                      <Metric label="Pantoscópico" value={sideMeasurements.pantoscopicAngle} suffix=" graus" />
                      <Metric label="Eixo 0" value={rightProfileAxisAngle} suffix=" graus" />
                    </div>
                  ) : <div className="text-sm font-semibold text-slate-500">Capture o perfil direito para calcular.</div>
                ) : measurements ? (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <Metric label="DP" value={measurements.dp} />
                    <Metric label="DNP OD" value={measurements.dnpOD} />
                    <Metric label="DNP OE" value={measurements.dnpOE} />
                    <Metric label="Alt. OD" value={measurements.altOD} />
                    <Metric label="Alt. OE" value={measurements.altOE} />
                    <Metric label="A × B" value={measurements.horizontal} suffix={` × ${measurements.vertical.toFixed(1)} mm`} />
                    {lensType === 'bifocal' && (
                      <>
                        <Metric label="Pálp. OD" value={measurements.palpebraOD} />
                        <Metric label="Pálp. OE" value={measurements.palpebraOE} />
                      </>
                    )}
                  </div>
                ) : <div className="text-sm font-semibold text-slate-500">Capture a foto frontal para calcular.</div>}
              </Panel>

              {!reviewMode && (measurementStage === 'front' ? capture : rightProfileCapture) && (
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-900/65 px-4 py-3">
                  <label htmlFor="tower-reference-mm" className="text-xs font-black uppercase tracking-[0.13em] text-slate-300">Referência em mm</label>
                  <input id="tower-reference-mm" value={referenceMm} type="number" step="0.1" onChange={(event) => setReferenceMm(Number(event.target.value) || CARD_MM)} className="h-10 w-24 rounded-lg border border-white/10 bg-black/25 px-3 text-right text-sm font-bold text-slate-100 outline-none focus:border-cyan-400/60" />
                </div>
              )}

              {reviewMode && (
                <div className="grid gap-3">
                  <div className={`rounded-2xl border p-4 ${measurementAttentions.length ? 'border-amber-300/25 bg-amber-400/10' : 'border-emerald-300/20 bg-emerald-400/10'}`}>
                    <p className={`text-xs font-black uppercase tracking-[0.14em] ${measurementAttentions.length ? 'text-amber-200' : 'text-emerald-200'}`}>
                      {measurementAttentions.length ? 'Pontos de atenção' : 'Medidas conferidas'}
                    </p>
                    {measurementAttentions.length ? (
                      <div className="mt-3 grid gap-3">
                        {measurementAttentions.map((attention) => (
                          <div key={attention.code}>
                            <p className="text-sm font-black text-amber-50">{attention.title}</p>
                            <p className="mt-1 text-xs leading-5 text-amber-50/75">{attention.message}</p>
                          </div>
                        ))}
                      </div>
                    ) : <p className="mt-2 text-xs leading-5 text-emerald-50/75">Nenhum ponto de atenção foi identificado nas faixas configuradas.</p>}
                  </div>

                  <button type="button" onClick={presentMeasurementResult} disabled={isPresentingResult} className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-cyan-400 px-4 text-sm font-black text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60">
                    {isPresentingResult ? <Loader2 className="h-4 w-4 animate-spin" /> : <MonitorUp className="h-4 w-4" />}
                    {resultPresented ? 'Apresentar novamente' : 'Salvar e apresentar resultado'}
                  </button>
                  {measurementSaveMessage && <p className={`text-center text-xs font-semibold ${resultPresented ? 'text-emerald-300' : 'text-amber-300'}`}>{measurementSaveMessage}</p>}
                  {resultPresented && (
                    <Link href={operatorBackHref} className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/10 bg-slate-900 px-4 text-sm font-black text-slate-100 transition hover:bg-slate-800">
                      Continuar atendimento
                    </Link>
                  )}
                </div>
              )}
            </aside>
          ) : (
          <aside className="flex flex-col gap-4">
            <Panel title="Sessao de captura">
              <div className="space-y-2 text-sm font-semibold">
                <div className={`flex items-center justify-between rounded-lg border px-3 py-2 ${capture ? 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100' : 'border-white/10 bg-black/20 text-slate-400'}`}>
                  <span>1. Foto frontal</span>
                  <span className="text-xs font-black uppercase">{capture ? 'Pronta' : 'Pendente'}</span>
                </div>
                <div className={`flex items-center justify-between rounded-lg border px-3 py-2 ${rightProfileCapture ? 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100' : 'border-white/10 bg-black/20 text-slate-400'}`}>
                  <span>2. Perfil direito</span>
                  <span className="text-xs font-black uppercase">{rightProfileCapture ? 'Pronto' : 'Pendente'}</span>
                </div>
              </div>
              <div className={`mt-3 rounded-lg border p-3 text-xs font-semibold leading-relaxed ${captureWorkflowComplete ? 'border-cyan-300/25 bg-cyan-400/10 text-cyan-50' : 'border-white/10 bg-black/20 text-slate-400'}`}>
                {captureWorkflowComplete ? 'Duas fotos registradas. Agora valide cada etapa e faça os ajustes finos.' : 'Capture as duas fotos antes de iniciar o ajuste fino.'}
              </div>
            </Panel>

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
              <label className="block text-xs font-black uppercase tracking-wide text-slate-400">
                {measurementStage === 'front' ? 'Referencia em mm' : 'Referencia lateral em mm'}
              </label>
              <input
                value={referenceMm}
                type="number"
                step="0.1"
                onChange={(event) => setReferenceMm(Number(event.target.value) || CARD_MM)}
                className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-black/25 px-3 text-sm font-bold text-slate-100 outline-none focus:border-cyan-400/60"
              />
              <button
                type="button"
                onClick={applyAutoHandles}
                disabled={measurementStage === 'front' ? !capture : !rightProfileCapture}
                className={`${buttonClass('light')} mt-3 w-full justify-center disabled:opacity-40`}
              >
                <Wand2 className="h-4 w-4" />
                {measurementStage === 'front' ? 'Reposicionar' : 'Reposicionar pontos laterais'}
              </button>
              {measurementStage === 'front' ? (
                <button
                  type="button"
                  onClick={locateWithAi}
                  disabled={!capture || !handles || isAiPending}
                  className={`${buttonClass('dark')} mt-3 w-full justify-center disabled:opacity-40`}
                >
                  {isAiPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
                  IA localizar lente
                </button>
              ) : (
                <div className="mt-3 rounded-lg border border-cyan-300/15 bg-cyan-400/5 p-3 text-xs font-semibold leading-relaxed text-cyan-50/85">
                  O perfil direito e calibrado manualmente nesta fase. A leitura automatica entra depois que validarmos exemplos reais.
                </div>
              )}
            </Panel>

            <Panel title="Ajuste fino">
              {measurementStage === 'front' ? (
                <>
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
                  <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
                    <div className="text-[11px] font-black uppercase tracking-wide text-slate-500">
                      Motor em teste: {DETECTION_PRESETS.find((preset) => preset.key === detectionPreset)?.label ?? 'Padrao'}
                    </div>
                    <button
                      type="button"
                      onClick={cycleDetectionPreset}
                      disabled={!capture}
                      className={`${buttonClass('light')} mt-2 w-full justify-center disabled:opacity-40`}
                    >
                      <Wand2 className="h-4 w-4" />
                      Tentar outra leitura
                    </button>
                  </div>
                </>
              ) : (
                <div className="grid gap-2">
                  {SIDE_MEASURE_GROUPS.map((group) => (
                    <button
                      key={group.label}
                      type="button"
                      onClick={() => setActiveSideKeys(group.keys)}
                      className={`rounded-lg border px-3 py-3 text-left text-xs font-black uppercase tracking-wide transition-colors ${
                        activeSideKeys === group.keys ? 'border-cyan-300/50 bg-cyan-400/15 text-cyan-50' : 'border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      {group.label}
                    </button>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="Medidas">
              {measurementStage === 'rightProfile' ? (
                sideMeasurements ? (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <Metric label="Dist. vertice" value={sideMeasurements.vertexDistance} />
                    <Metric label="Pantoscopico" value={sideMeasurements.pantoscopicAngle} suffix=" graus" />
                    <Metric label="Eixo 0" value={rightProfileAxisAngle} suffix=" graus" />
                  </div>
                ) : (
                  <div className="text-sm font-semibold text-slate-500">Carregue ou capture o perfil direito</div>
                )
              ) : measurements ? (
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <Metric label="DP" value={measurements.dp} />
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
          )}
        </section>
      </div>
    </main>
  )
}

function ClientMeasurementResult({ result }: { result: MeasurementPresentation }) {
  return (
    <main className="flex h-screen w-screen flex-col overflow-hidden bg-slate-950 p-5 text-white sm:p-7">
      <header className="flex shrink-0 items-end justify-between gap-5 border-b border-white/10 pb-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-300">Torre de experiência</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight">Resultado das medidas</h1>
        </div>
        <p className="max-w-md text-right text-sm leading-6 text-slate-400">Condição atual da armação no rosto. Valores em milímetros.</p>
      </header>

      <div className="grid min-h-0 flex-1 grid-rows-2 gap-4 pt-4">
        <section className="grid min-h-0 grid-cols-[minmax(0,1.35fr)_minmax(260px,.65fr)] gap-4 overflow-hidden rounded-3xl border border-white/10 bg-slate-900/70 p-4">
          <ResultPhoto title="Vista frontal">
            <svg viewBox={`0 0 ${result.front.capture.width} ${result.front.capture.height}`} preserveAspectRatio="xMidYMid meet" className="h-full w-full">
              <image href={result.front.capture.dataUrl} x={0} y={0} width={result.front.capture.width} height={result.front.capture.height} preserveAspectRatio="none" />
              <MeasurementLines handles={result.front.handles} lensType={result.lensMode === 'bifocal' ? 'bifocal' : 'surfacada'} />
              {(Object.keys(result.front.handles) as PointKey[]).map((key) => {
                if (result.lensMode !== 'bifocal' && (key === 'palpebraR' || key === 'palpebraL')) return null
                const point = result.front.handles[key]
                const style = POINT_STYLE[key]
                return <circle key={key} cx={point.x} cy={point.y} r={10} fill="rgba(2,6,23,.82)" stroke={style.color} strokeWidth={3} />
              })}
            </svg>
          </ResultPhoto>
          <div className="min-h-0 overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/55 p-4">
            <p className="text-xs font-black uppercase tracking-[0.17em] text-cyan-200">Medidas frontais</p>
            <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3">
              <ResultMetric label="DP" value={result.front.measurements.dp} />
              <ResultMetric label="DNP OD" value={result.front.measurements.dnpOD} />
              <ResultMetric label="DNP OE" value={result.front.measurements.dnpOE} />
              <ResultMetric label="Altura OD" value={result.front.measurements.altOD} />
              <ResultMetric label="Altura OE" value={result.front.measurements.altOE} />
              <ResultMetric label="A × B" value={result.front.measurements.horizontal} suffix={` × ${result.front.measurements.vertical.toFixed(1)}`} />
              {result.lensMode === 'bifocal' && (
                <>
                  <ResultMetric label="Pálpebra OD" value={result.front.measurements.palpebraOD} />
                  <ResultMetric label="Pálpebra OE" value={result.front.measurements.palpebraOE} />
                </>
              )}
            </div>
          </div>
        </section>

        <section className="grid min-h-0 grid-cols-[minmax(0,1.35fr)_minmax(260px,.65fr)] gap-4 overflow-hidden rounded-3xl border border-white/10 bg-slate-900/70 p-4">
          <ResultPhoto title="Perfil direito">
            <svg viewBox={`0 0 ${result.profile.capture.width} ${result.profile.capture.height}`} preserveAspectRatio="xMidYMid meet" className="h-full w-full">
              <image href={result.profile.capture.dataUrl} x={0} y={0} width={result.profile.capture.width} height={result.profile.capture.height} preserveAspectRatio="none" />
              <RightProfileLines handles={result.profile.handles} height={result.profile.capture.height} width={result.profile.capture.width} axisAngle={result.profile.axisAngle} onAxisPointerDown={() => undefined} />
              {(Object.keys(result.profile.handles) as SidePointKey[]).map((key) => {
                const point = result.profile.handles[key]
                const style = SIDE_POINT_STYLE[key]
                return <circle key={key} cx={point.x} cy={point.y} r={10} fill="rgba(2,6,23,.82)" stroke={style.color} strokeWidth={3} />
              })}
            </svg>
          </ResultPhoto>
          <div className="flex min-h-0 flex-col overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/55 p-4">
            <p className="text-xs font-black uppercase tracking-[0.17em] text-cyan-200">Posição de uso</p>
            <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3">
              <ResultMetric label="Dist. vértice" value={result.profile.measurements.vertexDistance} />
              <ResultMetric label="Pantoscópico" value={result.profile.measurements.pantoscopicAngle} suffix="°" />
            </div>
            <div className={`mt-5 rounded-2xl border p-4 ${result.attentions.length ? 'border-amber-300/25 bg-amber-400/10' : 'border-emerald-300/20 bg-emerald-400/10'}`}>
              <div className="flex items-center gap-2">
                {result.attentions.length ? <AlertTriangle className="h-5 w-5 text-amber-200" /> : <CheckCircle2 className="h-5 w-5 text-emerald-200" />}
                <p className={`text-sm font-black ${result.attentions.length ? 'text-amber-100' : 'text-emerald-100'}`}>{result.attentions.length ? 'Pontos para considerar' : 'Medidas conferidas'}</p>
              </div>
              {result.attentions.length ? (
                <div className="mt-3 grid gap-3">
                  {result.attentions.map((attention) => (
                    <div key={attention.code}>
                      <p className="text-sm font-black text-amber-50">{attention.title}</p>
                      <p className="mt-1 text-xs leading-5 text-amber-50/75">{attention.clientMessage}</p>
                    </div>
                  ))}
                </div>
              ) : <p className="mt-2 text-xs leading-5 text-emerald-50/75">A armação está em uma condição de montagem sem pontos de atenção nas faixas configuradas.</p>}
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}

function ResultPhoto({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="relative min-h-0 overflow-hidden rounded-2xl border border-white/10 bg-black">
      <div className="absolute left-3 top-3 z-10 rounded-lg border border-white/10 bg-slate-950/80 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white backdrop-blur">{title}</div>
      {children}
    </div>
  )
}

function ResultMetric({ label, value, suffix = '' }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="border-b border-white/10 pb-2">
      <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 font-mono text-lg font-black text-white">{value.toFixed(1)}{suffix}</p>
    </div>
  )
}

function buildMeasurementAttentions(front: FrontMeasurements, profile: ProfileMeasurements, lensType: LensType): MeasurementAttention[] {
  const attentions: MeasurementAttention[] = []
  const dnpDifference = Math.abs(front.dnpOD - front.dnpOE)
  const minimumFittingHeight = Math.min(front.altOD, front.altOE)

  if (lensType !== 'bifocal' && minimumFittingHeight < MEASUREMENT_ATTENTION_LIMITS.lowFittingHeightMm) {
    attentions.push({
      code: 'low_fitting_height',
      title: 'Altura de montagem baixa',
      message: 'A altura útil está baixa. Leve esta condição em consideração ao escolher o desenho e o corredor da lente.',
      clientMessage: 'A altura de montagem é baixa. Leve esta medida em consideração ao escolher a lente.',
    })
  }
  if (profile.vertexDistance > MEASUREMENT_ATTENTION_LIMITS.highVertexDistanceMm) {
    attentions.push({
      code: 'high_vertex_distance',
      title: 'Distância de vértice elevada',
      message: 'A lente está mais afastada dos olhos. Considere ajustar a armação e levar essa posição em conta na escolha da lente.',
      clientMessage: 'A armação deixa a lente mais afastada dos olhos. Um ajuste pode favorecer o conforto de uso.',
    })
  }
  if (profile.pantoscopicAngle > MEASUREMENT_ATTENTION_LIMITS.highPantoscopicAngleDegrees) {
    attentions.push({
      code: 'high_pantoscopic_angle',
      title: 'Inclinação pantoscópica acentuada',
      message: 'A inclinação atual merece atenção no ajuste da armação e na escolha posterior da lente.',
      clientMessage: 'A inclinação da armação está acentuada. Vale considerar um ajuste antes da montagem.',
    })
  }
  if (dnpDifference > MEASUREMENT_ATTENTION_LIMITS.dnpDifferenceReviewMm) {
    attentions.push({
      code: 'dnp_difference',
      title: 'Conferência de centralização recomendada',
      message: 'A diferença entre as DNPs ficou acima da faixa de conferência. Revise os pinos e, se necessário, refaça a foto frontal antes de apresentar.',
      clientMessage: 'Uma medida de centralização merece conferência antes de finalizar a montagem.',
    })
  }
  return attentions
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

function RightProfileLines({
  handles,
  height,
  width,
  axisAngle,
  onAxisPointerDown,
}: {
  handles: SideHandles
  height: number
  width: number
  axisAngle: number
  onAxisPointerDown: (event: React.PointerEvent<SVGGElement>) => void
}) {
  const lensAtCornea = pointOnSegmentAtY(handles.lensPlaneTop, handles.lensPlaneBottom, handles.cornea.y)
  const axisRadians = (axisAngle * Math.PI) / 180
  const axisXAtY = (y: number) => clamp(handles.cornea.x + Math.tan(axisRadians) * (y - handles.cornea.y), 0, width)
  const axisTop = { x: axisXAtY(0), y: 0 }
  const axisBottom = { x: axisXAtY(height), y: height }
  const axisHandleY = clamp(handles.cornea.y - height * 0.16, 42, height - 42)
  const axisHandle = { x: axisXAtY(axisHandleY), y: axisHandleY }

  return (
    <>
      <line
        x1={axisTop.x}
        y1={axisTop.y}
        x2={axisBottom.x}
        y2={axisBottom.y}
        stroke="#f8fafc"
        strokeWidth={3}
        strokeDasharray="14 12"
        opacity={0.72}
      />
      <g className="cursor-ew-resize" onPointerDown={onAxisPointerDown}>
        <circle cx={axisHandle.x} cy={axisHandle.y} r={28} fill="rgba(15,23,42,0.9)" stroke="#f8fafc" strokeWidth={4} />
        <text x={axisHandle.x} y={axisHandle.y + 6} textAnchor="middle" className="select-none fill-white text-[16px] font-black">
          0°
        </text>
      </g>
      <text x={axisHandle.x + 34} y={axisHandle.y + 6} className="select-none fill-white text-[18px] font-black" opacity={0.9}>
        EIXO 0
      </text>
      <line
        x1={handles.referenceA.x}
        y1={handles.referenceA.y}
        x2={handles.referenceB.x}
        y2={handles.referenceB.y}
        stroke={SIDE_POINT_STYLE.referenceA.color}
        strokeWidth={4}
        strokeLinecap="round"
        opacity={0.82}
      />
      <line
        x1={handles.lensPlaneTop.x}
        y1={handles.lensPlaneTop.y}
        x2={handles.lensPlaneBottom.x}
        y2={handles.lensPlaneBottom.y}
        stroke={SIDE_POINT_STYLE.lensPlaneTop.color}
        strokeWidth={4}
        strokeLinecap="round"
        opacity={0.82}
      />
      <line
        x1={handles.cornea.x}
        y1={handles.cornea.y}
        x2={lensAtCornea.x}
        y2={lensAtCornea.y}
        stroke={SIDE_POINT_STYLE.cornea.color}
        strokeWidth={4}
        strokeDasharray="10 8"
        strokeLinecap="round"
        opacity={0.92}
      />
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

function Metric({ label, value, suffix = '' }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-1">
      <span className="font-semibold text-slate-400">{label}</span>
      <span className="font-mono font-black text-slate-50">{value.toFixed(1)}{suffix}</span>
    </div>
  )
}

function createInitialRightProfileHandles(capture: CapturePayload): SideHandles {
  const { width: w, height: h } = capture
  const iris = pickProfileIris(capture.landmarks)
  const cornea = iris ? { x: iris.x * w, y: iris.y * h } : { x: w * 0.61, y: h * 0.47 }
  const lensDepth = Math.max(w * 0.055, 24)
  const lensX = clamp(cornea.x + lensDepth, 0, w)

  // The client is always photographed from the right side, with the nose facing right.
  // The iris is only a starting suggestion; the operator confirms the cornea and lens plane.
  return {
    referenceA: { x: w * 0.12, y: h * 0.82 },
    referenceB: { x: w * 0.34, y: h * 0.82 },
    cornea,
    // Keep the first frame-plane search within the lens opening, not across the whole face.
    lensPlaneTop: { x: lensX, y: clamp(cornea.y - h * 0.065, 0, h) },
    lensPlaneBottom: { x: lensX, y: clamp(cornea.y + h * 0.09, 0, h) },
  }
}

function pickProfileIris(landmarks: Landmark[] | undefined) {
  const candidates = [landmarks?.[RIGHT_IRIS], landmarks?.[LEFT_IRIS]].filter(
    (landmark): landmark is Landmark => {
      if (!landmark) return false
      return Number.isFinite(landmark.x) && Number.isFinite(landmark.y)
    },
  )
  return candidates[0]
}

function refineRightProfileLensPlane(imageData: ImageData, handles: SideHandles): SideHandles {
  const expectedX = (handles.lensPlaneTop.x + handles.lensPlaneBottom.x) / 2
  const startX = Math.round(clamp(handles.cornea.x + imageData.width * 0.018, 2, imageData.width - 3))
  const endX = Math.round(clamp(handles.cornea.x + imageData.width * 0.19, startX + 1, imageData.width - 3))
  const top = Math.round(clamp(handles.lensPlaneTop.y, 2, imageData.height - 3))
  const bottom = Math.round(clamp(handles.lensPlaneBottom.y, top + 1, imageData.height - 3))
  const samples = Math.max(1, Math.ceil((bottom - top) / 3))
  let best: { x: number; score: number } | null = null

  for (let x = startX; x <= endX; x += 1) {
    let edgeTotal = 0
    let edgeHits = 0
    let darkHits = 0

    for (let y = top; y <= bottom; y += 3) {
      const edge = localEdgeStrength(imageData, x, y)
      edgeTotal += edge
      if (edge > 20) edgeHits += 1
      if (pixelLuminance(imageData, x, y) < 105) darkHits += 1
    }

    const continuity = edgeHits / samples
    const contrast = Math.min(edgeTotal / Math.max(samples * 70, 1), 1)
    const darkFrameHint = darkHits / samples
    const nearSuggestion = 1 - Math.min(Math.abs(x - expectedX) / Math.max(imageData.width * 0.1, 1), 1)
    const score = continuity * 0.38 + contrast * 0.28 + darkFrameHint * 0.18 + nearSuggestion * 0.16
    if (!best || score > best.score) best = { x, score }
  }

  if (!best || best.score < 0.52) return handles
  return {
    ...handles,
    lensPlaneTop: { ...handles.lensPlaneTop, x: best.x },
    lensPlaneBottom: { ...handles.lensPlaneBottom, x: best.x },
  }
}

function calculateRightProfileMeasurements(handles: SideHandles, referenceMm: number, axisAngle: number) {
  const pxPerMm = Math.max(distance(handles.referenceA, handles.referenceB) / Math.max(referenceMm, 1), 0.01)
  const lensAtCornea = pointOnSegmentAtY(handles.lensPlaneTop, handles.lensPlaneBottom, handles.cornea.y)
  const vertexDistance = Math.abs(lensAtCornea.x - handles.cornea.x) / pxPerMm
  const top = handles.lensPlaneTop.y <= handles.lensPlaneBottom.y ? handles.lensPlaneTop : handles.lensPlaneBottom
  const bottom = top === handles.lensPlaneTop ? handles.lensPlaneBottom : handles.lensPlaneTop
  const lensAngle = (Math.atan2(bottom.x - top.x, bottom.y - top.y) * 180) / Math.PI
  const pantoscopicAngle = Math.abs(normalizeAngleDifference(lensAngle - axisAngle))

  return {
    vertexDistance,
    pantoscopicAngle,
  }
}

function normalizeAngleDifference(angle: number) {
  let normalized = angle % 180
  if (normalized > 90) normalized -= 180
  if (normalized < -90) normalized += 180
  return normalized
}

function pointOnSegmentAtY(start: Pt, end: Pt, y: number) {
  const deltaY = end.y - start.y
  if (Math.abs(deltaY) < 0.001) return { x: (start.x + end.x) / 2, y: start.y }
  const ratio = clamp((y - start.y) / deltaY, 0, 1)
  return {
    x: start.x + (end.x - start.x) * ratio,
    y: start.y + deltaY * ratio,
  }
}

function createInitialHandles(capture: CapturePayload, image?: HTMLImageElement, preset: DetectionPreset = 'standard'): Handles {
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
  const bridgeHalf = Math.max(7.5 * pxPerMm, (pupilL.x - pupilR.x) * 0.08)

  const buildHandles = (detectedLens: LensShape): Handles => {
    const lensLeftX = detectedLens.left
    const lensRightX = detectedLens.right
    const lensAxisX = (lensLeftX + lensRightX) / 2
    const lensTopY = detectedLens.top
    const lensBottomY = detectedLens.bottom
    const lensCenterY = (lensTopY + lensBottomY) / 2
    const bridgeY = clamp(bridge.y - 1.5 * pxPerMm, lensTopY, lensBottomY)

    return {
      calibA: { x: Math.max(0, cx - w * 0.11), y: h * 0.12 },
      calibB: { x: Math.min(w, cx + w * 0.11), y: h * 0.12 },
      pupilR,
      pupilL,
      bridgeR: { x: Math.min(lensRightX, bridge.x - bridgeHalf), y: bridgeY },
      bridgeL: { x: bridge.x + bridgeHalf, y: bridgeY },
      mountR: { x: pupilR.x, y: lensBottomY },
      mountL: { x: pupilL.x, y: lensBottomY },
      lensLeft: { x: lensLeftX, y: lensCenterY },
      lensRight: { x: lensRightX, y: lensCenterY },
      lensTop: { x: lensAxisX, y: lensTopY },
      lensBottom: { x: lensAxisX, y: lensBottomY },
      diagA: detectedLens.diagA,
      diagB: detectedLens.diagB,
      palpebraR: rightEyeBottom,
      palpebraL: toPx(lm?.[LEFT_EYE_BOTTOM], { x: pupilL.x, y: pupilL.y + 6 * pxPerMm }),
    }
  }

  const detectedLens = image ? detectLensShape(image, pupilR, fallbackLens, pxPerMm, preset) : fallbackLensToShape(fallbackLens)
  const handles = buildHandles(detectedLens)

  if (!image) return stabilizeBridgeHandlesToPupilAxis(handles, pxPerMm)
  const imageData = createImageData(image)
  if (!imageData) return stabilizeBridgeHandlesToPupilAxis(handles, pxPerMm)

  if (preset === 'closedContourText') {
    const standardLens = detectLensShape(image, pupilR, fallbackLens, pxPerMm, 'standard')
    const standardHandles = anchorInitialHandlesToFrame(imageData, buildHandles(standardLens), pxPerMm, 'standard')
    const textHandles = anchorInitialHandlesToFrame(imageData, handles, pxPerMm, preset)
    return {
      ...textHandles,
      bridgeR: standardHandles.bridgeR,
      bridgeL: standardHandles.bridgeL,
    }
  }

  return anchorInitialHandlesToFrame(imageData, handles, pxPerMm, preset)
}

function detectLensShape(
  image: HTMLImageElement,
  pupil: Pt,
  fallback: { left: number; right: number; top: number; bottom: number },
  pxPerMm: number,
  preset: DetectionPreset,
): LensShape {
  const imageData = createImageData(image)
  if (!imageData) return fallbackLensToShape(fallback)
  const sampleRadius = Math.max(3, Math.round(pxPerMm * 0.65))
  const horizontalBand = Math.max(14, Math.round(pxPerMm * 3.2))
  const verticalBand = Math.max(12, Math.round(pxPerMm * 2.8))
  const minScore = 0.26

  const left = findLensBoundaryX(imageData, pupil, -1, fallback.left, fallback.right, sampleRadius)
  const right = findLensBoundaryX(imageData, pupil, 1, fallback.left, fallback.right, sampleRadius)
  const top = findLensBoundaryY(imageData, pupil, -1, fallback.top, fallback.bottom, horizontalBand)
  const bottom = findLensBoundaryY(imageData, pupil, 1, fallback.top, fallback.bottom, verticalBand)
  const rays = scanLensRays(imageData, pupil, fallback, pxPerMm)
  const box = detectLensBox(imageData, pupil, fallback, pxPerMm)
  const brightBox = preset === 'transparent' ? detectBrightRimLensBox(imageData, fallback, pxPerMm) : null
  const darkContourBox = isClosedContourPreset(preset) ? detectDarkContourLensBox(imageData, pupil, fallback, pxPerMm) : null

  const next: LensShape = normalizeLensShapeToFacialFallback(darkContourBox ?? brightBox ?? box ?? {
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
  }, pupil, fallback, pxPerMm, preset)

  if (next.right - next.left < 34 * pxPerMm || next.bottom - next.top < 22 * pxPerMm) {
    return fallbackLensToShape(fallback)
  }
  if (!isPlausibleLensShape(next, pupil, fallback, pxPerMm)) {
    return fallbackLensToShape(fallback)
  }
  const diagonal = resolveLensDiagonal(imageData, next, pxPerMm, preset)
  next.diagA = diagonal.diagA
  next.diagB = diagonal.diagB
  return next
}

function isPlausibleLensShape(
  shape: LensShape,
  pupil: Pt,
  fallback: { left: number; right: number; top: number; bottom: number },
  pxPerMm: number,
) {
  const width = shape.right - shape.left
  const height = shape.bottom - shape.top
  const fallbackWidth = fallback.right - fallback.left
  const fallbackHeight = fallback.bottom - fallback.top
  if (width < 34 * pxPerMm || width > Math.max(74 * pxPerMm, fallbackWidth * 1.55)) return false
  if (height < 20 * pxPerMm || height > Math.max(56 * pxPerMm, fallbackHeight * 1.75)) return false
  if (pupil.x < shape.left - 5 * pxPerMm || pupil.x > shape.right + 5 * pxPerMm) return false
  if (pupil.y < shape.top - 7 * pxPerMm || pupil.y > shape.bottom + 7 * pxPerMm) return false
  return true
}

function normalizeLensShapeToFacialFallback(
  shape: LensShape,
  pupil: Pt,
  fallback: { left: number; right: number; top: number; bottom: number },
  pxPerMm: number,
  preset: DetectionPreset,
): LensShape {
  const next = { ...shape }
  const minBottom = Math.max(fallback.bottom, pupil.y + 20 * pxPerMm)
  const maxLeftDrift = fallback.left - (preset === 'transparent' ? 13 : isClosedContourPreset(preset) ? 9 : 5) * pxPerMm

  if (next.bottom < minBottom - 2 * pxPerMm) {
    next.bottom = blendNumber(next.bottom, minBottom, 0.72)
  }

  if (next.left < maxLeftDrift) {
    next.left = blendNumber(next.left, maxLeftDrift, 0.78)
  }

  if (next.diagB.y < next.bottom - 12 * pxPerMm) {
    next.diagB = { x: next.right, y: next.bottom }
  }

  return next
}

function isClosedContourPreset(preset: DetectionPreset) {
  return preset === 'closedContour' || preset === 'closedContourText'
}

function anchorInitialHandlesToFrame(imageData: ImageData, handles: Handles, pxPerMm: number, preset: DetectionPreset): Handles {
  if (preset === 'closedContour') {
    const insetHandles = insetClosedContourHandles(handles, pxPerMm)
    return stabilizeBridgeHandlesToPupilAxis(insetHandles, pxPerMm)
  }

  if (preset === 'closedContourText') {
    const insetHandles = insetClosedContourTextHandles(handles, pxPerMm, imageData)
    return alignBridgeHandlesToPupilAxis(insetHandles)
  }

  const edgeRadius = Math.max(10, Math.round(pxPerMm * 3.4))
  const rimKeys: PointKey[] = [
    'bridgeR',
    'bridgeL',
    'mountR',
    'mountL',
    'lensLeft',
    'lensRight',
    'lensTop',
    'lensBottom',
  ]

  const bottomKeys = new Set<PointKey>(['mountR', 'mountL', 'lensBottom'])
  const sideGuards: Partial<Record<PointKey, (snapped: Pt, original: Pt) => boolean>> = {
    lensLeft: (snapped, original) => snapped.x < original.x - pxPerMm * (preset === 'transparent' ? 7 : 2.2),
    lensRight: (snapped, original) => snapped.x > original.x + pxPerMm * (preset === 'transparent' ? 7 : 2.2),
  }
  const transparentBottom = preset === 'transparent' ? snapToBrightHorizontalRim(imageData, handles.lensBottom, pxPerMm) : null
  const anchored = rimKeys.reduce((next, key) => {
    const snapped = snapToLensBoundary(imageData, handles[key], edgeRadius)
    const reflectiveSide = preset === 'transparent' && (key === 'lensLeft' || key === 'lensRight') ? snapToBrightVerticalRim(imageData, handles[key], pxPerMm) : null
    const reflectiveBottom =
      preset === 'transparent' && transparentBottom && bottomKeys.has(key)
        ? { x: handles[key].x, y: transparentBottom.y }
        : null
    const preferred = reflectiveSide ?? reflectiveBottom ?? snapped
    const escapedSide = sideGuards[key]?.(preferred, handles[key]) ?? false
    const escapedBottom = bottomKeys.has(key) && preferred.y < handles[key].y - pxPerMm * 2.5
    const nextPoint = escapedSide || escapedBottom ? handles[key] : preferred
    return {
      ...next,
      [key]: nextPoint,
    }
  }, handles)

  const diagonal = resolveLensDiagonal(
    imageData,
    {
      left: anchored.lensLeft.x,
      right: anchored.lensRight.x,
      top: anchored.lensTop.y,
      bottom: anchored.lensBottom.y,
      diagA: anchored.diagA,
      diagB: anchored.diagB,
    },
    pxPerMm,
    preset,
  )

  return stabilizeBridgeHandlesToPupilAxis({
    ...anchored,
    diagA: diagonal.diagA,
    diagB: diagonal.diagB,
  }, pxPerMm)
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
      if (!isLensBoundaryCandidate(imageData, x, y)) continue
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
    ...resolveLensDiagonal(
      imageData,
      {
        left,
        right,
        top,
        bottom,
        diagA: { x: left, y: top },
        diagB: { x: right, y: bottom },
      },
      pxPerMm,
      'standard',
    ),
  }
}

function detectBrightRimLensBox(
  imageData: ImageData,
  fallback: { left: number; right: number; top: number; bottom: number },
  pxPerMm: number,
): LensShape | null {
  const xMin = clamp(Math.round(fallback.left - 18 * pxPerMm), 0, imageData.width - 1)
  const xMax = clamp(Math.round(fallback.right + 14 * pxPerMm), 0, imageData.width - 1)
  const yMin = clamp(Math.round(fallback.top - 10 * pxPerMm), 0, imageData.height - 1)
  const yMax = clamp(Math.round(fallback.bottom + 12 * pxPerMm), 0, imageData.height - 1)
  const width = xMax - xMin + 1
  const height = yMax - yMin + 1
  if (width < 30 || height < 24) return null

  const colCounts = new Array(width).fill(0) as number[]
  const rowCounts = new Array(height).fill(0) as number[]
  let hits = 0

  for (let y = yMin; y <= yMax; y += 1) {
    for (let x = xMin; x <= xMax; x += 1) {
      if (!isBrightRimPixel(imageData, x, y)) continue
      colCounts[x - xMin] += 1
      rowCounts[y - yMin] += 1
      hits += 1
    }
  }

  if (hits < width * height * 0.006) return null

  const smoothedCols = smoothCounts(colCounts, Math.max(2, Math.round(pxPerMm * 0.45)))
  const smoothedRows = smoothCounts(rowCounts, Math.max(2, Math.round(pxPerMm * 0.45)))
  const colThreshold = Math.max(4, height * 0.065)
  const rowThreshold = Math.max(4, width * 0.055)
  const leftIndex = firstStrongIndex(smoothedCols, colThreshold, 0, Math.round(width * 0.42))
  const rightIndex = lastStrongIndex(smoothedCols, colThreshold, Math.round(width * 0.46), width - 1)
  const topIndex = firstStrongIndex(smoothedRows, rowThreshold, 0, Math.round(height * 0.42))
  const bottomIndex = lastStrongIndex(smoothedRows, rowThreshold, Math.round(height * 0.46), height - 1)

  if (leftIndex === null || rightIndex === null || topIndex === null || bottomIndex === null) return null

  const left = xMin + leftIndex
  const right = xMin + rightIndex
  const top = yMin + topIndex
  const bottom = yMin + bottomIndex
  if (right - left < 34 * pxPerMm || bottom - top < 20 * pxPerMm) return null

  return {
    left,
    right,
    top,
    bottom,
    diagA: { x: left, y: top },
    diagB: { x: right, y: bottom },
  }
}

function detectDarkContourLensBox(
  imageData: ImageData,
  pupil: Pt,
  fallback: { left: number; right: number; top: number; bottom: number },
  pxPerMm: number,
): LensShape | null {
  const left = findDarkInnerBoundaryX(imageData, pupil, -1, fallback, pxPerMm)
  const right = findDarkInnerBoundaryX(imageData, pupil, 1, fallback, pxPerMm)
  const top = findDarkInnerBoundaryY(imageData, pupil, -1, fallback, pxPerMm)
  const bottom = findDarkInnerBoundaryY(imageData, pupil, 1, fallback, pxPerMm)

  if (left === null || right === null || top === null || bottom === null) return null
  const innerTop = Math.min(top + 1.6 * pxPerMm, pupil.y - 7 * pxPerMm)
  if (right - left < 34 * pxPerMm || bottom - innerTop < 20 * pxPerMm) return null

  return {
    left,
    right,
    top: innerTop,
    bottom,
    ...resolveLensDiagonal(
      imageData,
      {
        left,
        right,
        top: innerTop,
        bottom,
        diagA: { x: left, y: innerTop },
        diagB: { x: right, y: bottom },
      },
      pxPerMm,
      'closedContour',
    ),
  }
}

function findDarkInnerBoundaryX(
  imageData: ImageData,
  pupil: Pt,
  direction: -1 | 1,
  fallback: { left: number; right: number; top: number; bottom: number },
  pxPerMm: number,
) {
  const start = Math.round(pupil.x + direction * Math.max(6, pxPerMm * 4))
  const limit = direction < 0 ? Math.round(fallback.left - 6 * pxPerMm) : Math.round(fallback.right + 5 * pxPerMm)
  const yTop = Math.round(Math.max(fallback.top + 4 * pxPerMm, pupil.y - 11 * pxPerMm))
  const yBottom = Math.round(Math.min(fallback.bottom - 3 * pxPerMm, pupil.y + 13 * pxPerMm))
  const minHits = Math.max(7, Math.round((yBottom - yTop + 1) * 0.32))
  let streak = 0
  let lastStrongX: number | null = null

  for (let x = start; direction < 0 ? x >= limit : x <= limit; x += direction) {
    if (x < 2 || x >= imageData.width - 2) continue
    let hits = 0
    let edgeTotal = 0

    for (let y = yTop; y <= yBottom; y += 1) {
      if (y < 2 || y >= imageData.height - 2) continue
      if (!isDarkRimPixel(imageData, x, y)) continue
      hits += 1
      edgeTotal += localEdgeStrength(imageData, x, y)
    }

    if (hits >= minHits) {
      streak += 1
      const edgeScore = Math.min(edgeTotal / Math.max(hits * 70, 1), 1)
      if (streak >= 2 && edgeScore > 0.12) {
        if (direction > 0) return x
        lastStrongX = x
      }
    } else {
      streak = 0
    }
  }

  return lastStrongX
}

function findDarkInnerBoundaryY(
  imageData: ImageData,
  pupil: Pt,
  direction: -1 | 1,
  fallback: { left: number; right: number; top: number; bottom: number },
  pxPerMm: number,
) {
  const start = Math.round(pupil.y + direction * Math.max(7, pxPerMm * 5))
  const limit = direction < 0 ? Math.round(fallback.top - 4 * pxPerMm) : Math.round(fallback.bottom + 5 * pxPerMm)
  const xLeft = Math.round(Math.max(fallback.left + 8 * pxPerMm, pupil.x - 18 * pxPerMm))
  const xRight = Math.round(Math.min(fallback.right - 5 * pxPerMm, pupil.x + 18 * pxPerMm))
  const minHits = Math.max(9, Math.round((xRight - xLeft + 1) * (direction < 0 ? 0.24 : 0.2)))
  let streak = 0

  for (let y = start; direction < 0 ? y >= limit : y <= limit; y += direction) {
    if (y < 2 || y >= imageData.height - 2) continue
    let hits = 0
    let edgeTotal = 0

    for (let x = xLeft; x <= xRight; x += 1) {
      if (x < 2 || x >= imageData.width - 2) continue
      if (!isDarkRimPixel(imageData, x, y)) continue
      hits += 1
      edgeTotal += localEdgeStrength(imageData, x, y)
    }

    if (hits >= minHits) {
      streak += 1
      const edgeScore = Math.min(edgeTotal / Math.max(hits * 70, 1), 1)
      if (streak >= 2 && edgeScore > 0.1) return y
    } else {
      streak = 0
    }
  }

  return null
}

function resolveLensDiagonal(imageData: ImageData, shape: LensShape, pxPerMm: number, preset: DetectionPreset = 'standard') {
  const width = Math.max(shape.right - shape.left, 1)
  const height = Math.max(shape.bottom - shape.top, 1)
  const transparent = preset === 'transparent'
  const closedContour = isClosedContourPreset(preset)
  const boundaryCandidate = closedContour
    ? (x: number, y: number) => isDarkRimPixel(imageData, x, y)
    : (x: number, y: number) => isLensBoundaryCandidate(imageData, x, y)
  const diagAStartX = shape.left + Math.max(width * 0.035, pxPerMm * 1.6)
  const diagALimitX = shape.left + width * 0.28
  const diagAStartY = shape.top
  const diagALimitY = shape.top + height * 0.2
  const diagBStartX = shape.left + width * 0.62
  const diagBLimitX = shape.left + width * (transparent || closedContour ? 0.96 : 0.93)
  const diagBStartY = shape.top + height * (transparent || closedContour ? 0.62 : 0.52)
  const diagBLimitY = shape.top + height * (transparent || closedContour ? 0.98 : 0.86)
  const diagBTarget = {
    x: shape.right - width * (transparent || closedContour ? 0.1 : 0.14),
    y: shape.bottom - height * (transparent || closedContour ? 0.08 : 0.2),
  }

  const diagA =
    bestBoundaryInRect(
      imageData,
      {
        left: clamp(Math.round(diagAStartX), 0, imageData.width - 1),
        right: clamp(Math.round(diagALimitX), 0, imageData.width - 1),
        top: clamp(Math.round(diagAStartY), 0, imageData.height - 1),
        bottom: clamp(Math.round(diagALimitY), 0, imageData.height - 1),
      },
      { x: shape.left + width * 0.075, y: shape.top + height * 0.04 },
      (point) => {
        const yNearTop = 1 - Math.min(Math.abs(point.y - (shape.top + height * 0.04)) / Math.max(height * 0.14, 1), 1)
        const xNearLeftLens = 1 - Math.min(Math.abs(point.x - (shape.left + width * 0.075)) / Math.max(width * 0.12, 1), 1)
        const darkBonus = closedContour && isDarkRimPixel(imageData, Math.round(point.x), Math.round(point.y)) ? 0.18 : 0
        return yNearTop * 0.5 + xNearLeftLens * 0.42 + darkBonus
      },
      boundaryCandidate,
    ) ?? { x: shape.left, y: shape.top }

  const diagB =
    bestBoundaryInRect(
      imageData,
      {
        left: clamp(Math.round(diagBStartX), 0, imageData.width - 1),
        right: clamp(Math.round(diagBLimitX), 0, imageData.width - 1),
        top: clamp(Math.round(diagBStartY), 0, imageData.height - 1),
        bottom: clamp(Math.round(diagBLimitY), 0, imageData.height - 1),
      },
      diagBTarget,
      (point) => {
        const yNearLowerCurve = 1 - Math.min(Math.abs(point.y - diagBTarget.y) / Math.max(height * (transparent || closedContour ? 0.18 : 0.23), 1), 1)
        const xNearA2 = 1 - Math.min(Math.abs(point.x - diagBTarget.x) / Math.max(width * (transparent || closedContour ? 0.16 : 0.2), 1), 1)
        const belowEyeBias = transparent || closedContour ? Math.min(Math.max((point.y - (shape.top + height * 0.58)) / Math.max(height * 0.35, 1), 0), 1) : 0
        const darkBonus = closedContour && isDarkRimPixel(imageData, Math.round(point.x), Math.round(point.y)) ? 0.22 : 0
        return yNearLowerCurve * (transparent || closedContour ? 0.48 : 0.34) + xNearA2 * (transparent || closedContour ? 0.34 : 0.48) + belowEyeBias * 0.12 + darkBonus
      },
      boundaryCandidate,
    ) ?? { x: shape.right, y: shape.bottom }

  return { diagA, diagB }
}

function bestBoundaryInRect(
  imageData: ImageData,
  rect: { left: number; right: number; top: number; bottom: number },
  target: Pt,
  geometryScore: (point: Pt) => number,
  isCandidate: (x: number, y: number) => boolean = (x, y) => isLensBoundaryCandidate(imageData, x, y),
) {
  let best: { point: Pt; score: number } | null = null
  const maxDistance = Math.max(distance({ x: rect.left, y: rect.top }, { x: rect.right, y: rect.bottom }), 1)

  for (let y = rect.top; y <= rect.bottom; y += 1) {
    if (y < 1 || y >= imageData.height - 1) continue
    for (let x = rect.left; x <= rect.right; x += 1) {
      if (x < 1 || x >= imageData.width - 1) continue
      if (!isCandidate(x, y)) continue
      const closeness = 1 - Math.min(distance(target, { x, y }) / maxDistance, 1)
      const edge = Math.min(localEdgeStrength(imageData, x, y) / 90, 1)
      const highlight = isSpecularLensHint(imageData, x, y) ? 0.18 : 0
      const score = edge * 0.38 + closeness * 0.14 + highlight + geometryScore({ x, y })
      if (!best || score > best.score) best = { point: { x, y }, score }
    }
  }

  return best?.point ?? null
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

function snapToLensBoundary(imageData: ImageData | null, point: Pt, radius: number): Pt {
  if (!imageData) return point
  return nearestLensBoundaryCandidate(imageData, point, radius) ?? point
}

function nearestLensBoundaryCandidate(imageData: ImageData, point: Pt, radius: number): Pt | null {
  let best: { point: Pt; score: number } | null = null
  const centerX = Math.round(point.x)
  const centerY = Math.round(point.y)

  for (let y = centerY - radius; y <= centerY + radius; y += 1) {
    if (y < 1 || y >= imageData.height - 1) continue
    for (let x = centerX - radius; x <= centerX + radius; x += 1) {
      if (x < 1 || x >= imageData.width - 1) continue
      if (!isLensBoundaryCandidate(imageData, x, y)) continue
      const closeness = 1 - Math.min(distance(point, { x, y }) / radius, 1)
      const edge = Math.min(localEdgeStrength(imageData, x, y) / 90, 1)
      const highlight = isSpecularLensHint(imageData, x, y) ? 0.22 : 0
      const score = edge * 0.68 + closeness * 0.25 + highlight
      if (!best || score > best.score) best = { point: { x, y }, score }
    }
  }

  return best?.point ?? null
}

function snapToBrightVerticalRim(imageData: ImageData, point: Pt, pxPerMm: number): Pt | null {
  const radiusX = Math.max(16, Math.round(pxPerMm * 10))
  const radiusY = Math.max(20, Math.round(pxPerMm * 10))
  const centerX = Math.round(point.x)
  const centerY = Math.round(point.y)
  let best: { point: Pt; score: number } | null = null

  for (let x = centerX - radiusX; x <= centerX + radiusX; x += 1) {
    if (x < 2 || x >= imageData.width - 2) continue
    let hits = 0
    let weightedY = 0
    let edgeTotal = 0

    for (let y = centerY - radiusY; y <= centerY + radiusY; y += 1) {
      if (y < 2 || y >= imageData.height - 2) continue
      if (!isBrightRimPixel(imageData, x, y)) continue
      const edge = localEdgeStrength(imageData, x, y)
      hits += 1
      weightedY += y * Math.max(edge, 1)
      edgeTotal += Math.max(edge, 1)
    }

    if (hits < Math.max(5, Math.round(radiusY * 0.28))) continue
    const avgY = edgeTotal ? weightedY / edgeTotal : centerY
    const closeness = 1 - Math.min(Math.abs(x - centerX) / Math.max(radiusX, 1), 1)
    const continuity = Math.min(hits / Math.max(radiusY * 1.25, 1), 1)
    const score = continuity * 0.62 + closeness * 0.2 + Math.min(edgeTotal / Math.max(hits * 70, 1), 1) * 0.18
    if (!best || score > best.score) best = { point: { x, y: avgY }, score }
  }

  return best && best.score > 0.42 ? best.point : null
}

function snapToBrightHorizontalRim(imageData: ImageData, point: Pt, pxPerMm: number): Pt | null {
  const radiusX = Math.max(28, Math.round(pxPerMm * 18))
  const radiusUp = Math.max(10, Math.round(pxPerMm * 4))
  const radiusDown = Math.max(22, Math.round(pxPerMm * 11))
  const centerX = Math.round(point.x)
  const centerY = Math.round(point.y)
  let best: { point: Pt; score: number } | null = null

  for (let y = centerY - radiusUp; y <= centerY + radiusDown; y += 1) {
    if (y < 2 || y >= imageData.height - 2) continue
    let hits = 0
    let weightedX = 0
    let edgeTotal = 0

    for (let x = centerX - radiusX; x <= centerX + radiusX; x += 1) {
      if (x < 2 || x >= imageData.width - 2) continue
      if (!isBrightRimPixel(imageData, x, y)) continue
      const edge = localEdgeStrength(imageData, x, y)
      hits += 1
      weightedX += x * Math.max(edge, 1)
      edgeTotal += Math.max(edge, 1)
    }

    if (hits < Math.max(6, Math.round(radiusX * 0.22))) continue
    const avgX = edgeTotal ? weightedX / edgeTotal : centerX
    const lowerBias = Math.min(Math.max((y - centerY + radiusUp) / Math.max(radiusUp + radiusDown, 1), 0), 1)
    const centered = 1 - Math.min(Math.abs(avgX - centerX) / Math.max(radiusX, 1), 1)
    const continuity = Math.min(hits / Math.max(radiusX * 0.72, 1), 1)
    const edgeScore = Math.min(edgeTotal / Math.max(hits * 68, 1), 1)
    const score = continuity * 0.48 + lowerBias * 0.24 + centered * 0.12 + edgeScore * 0.16
    if (!best || score > best.score) best = { point: { x: centerX, y }, score }
  }

  return best && best.score > 0.4 ? best.point : null
}

function findLensBoundaryX(
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
    let hits = 0
    let total = 0
    for (let y = Math.round(pupil.y - radius * 2); y <= Math.round(pupil.y + radius * 2); y += 1) {
      if (y < 0 || y >= height) continue
      if (isLensBoundaryCandidate(imageData, x, y)) hits += 1
      total += 1
    }
    const score = total ? hits / total : 0
    if (score > best.score) best = { value: x, score }
  }

  return best
}

function findLensBoundaryY(
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
    let hits = 0
    let total = 0
    for (let x = Math.round(pupil.x - halfBand); x <= Math.round(pupil.x + halfBand); x += 2) {
      if (x < 0 || x >= width) continue
      if (isLensBoundaryCandidate(imageData, x, y)) hits += 1
      total += 1
    }
    const score = total ? hits / total : 0
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
    bottom: bestRayHit(imageData, pupil, angles.bottom, start, maxRadius, (point, best) => !best || point.y > best.y, 'last'),
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
  mode: 'first' | 'last' = 'first',
) {
  let best: Pt | null = null
  for (const angle of angles) {
    const hit = scanRayForLensBoundary(imageData, origin, angle, start, maxRadius, mode)
    if (hit && isBetter(hit, best)) best = hit
  }
  return best
}

function scanRayForLensBoundary(imageData: ImageData, origin: Pt, degrees: number, start: number, maxRadius: number, mode: 'first' | 'last') {
  const radians = (degrees * Math.PI) / 180
  const dx = Math.cos(radians)
  const dy = Math.sin(radians)
  let streak = 0
  let lastHit: Pt | null = null

  for (let radius = start; radius <= maxRadius; radius += 2) {
    const x = Math.round(origin.x + dx * radius)
    const y = Math.round(origin.y + dy * radius)
    if (x < 1 || y < 1 || x >= imageData.width - 1 || y >= imageData.height - 1) break

    if (isLensBoundaryCandidate(imageData, x, y)) {
      streak += 1
      if (streak >= 2) {
        lastHit = { x, y }
        if (mode === 'first') return lastHit
      }
    } else {
      streak = 0
    }
  }

  return lastHit
}

function hasLocalEdge(imageData: ImageData, x: number, y: number) {
  return localEdgeStrength(imageData, x, y) > 34
}

function localEdgeStrength(imageData: ImageData, x: number, y: number) {
  const center = pixelLuminance(imageData, x, y)
  const left = pixelLuminance(imageData, x - 1, y)
  const right = pixelLuminance(imageData, x + 1, y)
  const top = pixelLuminance(imageData, x, y - 1)
  const bottom = pixelLuminance(imageData, x, y + 1)
  return Math.max(Math.abs(center - left), Math.abs(center - right), Math.abs(center - top), Math.abs(center - bottom))
}

function isSpecularLensHint(imageData: ImageData, x: number, y: number) {
  const index = (y * imageData.width + x) * 4
  const red = imageData.data[index]
  const green = imageData.data[index + 1]
  const blue = imageData.data[index + 2]
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue
  const contrast = Math.max(red, green, blue) - Math.min(red, green, blue)
  return luminance > 178 && contrast < 58 && localEdgeStrength(imageData, x, y) > 18
}

function isBrightRimPixel(imageData: ImageData, x: number, y: number) {
  const index = (y * imageData.width + x) * 4
  const red = imageData.data[index]
  const green = imageData.data[index + 1]
  const blue = imageData.data[index + 2]
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue
  const contrast = Math.max(red, green, blue) - Math.min(red, green, blue)
  return luminance > 150 && contrast < 72 && localEdgeStrength(imageData, x, y) > 12
}

function isDarkRimPixel(imageData: ImageData, x: number, y: number) {
  const index = (y * imageData.width + x) * 4
  const red = imageData.data[index]
  const green = imageData.data[index + 1]
  const blue = imageData.data[index + 2]
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue
  const contrast = Math.max(red, green, blue) - Math.min(red, green, blue)
  return luminance < 92 && contrast < 96
}

function isLensBoundaryCandidate(imageData: ImageData, x: number, y: number) {
  return hasLocalEdge(imageData, x, y) || isSpecularLensHint(imageData, x, y)
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

function pixelLuminance(imageData: ImageData, x: number, y: number) {
  const index = (y * imageData.width + x) * 4
  return 0.2126 * imageData.data[index] + 0.7152 * imageData.data[index + 1] + 0.0722 * imageData.data[index + 2]
}

function calculateMeasurements(handles: Handles, referenceMm: number) {
  const mmpp = referenceMm / Math.max(distance(handles.calibA, handles.calibB), 0.0001)
  const pupilAxis = unitVector(handles.pupilR, handles.pupilL)
  const axisValue = (point: Pt) => (point.x - handles.pupilR.x) * pupilAxis.x + (point.y - handles.pupilR.y) * pupilAxis.y
  const pupilRValue = 0
  const pupilLValue = axisValue(handles.pupilL)
  const bridgeRValue = axisValue(handles.bridgeR)
  const bridgeLValue = axisValue(handles.bridgeL)
  const horizontal = distance(handles.lensLeft, handles.lensRight) * mmpp
  const vertical = distance(handles.lensTop, handles.lensBottom) * mmpp
  const dp = Math.abs(pupilLValue - pupilRValue) * mmpp
  const ponte = Math.abs(bridgeLValue - bridgeRValue) * mmpp
  const halfBridge = ponte / 2
  const dnpOD = Math.abs(bridgeRValue - pupilRValue) * mmpp + halfBridge
  const dnpOE = Math.abs(pupilLValue - bridgeLValue) * mmpp + halfBridge
  const altOD = Math.abs(handles.mountR.y - handles.pupilR.y) * mmpp
  const altOE = Math.abs(handles.mountL.y - handles.pupilL.y) * mmpp
  const diam = (dnp: number, alt: number) => {
    const dH = Math.abs(horizontal / 2 + ponte / 2 - dnp)
    const dV = Math.abs(alt - vertical / 2)
    return nextBlank(distance({ x: 0, y: 0 }, { x: dH, y: dV }) * 2 + distance(handles.diagA, handles.diagB) * mmpp + 2)
  }

  return {
    dp,
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

function estimatePxPerMmFromPupils(handles: Pick<Handles, 'pupilR' | 'pupilL'>) {
  return Math.max(distance(handles.pupilR, handles.pupilL) / 63, 1)
}

function buttonClass(tone: 'dark' | 'light') {
  return `inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-black transition-colors ${
    tone === 'dark'
      ? 'bg-cyan-500 text-slate-950 hover:bg-cyan-400'
      : 'border border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/10 hover:text-white'
  }`
}

function buildZoomViewBox(width: number, height: number, zoom: number, pan: Pt = { x: 0, y: 0 }) {
  const safeZoom = clamp(zoom, 1, 4)
  const viewWidth = width / safeZoom
  const viewHeight = height / safeZoom
  const x = clamp((width - viewWidth) / 2 + pan.x, 0, width - viewWidth)
  const y = clamp((height - viewHeight) / 2 + pan.y, 0, height - viewHeight)
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

function cropImageToMeasurementGuide(image: HTMLImageElement, stage: MeasurementStage) {
  const sourceWidth = image.naturalWidth
  const sourceHeight = image.naturalHeight
  const maxGuideHeight = Math.min(sourceHeight * CAPTURE_GUIDE_HEIGHT_RATIO, sourceWidth / CAPTURE_GUIDE_ASPECT)
  const cropHeight = Math.max(1, Math.round(maxGuideHeight))
  const cropWidth = Math.max(1, Math.round(cropHeight * CAPTURE_GUIDE_ASPECT))
  const centerY = stage === 'front' ? sourceHeight * 0.47 : sourceHeight * 0.5
  const sourceX = clamp(Math.round((sourceWidth - cropWidth) / 2), 0, Math.max(sourceWidth - cropWidth, 0))
  const sourceY = clamp(Math.round(centerY - cropHeight / 2), 0, Math.max(sourceHeight - cropHeight, 0))

  const canvas = document.createElement('canvas')
  canvas.width = cropWidth
  canvas.height = cropHeight
  const context = canvas.getContext('2d')
  if (!context) return image.src
  context.drawImage(image, sourceX, sourceY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight)
  return canvas.toDataURL('image/jpeg', 0.96)
}

function nextBlank(value: number) {
  return BLANKS.find((blank) => blank >= value) ?? 85
}

function distance(a: Pt, b: Pt) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function unitVector(a: Pt, b: Pt) {
  const length = Math.max(distance(a, b), 0.0001)
  return { x: (b.x - a.x) / length, y: (b.y - a.y) / length }
}

function projectPointToLine(point: Pt, lineStart: Pt, lineEnd: Pt) {
  const axis = unitVector(lineStart, lineEnd)
  const amount = (point.x - lineStart.x) * axis.x + (point.y - lineStart.y) * axis.y
  return {
    x: lineStart.x + axis.x * amount,
    y: lineStart.y + axis.y * amount,
  }
}

function alignBridgeHandlesToPupilAxis(handles: Handles): Handles {
  return {
    ...handles,
    bridgeR: projectPointToLine(handles.bridgeR, handles.pupilR, handles.pupilL),
    bridgeL: projectPointToLine(handles.bridgeL, handles.pupilR, handles.pupilL),
  }
}

function insetClosedContourHandles(handles: Handles, pxPerMm: number): Handles {
  const leftInset = -5.4 * pxPerMm
  const rightInset = 2.2 * pxPerMm
  const topInset = 10.5 * pxPerMm
  const bridgeInset = 2.1 * pxPerMm
  const bridgeLeftInset = 4.6 * pxPerMm
  const lensLeft = { ...handles.lensLeft, x: handles.lensLeft.x + leftInset }
  const lensRight = { ...handles.lensRight, x: handles.lensRight.x - rightInset }
  const lensTop = { ...handles.lensTop, y: Math.min(handles.lensTop.y + topInset, handles.pupilR.y - 4.8 * pxPerMm) }
  const bridgeR = { ...handles.bridgeR, x: Math.min(handles.bridgeR.x - bridgeInset, lensRight.x - 0.6 * pxPerMm) }
  const bridgeL = { ...handles.bridgeL, x: handles.bridgeL.x + bridgeLeftInset }
  const width = Math.max(lensRight.x - lensLeft.x, 1)
  const height = Math.max(handles.lensBottom.y - lensTop.y, 1)

  return {
    ...handles,
    lensLeft,
    lensRight,
    lensTop,
    bridgeR,
    bridgeL,
    diagA: {
      x: lensLeft.x + width * 0.006,
      y: lensTop.y + height * 0.1,
    },
    diagB: {
      x: lensRight.x - width * 0.075,
      y: handles.lensBottom.y - height * 0.26,
    },
  }
}

function insetClosedContourTextHandles(handles: Handles, pxPerMm: number, imageData?: ImageData): Handles {
  const base = insetClosedContourHandles(handles, pxPerMm)
  if (!imageData) return base

  const detectedNasalRimX = findClosedContourNasalRimX(imageData, handles, pxPerMm)
  const lensRight = detectedNasalRimX ? { ...base.lensRight, x: detectedNasalRimX } : base.lensRight
  const brightLeftRimX = findHybridBrightLeftRimX(imageData, base, pxPerMm)
  const lensLeft = brightLeftRimX ? { ...base.lensLeft, x: brightLeftRimX } : base.lensLeft
  const width = Math.max(lensRight.x - lensLeft.x, 1)
  const axisY = (lensLeft.y + lensRight.y) / 2
  const lensAxisX = (lensLeft.x + lensRight.x) / 2
  // In this preset the center is noisy (eyebrow and lens text), so keep the
  // geometric fallback close to the usual inner contour before pixel snapping.
  const geometricTopY = clamp(axisY - width * 0.28, 0, imageData.height - 1)
  const geometricBottomY = clamp(axisY + width * 0.52, 0, imageData.height - 1)
  const darkTopRimY = findHybridDarkTopRimY(imageData, { ...base, lensLeft, lensRight }, pxPerMm)
  const topPixelIsPlausible =
    darkTopRimY !== null &&
    darkTopRimY > geometricTopY - 3.5 * pxPerMm &&
    darkTopRimY < geometricTopY + 3 * pxPerMm
  const lensTop = { ...base.lensTop, x: lensAxisX, y: topPixelIsPlausible ? darkTopRimY : geometricTopY }
  const detectedLowerRimY = findHybridBrightLowerRimY(
    imageData,
    { ...base, lensLeft, lensRight, lensTop },
    pxPerMm,
    geometricBottomY,
  )
  const bottomPixelIsPlausible =
    detectedLowerRimY !== null &&
    detectedLowerRimY > geometricBottomY - 4 * pxPerMm &&
    detectedLowerRimY < geometricBottomY + 4 * pxPerMm
  const lensBottom = { ...base.lensBottom, x: lensAxisX, y: bottomPixelIsPlausible ? detectedLowerRimY : geometricBottomY }
  const mountR = { ...base.mountR, y: lensBottom.y }
  const mountL = { ...base.mountL, y: lensBottom.y }
  const bridgeR = base.bridgeR
  const bridgeL = base.bridgeL
  const height = Math.max(lensBottom.y - lensTop.y, 1)
  const diagB = findHybridDarkDiagB(imageData, { ...base, lensLeft, lensRight, lensTop, lensBottom }, pxPerMm) ?? base.diagB

  return {
    ...base,
    lensLeft,
    lensRight,
    lensTop,
    lensBottom,
    mountR,
    mountL,
    bridgeR,
    bridgeL,
    diagA: {
      x: lensLeft.x + width * 0.006,
      y: lensTop.y + height * 0.1,
    },
    diagB,
  }
}

function findClosedContourNasalRimX(imageData: ImageData, handles: Handles, pxPerMm: number) {
  const start = Math.round(handles.lensRight.x - 0.8 * pxPerMm)
  const limit = Math.round(Math.max(handles.pupilR.x + 7 * pxPerMm, handles.lensRight.x - 19 * pxPerMm))
  const yTop = Math.round(Math.max(handles.lensTop.y + 5 * pxPerMm, handles.pupilR.y - 7 * pxPerMm))
  const yBottom = Math.round(Math.min(handles.lensBottom.y - 5 * pxPerMm, handles.pupilR.y + 15 * pxPerMm))
  const minHits = Math.max(7, Math.round((yBottom - yTop + 1) * 0.28))
  let best: { x: number; score: number } | null = null

  for (let x = start; x >= limit; x -= 1) {
    if (x < 2 || x >= imageData.width - 2) continue
    let hits = 0
    let edgeTotal = 0

    for (let y = yTop; y <= yBottom; y += 1) {
      if (y < 2 || y >= imageData.height - 2) continue
      if (!isDarkRimPixel(imageData, x, y)) continue
      hits += 1
      edgeTotal += localEdgeStrength(imageData, x, y)
    }

    if (hits < minHits) continue

    const continuity = hits / Math.max(yBottom - yTop + 1, 1)
    const edgeScore = Math.min(edgeTotal / Math.max(hits * 80, 1), 1)
    const distanceFromBridge = Math.min((handles.lensRight.x - x) / Math.max(13 * pxPerMm, 1), 1)
    const score = continuity * 0.5 + edgeScore * 0.32 + distanceFromBridge * 0.18
    if (!best || score > best.score) best = { x, score }
  }

  return best && best.score > 0.42 ? best.x : null
}

function findHybridDarkTopRimY(imageData: ImageData, handles: Handles, pxPerMm: number) {
  const left = Math.round(Math.max(2, handles.lensLeft.x + 5 * pxPerMm))
  const right = Math.round(Math.min(imageData.width - 3, handles.lensRight.x - 4 * pxPerMm))
  const width = right - left + 1
  if (width < 24) return null

  const yStart = Math.round(Math.max(2, handles.lensTop.y - 13 * pxPerMm))
  const yEnd = Math.round(Math.min(handles.pupilR.y - 12 * pxPerMm, handles.lensTop.y + 2 * pxPerMm))
  const minTotalHits = Math.max(14, Math.round(width * 0.14))
  const minRun = Math.max(18, Math.round(width * 0.18))
  const minSideHits = Math.max(5, Math.round(width * 0.035))
  let best: { y: number; score: number } | null = null

  for (let y = yStart; y <= yEnd; y += 1) {
    if (y < 2 || y >= imageData.height - 2) continue
    let totalHits = 0
    let edgeTotal = 0
    let currentRun = 0
    let longestRun = 0
    let outerHits = 0
    let nasalHits = 0

    for (let x = left; x <= right; x += 1) {
      const relative = (x - left) / Math.max(width - 1, 1)
      if (!isDarkRimPixel(imageData, x, y)) {
        currentRun = 0
        continue
      }
      currentRun += 1
      longestRun = Math.max(longestRun, currentRun)
      totalHits += 1
      edgeTotal += localEdgeStrength(imageData, x, y)
      if (relative < 0.38) outerHits += 1
      if (relative > 0.62) nasalHits += 1
    }

    if (totalHits < minTotalHits || longestRun < minRun || outerHits < minSideHits || nasalHits < minSideHits) continue

    const runScore = Math.min(longestRun / Math.max(width * 0.3, 1), 1)
    const coverage = Math.min(totalHits / Math.max(width * 0.24, 1), 1)
    const edgeScore = Math.min(edgeTotal / Math.max(totalHits * 80, 1), 1)
    const topBias = 1 - Math.min((y - yStart) / Math.max(yEnd - yStart, 1), 1)
    const sideBalance = Math.min(outerHits, nasalHits) / Math.max(Math.max(outerHits, nasalHits), 1)
    const score = runScore * 0.34 + coverage * 0.23 + edgeScore * 0.16 + sideBalance * 0.17 + topBias * 0.1
    if (!best || score > best.score) best = { y, score }
  }

  return best && best.score > 0.46 ? best.y + 0.8 * pxPerMm : null
}

function findHybridDarkDiagB(imageData: ImageData, handles: Handles, pxPerMm: number): Pt | null {
  const width = Math.max(handles.lensRight.x - handles.lensLeft.x, 1)
  const height = Math.max(handles.lensBottom.y - handles.lensTop.y, 1)
  const rect = {
    left: clamp(Math.round(handles.lensRight.x - width * 0.22), 0, imageData.width - 1),
    right: clamp(Math.round(handles.lensRight.x + 2 * pxPerMm), 0, imageData.width - 1),
    top: clamp(Math.round(handles.lensTop.y + height * 0.52), 0, imageData.height - 1),
    bottom: clamp(Math.round(handles.lensBottom.y - height * 0.05), 0, imageData.height - 1),
  }
  const target = {
    x: handles.lensRight.x - width * 0.08,
    y: handles.lensBottom.y - height * 0.2,
  }

  return bestBoundaryInRect(
    imageData,
    rect,
    target,
    (point) => {
      const xNearRim = 1 - Math.min(Math.abs(point.x - target.x) / Math.max(width * 0.12, 1), 1)
      const yNearLower = 1 - Math.min(Math.abs(point.y - target.y) / Math.max(height * 0.18, 1), 1)
      const awayFromNose = point.x <= handles.lensRight.x + pxPerMm ? 0.18 : 0
      return xNearRim * 0.42 + yNearLower * 0.4 + awayFromNose
    },
    (x, y) => isDarkRimPixel(imageData, x, y),
  )
}

function findHybridBrightLeftRimX(imageData: ImageData, handles: Handles, pxPerMm: number) {
  const start = Math.round(handles.pupilR.x - 10 * pxPerMm)
  const limit = Math.round(Math.max(2, handles.lensLeft.x - 4 * pxPerMm))
  const yTop = Math.round(Math.max(2, handles.lensTop.y + 7 * pxPerMm))
  const yBottom = Math.round(Math.min(imageData.height - 3, handles.lensBottom.y - 8 * pxPerMm))
  const minHits = Math.max(8, Math.round((yBottom - yTop + 1) * 0.16))
  let best: { x: number; score: number } | null = null

  for (let x = start; x >= limit; x -= 1) {
    if (x < 2 || x >= imageData.width - 2) continue
    let hits = 0
    let edgeTotal = 0

    for (let y = yTop; y <= yBottom; y += 1) {
      if (y < 2 || y >= imageData.height - 2) continue
      if (!isBrightRimPixel(imageData, x, y) && !isSpecularLensHint(imageData, x, y)) continue
      hits += 1
      edgeTotal += localEdgeStrength(imageData, x, y)
    }

    if (hits < minHits) continue

    const continuity = hits / Math.max(yBottom - yTop + 1, 1)
    const edgeScore = Math.min(edgeTotal / Math.max(hits * 75, 1), 1)
    const outsideBias = Math.min((handles.pupilR.x - x) / Math.max(30 * pxPerMm, 1), 1)
    const score = continuity * 0.46 + edgeScore * 0.3 + outsideBias * 0.24
    if (!best || score > best.score) best = { x, score }
  }

  return best && best.score > 0.34 ? best.x : null
}

function findHybridBrightLowerRimY(imageData: ImageData, handles: Handles, pxPerMm: number, expectedY: number) {
  const left = Math.round(Math.max(2, handles.lensLeft.x + 4 * pxPerMm))
  const right = Math.round(Math.min(imageData.width - 3, handles.lensRight.x - 6 * pxPerMm))
  const width = right - left + 1
  if (width < 24) return null

  const yStart = Math.round(Math.max(handles.pupilR.y + 21 * pxPerMm, expectedY - 5 * pxPerMm))
  const yEnd = Math.round(Math.min(imageData.height - 3, expectedY + 5 * pxPerMm))
  const minTotalHits = Math.max(10, Math.round(width * 0.075))
  const minRun = Math.max(8, Math.round(width * 0.08))
  let best: { y: number; score: number } | null = null

  for (let y = yStart; y <= yEnd; y += 1) {
    if (y < 2 || y >= imageData.height - 2) continue
    let totalHits = 0
    let edgeTotal = 0
    let currentRun = 0
    let longestRun = 0
    let sideHits = 0

    for (let x = left; x <= right; x += 1) {
      const relative = (x - left) / Math.max(width - 1, 1)
      const isSideBand = relative < 0.34 || relative > 0.68
      const hit = isBrightRimPixel(imageData, x, y) || isSpecularLensHint(imageData, x, y)
      if (!hit || !isSideBand) {
        currentRun = 0
        continue
      }
      currentRun += 1
      longestRun = Math.max(longestRun, currentRun)
      totalHits += 1
      sideHits += 1
      edgeTotal += localEdgeStrength(imageData, x, y)
    }

    if (totalHits < minTotalHits || longestRun < minRun || sideHits < minTotalHits) continue

    const runScore = Math.min(longestRun / Math.max(width * 0.15, 1), 1)
    const coverage = Math.min(totalHits / Math.max(width * 0.14, 1), 1)
    const edgeScore = Math.min(edgeTotal / Math.max(totalHits * 75, 1), 1)
    const nearExpected = 1 - Math.min(Math.abs(y - expectedY) / Math.max(5 * pxPerMm, 1), 1)
    const innerEdgeBias = 1 - Math.min((y - yStart) / Math.max(yEnd - yStart, 1), 1)
    const score = runScore * 0.34 + coverage * 0.18 + edgeScore * 0.17 + nearExpected * 0.21 + innerEdgeBias * 0.1
    if (!best || score > best.score) best = { y, score }
  }

  if (!best || best.score <= 0.4) return null
  return findLowerRimInnerEdgeY(imageData, handles, best.y, pxPerMm)
}

function findLowerRimInnerEdgeY(imageData: ImageData, handles: Handles, rimCenterY: number, pxPerMm: number) {
  const left = Math.round(Math.max(2, handles.lensLeft.x + 4 * pxPerMm))
  const right = Math.round(Math.min(imageData.width - 3, handles.lensRight.x - 6 * pxPerMm))
  const width = right - left + 1
  const yStart = Math.round(Math.max(2, rimCenterY - 5 * pxPerMm))
  const yEnd = Math.round(Math.min(imageData.height - 3, rimCenterY + 0.5 * pxPerMm))
  let best: { y: number; score: number } | null = null

  for (let y = yStart; y <= yEnd; y += 1) {
    let hits = 0
    let darkeningTotal = 0

    for (let x = left; x <= right; x += 1) {
      const relative = (x - left) / Math.max(width - 1, 1)
      if (relative >= 0.34 && relative <= 0.68) continue

      const lensSide = pixelLuminance(imageData, x, y - 2)
      const rimSide = pixelLuminance(imageData, x, y + 2)
      const darkening = lensSide - rimSide
      if (darkening < 10) continue

      hits += 1
      darkeningTotal += darkening
    }

    if (hits < Math.max(6, Math.round(width * 0.045))) continue

    const continuity = Math.min(hits / Math.max(width * 0.13, 1), 1)
    const contrast = Math.min(darkeningTotal / Math.max(hits * 45, 1), 1)
    const nearRim = 1 - Math.min(Math.abs(y - rimCenterY) / Math.max(5 * pxPerMm, 1), 1)
    const score = continuity * 0.42 + contrast * 0.43 + nearRim * 0.15
    if (!best || score > best.score) best = { y, score }
  }

  return best?.y ?? rimCenterY - 1.8 * pxPerMm
}

function stabilizeBridgeHandlesToPupilAxis(handles: Handles, pxPerMm: number): Handles {
  const aligned = alignBridgeHandlesToPupilAxis(handles)
  const axis = unitVector(aligned.pupilR, aligned.pupilL)
  const axisValue = (point: Pt) => (point.x - aligned.pupilR.x) * axis.x + (point.y - aligned.pupilR.y) * axis.y
  const dp = Math.max(axisValue(aligned.pupilL), 1)
  const bridgeRValue = axisValue(aligned.bridgeR)
  const bridgeLValue = axisValue(aligned.bridgeL)
  const bridgeWidth = bridgeLValue - bridgeRValue

  const minBridge = 11 * pxPerMm
  const maxBridge = 28 * pxPerMm
  const bridgeIsOrdered = bridgeRValue < bridgeLValue
  const bridgeIsInsideDp = bridgeRValue > dp * 0.2 && bridgeLValue < dp * 0.82
  const bridgeHasPlausibleWidth = bridgeWidth >= minBridge && bridgeWidth <= maxBridge

  if (bridgeIsOrdered && bridgeIsInsideDp && bridgeHasPlausibleWidth) return aligned

  const fallbackWidth = clamp(Math.abs(bridgeWidth) || 18 * pxPerMm, 16 * pxPerMm, 23 * pxPerMm)
  const detectedCenter = bridgeIsOrdered ? (bridgeRValue + bridgeLValue) / 2 : dp / 2
  const center = clamp(detectedCenter, dp * 0.43, dp * 0.62)
  const bridgeR = pointOnLine(aligned.pupilR, axis, center - fallbackWidth / 2)
  const bridgeL = pointOnLine(aligned.pupilR, axis, center + fallbackWidth / 2)

  return {
    ...aligned,
    bridgeR,
    bridgeL,
  }
}

function pointOnLine(start: Pt, axis: Pt, amount: number) {
  return {
    x: start.x + axis.x * amount,
    y: start.y + axis.y * amount,
  }
}

function midpoint(a: Pt, b: Pt) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
