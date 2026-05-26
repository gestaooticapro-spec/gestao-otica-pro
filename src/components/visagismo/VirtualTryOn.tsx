'use client'

import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import { useCallback, useEffect, useId, useMemo, useRef, useState, useTransition } from 'react'
import {
  ArrowLeft,
  Bot,
  Camera,
  Clipboard,
  FlipHorizontal,
  Glasses,
  Loader2,
  Maximize2,
  MonitorUp,
  Play,
  ScanFace,
  SlidersHorizontal,
  Sparkles,
  Square,
} from 'lucide-react'
import type { GlobalVisagismoFrameTemplate } from '@/lib/actions/visagismo.actions'
import {
  generateVisagismoNarrativeAction,
  type VisagismoNarrativeOption,
  type VisagismoRecommendationNarrative,
} from '@/lib/actions/visagismo-ai.actions'
import { analyzeFaceLandmarks, type FaceAnalysisResult, type FaceShape } from '@/lib/visagismo/face-analysis'
import { recommendFramesForFace, type CustomerStyleProfile, type FrameRecommendation } from '@/lib/visagismo/frame-recommendation'

type MediaPipeModule = typeof import('@mediapipe/tasks-vision')
type FaceLandmarkerInstance = Awaited<ReturnType<MediaPipeModule['FaceLandmarker']['createFromOptions']>>
type Landmark = { x: number; y: number; z?: number }

type OverlayPose = {
  x: number
  y: number
  width: number
  angle: number
  detected: boolean
}

type FaceGuidePoint = {
  id: string
  x: number
  y: number
}

type FaceGuide = {
  points: FaceGuidePoint[]
  lines: Array<[FaceGuidePoint, FaceGuidePoint]>
  outline: string
  eyeLine: [FaceGuidePoint, FaceGuidePoint] | null
  measurements: {
    forehead: [FaceGuidePoint, FaceGuidePoint]
    cheekbones: [FaceGuidePoint, FaceGuidePoint]
    noseAxis: [FaceGuidePoint, FaceGuidePoint]
    jaw: [FaceGuidePoint, FaceGuidePoint]
    faceHeight: [FaceGuidePoint, FaceGuidePoint]
  }
}

type AnalysisPhase = 'idle' | 'forehead' | 'cheekbones' | 'nose' | 'jaw' | 'mask' | 'complete' | 'hiding'

type FrameSwap = {
  id: number
  from: GlobalVisagismoFrameTemplate | null
  to: GlobalVisagismoFrameTemplate
  pose: OverlayPose
}

type TryOnState = {
  selectedId: string
  mirror: boolean
  sizeAdjust: number
  heightAdjust: number
  strokeScale: number
  frameColor: string
  lensMode: LensMode
  skinTone: SkinTone
  customerProfile: CustomerStyleProfile
}

type SkinTone = 'light' | 'medium' | 'dark'
type LensMode = 'none' | 'crystal' | 'frost' | 'reflection'

type TryOnCommand = 'startCamera' | 'stopCamera' | 'fullscreen' | 'analyzeFace'
type TryOnAnalysisReport = {
  analysis: FaceAnalysisResult
  recommendations: FrameRecommendation[]
}

type TryOnMessage =
  | { type: 'state'; state: TryOnState }
  | { type: 'command'; command: TryOnCommand }
  | { type: 'autoSelect'; selectedId: string }
  | { type: 'narrative'; narrative: VisagismoRecommendationNarrative | null }
  | { type: 'narrativeLoading'; loading: boolean }
  | { type: 'report'; cameraOn: boolean; faceDetected: boolean; faceTooTurned: boolean; status: string; analysisReport?: TryOnAnalysisReport | null }

const RIGHT_IRIS = 468
const LEFT_IRIS = 473
const RIGHT_EYE_OUTER = 33
const RIGHT_EYE_INNER = 133
const LEFT_EYE_INNER = 362
const LEFT_EYE_OUTER = 263
const NOSE = 1
const NOSE_BRIDGE = 168
const DEFAULT_PD_MM = 63
const FRAME_COLOR_PALETTE = [
  { name: 'Preto', value: '#0f172a' },
  { name: 'Grafite', value: '#475569' },
  { name: 'Prata', value: '#cbd5e1' },
  { name: 'Dourado', value: '#c9963e' },
  { name: 'Tartaruga', value: '#7c3f1d' },
  { name: 'Marrom', value: '#5c4033' },
  { name: 'Transparente', value: '#d9f3f4' },
  { name: 'Vinho', value: '#7f1d3a' },
  { name: 'Azul', value: '#1d4ed8' },
  { name: 'Verde', value: '#166534' },
] as const
const SKIN_TONE_OPTIONS: Array<{ label: string; value: SkinTone; color: string }> = [
  { label: 'Clara', value: 'light', color: '#f3c7a8' },
  { label: 'Media', value: 'medium', color: '#b9784b' },
  { label: 'Escura', value: 'dark', color: '#5f3727' },
]
const LENS_MODE_OPTIONS: Array<{ label: string; value: LensMode }> = [
  { label: 'Sem lente', value: 'none' },
  { label: 'Cristal', value: 'crystal' },
  { label: 'Fosca', value: 'frost' },
  { label: 'Reflexo', value: 'reflection' },
]
const THINKING_STATUS_TEXTS = [
  'Cruzando formato do rosto com proporcao da armacao...',
  'Comparando linhas, peso visual e expressao...',
  'Filtrando restricoes marcadas pelo consultor...',
  'Preparando uma fala simples para apresentar ao cliente...',
] as const
const DEFAULT_CUSTOMER_PROFILE: CustomerStyleProfile = {
  style: 'none',
  expression: 'none',
  goals: [],
  avoid: [],
}
const CUSTOMER_STYLE_OPTIONS: Array<{ label: string; value: CustomerStyleProfile['style'] }> = [
  { label: 'Livre', value: 'none' },
  { label: 'Discreto', value: 'discrete' },
  { label: 'Classico', value: 'classic' },
  { label: 'Moderno', value: 'modern' },
  { label: 'Marcante', value: 'striking' },
]
const CUSTOMER_EXPRESSION_OPTIONS: Array<{ label: string; value: CustomerStyleProfile['expression'] }> = [
  { label: 'Livre', value: 'none' },
  { label: 'Masc.', value: 'masculine' },
  { label: 'Fem.', value: 'feminine' },
  { label: 'Neutro', value: 'neutral' },
]
const CUSTOMER_GOAL_OPTIONS: Array<{ label: string; value: CustomerStyleProfile['goals'][number] }> = [
  { label: 'Suavizar', value: 'soften' },
  { label: 'Estruturar', value: 'structure' },
  { label: 'Rejuvenescer', value: 'rejuvenate' },
  { label: 'Levantar', value: 'lift' },
]
const CUSTOMER_AVOID_OPTIONS: Array<{ label: string; value: CustomerStyleProfile['avoid'][number] }> = [
  { label: 'Sem gatinho', value: 'cat-eye' },
  { label: 'Sem redondo', value: 'round' },
  { label: 'Sem grande', value: 'large' },
  { label: 'Sem forte', value: 'strong' },
]
const SIMULATED_FACE_OPTIONS: Array<{ label: string; value: FaceShape }> = [
  { label: 'Redondo', value: 'round' },
  { label: 'Oval', value: 'oval' },
  { label: 'Quadrado', value: 'square' },
  { label: 'Alongado', value: 'long' },
  { label: 'Coracao', value: 'heart' },
  { label: 'Triangular', value: 'triangle' },
  { label: 'Equilibrado', value: 'balanced' },
]

interface VirtualTryOnProps {
  storeId: number
  templates: GlobalVisagismoFrameTemplate[]
  clientMode?: boolean
}

export default function VirtualTryOn({ storeId, templates, clientMode = false }: VirtualTryOnProps) {
  const channelName = `visagismo-tryon-${storeId}`
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const stageRef = useRef<HTMLElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const landmarkerRef = useRef<FaceLandmarkerInstance | null>(null)
  const animationRef = useRef<number | null>(null)
  const lastTickRef = useRef(0)
  const poseRef = useRef<OverlayPose | null>(null)
  const channelRef = useRef<BroadcastChannel | null>(null)
  const lastLandmarksRef = useRef<Landmark[] | null>(null)
  const selectedTemplateRef = useRef<GlobalVisagismoFrameTemplate | null>(null)
  const startCameraRef = useRef<() => Promise<void>>(async () => {})
  const stopCameraRef = useRef<() => void>(() => {})
  const fullscreenRef = useRef<() => Promise<void>>(async () => {})
  const analyzeFaceRef = useRef<() => void>(() => {})
  const analysisTimersRef = useRef<number[]>([])
  const frameSwapTimerRef = useRef<number | null>(null)
  const analysisPhaseRef = useRef<AnalysisPhase>('idle')
  const previousTemplateRef = useRef<GlobalVisagismoFrameTemplate | null>(null)
  const narrativeRequestKeyRef = useRef<string | null>(null)
  const mirrorRef = useRef(true)
  const sizeAdjustRef = useRef(1)
  const heightAdjustRef = useRef(0)

  const [state, setState] = useState<TryOnState>({
    selectedId: '',
    mirror: true,
    sizeAdjust: 1,
    heightAdjust: 0,
    strokeScale: 1,
    frameColor: FRAME_COLOR_PALETTE[6].value,
    lensMode: 'crystal',
    skinTone: 'medium',
    customerProfile: DEFAULT_CUSTOMER_PROFILE,
  })
  const [cameraOn, setCameraOn] = useState(false)
  const [status, setStatus] = useState(clientMode ? 'Aguardando comando da tela touch' : 'Tela cliente aguardando')
  const [faceDetected, setFaceDetected] = useState(false)
  const [faceTooTurned, setFaceTooTurned] = useState(false)
  const [analysisReport, setAnalysisReport] = useState<TryOnAnalysisReport | null>(null)
  const [analysisVisible, setAnalysisVisible] = useState(false)
  const [analysisPhase, setAnalysisPhase] = useState<AnalysisPhase>('idle')
  const [faceGuide, setFaceGuide] = useState<FaceGuide | null>(null)
  const [pose, setPose] = useState<OverlayPose | null>(null)
  const [frameSwap, setFrameSwap] = useState<FrameSwap | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [jsonCopied, setJsonCopied] = useState(false)
  const [batchJsonCopied, setBatchJsonCopied] = useState(false)
  const [narrativeCopied, setNarrativeCopied] = useState(false)
  const [aiNarrative, setAiNarrative] = useState<VisagismoRecommendationNarrative | null>(null)
  const [aiNarrativeError, setAiNarrativeError] = useState<string | null>(null)
  const [aiNarrativeLoading, setAiNarrativeLoading] = useState(false)
  const [isGeneratingNarrative, startNarrativeTransition] = useTransition()

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === state.selectedId) ?? null,
    [state.selectedId, templates],
  )
  const recommendedTemplates = useMemo(
    () => (analysisReport?.recommendations ?? [])
      .slice(0, 3)
      .map((recommendation) => templates.find((template) => template.id === recommendation.templateId))
      .filter((template): template is GlobalVisagismoFrameTemplate => Boolean(template)),
    [analysisReport, templates],
  )
  const thinkingTemplates = useMemo(() => {
    if (recommendedTemplates.length) return recommendedTemplates
    if (selectedTemplate) {
      return [
        selectedTemplate,
        ...templates.filter((template) => template.id !== selectedTemplate.id),
      ].slice(0, 5)
    }

    return templates.slice(0, 5)
  }, [recommendedTemplates, selectedTemplate, templates])

  useEffect(() => {
    const channel = new BroadcastChannel(channelName)
    channelRef.current = channel

    channel.onmessage = (event: MessageEvent<TryOnMessage>) => {
      const message = event.data
      if (!message) return

      if (clientMode) {
        if (message.type === 'state') setState(message.state)
        if (message.type === 'narrative') setAiNarrative(message.narrative)
        if (message.type === 'narrativeLoading') setAiNarrativeLoading(message.loading)
        if (message.type === 'command' && message.command === 'startCamera') void startCameraRef.current()
        if (message.type === 'command' && message.command === 'stopCamera') stopCameraRef.current()
        if (message.type === 'command' && message.command === 'fullscreen') void fullscreenRef.current()
        if (message.type === 'command' && message.command === 'analyzeFace') analyzeFaceRef.current()
        return
      }

      if (message.type === 'report') {
        setCameraOn(message.cameraOn)
        setFaceDetected(message.faceDetected)
        setFaceTooTurned(message.faceTooTurned)
        setStatus(message.status)
        if (message.analysisReport !== undefined) setAnalysisReport(message.analysisReport)
      }

      if (message.type === 'autoSelect') {
        setTryOnState({ selectedId: message.selectedId })
      }
    }

    return () => {
      channel.close()
      channelRef.current = null
    }
  }, [channelName, clientMode])

  useEffect(() => () => {
    clearAnalysisTimers()
    clearFrameSwapTimer()
    stopCameraRef.current()
  }, [])

  useEffect(() => {
    selectedTemplateRef.current = selectedTemplate
    if (!clientMode) return

    if (!selectedTemplate) {
      previousTemplateRef.current = null
      setFrameSwap(null)
      return
    }

    const previousTemplate = previousTemplateRef.current
    previousTemplateRef.current = selectedTemplate
    const currentPose = poseRef.current
    if (!currentPose?.detected || previousTemplate?.id === selectedTemplate.id) return

    clearFrameSwapTimer()
    setFrameSwap({
      id: Date.now(),
      from: previousTemplate,
      to: selectedTemplate,
      pose: currentPose,
    })
    frameSwapTimerRef.current = window.setTimeout(() => setFrameSwap(null), 950)
  }, [clientMode, selectedTemplate])

  useEffect(() => {
    mirrorRef.current = state.mirror
    sizeAdjustRef.current = state.sizeAdjust
    heightAdjustRef.current = state.heightAdjust

    if (!clientMode) {
      channelRef.current?.postMessage({ type: 'state', state } satisfies TryOnMessage)
    }
  }, [clientMode, state])

  useEffect(() => {
    if (clientMode) return
    channelRef.current?.postMessage({ type: 'narrative', narrative: aiNarrative } satisfies TryOnMessage)
  }, [aiNarrative, clientMode])

  useEffect(() => {
    if (clientMode) return
    channelRef.current?.postMessage({ type: 'narrativeLoading', loading: aiNarrativeLoading } satisfies TryOnMessage)
  }, [aiNarrativeLoading, clientMode])

  useEffect(() => {
    if (!clientMode) return

    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === stageRef.current)
    }

    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [clientMode])

  useEffect(() => {
    if (!clientMode) return
    channelRef.current?.postMessage({
      type: 'report',
      cameraOn,
      faceDetected,
      faceTooTurned,
      status,
      analysisReport,
    } satisfies TryOnMessage)
  }, [analysisReport, cameraOn, clientMode, faceDetected, faceTooTurned, status])

  function setTryOnState(patch: Partial<TryOnState>) {
    setState((current) => ({ ...current, ...patch }))
  }

  function setCustomerProfile(patch: Partial<CustomerStyleProfile>) {
    setState((current) => ({
      ...current,
      customerProfile: {
        ...current.customerProfile,
        ...patch,
      },
    }))
  }

  function toggleCustomerGoal(goal: CustomerStyleProfile['goals'][number]) {
    setState((current) => ({
      ...current,
      customerProfile: {
        ...current.customerProfile,
        goals: current.customerProfile.goals.includes(goal)
          ? current.customerProfile.goals.filter((item) => item !== goal)
          : [...current.customerProfile.goals, goal],
      },
    }))
  }

  function toggleCustomerAvoid(avoid: CustomerStyleProfile['avoid'][number]) {
    setState((current) => ({
      ...current,
      customerProfile: {
        ...current.customerProfile,
        avoid: current.customerProfile.avoid.includes(avoid)
          ? current.customerProfile.avoid.filter((item) => item !== avoid)
          : [...current.customerProfile.avoid, avoid],
      },
    }))
  }

  function sendCommand(command: TryOnCommand) {
    channelRef.current?.postMessage({ type: 'command', command } satisfies TryOnMessage)
  }

  function runFaceAnalysis() {
    sendCommand('analyzeFace')
  }

  function runSimulatedAnalysis(faceShape: FaceShape) {
    const analysis = createSimulatedFaceAnalysis(faceShape)
    const recommendations = recommendFramesForFace(analysis, templates, state.customerProfile)
    const selectedId = recommendations[0]?.templateId ?? ''
    const report = { analysis, recommendations }

    setAnalysisReport(report)
    setAiNarrative(null)
    setAiNarrativeError(null)
    setAiNarrativeLoading(false)
    narrativeRequestKeyRef.current = null
    if (selectedId) setTryOnState({ selectedId })
    setStatus(`Simulacao: ${faceShapeLabel(faceShape)}`)
  }

  async function copyRecommendationJson() {
    if (!analysisReport) return

    const diagnostic = buildRecommendationDiagnostic({
      analysisReport,
      templates,
      customerProfile: state.customerProfile,
      appearance: {
        frameColor: state.frameColor,
        lensMode: state.lensMode,
        skinTone: state.skinTone,
      },
    })
    await navigator.clipboard.writeText(JSON.stringify(diagnostic, null, 2))
    setJsonCopied(true)
    window.setTimeout(() => setJsonCopied(false), 1800)
  }

  async function copyBatchAuditJson() {
    const diagnostic = buildBatchRecommendationDiagnostic({
      templates,
      appearance: {
        frameColor: state.frameColor,
        lensMode: state.lensMode,
        skinTone: state.skinTone,
      },
    })

    await navigator.clipboard.writeText(JSON.stringify(diagnostic, null, 2))
    setBatchJsonCopied(true)
    window.setTimeout(() => setBatchJsonCopied(false), 1800)
  }

  const generateNarrative = useCallback((report = analysisReport) => {
    if (!report || isGeneratingNarrative || aiNarrativeLoading) return

    setAiNarrativeError(null)
    setAiNarrativeLoading(true)
    channelRef.current?.postMessage({ type: 'narrativeLoading', loading: true } satisfies TryOnMessage)
    startNarrativeTransition(async () => {
      try {
        const result = await generateVisagismoNarrativeAction({
          analysis: report.analysis,
          recommendations: report.recommendations,
          templates,
          customerProfile: state.customerProfile,
          appearance: {
            frameColor: state.frameColor,
            lensMode: state.lensMode,
            skinTone: state.skinTone,
          },
        })

        if (result.success && result.narrative) {
          setAiNarrative(result.narrative)
          setAiNarrativeError(null)
          return
        }

        setAiNarrative(null)
        setAiNarrativeError(result.error ?? 'Nao foi possivel gerar o texto da indicacao')
      } finally {
        setAiNarrativeLoading(false)
        channelRef.current?.postMessage({ type: 'narrativeLoading', loading: false } satisfies TryOnMessage)
      }
    })
  }, [
    aiNarrativeLoading,
    analysisReport,
    isGeneratingNarrative,
    startNarrativeTransition,
    state.customerProfile,
    state.frameColor,
    state.lensMode,
    state.skinTone,
    templates,
  ])

  useEffect(() => {
    if (clientMode || !analysisReport) return

    const key = buildNarrativeRequestKey(analysisReport, state.customerProfile)
    if (narrativeRequestKeyRef.current === key) return

    narrativeRequestKeyRef.current = key
    generateNarrative(analysisReport)
  }, [analysisReport, clientMode, generateNarrative, state.customerProfile])

  async function copyNarrativeText() {
    if (!aiNarrative) return

    await navigator.clipboard.writeText(formatNarrativeForClipboard(aiNarrative))
    setNarrativeCopied(true)
    window.setTimeout(() => setNarrativeCopied(false), 1800)
  }

  function startTryOnCamera() {
    const nextState = { ...state, selectedId: '' }
    setAnalysisReport(null)
    setAiNarrative(null)
    setAiNarrativeError(null)
    setAiNarrativeLoading(false)
    narrativeRequestKeyRef.current = null
    setAnalysisPhase('idle')
    setState(nextState)
    channelRef.current?.postMessage({ type: 'state', state: nextState } satisfies TryOnMessage)
    sendCommand('startCamera')
  }

  function openClientScreen() {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    url.searchParams.set('client', '1')
    window.open(url.toString(), 'visagismo-client-screen', 'popup=yes,width=1366,height=768')
    window.setTimeout(() => {
      channelRef.current?.postMessage({ type: 'state', state } satisfies TryOnMessage)
      channelRef.current?.postMessage({ type: 'narrative', narrative: aiNarrative } satisfies TryOnMessage)
      channelRef.current?.postMessage({ type: 'narrativeLoading', loading: aiNarrativeLoading } satisfies TryOnMessage)
    }, 700)
  }

  async function ensureLandmarker() {
    if (landmarkerRef.current) return landmarkerRef.current

    setStatus('Carregando modelo facial...')
    try {
      const vision = (await import('@mediapipe/tasks-vision')) as MediaPipeModule
      const wasm = await vision.FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm',
      )

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

      setStatus('Modelo pronto')
      return landmarkerRef.current
    } finally {
      setStatus((current) => current === 'Carregando modelo facial...' ? 'Modelo pronto' : current)
    }
  }

  async function startCamera() {
    if (cameraOn) return

    try {
      setAnalysisVisible(false)
      setAnalysisReport(null)
      setAnalysisPhase('idle')
      const landmarker = await ensureLandmarker()
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 30 },
        },
      })

      streamRef.current = stream
      const video = videoRef.current
      if (video) {
        video.srcObject = stream
        await video.play()
      }

      setCameraOn(true)
      setStatus('Procurando rosto...')
      loop(landmarker)
    } catch {
      setStatus('Nao foi possivel acessar a camera')
      stopCamera()
    }
  }

  function stopCamera() {
    if (animationRef.current) cancelAnimationFrame(animationRef.current)
    animationRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraOn(false)
    setPose(null)
    setFaceGuide(null)
    setFrameSwap(null)
    setAnalysisVisible(false)
    setAnalysisReport(null)
    setAiNarrative(null)
    setAiNarrativeError(null)
    setAiNarrativeLoading(false)
    narrativeRequestKeyRef.current = null
    setAnalysisPhase('idle')
    setFaceDetected(false)
    setFaceTooTurned(false)
    poseRef.current = null
    previousTemplateRef.current = null
    analysisPhaseRef.current = 'idle'
    clearAnalysisTimers()
    clearFrameSwapTimer()
    if (clientMode) setStatus('Aguardando comando da tela touch')
  }

  async function toggleFullscreen() {
    const stage = stageRef.current
    if (!stage) return

    if (document.fullscreenElement === stage) {
      await document.exitFullscreen()
      return
    }

    await stage.requestFullscreen()
  }

  function loop(landmarker: FaceLandmarkerInstance) {
    const video = videoRef.current
    if (!video || video.readyState < 2) {
      animationRef.current = requestAnimationFrame(() => loop(landmarker))
      return
    }

    const now = performance.now()
    if (now - lastTickRef.current < 33) {
      animationRef.current = requestAnimationFrame(() => loop(landmarker))
      return
    }
    lastTickRef.current = now

    const result = landmarker.detectForVideo(video, now)
    const landmarks = result.faceLandmarks?.[0] as Landmark[] | undefined
    lastLandmarksRef.current = landmarks ?? null
    const nextGuide = landmarks ? computeFaceGuide(landmarks, video, mirrorRef.current) : null
    const nextPose = landmarks && selectedTemplateRef.current
      ? computeOverlayPose(
          landmarks,
          video,
          selectedTemplateRef.current,
          mirrorRef.current,
          sizeAdjustRef.current,
          heightAdjustRef.current,
        )
      : null

    if (landmarks) {
      const yaw = computeFaceYaw(landmarks, video, mirrorRef.current)
      const turned = Math.abs(yaw) > 0.32
      setFaceGuide(nextGuide)
      setFaceDetected(true)
      setFaceTooTurned(turned)
      if (analysisPhaseRef.current === 'idle') {
        setStatus(turned ? 'Rosto virado: volte um pouco de frente' : 'Rosto detectado')
      }

      if (nextPose) {
        const smoothed = smoothPose(poseRef.current, nextPose)
        poseRef.current = smoothed
        setPose(smoothed)
      } else {
        poseRef.current = null
        setPose(null)
      }
    } else {
      setPose((current) => current ? { ...current, detected: false } : null)
      setFaceGuide(null)
      setFaceDetected(false)
      setFaceTooTurned(false)
      setStatus('Procurando rosto...')
    }

    animationRef.current = requestAnimationFrame(() => loop(landmarker))
  }

  function analyzeCurrentFace() {
    const landmarks = lastLandmarksRef.current
    if (!landmarks) {
      setStatus('Rosto ainda nao detectado para analise')
      return
    }

    clearAnalysisTimers()
    setAnalysisVisible(true)
    setAnalysisReport(null)
    setAiNarrative(null)
    setAiNarrativeError(null)
    setAiNarrativeLoading(false)
    narrativeRequestKeyRef.current = null
    setAnalysisPhase('forehead')
    analysisPhaseRef.current = 'forehead'
    setState((current) => ({ ...current, selectedId: '' }))
    setStatus('Medindo largura das temporas...')

    const analysis = analyzeFaceLandmarks(landmarks)
    if (!analysis) {
      setStatus('Nao foi possivel calcular a analise facial')
      return
    }

    const recommendations = recommendFramesForFace(analysis, templates, state.customerProfile)
    const report = { analysis, recommendations }
    const selectedId = recommendations[0]?.templateId

    queueAnalysisTimer(() => {
      setAnalysisPhase('cheekbones')
      analysisPhaseRef.current = 'cheekbones'
      setStatus('Medindo regiao dos olhos...')
    }, 900)

    queueAnalysisTimer(() => {
      setAnalysisPhase('nose')
      analysisPhaseRef.current = 'nose'
      setStatus('Localizando eixo central do rosto...')
    }, 1800)

    queueAnalysisTimer(() => {
      setAnalysisPhase('jaw')
      analysisPhaseRef.current = 'jaw'
      setStatus('Medindo mandibula e queixo...')
    }, 2700)

    queueAnalysisTimer(() => {
      setAnalysisPhase('mask')
      analysisPhaseRef.current = 'mask'
      setStatus('Montando mascara facial...')
    }, 3600)

    queueAnalysisTimer(() => {
      setAnalysisReport(report)
      setAnalysisPhase('complete')
      analysisPhaseRef.current = 'complete'
      setStatus(`Analise pronta: ${faceShapeLabel(analysis.faceShape)}`)
    }, 4700)

    queueAnalysisTimer(() => {
      setAnalysisPhase('hiding')
      analysisPhaseRef.current = 'hiding'
      setStatus(selectedId ? 'Carregando armacao sugerida...' : 'Analise pronta')
    }, 8200)

    queueAnalysisTimer(() => {
      if (selectedId) {
        setState((current) => ({ ...current, selectedId }))
        channelRef.current?.postMessage({ type: 'autoSelect', selectedId } satisfies TryOnMessage)
      }
      setAnalysisVisible(false)
      setAnalysisPhase('idle')
      analysisPhaseRef.current = 'idle'
      setStatus(selectedId ? 'Armacao sugerida carregada' : 'Rosto detectado')
    }, 8750)
  }

  function queueAnalysisTimer(callback: () => void, delay: number) {
    const id = window.setTimeout(callback, delay)
    analysisTimersRef.current.push(id)
  }

  function clearAnalysisTimers() {
    analysisTimersRef.current.forEach((id) => window.clearTimeout(id))
    analysisTimersRef.current = []
  }

  function clearFrameSwapTimer() {
    if (frameSwapTimerRef.current) window.clearTimeout(frameSwapTimerRef.current)
    frameSwapTimerRef.current = null
  }

  startCameraRef.current = startCamera
  stopCameraRef.current = stopCamera
  fullscreenRef.current = toggleFullscreen
  analyzeFaceRef.current = analyzeCurrentFace

  const canRenderFrame = !!selectedTemplate && !!pose && pose.detected && !faceTooTurned
  const canRenderAnalysis = analysisVisible && !!faceGuide && faceDetected
  const clientNarrativeOption = aiNarrative?.options.find((option) => option.templateId === state.selectedId) ?? null

  if (clientMode) {
    return (
      <div className="h-screen w-screen overflow-hidden bg-black text-slate-100">
        <section ref={stageRef} className="relative h-screen w-screen overflow-hidden bg-black">
          <video
            ref={videoRef}
            className={`absolute inset-0 h-full w-full object-contain ${state.mirror ? '-scale-x-100' : ''}`}
            autoPlay
            muted
            playsInline
          />

          {!cameraOn && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-950">
              <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-cyan-400/30 bg-cyan-400/10">
                <Camera className="h-7 w-7 text-cyan-200" />
              </div>
              <p className="text-sm font-bold text-slate-300">Aguardando comando da tela touch.</p>
            </div>
          )}

          {canRenderFrame && selectedTemplate && !frameSwap && (
            <div
              className="pointer-events-none absolute left-0 top-0"
              style={{
                width: pose.width,
                height: pose.width * (selectedTemplate.viewBox.height / selectedTemplate.viewBox.width),
                transform: `translate(${pose.x}px, ${pose.y}px) translate(-50%, -50%) rotate(${pose.angle}rad)`,
              }}
            >
              <TryOnFrameSvg
                template={selectedTemplate}
                strokeScale={state.strokeScale}
                color={state.frameColor}
                lensMode={state.lensMode}
              />
            </div>
          )}

          {frameSwap && !faceTooTurned && (
            <FrameSwapAnimation
              swap={frameSwap}
              strokeScale={state.strokeScale}
              color={state.frameColor}
              lensMode={state.lensMode}
            />
          )}

          {canRenderAnalysis && faceGuide && (
            <FaceAnalysisOverlay guide={faceGuide} phase={analysisPhase} />
          )}

          {recommendedTemplates.length > 0 && (
            <ClientFrameStack
              templates={recommendedTemplates}
              selectedId={state.selectedId}
              color={state.frameColor}
              lensMode={state.lensMode}
            />
          )}

          {aiNarrativeLoading && thinkingTemplates.length > 0 && (
            <ClientThinkingCarousel
              templates={thinkingTemplates}
              color={state.frameColor}
              lensMode={state.lensMode}
            />
          )}

          {clientNarrativeOption && (
            <ClientNarrativeOverlay
              key={`${clientNarrativeOption.templateId}-${clientNarrativeOption.headline}-${clientNarrativeOption.explanation}`}
              option={clientNarrativeOption}
            />
          )}

          <div className={`absolute left-4 top-4 rounded-lg border px-3 py-2 text-xs font-black uppercase tracking-[0.12em] ${
            faceTooTurned
              ? 'border-amber-400/40 bg-amber-500/15 text-amber-200'
              : faceDetected
                ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
                : 'border-white/10 bg-white/10 text-slate-300'
          }`}>
            {status}
          </div>

          <button
            type="button"
            onClick={toggleFullscreen}
            className="absolute right-4 top-4 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-black/45 px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-slate-100 backdrop-blur transition-colors hover:bg-black/65"
          >
            <Maximize2 className="h-4 w-4" />
            {isFullscreen ? 'Sair' : 'Tela cheia'}
          </button>
        </section>
      </div>
    )
  }

  return (
    <div className="min-h-[calc(100vh-64px)] bg-slate-950 text-slate-100">
      <div className="border-b border-white/10 bg-slate-950/95">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href={`/dashboard/loja/${storeId}/visagismo`}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
              title="Voltar"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">
                <Glasses className="h-3.5 w-3.5" />
                Visagismo
              </div>
              <h1 className="mt-1 text-xl font-black tracking-tight text-white">Comando da prova virtual</h1>
            </div>
          </div>

          <button
            type="button"
            onClick={openClientScreen}
            className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-3 py-2 text-xs font-black uppercase text-slate-950 transition-colors hover:bg-cyan-400"
          >
            <MonitorUp className="h-4 w-4" />
            Abrir tela cliente
          </button>
        </div>
      </div>

      <main className="mx-auto grid max-w-7xl gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[1fr_340px]">
        <section className="rounded-lg border border-white/10 bg-white/[0.04] p-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatusCard label="Camera" value={cameraOn ? 'ativa' : 'desligada'} tone={cameraOn ? 'good' : 'idle'} />
            <StatusCard label="Rosto" value={faceDetected ? 'detectado' : 'aguardando'} tone={faceDetected ? 'good' : 'idle'} />
            <StatusCard label="Posicao" value={faceTooTurned ? 'virado' : faceDetected ? 'frontal' : '-'} tone={faceTooTurned ? 'warn' : 'idle'} />
          </div>

          <div className="mt-6 rounded-lg border border-white/10 bg-slate-950/50 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">Status da tela cliente</p>
            <p className="mt-2 text-sm font-bold text-slate-200">{status}</p>
          </div>

          <div className="mt-6 rounded-lg border border-white/10 bg-slate-950/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">Perfil do cliente</p>
                <p className="mt-1 text-xs text-slate-500">Toques rapidos enquanto conversa com o cliente.</p>
              </div>
              <button
                type="button"
                onClick={() => setTryOnState({ customerProfile: DEFAULT_CUSTOMER_PROFILE })}
                className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] font-black uppercase text-slate-400 transition-colors hover:bg-white/10 hover:text-slate-200"
              >
                Limpar perfil
              </button>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <ButtonGroup label="Estilo desejado">
                {CUSTOMER_STYLE_OPTIONS.map((option) => (
                  <ProfileButton
                    key={option.value}
                    selected={state.customerProfile.style === option.value}
                    onClick={() => setCustomerProfile({ style: option.value })}
                  >
                    {option.label}
                  </ProfileButton>
                ))}
              </ButtonGroup>

              <ButtonGroup label="Preferencia visual">
                {CUSTOMER_EXPRESSION_OPTIONS.map((option) => (
                  <ProfileButton
                    key={option.value}
                    selected={state.customerProfile.expression === option.value}
                    onClick={() => setCustomerProfile({ expression: option.value })}
                  >
                    {option.label}
                  </ProfileButton>
                ))}
              </ButtonGroup>

              <ButtonGroup label="Objetivo">
                {CUSTOMER_GOAL_OPTIONS.map((option) => (
                  <ProfileButton
                    key={option.value}
                    selected={state.customerProfile.goals.includes(option.value)}
                    onClick={() => toggleCustomerGoal(option.value)}
                  >
                    {option.label}
                  </ProfileButton>
                ))}
              </ButtonGroup>

              <ButtonGroup label="Restricoes">
                {CUSTOMER_AVOID_OPTIONS.map((option) => (
                  <ProfileButton
                    key={option.value}
                    selected={state.customerProfile.avoid.includes(option.value)}
                    onClick={() => toggleCustomerAvoid(option.value)}
                    tone="warn"
                  >
                    {option.label}
                  </ProfileButton>
                ))}
              </ButtonGroup>
            </div>
          </div>

          <div className="mt-6 rounded-lg border border-white/10 bg-slate-950/50 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">Simular indicacao</p>
            <p className="mt-1 text-xs text-slate-500">
              Teste o motor sem camera usando o perfil do cliente marcado acima.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {SIMULATED_FACE_OPTIONS.map((option) => (
                <ProfileButton
                  key={option.value}
                  selected={analysisReport?.analysis.faceShape === option.value && !faceDetected}
                  onClick={() => runSimulatedAnalysis(option.value)}
                >
                  {option.label}
                </ProfileButton>
              ))}
            </div>
            <button
              type="button"
              onClick={copyBatchAuditJson}
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] font-black uppercase text-slate-300 transition-colors hover:bg-white/10"
            >
              <Clipboard className="h-3.5 w-3.5" />
              {batchJsonCopied ? 'Lote copiado' : 'Copiar lote para IA'}
            </button>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <button
              type="button"
              onClick={startTryOnCamera}
              disabled={templates.length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-500 px-4 py-3 text-xs font-black uppercase text-slate-950 transition-colors hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Play className="h-4 w-4" />
              Iniciar camera
            </button>
            <button
              type="button"
              onClick={() => sendCommand('stopCamera')}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-xs font-black uppercase text-slate-300 transition-colors hover:bg-white/10"
            >
              <Square className="h-4 w-4" />
              Parar camera
            </button>
            <button
              type="button"
              onClick={() => sendCommand('fullscreen')}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-xs font-black uppercase text-slate-300 transition-colors hover:bg-white/10"
            >
              <Maximize2 className="h-4 w-4" />
              Tela cheia
            </button>
            <button
              type="button"
              onClick={runFaceAnalysis}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-4 py-3 text-xs font-black uppercase text-cyan-100 transition-colors hover:bg-cyan-500/20"
            >
              <ScanFace className="h-4 w-4" />
              Analisar rosto
            </button>
          </div>

          {analysisReport && (
            <div className="mt-6 rounded-lg border border-white/10 bg-slate-950/50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">Analise facial</p>
                  <p className="mt-1 text-sm font-bold text-slate-200">
                    Formato estimado: {faceShapeLabel(analysisReport.analysis.faceShape)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={copyRecommendationJson}
                    className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] font-black uppercase text-slate-300 transition-colors hover:bg-white/10"
                  >
                    <Clipboard className="h-3.5 w-3.5" />
                    {jsonCopied ? 'Copiado' : 'Copiar JSON'}
                  </button>
                  <span className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 font-mono text-xs font-bold text-slate-300">
                    {Math.round(analysisReport.analysis.confidence * 100)}%
                  </span>
                </div>
              </div>

              <div className="mt-4 grid gap-2">
                {analysisReport.recommendations.map((recommendation, index) => (
                  <button
                    key={recommendation.templateId}
                    type="button"
                    onClick={() => setTryOnState({ selectedId: recommendation.templateId })}
                    className={`rounded-lg border p-3 text-left transition-colors ${
                      index === 0
                        ? 'border-cyan-400/60 bg-cyan-400/10'
                        : 'border-white/10 bg-white/[0.03] hover:bg-white/10'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-black text-white">
                        {index + 1}. {recommendation.name}
                      </p>
                      <span className="font-mono text-xs font-black text-cyan-200">{recommendation.score}</span>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-slate-400">
                      {recommendation.reasons.join(' | ')}
                    </p>
                  </button>
                ))}
              </div>

              <div className="mt-4 rounded-lg border border-cyan-400/20 bg-cyan-400/[0.04] p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">
                      <Bot className="h-3.5 w-3.5" />
                      Texto para apresentar
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-400">
                      A IA transforma a decisao do motor em uma fala para o atendimento.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {aiNarrative && (
                      <button
                        type="button"
                        onClick={copyNarrativeText}
                        className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] font-black uppercase text-slate-300 transition-colors hover:bg-white/10"
                      >
                        <Clipboard className="h-3.5 w-3.5" />
                        {narrativeCopied ? 'Copiado' : 'Copiar texto'}
                      </button>
                    )}
                      <button
                        type="button"
                        onClick={() => {
                          if (analysisReport) {
                            narrativeRequestKeyRef.current = null
                            generateNarrative(analysisReport)
                          }
                        }}
                        disabled={isGeneratingNarrative}
                      className="inline-flex items-center gap-2 rounded-lg border border-cyan-300/30 bg-cyan-400/10 px-3 py-2 text-[10px] font-black uppercase text-cyan-100 transition-colors hover:bg-cyan-400/20 disabled:cursor-wait disabled:opacity-60"
                    >
                      {isGeneratingNarrative ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      {isGeneratingNarrative ? 'Gerando' : 'Gerar texto'}
                    </button>
                  </div>
                </div>

                {aiNarrativeError && (
                  <p className="mt-3 rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-100">
                    {aiNarrativeError}
                  </p>
                )}

                {aiNarrative && (
                  <div className="mt-3 space-y-3">
                    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                      <p className="text-sm font-bold leading-6 text-slate-100">{aiNarrative.sellerOpening}</p>
                      <p className="mt-2 text-xs leading-5 text-slate-400">{aiNarrative.customerSummary}</p>
                    </div>

                    <div className="grid gap-2">
                      {aiNarrative.options.map((option, index) => (
                        <div key={option.templateId} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-black text-white">
                              {index + 1}. {option.name}
                            </p>
                            <span className="text-[10px] font-black uppercase text-cyan-200">{option.headline}</span>
                          </div>
                          <p className="mt-2 text-xs leading-5 text-slate-300">{option.explanation}</p>
                          <p className="mt-2 text-xs leading-5 text-slate-500">{option.sellerTip}</p>
                          {option.caveat && (
                            <p className="mt-2 text-xs leading-5 text-amber-100/80">{option.caveat}</p>
                          )}
                        </div>
                      ))}
                    </div>

                    <p className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs font-bold leading-5 text-slate-300">
                      {aiNarrative.closingLine}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        <aside className="space-y-3">
          <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
            <h2 className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Ajustes
            </h2>
            <label className="block text-[10px] font-black uppercase text-slate-500">Formato</label>
            <select
              value={state.selectedId}
              onChange={(event) => setTryOnState({ selectedId: event.target.value })}
              className="mt-1 h-10 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-xs font-bold text-slate-100 outline-none focus:border-cyan-400/60"
            >
              <option value="">Sem armacao</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>{template.name}</option>
              ))}
            </select>

            <Range label="Tamanho" value={state.sizeAdjust} min={0.78} max={1.28} step={0.01} onChange={(value) => setTryOnState({ sizeAdjust: value })} />
            <Range label="Altura" value={state.heightAdjust} min={-40} max={40} step={1} onChange={(value) => setTryOnState({ heightAdjust: value })} />
            <Range label="Linha" value={state.strokeScale} min={0.65} max={1.6} step={0.05} onChange={(value) => setTryOnState({ strokeScale: value })} />

            <div className="mt-4">
              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Lente</p>
              <div className="grid grid-cols-2 gap-2">
                {LENS_MODE_OPTIONS.map((mode) => (
                  <button
                    key={mode.value}
                    type="button"
                    onClick={() => setTryOnState({ lensMode: mode.value })}
                    className={`rounded-lg border px-2 py-2 text-[10px] font-black uppercase transition-colors ${
                      state.lensMode === mode.value
                        ? 'border-cyan-300 bg-cyan-400/10 text-cyan-100'
                        : 'border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Cor da armacao</p>
              <div className="grid grid-cols-5 gap-2">
                {FRAME_COLOR_PALETTE.map((color) => (
                  <button
                    key={color.value}
                    type="button"
                    onClick={() => setTryOnState({ frameColor: color.value })}
                    title={color.name}
                    className={`h-9 rounded-lg border transition-all ${
                      state.frameColor === color.value
                        ? 'border-cyan-300 ring-2 ring-cyan-300/30'
                        : 'border-white/10 hover:border-white/30'
                    }`}
                    style={{ backgroundColor: color.value }}
                  />
                ))}
              </div>
            </div>

            <div className="mt-4">
              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Pele</p>
              <div className="grid grid-cols-3 gap-2">
                {SKIN_TONE_OPTIONS.map((tone) => (
                  <button
                    key={tone.value}
                    type="button"
                    onClick={() => setTryOnState({ skinTone: tone.value })}
                    className={`flex items-center justify-center gap-2 rounded-lg border px-2 py-2 text-[10px] font-black uppercase transition-colors ${
                      state.skinTone === tone.value
                        ? 'border-cyan-300 bg-cyan-400/10 text-cyan-100'
                        : 'border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    <span className="h-3 w-3 rounded-full border border-white/20" style={{ backgroundColor: tone.color }} />
                    {tone.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setTryOnState({ mirror: !state.mirror })}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-bold text-slate-300 transition-colors hover:bg-white/10"
            >
              <FlipHorizontal className="h-4 w-4" />
              {state.mirror ? 'Camera espelhada' : 'Camera normal'}
            </button>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
            <h2 className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Formatos</h2>
            <div className="grid gap-2">
              {templates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => setTryOnState({ selectedId: template.id })}
                  className={`rounded-lg border p-2 transition-colors ${
                    state.selectedId === template.id
                      ? 'border-cyan-400/60 bg-cyan-400/10'
                      : 'border-white/10 bg-white/[0.03] hover:bg-white/10'
                  }`}
                >
                  <TryOnFrameSvg
                    template={template}
                    strokeScale={0.85}
                    color={state.frameColor}
                    lensMode={state.lensMode}
                    className="h-14 w-full text-slate-100"
                  />
                  <p className="mt-1 text-left text-xs font-bold text-slate-200">{template.name}</p>
                </button>
              ))}
            </div>
          </div>
        </aside>
      </main>
    </div>
  )
}

function StatusCard({ label, value, tone }: { label: string; value: string; tone: 'good' | 'warn' | 'idle' }) {
  const toneClass = tone === 'good'
    ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200'
    : tone === 'warn'
      ? 'border-amber-400/20 bg-amber-500/10 text-amber-200'
      : 'border-white/10 bg-white/[0.03] text-slate-300'

  return (
    <div className={`rounded-lg border p-4 ${toneClass}`}>
      <p className="text-[10px] font-black uppercase tracking-[0.18em] opacity-70">{label}</p>
      <p className="mt-2 text-lg font-black uppercase">{value}</p>
    </div>
  )
}

function ButtonGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )
}

function ProfileButton({
  selected,
  onClick,
  children,
  tone = 'default',
}: {
  selected: boolean
  onClick: () => void
  children: ReactNode
  tone?: 'default' | 'warn'
}) {
  const selectedClass = tone === 'warn'
    ? 'border-amber-300/70 bg-amber-400/10 text-amber-100'
    : 'border-cyan-300/70 bg-cyan-400/10 text-cyan-100'

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-3 py-2 text-xs font-black uppercase transition-colors ${
        selected
          ? selectedClass
          : 'border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/10 hover:text-slate-200'
      }`}
    >
      {children}
    </button>
  )
}

function ClientFrameStack({
  templates,
  selectedId,
  color,
  lensMode,
}: {
  templates: GlobalVisagismoFrameTemplate[]
  selectedId: string
  color: string
  lensMode: LensMode
}) {
  return (
    <div className="pointer-events-none absolute right-6 top-20 z-30 h-32 w-52">
      {templates.map((template, index) => {
        const active = template.id === selectedId
        return (
          <div
            key={template.id}
            className={`absolute h-24 w-40 rounded-lg border bg-slate-950/58 p-2 shadow-2xl backdrop-blur transition-all duration-500 ${
              active ? 'border-cyan-300/80 text-cyan-50' : 'border-white/20 text-slate-200'
            }`}
            style={{
              right: index * 18,
              bottom: index * 14,
              zIndex: active ? 20 : 10 - index,
              opacity: active ? 0.95 : 0.76,
              transform: `scale(${active ? 1 : 0.88})`,
            }}
          >
            <TryOnFrameSvg
              template={template}
              strokeScale={0.82}
              color={color}
              lensMode={lensMode}
              className="h-full w-full drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]"
            />
          </div>
        )
      })}
    </div>
  )
}

function ClientThinkingCarousel({
  templates,
  color,
  lensMode,
}: {
  templates: GlobalVisagismoFrameTemplate[]
  color: string
  lensMode: LensMode
}) {
  const statusIndex = useCyclingIndex(THINKING_STATUS_TEXTS.length, 1700)
  const carouselItems = [...templates, ...templates, ...templates]

  return (
    <div className="pointer-events-none absolute bottom-[22vh] left-8 top-24 z-20 flex w-64 flex-col justify-center">
      <div className="rounded-lg border border-cyan-300/20 bg-black/45 p-4 shadow-2xl backdrop-blur-md">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-200">
          analisando estilo
        </p>
        <p className="mt-2 min-h-[2.5rem] text-sm font-bold leading-5 text-slate-100">
          {THINKING_STATUS_TEXTS[statusIndex]}
        </p>

        <div
          className="relative mt-4 h-80 overflow-hidden"
          style={{
            WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 18%, black 52%, transparent 92%)',
            maskImage: 'linear-gradient(to bottom, transparent, black 18%, black 52%, transparent 92%)',
          }}
        >
          <div className="visagismo-thinking-carousel absolute inset-x-0 top-0 space-y-4">
            {carouselItems.map((template, index) => (
              <div
                key={`${template.id}-${index}`}
                className="mx-auto flex h-24 w-48 items-center justify-center rounded-lg border border-white/10 bg-slate-950/65 p-2 shadow-xl"
              >
                <TryOnFrameSvg
                  template={template}
                  strokeScale={0.9}
                  color={color}
                  lensMode={lensMode}
                  className="h-full w-full drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      <style jsx global>{`
        .visagismo-thinking-carousel {
          animation: visagismo-thinking-carousel 5.4s linear infinite;
        }

        @keyframes visagismo-thinking-carousel {
          0% {
            transform: translateY(0);
          }
          100% {
            transform: translateY(-50%);
          }
        }
      `}</style>
    </div>
  )
}

function useCyclingIndex(length: number, intervalMs: number) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (length <= 1) return
    const id = window.setInterval(() => {
      setIndex((current) => (current + 1) % length)
    }, intervalMs)

    return () => window.clearInterval(id)
  }, [intervalMs, length])

  return index
}

function ClientNarrativeOverlay({ option }: { option: VisagismoNarrativeOption }) {
  const text = option.explanation || option.headline
  const typedText = useTypewriter(text, 28)

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[8vh] z-20 flex justify-center px-6">
      <div className="max-w-4xl rounded-lg border border-white/10 bg-black/55 px-7 py-5 text-center shadow-2xl backdrop-blur-md">
        <p className="text-[11px] font-black uppercase tracking-[0.24em] text-cyan-200">
          {option.headline}
        </p>
        <h2 className="mt-2 text-4xl font-black tracking-tight text-white md:text-6xl">
          {option.name}
        </h2>
        <p className="mt-3 min-h-[2.5rem] text-2xl font-bold leading-snug text-slate-100 md:text-3xl">
          {typedText}
          <span className="ml-1 inline-block h-7 w-0.5 translate-y-1 animate-pulse bg-cyan-200" />
        </p>
      </div>
    </div>
  )
}

function useTypewriter(text: string, speedMs: number) {
  const [value, setValue] = useState('')

  useEffect(() => {
    if (!text) return

    let index = 0
    const id = window.setInterval(() => {
      index += 1
      setValue(text.slice(0, index))
      if (index >= text.length) window.clearInterval(id)
    }, speedMs)

    return () => window.clearInterval(id)
  }, [speedMs, text])

  return value
}

function FrameSwapAnimation({
  swap,
  strokeScale,
  color,
  lensMode,
}: {
  swap: FrameSwap
  strokeScale: number
  color: string
  lensMode: LensMode
}) {
  const height = swap.pose.width * (swap.to.viewBox.height / swap.to.viewBox.width)
  const targetX = swap.pose.x - swap.pose.width / 2
  const targetY = swap.pose.y - height / 2

  return (
    <div className="pointer-events-none absolute inset-0">
      {swap.from && (
        <div
          key={`out-${swap.id}`}
          className="absolute left-0 top-0 visagismo-frame-out"
          style={{
            width: swap.pose.width,
            height,
            '--target-x': `${targetX}px`,
            '--target-y': `${targetY}px`,
            '--target-rotate': `${swap.pose.angle}rad`,
          } as CSSProperties}
        >
          <TryOnFrameSvg template={swap.from} strokeScale={strokeScale} color={color} lensMode={lensMode} />
        </div>
      )}
      <div
        key={`in-${swap.id}`}
        className="absolute left-0 top-0 visagismo-frame-in"
        style={{
          width: swap.pose.width,
          height,
          '--target-x': `${targetX}px`,
          '--target-y': `${targetY}px`,
          '--target-rotate': `${swap.pose.angle}rad`,
        } as CSSProperties}
      >
        <TryOnFrameSvg template={swap.to} strokeScale={strokeScale} color={color} lensMode={lensMode} />
      </div>

      <style jsx global>{`
        .visagismo-frame-in {
          animation: visagismo-frame-in 0.82s cubic-bezier(0.2, 0.78, 0.22, 1) forwards;
          transform-origin: center;
        }

        .visagismo-frame-out {
          animation: visagismo-frame-out 0.82s cubic-bezier(0.55, 0.04, 0.3, 1) forwards;
          transform-origin: center;
        }

        @keyframes visagismo-frame-in {
          0% {
            opacity: 0.2;
            transform: translate(calc(100vw - 230px), calc(100vh - 145px)) scale(0.36) rotate(0rad);
          }
          62% {
            opacity: 1;
          }
          100% {
            opacity: 1;
            transform: translate(var(--target-x), var(--target-y)) rotate(var(--target-rotate));
          }
        }

        @keyframes visagismo-frame-out {
          0% {
            opacity: 1;
            transform: translate(var(--target-x), var(--target-y)) rotate(var(--target-rotate));
          }
          100% {
            opacity: 0.22;
            transform: translate(calc(100vw - 230px), calc(100vh - 145px)) scale(0.36) rotate(0rad);
          }
        }
      `}</style>
    </div>
  )
}

function FaceAnalysisOverlay({ guide, phase }: { guide: FaceGuide; phase: AnalysisPhase }) {
  const complete = phase === 'complete' || phase === 'mask'
  const hiding = phase === 'hiding'
  const activeMeasurement = getActiveMeasurement(guide, phase)
  const completedMeasurements = getCompletedMeasurements(guide, phase)
  const showMask = phase === 'mask' || phase === 'complete' || phase === 'hiding'

  return (
    <svg
      className={`pointer-events-none absolute inset-0 h-full w-full transition-opacity duration-500 ${
        hiding ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <defs>
        <filter id="visagismo-face-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {showMask && guide.outline && (
        <polygon
          points={guide.outline}
          fill="rgba(34,211,238,0.06)"
          stroke="rgba(103,232,249,0.72)"
          strokeWidth="1.4"
          pathLength={1}
          strokeDasharray="1"
          strokeDashoffset={phase === 'mask' ? 1 : 0}
          className={phase === 'mask' ? 'visagismo-draw-line' : ''}
          filter="url(#visagismo-face-glow)"
        />
      )}

      {completedMeasurements.map(([from, to]) => (
        <line
          key={`${from.id}-${to.id}`}
          x1={from.x}
          y1={from.y}
          x2={to.x}
          y2={to.y}
          stroke="rgba(125,211,252,0.42)"
          strokeWidth="1.2"
          strokeDasharray="7 7"
        />
      ))}

      {activeMeasurement && (
        <MeasurementLine from={activeMeasurement[0]} to={activeMeasurement[1]} label={activeMeasurement[2]} />
      )}

      {showMask && guide.lines.map(([from, to]) => (
        <line
          key={`mask-${from.id}-${to.id}`}
          x1={from.x}
          y1={from.y}
          x2={to.x}
          y2={to.y}
          stroke="rgba(125,211,252,0.48)"
          strokeWidth="1"
          strokeDasharray="8 8"
        />
      ))}

      {showMask && guide.eyeLine && (
        <line
          x1={guide.eyeLine[0].x}
          y1={guide.eyeLine[0].y}
          x2={guide.eyeLine[1].x}
          y2={guide.eyeLine[1].y}
          stroke="rgba(45,212,191,0.75)"
          strokeWidth="1.6"
        />
      )}

      {(showMask ? guide.points : getPhasePoints(guide, phase)).map((point) => (
        <g key={point.id}>
          <circle cx={point.x} cy={point.y} r="5.5" fill="rgba(8,47,73,0.62)" />
          <circle
            cx={point.x}
            cy={point.y}
            r={complete ? 3.4 : 3.8}
            fill={complete ? 'rgb(103,232,249)' : 'rgb(34,211,238)'}
          />
        </g>
      ))}

      <style jsx global>{`
        @keyframes visagismo-dash {
          to {
            stroke-dashoffset: 0;
          }
        }

        .visagismo-draw-line {
          animation: visagismo-dash 0.9s ease-out forwards;
        }
      `}</style>
    </svg>
  )
}

function MeasurementLine({
  from,
  to,
  label,
}: {
  from: FaceGuidePoint
  to: FaceGuidePoint
  label: string
}) {
  const labelX = (from.x + to.x) / 2
  const labelY = (from.y + to.y) / 2 - 12

  return (
    <g>
      <line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        stroke="rgba(34,211,238,0.95)"
        strokeWidth="2"
        strokeDasharray="520"
        strokeDashoffset="520"
        className="visagismo-draw-line"
        filter="url(#visagismo-face-glow)"
      />
      <circle cx={from.x} cy={from.y} r="6" fill="rgba(8,47,73,0.72)" stroke="rgb(103,232,249)" strokeWidth="1.4" />
      <circle cx={to.x} cy={to.y} r="6" fill="rgba(8,47,73,0.72)" stroke="rgb(103,232,249)" strokeWidth="1.4" />
      <rect
        x={labelX - 34}
        y={labelY - 12}
        width="68"
        height="20"
        rx="4"
        fill="rgba(2,6,23,0.72)"
        stroke="rgba(103,232,249,0.36)"
      />
      <text
        x={labelX}
        y={labelY + 2}
        textAnchor="middle"
        fill="rgb(207,250,254)"
        fontSize="10"
        fontWeight="800"
        letterSpacing="0"
      >
        {label}
      </text>
    </g>
  )
}

function getActiveMeasurement(guide: FaceGuide, phase: AnalysisPhase): [FaceGuidePoint, FaceGuidePoint, string] | null {
  if (phase === 'forehead') return [...guide.measurements.forehead, 'TEMPORAS']
  if (phase === 'cheekbones') return [...guide.measurements.cheekbones, 'OLHOS']
  if (phase === 'nose') return [...guide.measurements.noseAxis, 'EIXO']
  if (phase === 'jaw') return [...guide.measurements.jaw, 'QUEIXO']
  return null
}

function getCompletedMeasurements(guide: FaceGuide, phase: AnalysisPhase) {
  const measurements: Array<[FaceGuidePoint, FaceGuidePoint]> = []
  if (['cheekbones', 'nose', 'jaw', 'mask', 'complete', 'hiding'].includes(phase)) {
    measurements.push(guide.measurements.forehead)
  }
  if (['nose', 'jaw', 'mask', 'complete', 'hiding'].includes(phase)) {
    measurements.push(guide.measurements.cheekbones)
  }
  if (['jaw', 'mask', 'complete', 'hiding'].includes(phase)) {
    measurements.push(guide.measurements.noseAxis)
  }
  if (['mask', 'complete', 'hiding'].includes(phase)) {
    measurements.push(guide.measurements.jaw)
  }
  if (['complete', 'hiding'].includes(phase)) {
    measurements.push(guide.measurements.faceHeight)
  }
  return measurements
}

function getPhasePoints(guide: FaceGuide, phase: AnalysisPhase) {
  const active = getActiveMeasurement(guide, phase)
  if (!active) return []
  return [active[0], active[1]]
}

function TryOnFrameSvg({
  template,
  strokeScale,
  className,
  color,
  lensMode = 'none',
}: {
  template: GlobalVisagismoFrameTemplate
  strokeScale: number
  className?: string
  color?: string
  lensMode?: LensMode
}) {
  const { outerFullPath, innerRightPath, innerLeftPath } = template.generatedPaths
  const outerFramePath = ensureClosedSvgPath(outerFullPath)
  const rightLensPath = ensureClosedSvgPath(innerRightPath)
  const leftLensPath = ensureClosedSvgPath(innerLeftPath)
  const frameFillPath = outerFramePath
    ? [outerFramePath, rightLensPath, leftLensPath].filter(Boolean).join(' ')
    : undefined
  const id = useId().replace(/:/g, '')
  const lensFillId = `visagismo-lens-${id}`
  const lensGlowId = `visagismo-lens-glow-${id}`
  const lensHazeId = `visagismo-lens-haze-${id}`
  const lensSpotId = `visagismo-lens-spot-${id}`
  const lensBlurId = `visagismo-lens-blur-${id}`
  const rightClipId = `visagismo-right-lens-${id}`
  const leftClipId = `visagismo-left-lens-${id}`
  const isTransparentFrame = color === FRAME_COLOR_PALETTE[6].value
  const frameColor = color ?? '#cffafe'
  const lensOpacity = lensMode === 'none' ? 0 : lensMode === 'frost' ? 0.46 : lensMode === 'reflection' ? 0.24 : 0.34
  const svgStyle: CSSProperties = color ? { color, overflow: 'visible' } : { overflow: 'visible' }

  return (
    <svg
      className={className ?? 'h-full w-full text-cyan-100 drop-shadow-[0_1px_2px_rgba(0,0,0,0.75)]'}
      style={svgStyle}
      viewBox={`0 0 ${template.viewBox.width} ${template.viewBox.height}`}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      vectorEffect="non-scaling-stroke"
    >
      <defs>
        <linearGradient id={lensFillId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity={lensMode === 'frost' ? 0.62 : 0.34} />
          <stop offset="48%" stopColor="#bae6fd" stopOpacity={lensMode === 'frost' ? 0.34 : 0.16} />
          <stop offset="100%" stopColor="#0f172a" stopOpacity={lensMode === 'frost' ? 0.18 : 0.08} />
        </linearGradient>
        <linearGradient id={lensGlowId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="42%" stopColor="#ffffff" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={lensHazeId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.1" />
          <stop offset="38%" stopColor="#ffffff" stopOpacity="0.52" />
          <stop offset="58%" stopColor="#dff7ff" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.02" />
        </linearGradient>
        <radialGradient id={lensSpotId} cx="32%" cy="22%" r="68%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.46" />
          <stop offset="42%" stopColor="#dff7ff" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <filter id={lensBlurId} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.8" />
        </filter>
        {rightLensPath && (
          <clipPath id={rightClipId}>
            <path d={rightLensPath} />
          </clipPath>
        )}
        {leftLensPath && (
          <clipPath id={leftClipId}>
            <path d={leftLensPath} />
          </clipPath>
        )}
        <filter id={`visagismo-frame-shadow-${id}`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1.1" stdDeviation="0.7" floodColor="#020617" floodOpacity="0.55" />
        </filter>
      </defs>

      {lensMode !== 'none' && rightLensPath && (
        <path d={rightLensPath} fill={`url(#${lensFillId})`} stroke="none" opacity={lensOpacity} />
      )}
      {lensMode !== 'none' && leftLensPath && (
        <path d={leftLensPath} fill={`url(#${lensFillId})`} stroke="none" opacity={lensOpacity} />
      )}
      {lensMode === 'frost' && rightLensPath && (
        <path d={rightLensPath} fill="#ffffff" stroke="none" opacity="0.12" />
      )}
      {lensMode === 'frost' && leftLensPath && (
        <path d={leftLensPath} fill="#ffffff" stroke="none" opacity="0.12" />
      )}
      {lensMode === 'crystal' && rightLensPath && (
        <g clipPath={`url(#${rightClipId})`} opacity="0.5">
          <rect width={template.viewBox.width} height={template.viewBox.height} fill={`url(#${lensSpotId})`} stroke="none" />
          <path d={`M ${template.viewBox.width * 0.53} ${template.viewBox.height * 0.18} L ${template.viewBox.width * 0.83} ${template.viewBox.height * 0.12}`} stroke="#ffffff" strokeWidth={1.5 * strokeScale} opacity="0.3" />
        </g>
      )}
      {lensMode === 'crystal' && leftLensPath && (
        <g clipPath={`url(#${leftClipId})`} opacity="0.5">
          <rect width={template.viewBox.width} height={template.viewBox.height} fill={`url(#${lensSpotId})`} stroke="none" />
          <path d={`M ${template.viewBox.width * 0.13} ${template.viewBox.height * 0.18} L ${template.viewBox.width * 0.43} ${template.viewBox.height * 0.12}`} stroke="#ffffff" strokeWidth={1.5 * strokeScale} opacity="0.3" />
        </g>
      )}
      {lensMode === 'reflection' && rightLensPath && (
        <g clipPath={`url(#${rightClipId})`}>
          <rect width={template.viewBox.width} height={template.viewBox.height} fill={`url(#${lensSpotId})`} stroke="none" opacity="0.5" />
          <path
            d={`M ${template.viewBox.width * 0.46} ${template.viewBox.height * 0.78} C ${template.viewBox.width * 0.64} ${template.viewBox.height * 0.38}, ${template.viewBox.width * 0.78} ${template.viewBox.height * 0.26}, ${template.viewBox.width * 0.98} ${template.viewBox.height * 0.1}`}
            stroke={`url(#${lensHazeId})`}
            strokeWidth={12 * strokeScale}
            strokeLinecap="round"
            opacity="0.74"
            filter={`url(#${lensBlurId})`}
          />
          <path d={`M ${template.viewBox.width * 0.56} ${template.viewBox.height * 0.22} L ${template.viewBox.width * 0.9} ${template.viewBox.height * 0.08}`} stroke={`url(#${lensGlowId})`} strokeWidth={3 * strokeScale} opacity="0.55" />
          <path d={`M ${template.viewBox.width * 0.62} ${template.viewBox.height * 0.4} L ${template.viewBox.width * 0.94} ${template.viewBox.height * 0.24}`} stroke="#ffffff" strokeWidth={1.2 * strokeScale} opacity="0.28" />
        </g>
      )}
      {lensMode === 'reflection' && leftLensPath && (
        <g clipPath={`url(#${leftClipId})`}>
          <rect width={template.viewBox.width} height={template.viewBox.height} fill={`url(#${lensSpotId})`} stroke="none" opacity="0.5" />
          <path
            d={`M ${template.viewBox.width * 0.02} ${template.viewBox.height * 0.1} C ${template.viewBox.width * 0.2} ${template.viewBox.height * 0.28}, ${template.viewBox.width * 0.34} ${template.viewBox.height * 0.4}, ${template.viewBox.width * 0.5} ${template.viewBox.height * 0.78}`}
            stroke={`url(#${lensHazeId})`}
            strokeWidth={12 * strokeScale}
            strokeLinecap="round"
            opacity="0.74"
            filter={`url(#${lensBlurId})`}
          />
          <path d={`M ${template.viewBox.width * 0.1} ${template.viewBox.height * 0.22} L ${template.viewBox.width * 0.44} ${template.viewBox.height * 0.08}`} stroke={`url(#${lensGlowId})`} strokeWidth={3 * strokeScale} opacity="0.55" />
          <path d={`M ${template.viewBox.width * 0.08} ${template.viewBox.height * 0.4} L ${template.viewBox.width * 0.4} ${template.viewBox.height * 0.24}`} stroke="#ffffff" strokeWidth={1.2 * strokeScale} opacity="0.28" />
        </g>
      )}

      {frameFillPath && (
        <g filter={`url(#visagismo-frame-shadow-${id})`}>
          <path
            d={frameFillPath}
            fill="#020617"
            fillRule="evenodd"
            stroke="none"
            opacity={isTransparentFrame ? 0.06 : 0.12}
          />
          <path
            d={frameFillPath}
            fill={frameColor}
            fillRule="evenodd"
            stroke="none"
            opacity={isTransparentFrame ? 0.44 : 0.78}
          />
          {isTransparentFrame && (
            <path
              d={frameFillPath}
              fill="#ffffff"
              fillRule="evenodd"
              stroke="none"
              opacity="0.06"
            />
          )}
        </g>
      )}

      {outerFullPath && (
        <g>
          <path
            d={outerFullPath}
            stroke="#020617"
            strokeWidth={0.8 * strokeScale}
            opacity={isTransparentFrame ? 0.5 : 0.62}
          />
        </g>
      )}
      {innerRightPath && (
        <g>
          <path
            d={innerRightPath}
            strokeWidth={1.15 * strokeScale}
            stroke="#020617"
            opacity={isTransparentFrame ? 0.38 : 0.32}
          />
          <path
            d={innerRightPath}
            strokeWidth={0.62 * strokeScale}
            stroke={frameColor}
            opacity={isTransparentFrame ? 0.36 : 0.66}
          />
        </g>
      )}
      {innerLeftPath && (
        <g>
          <path
            d={innerLeftPath}
            strokeWidth={1.15 * strokeScale}
            stroke="#020617"
            opacity={isTransparentFrame ? 0.38 : 0.32}
          />
          <path
            d={innerLeftPath}
            strokeWidth={0.62 * strokeScale}
            stroke={frameColor}
            opacity={isTransparentFrame ? 0.36 : 0.66}
          />
        </g>
      )}
    </svg>
  )
}

function ensureClosedSvgPath(path: string | undefined) {
  if (!path) return undefined
  return /z\s*$/i.test(path.trim()) ? path : `${path} Z`
}

function Range({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
}) {
  return (
    <label className="mt-3 block">
      <span className="mb-1 flex justify-between text-[10px] font-black uppercase text-slate-500">
        {label}
        <span className="font-mono text-slate-400">{value.toFixed(step < 1 ? 2 : 0)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full"
      />
    </label>
  )
}

function computeOverlayPose(
  landmarks: Landmark[],
  video: HTMLVideoElement,
  template: GlobalVisagismoFrameTemplate | null,
  mirror: boolean,
  sizeAdjust: number,
  heightAdjust: number,
): OverlayPose | null {
  if (!template) return null

  const stableEyes = getStableEyeCenters(landmarks)
  const rightEyeAnchor = stableEyes?.right ?? landmarks[RIGHT_IRIS]
  const leftEyeAnchor = stableEyes?.left ?? landmarks[LEFT_IRIS]
  const nose = landmarks[NOSE]
  if (!rightEyeAnchor || !leftEyeAnchor || !nose) return null

  const videoRect = video.getBoundingClientRect()
  const videoAspect = video.videoWidth / Math.max(video.videoHeight, 1)
  const rectAspect = videoRect.width / Math.max(videoRect.height, 1)
  let drawWidth = videoRect.width
  let drawHeight = videoRect.height
  let offsetX = 0
  let offsetY = 0

  if (videoAspect > rectAspect) {
    drawHeight = videoRect.width / videoAspect
    offsetY = (videoRect.height - drawHeight) / 2
  } else {
    drawWidth = videoRect.height * videoAspect
    offsetX = (videoRect.width - drawWidth) / 2
  }

  const toPx = (landmark: Landmark) => ({
    x: offsetX + (mirror ? 1 - landmark.x : landmark.x) * drawWidth,
    y: offsetY + landmark.y * drawHeight,
  })

  const right = toPx(rightEyeAnchor)
  const left = toPx(leftEyeAnchor)
  const nosePoint = toPx(nose)
  const bridgePoint = landmarks[NOSE_BRIDGE] ? toPx(landmarks[NOSE_BRIDGE]) : nosePoint
  const screenLeftEye = right.x < left.x ? right : left
  const screenRightEye = right.x < left.x ? left : right
  const eyeCenter = {
    x: (right.x + left.x) / 2,
    y: (right.y + left.y) / 2,
  }
  const eyeDistance = Math.max(distance(right, left), 1)
  const realWidth = template.realWidthMm ?? 132
  const yaw = (nosePoint.x - eyeCenter.x) / eyeDistance
  const bridgeBlend = clamp(Math.abs(yaw) * 2.4, 0, 0.9)
  const anchorX = lerp(eyeCenter.x, bridgePoint.x, bridgeBlend)
  const turnSizeCompensation = clamp(1 + Math.abs(yaw) * 0.42, 1, 1.12)

  return {
    x: anchorX,
    y: eyeCenter.y + heightAdjust,
    width: eyeDistance * turnSizeCompensation * (realWidth / DEFAULT_PD_MM) * sizeAdjust,
    angle: clamp(Math.atan2(screenRightEye.y - screenLeftEye.y, screenRightEye.x - screenLeftEye.x), -0.22, 0.22),
    detected: true,
  }
}

function getStableEyeCenters(landmarks: Landmark[]) {
  const rightOuter = landmarks[RIGHT_EYE_OUTER]
  const rightInner = landmarks[RIGHT_EYE_INNER]
  const leftInner = landmarks[LEFT_EYE_INNER]
  const leftOuter = landmarks[LEFT_EYE_OUTER]
  if (!rightOuter || !rightInner || !leftInner || !leftOuter) return null

  return {
    right: midpoint(rightOuter, rightInner),
    left: midpoint(leftInner, leftOuter),
  }
}

function midpoint(a: Landmark, b: Landmark): Landmark {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: a.z !== undefined && b.z !== undefined ? (a.z + b.z) / 2 : undefined,
  }
}

function computeFaceGuide(landmarks: Landmark[], video: HTMLVideoElement, mirror: boolean): FaceGuide | null {
  const map = createVideoPointMapper(video, mirror)
  const pointMap = {
    top: map(landmarks[10], 'top'),
    chin: map(landmarks[152], 'chin'),
    leftTemple: map(landmarks[127], 'leftTemple'),
    rightTemple: map(landmarks[356], 'rightTemple'),
    leftCheek: map(landmarks[234], 'leftCheek'),
    rightCheek: map(landmarks[454], 'rightCheek'),
    leftJaw: map(landmarks[172], 'leftJaw'),
    rightJaw: map(landmarks[397], 'rightJaw'),
    rightIris: map(landmarks[RIGHT_IRIS], 'rightIris'),
    leftIris: map(landmarks[LEFT_IRIS], 'leftIris'),
    nose: map(landmarks[NOSE], 'nose'),
  }

  const points = Object.values(pointMap)
  if (points.some((point) => !point)) return null

  const top = pointMap.top!
  const chin = pointMap.chin!
  const leftTemple = pointMap.leftTemple!
  const rightTemple = pointMap.rightTemple!
  const leftCheek = pointMap.leftCheek!
  const rightCheek = pointMap.rightCheek!
  const leftJaw = pointMap.leftJaw!
  const rightJaw = pointMap.rightJaw!
  const leftIris = pointMap.leftIris!
  const rightIris = pointMap.rightIris!
  const nose = pointMap.nose!
  const center = { id: 'center', x: (leftCheek.x + rightCheek.x) / 2, y: (top.y + chin.y) / 2 }

  return {
    points: [top, chin, leftTemple, rightTemple, leftCheek, rightCheek, leftJaw, rightJaw, leftIris, rightIris, nose],
    lines: [
      [top, chin],
      [leftTemple, rightTemple],
      [leftCheek, rightCheek],
      [leftJaw, rightJaw],
      [center, nose],
    ],
    outline: [top, rightTemple, rightCheek, rightJaw, chin, leftJaw, leftCheek, leftTemple]
      .map((point) => `${point.x},${point.y}`)
      .join(' '),
    eyeLine: [leftIris, rightIris],
    measurements: {
      forehead: [leftTemple, rightTemple],
      cheekbones: [leftCheek, rightCheek],
      noseAxis: [top, chin],
      jaw: [leftJaw, rightJaw],
      faceHeight: [top, chin],
    },
  }
}

function computeFaceYaw(landmarks: Landmark[], video: HTMLVideoElement, mirror: boolean) {
  const map = createVideoPointMapper(video, mirror)
  const stableEyes = getStableEyeCenters(landmarks)
  const rightIris = map(stableEyes?.right ?? landmarks[RIGHT_IRIS], 'rightIris')
  const leftIris = map(stableEyes?.left ?? landmarks[LEFT_IRIS], 'leftIris')
  const nose = map(landmarks[NOSE], 'nose')
  if (!rightIris || !leftIris || !nose) return 0

  const eyeCenter = {
    x: (rightIris.x + leftIris.x) / 2,
    y: (rightIris.y + leftIris.y) / 2,
  }
  const eyeDistance = Math.max(distance(rightIris, leftIris), 1)
  return (nose.x - eyeCenter.x) / eyeDistance
}

function createVideoPointMapper(video: HTMLVideoElement, mirror: boolean) {
  const videoRect = video.getBoundingClientRect()
  const parentRect = video.parentElement?.getBoundingClientRect()
  const videoAspect = video.videoWidth / Math.max(video.videoHeight, 1)
  const rectAspect = videoRect.width / Math.max(videoRect.height, 1)
  let drawWidth = videoRect.width
  let drawHeight = videoRect.height
  let offsetX = videoRect.left - (parentRect?.left ?? 0)
  let offsetY = videoRect.top - (parentRect?.top ?? 0)

  if (videoAspect > rectAspect) {
    drawHeight = videoRect.width / videoAspect
    offsetY += (videoRect.height - drawHeight) / 2
  } else {
    drawWidth = videoRect.height * videoAspect
    offsetX += (videoRect.width - drawWidth) / 2
  }

  return (landmark: Landmark | undefined, id: string): FaceGuidePoint | null => {
    if (!landmark) return null
    return {
      id,
      x: offsetX + (mirror ? 1 - landmark.x : landmark.x) * drawWidth,
      y: offsetY + landmark.y * drawHeight,
    }
  }
}

function smoothPose(previous: OverlayPose | null, next: OverlayPose): OverlayPose {
  if (!previous) return next
  const amount = 0.28
  return {
    x: lerp(previous.x, next.x, amount),
    y: lerp(previous.y, next.y, amount),
    width: lerp(previous.width, next.width, amount),
    angle: lerp(previous.angle, next.angle, amount),
    detected: next.detected,
  }
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function createSimulatedFaceAnalysis(faceShape: FaceShape): FaceAnalysisResult {
  const presets: Record<FaceShape, FaceAnalysisResult['traits'] & { widthToHeight: number }> = {
    round: {
      widthToHeight: 0.82,
      softLines: 0.84,
      angularLines: 0.2,
      verticalFace: 0.12,
      wideFace: 0.74,
      upperFaceDominance: 0.22,
      lowerFaceDominance: 0.2,
    },
    oval: {
      widthToHeight: 0.69,
      softLines: 0.72,
      angularLines: 0.28,
      verticalFace: 0.34,
      wideFace: 0.36,
      upperFaceDominance: 0.18,
      lowerFaceDominance: 0.14,
    },
    square: {
      widthToHeight: 0.76,
      softLines: 0.32,
      angularLines: 0.76,
      verticalFace: 0.18,
      wideFace: 0.62,
      upperFaceDominance: 0.16,
      lowerFaceDominance: 0.38,
    },
    long: {
      widthToHeight: 0.55,
      softLines: 0.58,
      angularLines: 0.34,
      verticalFace: 0.86,
      wideFace: 0.08,
      upperFaceDominance: 0.2,
      lowerFaceDominance: 0.16,
    },
    heart: {
      widthToHeight: 0.68,
      softLines: 0.55,
      angularLines: 0.42,
      verticalFace: 0.4,
      wideFace: 0.32,
      upperFaceDominance: 0.78,
      lowerFaceDominance: 0.06,
    },
    triangle: {
      widthToHeight: 0.72,
      softLines: 0.46,
      angularLines: 0.52,
      verticalFace: 0.28,
      wideFace: 0.46,
      upperFaceDominance: 0.08,
      lowerFaceDominance: 0.76,
    },
    balanced: {
      widthToHeight: 0.7,
      softLines: 0.58,
      angularLines: 0.38,
      verticalFace: 0.32,
      wideFace: 0.34,
      upperFaceDominance: 0.16,
      lowerFaceDominance: 0.16,
    },
  }
  const preset = presets[faceShape]
  const faceHeight = 1
  const faceWidth = preset.widthToHeight * faceHeight

  return {
    faceShape,
    confidence: 0.92,
    proportions: {
      faceWidth,
      faceHeight,
      widthToHeight: preset.widthToHeight,
      foreheadWidth: faceWidth * (faceShape === 'heart' ? 1 : 0.92),
      cheekboneWidth: faceWidth,
      jawWidth: faceWidth * (faceShape === 'triangle' || faceShape === 'square' ? 0.98 : 0.82),
      chinWidth: faceWidth * (faceShape === 'heart' ? 0.52 : 0.68),
    },
    traits: {
      softLines: preset.softLines,
      angularLines: preset.angularLines,
      verticalFace: preset.verticalFace,
      wideFace: preset.wideFace,
      upperFaceDominance: preset.upperFaceDominance,
      lowerFaceDominance: preset.lowerFaceDominance,
    },
  }
}

function buildRecommendationDiagnostic({
  analysisReport,
  templates,
  customerProfile,
  appearance,
}: {
  analysisReport: TryOnAnalysisReport
  templates: GlobalVisagismoFrameTemplate[]
  customerProfile: CustomerStyleProfile
  appearance: {
    frameColor: string
    lensMode: LensMode
    skinTone: SkinTone
  }
}) {
  const recommendations = analysisReport.recommendations.map((recommendation, index) => {
    const template = templates.find((item) => item.id === recommendation.templateId)

    return {
      rank: index + 1,
      templateId: recommendation.templateId,
      name: recommendation.name,
      score: recommendation.score,
      reasons: recommendation.reasons,
      frameProfile: template?.profile ?? null,
      frameData: template
        ? {
            slug: template.slug,
            category: template.category,
            description: template.description,
            realWidthMm: template.realWidthMm,
            viewBox: template.viewBox,
            generatedPathsAvailable: {
              outerFullPath: Boolean(template.generatedPaths.outerFullPath),
              innerRightPath: Boolean(template.generatedPaths.innerRightPath),
              innerLeftPath: Boolean(template.generatedPaths.innerLeftPath),
            },
          }
        : null,
    }
  })

  return {
    generatedAt: new Date().toISOString(),
    purpose: 'Diagnostico do motor de recomendacao de visagismo para revisao externa/IA.',
    note: 'A IA deve avaliar coerencia dos pesos e motivos. Ela nao decide a recomendacao exibida ao cliente.',
    engineInputs: {
      faceAnalysis: analysisReport.analysis,
      customerProfile,
      frameProfiles: templates.map((template) => ({
        id: template.id,
        name: template.name,
        profile: template.profile,
        realWidthMm: template.realWidthMm,
        viewBox: template.viewBox,
      })),
    },
    currentAppearance: {
      ...appearance,
      usage: 'Aparencia visual atual da prova. No momento, estes campos nao pesam na recomendacao.',
    },
    recommendations,
    topThree: recommendations.slice(0, 3),
    promptSuggestion:
      'Analise este JSON como auditor de um motor de visagismo. Verifique se as 3 primeiras sugestoes fazem sentido para o rosto e perfil do cliente, aponte pesos que parecem exagerados e sugira ajustes objetivos nas regras.',
  }
}

function buildBatchRecommendationDiagnostic({
  templates,
  appearance,
}: {
  templates: GlobalVisagismoFrameTemplate[]
  appearance: {
    frameColor: string
    lensMode: LensMode
    skinTone: SkinTone
  }
}) {
  const scenarios = createAuditScenarios()
  const results = scenarios.map((scenario, index) => {
    const analysis = createSimulatedFaceAnalysis(scenario.faceShape)
    const recommendations = recommendFramesForFace(analysis, templates, scenario.customerProfile)
    const report = { analysis, recommendations }

    return {
      id: `scenario-${String(index + 1).padStart(2, '0')}`,
      title: scenario.title,
      expectation: scenario.expectation,
      customerProfile: scenario.customerProfile,
      faceAnalysis: analysis,
      topThree: buildRecommendationDiagnostic({
        analysisReport: report,
        templates,
        customerProfile: scenario.customerProfile,
        appearance,
      }).topThree,
      fullRanking: recommendations.map((recommendation, rank) => ({
        rank: rank + 1,
        templateId: recommendation.templateId,
        name: recommendation.name,
        score: recommendation.score,
        reasons: recommendation.reasons,
      })),
    }
  })

  return {
    generatedAt: new Date().toISOString(),
    purpose: 'Auditoria em lote do motor de recomendacao de visagismo.',
    instructions:
      'Analise todos os cenarios, encontre padroes de erro do motor, conflitos entre perfil do cliente e geometria facial, pesos exagerados/subutilizados e sugira ajustes objetivos nas regras. Nao escolha armações para cliente real; audite a logica.',
    currentAppearance: {
      ...appearance,
      usage: 'Aparencia visual atual. No momento, estes campos nao pesam na recomendacao.',
    },
    frameProfiles: templates.map((template) => ({
      id: template.id,
      name: template.name,
      profile: template.profile,
      realWidthMm: template.realWidthMm,
      viewBox: template.viewBox,
    })),
    scenarios: results,
  }
}

function formatNarrativeForClipboard(narrative: VisagismoRecommendationNarrative) {
  const options = narrative.options
    .map((option, index) => {
      const caveat = option.caveat ? `\nObservacao: ${option.caveat}` : ''
      return `${index + 1}. ${option.name} - ${option.headline}\n${option.explanation}\nFala do vendedor: ${option.sellerTip}${caveat}`
    })
    .join('\n\n')

  return `${narrative.sellerOpening}\n\n${narrative.customerSummary}\n\n${options}\n\n${narrative.closingLine}`
}

function buildNarrativeRequestKey(report: TryOnAnalysisReport, customerProfile: CustomerStyleProfile) {
  return JSON.stringify({
    shape: report.analysis.faceShape,
    confidence: Math.round(report.analysis.confidence * 100),
    profile: customerProfile,
    top: report.recommendations.slice(0, 3).map((recommendation) => ({
      id: recommendation.templateId,
      score: recommendation.score,
    })),
  })
}

function createAuditScenarios(): Array<{
  title: string
  faceShape: FaceShape
  customerProfile: CustomerStyleProfile
  expectation: string
}> {
  return [
    {
      title: 'Rosto redondo, discreto masculino, quer estruturar e evitar gatinho',
      faceShape: 'round',
      customerProfile: {
        style: 'discrete',
        expression: 'masculine',
        goals: ['structure', 'rejuvenate'],
        avoid: ['cat-eye'],
      },
      expectation: 'Deve favorecer estruturas discretas como retangular, quadrado arredondado, browline/wayfarer; gatinho deve ficar fora do topo.',
    },
    {
      title: 'Rosto alongado, classico feminino, quer levantar',
      faceShape: 'long',
      customerProfile: {
        style: 'classic',
        expression: 'feminine',
        goals: ['lift'],
        avoid: [],
      },
      expectation: 'Deve favorecer linhas ascendentes/gatinho se nao houver restricao, e penalizar aviador descendente.',
    },
    {
      title: 'Rosto alongado, classico, quer suavizar e evitar grande',
      faceShape: 'long',
      customerProfile: {
        style: 'classic',
        expression: 'none',
        goals: ['soften'],
        avoid: ['large'],
      },
      expectation: 'Deve respeitar sem grande, evitando wide/high no topo; Panto/Oval/Browline podem subir.',
    },
    {
      title: 'Rosto quadrado, moderno, quer suavizar',
      faceShape: 'square',
      customerProfile: {
        style: 'modern',
        expression: 'neutral',
        goals: ['soften'],
        avoid: [],
      },
      expectation: 'Deve favorecer curvas ou mistos modernos, sem excesso de quadrados fortes.',
    },
    {
      title: 'Rosto triangular, marcante feminino, quer levantar',
      faceShape: 'triangle',
      customerProfile: {
        style: 'striking',
        expression: 'feminine',
        goals: ['lift'],
        avoid: [],
      },
      expectation: 'Deve favorecer gatinho/ascendente e modelos com presenca na parte superior.',
    },
    {
      title: 'Rosto oval, discreto neutro, sem forte',
      faceShape: 'oval',
      customerProfile: {
        style: 'discrete',
        expression: 'neutral',
        goals: [],
        avoid: ['strong'],
      },
      expectation: 'Deve favorecer opcoes leves/medias e evitar geometrico forte/quadrado marcado.',
    },
    {
      title: 'Rosto coracao, classico, quer suavizar',
      faceShape: 'heart',
      customerProfile: {
        style: 'classic',
        expression: 'none',
        goals: ['soften'],
        avoid: [],
      },
      expectation: 'Deve favorecer oval, panto, arredondado ou aviador moderado, sem peso excessivo na parte superior.',
    },
    {
      title: 'Rosto redondo, moderno, quer presenca sem redondo',
      faceShape: 'round',
      customerProfile: {
        style: 'modern',
        expression: 'neutral',
        goals: ['structure'],
        avoid: ['round'],
      },
      expectation: 'Deve favorecer geometrico/retangular/wayfarer e derrubar redondo/oval.',
    },
    {
      title: 'Rosto equilibrado, marcante masculino, quer estruturar',
      faceShape: 'balanced',
      customerProfile: {
        style: 'striking',
        expression: 'masculine',
        goals: ['structure'],
        avoid: [],
      },
      expectation: 'Deve favorecer quadrado marcado, geometrico, wayfarer ou retangular com presenca.',
    },
    {
      title: 'Rosto alongado, discreto masculino, sem grande',
      faceShape: 'long',
      customerProfile: {
        style: 'discrete',
        expression: 'masculine',
        goals: ['structure'],
        avoid: ['large'],
      },
      expectation: 'Deve equilibrar rosto longo sem usar modelos grandes; evitar wide/high no top 3.',
    },
  ]
}

function faceShapeLabel(shape: FaceShape) {
  const labels: Record<FaceShape, string> = {
    round: 'arredondado',
    oval: 'oval',
    square: 'quadrado',
    long: 'alongado',
    heart: 'coracao',
    triangle: 'triangular',
    balanced: 'equilibrado',
  }

  return labels[shape]
}
