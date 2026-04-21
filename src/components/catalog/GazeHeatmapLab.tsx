'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Camera, CircleDot, Loader2, Play, RotateCcw, ScanFace, StopCircle } from 'lucide-react'

type NormalizedPoint = { x: number; y: number }
type FaceMetrics = {
  faceDetected: boolean
  eyeX: number
  eyeY: number
  headX: number
  headY: number
}
type SessionPhase = 'idle' | 'calibrating' | 'running' | 'finished'
type ProfileDescriptor = {
  key: string
  name: string
  subtitle: string
  topInset: number
  midInset: number
  bottomInset: number
  accent: string
}
type SessionSummary = {
  eyeShare: number
  headShare: number
  heatSpreadX: number
  heatSpreadY: number
  sampleCount: number
  wideScore: number
  narrowScore: number
  label: string
  message: string
}
type MediaPipeModule = typeof import('@mediapipe/tasks-vision')
type FaceLandmarkerInstance = Awaited<ReturnType<MediaPipeModule['FaceLandmarker']['createFromOptions']>>

const VIDEO_W = 960
const VIDEO_H = 540
const HEAT_COLS = 44
const HEAT_ROWS = 28
const TARGET_INTERVAL_MS = 1100
const SESSION_DURATION_MS = 30000
const CALIBRATION_DURATION_MS = 3000
const SAFE_TARGET_MARGIN_X = 0.1
const SAFE_TARGET_MARGIN_Y = 0.16

const LANDMARKS = {
  nose: 1,
  forehead: 10,
  chin: 152,
  leftEyeOuter: 33,
  leftEyeInner: 133,
  leftEyeTop: 159,
  leftEyeBottom: 145,
  rightEyeInner: 362,
  rightEyeOuter: 263,
  rightEyeTop: 386,
  rightEyeBottom: 374,
  leftIris: 468,
  rightIris: 473,
} as const

const COMPARISON_PROFILES: ProfileDescriptor[] = [
  {
    key: 'wide',
    name: 'Campo amplo',
    subtitle: 'Mais permissiva nas bordas',
    topInset: 0.08,
    midInset: 0.12,
    bottomInset: 0.18,
    accent: '#22c55e',
  },
  {
    key: 'narrow',
    name: 'Campo compacto',
    subtitle: 'Exige uso mais central',
    topInset: 0.13,
    midInset: 0.22,
    bottomInset: 0.29,
    accent: '#f59e0b',
  },
]

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

function distance(a: NormalizedPoint, b: NormalizedPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function getLandmark(landmarks: NormalizedPoint[], index: number) {
  return landmarks[index] ?? { x: 0, y: 0 }
}

function computeEyeAxis(
  iris: NormalizedPoint,
  cornerA: NormalizedPoint,
  cornerB: NormalizedPoint,
  top: NormalizedPoint,
  bottom: NormalizedPoint,
) {
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

function computeFaceMetrics(landmarks: NormalizedPoint[]): FaceMetrics {
  if (landmarks.length < LANDMARKS.rightIris + 1) {
    return { faceDetected: false, eyeX: 0, eyeY: 0, headX: 0, headY: 0 }
  }

  const leftEyeOuter = getLandmark(landmarks, LANDMARKS.leftEyeOuter)
  const leftEyeInner = getLandmark(landmarks, LANDMARKS.leftEyeInner)
  const rightEyeInner = getLandmark(landmarks, LANDMARKS.rightEyeInner)
  const rightEyeOuter = getLandmark(landmarks, LANDMARKS.rightEyeOuter)
  const leftEyeTop = getLandmark(landmarks, LANDMARKS.leftEyeTop)
  const leftEyeBottom = getLandmark(landmarks, LANDMARKS.leftEyeBottom)
  const rightEyeTop = getLandmark(landmarks, LANDMARKS.rightEyeTop)
  const rightEyeBottom = getLandmark(landmarks, LANDMARKS.rightEyeBottom)
  const leftIris = getLandmark(landmarks, LANDMARKS.leftIris)
  const rightIris = getLandmark(landmarks, LANDMARKS.rightIris)
  const nose = getLandmark(landmarks, LANDMARKS.nose)
  const forehead = getLandmark(landmarks, LANDMARKS.forehead)
  const chin = getLandmark(landmarks, LANDMARKS.chin)

  const leftAxis = computeEyeAxis(leftIris, leftEyeOuter, leftEyeInner, leftEyeTop, leftEyeBottom)
  const rightAxis = computeEyeAxis(rightIris, rightEyeOuter, rightEyeInner, rightEyeTop, rightEyeBottom)
  const eyeX = (leftAxis.x + rightAxis.x) / 2
  const eyeY = (leftAxis.y + rightAxis.y) / 2

  const leftEyeCenter = {
    x: (leftEyeOuter.x + leftEyeInner.x) / 2,
    y: (leftEyeTop.y + leftEyeBottom.y) / 2,
  }
  const rightEyeCenter = {
    x: (rightEyeOuter.x + rightEyeInner.x) / 2,
    y: (rightEyeTop.y + rightEyeBottom.y) / 2,
  }
  const eyeCenter = {
    x: (leftEyeCenter.x + rightEyeCenter.x) / 2,
    y: (leftEyeCenter.y + rightEyeCenter.y) / 2,
  }
  const eyeDistance = Math.max(distance(leftEyeCenter, rightEyeCenter), 0.0001)
  const faceHeight = Math.max(Math.abs(chin.y - forehead.y), 0.0001)

  return {
    faceDetected: true,
    eyeX,
    eyeY,
    headX: clamp((nose.x - eyeCenter.x) / (eyeDistance * 0.5), -1.4, 1.4),
    headY: clamp(((nose.y - eyeCenter.y) / faceHeight - 0.08) * 3.2, -1.4, 1.4),
  }
}

function makeHeatmap() {
  return new Float32Array(HEAT_COLS * HEAT_ROWS)
}

function addHeatPoint(grid: Float32Array, point: NormalizedPoint, weight = 1) {
  const radius = 2.2
  const px = clamp(point.x, 0.01, 0.99) * (HEAT_COLS - 1)
  const py = clamp(point.y, 0.01, 0.99) * (HEAT_ROWS - 1)

  for (let row = 0; row < HEAT_ROWS; row += 1) {
    for (let col = 0; col < HEAT_COLS; col += 1) {
      const dx = col - px
      const dy = row - py
      const value = Math.exp(-(dx * dx + dy * dy) / (2 * radius * radius)) * weight
      if (value < 0.015) continue
      grid[row * HEAT_COLS + col] += value
    }
  }
}

function getHeatMax(grid: Float32Array) {
  let max = 0
  for (const value of grid) {
    if (value > max) max = value
  }
  return max
}

function buildLensPath(width: number, height: number) {
  const path = new Path2D()
  const k = 0.55
  const topH = height * 0.36
  const botH = height * 0.64
  const midY = topH
  const hw = width * 0.5
  path.moveTo(0, midY)
  path.bezierCurveTo(0, midY - topH * k, hw - hw * k, 0, hw, 0)
  path.bezierCurveTo(hw + hw * k, 0, width, midY - topH * k, width, midY)
  path.bezierCurveTo(width, midY + botH * k, hw + hw * k, height, hw, height)
  path.bezierCurveTo(hw - hw * k, height, 0, midY + botH * k, 0, midY)
  path.closePath()
  return path
}

function getRiskInsetAtY(y: number, profile: ProfileDescriptor) {
  const topBlend = smoothstep(0, 0.42, y)
  const bottomBlend = smoothstep(0.48, 1, y)
  const topValue = profile.topInset + (profile.midInset - profile.topInset) * topBlend
  return topValue + (profile.bottomInset - topValue) * bottomBlend
}

function isRiskPoint(x: number, y: number, profile: ProfileDescriptor) {
  const inset = getRiskInsetAtY(y, profile)
  return x <= inset || x >= 1 - inset
}

function drawRiskZones(ctx: CanvasRenderingContext2D, width: number, height: number, profile: ProfileDescriptor) {
  ctx.fillStyle = 'rgba(148, 163, 184, 0.78)'

  const drawSide = (mirror: boolean) => {
    ctx.beginPath()
    const samples = 16
    for (let i = 0; i <= samples; i += 1) {
      const t = i / samples
      const inset = getRiskInsetAtY(t, profile) * width
      const x = mirror ? width - inset : inset
      const y = t * height
      if (i === 0) ctx.moveTo(mirror ? width : 0, 0)
      ctx.lineTo(x, y)
    }
    ctx.lineTo(mirror ? width : 0, height)
    ctx.closePath()
    ctx.fill()
  }

  drawSide(false)
  drawSide(true)
}

function colorForHeat(value: number) {
  const t = clamp(value, 0, 1)
  const hue = 32 - t * 32
  const alpha = 0.08 + t * 0.82
  return `hsla(${hue}, 100%, ${60 - t * 10}%, ${alpha})`
}

function drawLensHeatmap(
  canvas: HTMLCanvasElement,
  grid: Float32Array,
  profile?: ProfileDescriptor,
  title?: string,
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const width = canvas.width
  const height = canvas.height
  const padding = 28
  const lensWidth = width - padding * 2
  const lensHeight = height - padding * 2 - (title ? 18 : 0)
  const lensX = padding
  const lensY = padding + (title ? 18 : 0)

  ctx.clearRect(0, 0, width, height)
  if (title) {
    ctx.fillStyle = '#e2e8f0'
    ctx.font = '700 14px ui-sans-serif, system-ui'
    ctx.textAlign = 'left'
    ctx.fillText(title, padding, 18)
  }

  const maxValue = getHeatMax(grid)
  const lensPath = buildLensPath(lensWidth, lensHeight)

  ctx.save()
  ctx.translate(lensX, lensY)
  ctx.fillStyle = '#f8fafc'
  ctx.strokeStyle = 'rgba(99, 102, 241, 0.42)'
  ctx.lineWidth = 6
  ctx.shadowColor = 'rgba(15, 23, 42, 0.18)'
  ctx.shadowBlur = 26
  ctx.fill(lensPath)
  ctx.shadowBlur = 0
  ctx.save()
  ctx.clip(lensPath)
  ctx.fillStyle = '#eef2ff'
  ctx.fillRect(0, 0, lensWidth, lensHeight)

  if (profile) {
    drawRiskZones(ctx, lensWidth, lensHeight, profile)
  }

  if (maxValue > 0) {
    for (let row = 0; row < HEAT_ROWS; row += 1) {
      for (let col = 0; col < HEAT_COLS; col += 1) {
        const value = grid[row * HEAT_COLS + col] / maxValue
        if (value < 0.06) continue
        const cellX = (col / HEAT_COLS) * lensWidth
        const cellY = (row / HEAT_ROWS) * lensHeight
        const cellW = lensWidth / HEAT_COLS + 1
        const cellH = lensHeight / HEAT_ROWS + 1
        ctx.fillStyle = colorForHeat(value)
        ctx.beginPath()
        ctx.roundRect(cellX, cellY, cellW, cellH, 6)
        ctx.fill()
      }
    }
  }

  ctx.restore()
  ctx.stroke(lensPath)
  ctx.restore()
}

function drawTrackingOverlay(
  canvas: HTMLCanvasElement,
  landmarks: NormalizedPoint[] | null,
  metrics: FaceMetrics,
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  if (!landmarks || !metrics.faceDetected) return

  ctx.strokeStyle = 'rgba(56, 189, 248, 0.75)'
  ctx.lineWidth = 1.5

  const leftEyeOuter = getLandmark(landmarks, LANDMARKS.leftEyeOuter)
  const leftEyeInner = getLandmark(landmarks, LANDMARKS.leftEyeInner)
  const leftEyeTop = getLandmark(landmarks, LANDMARKS.leftEyeTop)
  const leftEyeBottom = getLandmark(landmarks, LANDMARKS.leftEyeBottom)
  const rightEyeOuter = getLandmark(landmarks, LANDMARKS.rightEyeOuter)
  const rightEyeInner = getLandmark(landmarks, LANDMARKS.rightEyeInner)
  const rightEyeTop = getLandmark(landmarks, LANDMARKS.rightEyeTop)
  const rightEyeBottom = getLandmark(landmarks, LANDMARKS.rightEyeBottom)
  const leftIris = getLandmark(landmarks, LANDMARKS.leftIris)
  const rightIris = getLandmark(landmarks, LANDMARKS.rightIris)
  const nose = getLandmark(landmarks, LANDMARKS.nose)

  const drawEye = (
    outer: NormalizedPoint,
    inner: NormalizedPoint,
    top: NormalizedPoint,
    bottom: NormalizedPoint,
    iris: NormalizedPoint,
  ) => {
    const width = canvas.width
    const height = canvas.height
    ctx.beginPath()
    ctx.ellipse(
      ((outer.x + inner.x) / 2) * width,
      ((top.y + bottom.y) / 2) * height,
      Math.abs(inner.x - outer.x) * width * 0.52,
      Math.abs(bottom.y - top.y) * height * 1.4,
      0,
      0,
      Math.PI * 2,
    )
    ctx.stroke()
    ctx.fillStyle = 'rgba(239, 68, 68, 0.95)'
    ctx.beginPath()
    ctx.arc(iris.x * width, iris.y * height, 4.5, 0, Math.PI * 2)
    ctx.fill()
  }

  drawEye(leftEyeOuter, leftEyeInner, leftEyeTop, leftEyeBottom, leftIris)
  drawEye(rightEyeOuter, rightEyeInner, rightEyeTop, rightEyeBottom, rightIris)

  ctx.strokeStyle = 'rgba(34, 197, 94, 0.9)'
  ctx.beginPath()
  ctx.moveTo(nose.x * canvas.width, nose.y * canvas.height)
  ctx.lineTo((nose.x + metrics.headX * 0.06) * canvas.width, (nose.y + metrics.headY * 0.05) * canvas.height)
  ctx.stroke()
}

function summarizeSession(samples: Array<{ eyeX: number; eyeY: number; headX: number; headY: number }>): SessionSummary {
  if (!samples.length) {
    return {
      eyeShare: 0,
      headShare: 0,
      heatSpreadX: 0,
      heatSpreadY: 0,
      sampleCount: 0,
      wideScore: 0,
      narrowScore: 0,
      label: 'Sem amostras suficientes',
      message: 'A sessão ainda não coletou dados estáveis do rosto.',
    }
  }

  let eyeTotal = 0
  let headTotal = 0
  let sumX = 0
  let sumY = 0
  let riskWide = 0
  let riskNarrow = 0

  const points = samples.map((sample) => {
    const x = clamp(0.5 + sample.eyeX * 0.18, 0.05, 0.95)
    const y = clamp(0.52 + sample.eyeY * 0.16, 0.06, 0.94)
    eyeTotal += Math.hypot(sample.eyeX, sample.eyeY)
    headTotal += Math.hypot(sample.headX, sample.headY)
    sumX += x
    sumY += y
    if (isRiskPoint(x, y, COMPARISON_PROFILES[0])) riskWide += 1
    if (isRiskPoint(x, y, COMPARISON_PROFILES[1])) riskNarrow += 1
    return { x, y }
  })

  const meanX = sumX / points.length
  const meanY = sumY / points.length
  let varianceX = 0
  let varianceY = 0
  for (const point of points) {
    varianceX += (point.x - meanX) ** 2
    varianceY += (point.y - meanY) ** 2
  }

  const eyeShare = eyeTotal / Math.max(eyeTotal + headTotal, 0.0001)
  const headShare = headTotal / Math.max(eyeTotal + headTotal, 0.0001)
  const heatSpreadX = Math.sqrt(varianceX / points.length)
  const heatSpreadY = Math.sqrt(varianceY / points.length)
  const wideScore = 1 - riskWide / points.length
  const narrowScore = 1 - riskNarrow / points.length

  let label = 'Perfil misto'
  let message = 'O cliente alterna bem entre olhos e cabeça. Vale comparar conforto percebido entre campos médios e amplos.'
  if (headShare >= 0.6 && heatSpreadX < 0.09) {
    label = 'Perfil centralizado'
    message = 'A amostra ficou concentrada no centro da lente. Esse comportamento tende a tolerar designs mais compactos com bom conforto.'
  } else if (eyeShare >= 0.62 || heatSpreadX >= 0.115) {
    label = 'Perfil explorador com olhos'
    message = 'O mapa se espalhou mais pelas bordas. Esse padrão favorece campos mais generosos para reduzir sensação de distorção.'
  }

  return {
    eyeShare,
    headShare,
    heatSpreadX,
    heatSpreadY,
    sampleCount: points.length,
    wideScore,
    narrowScore,
    label,
    message,
  }
}

export default function GazeHeatmapLab({
  storeId,
  backPath,
}: {
  storeId: number
  backPath: string
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const mainHeatmapRef = useRef<HTMLCanvasElement>(null)
  const wideHeatmapRef = useRef<HTMLCanvasElement>(null)
  const narrowHeatmapRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const landmarkerRef = useRef<FaceLandmarkerInstance | null>(null)
  const animationRef = useRef<number | null>(null)
  const targetTimerRef = useRef<number | null>(null)
  const sessionTimerRef = useRef<number | null>(null)
  const calibrationTimerRef = useRef<number | null>(null)
  const lastTickRef = useRef<number>(0)
  const lastUiTickRef = useRef<number>(0)
  const phaseRef = useRef<SessionPhase>('idle')
  const heatmapRef = useRef<Float32Array>(makeHeatmap())
  const samplesRef = useRef<Array<{ eyeX: number; eyeY: number; headX: number; headY: number }>>([])
  const calibrationSamplesRef = useRef<FaceMetrics[]>([])
  const baselineRef = useRef({ eyeX: 0, eyeY: 0, headX: 0, headY: 0 })
  const currentTargetRef = useRef<NormalizedPoint>({ x: 0.5, y: 0.5 })
  const targetStartedAtRef = useRef<number>(0)

  const [cameraReady, setCameraReady] = useState(false)
  const [loadingModel, setLoadingModel] = useState(false)
  const [phase, setPhase] = useState<SessionPhase>('idle')
  const [hasCalibration, setHasCalibration] = useState(false)
  const [status, setStatus] = useState('Abra a câmera frontal e alinhe o rosto ao centro.')
  const [target, setTarget] = useState<NormalizedPoint>({ x: 0.5, y: 0.5 })
  const [liveMetrics, setLiveMetrics] = useState<FaceMetrics>({
    faceDetected: false,
    eyeX: 0,
    eyeY: 0,
    headX: 0,
    headY: 0,
  })
  const [summary, setSummary] = useState<SessionSummary | null>(null)
  const [secureContextWarning, setSecureContextWarning] = useState(false)

  useEffect(() => {
    setSecureContextWarning(typeof window !== 'undefined' && !window.isSecureContext)
  }, [])

  useEffect(() => {
    if (mainHeatmapRef.current) {
      drawLensHeatmap(mainHeatmapRef.current, heatmapRef.current, undefined, 'Mapa de calor da lente')
    }
    if (wideHeatmapRef.current) {
      drawLensHeatmap(wideHeatmapRef.current, heatmapRef.current, COMPARISON_PROFILES[0], COMPARISON_PROFILES[0].name)
    }
    if (narrowHeatmapRef.current) {
      drawLensHeatmap(narrowHeatmapRef.current, heatmapRef.current, COMPARISON_PROFILES[1], COMPARISON_PROFILES[1].name)
    }
  }, [])

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  useEffect(() => {
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
      if (targetTimerRef.current) window.clearInterval(targetTimerRef.current)
      if (sessionTimerRef.current) window.clearTimeout(sessionTimerRef.current)
      if (calibrationTimerRef.current) window.clearTimeout(calibrationTimerRef.current)
      landmarkerRef.current?.close?.()
      streamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  async function ensureLandmarker() {
    if (landmarkerRef.current) return landmarkerRef.current

    setLoadingModel(true)
    setStatus('Carregando o modelo facial no navegador...')

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

      setStatus('Modelo pronto. Agora podemos abrir a câmera frontal.')
      return landmarkerRef.current
    } finally {
      setLoadingModel(false)
    }
  }

  async function startCamera() {
    try {
      await ensureLandmarker()
      setStatus('Solicitando acesso à câmera frontal...')

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: 'user',
          width: { ideal: VIDEO_W },
          height: { ideal: VIDEO_H },
          frameRate: { ideal: 30, max: 30 },
        },
      })

      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = stream

      const video = videoRef.current
      if (!video) return

      video.srcObject = stream
      await video.play()
      setCameraReady(true)
      setStatus('Câmera ativa. Deixe o rosto centralizado e inicie a calibração.')
      startTrackingLoop()
    } catch (error) {
      console.error(error)
      setStatus('Não foi possível abrir a câmera. No tablet, use HTTPS ou uma origem segura.')
    }
  }

  function stopSessionTimers() {
    if (targetTimerRef.current) {
      window.clearInterval(targetTimerRef.current)
      targetTimerRef.current = null
    }
    if (sessionTimerRef.current) {
      window.clearTimeout(sessionTimerRef.current)
      sessionTimerRef.current = null
    }
    if (calibrationTimerRef.current) {
      window.clearTimeout(calibrationTimerRef.current)
      calibrationTimerRef.current = null
    }
  }

  function resetLab() {
    stopSessionTimers()
    heatmapRef.current = makeHeatmap()
    samplesRef.current = []
    calibrationSamplesRef.current = []
    baselineRef.current = { eyeX: 0, eyeY: 0, headX: 0, headY: 0 }
    currentTargetRef.current = { x: 0.5, y: 0.5 }
    targetStartedAtRef.current = 0
    setHasCalibration(false)
    setTarget({ x: 0.5, y: 0.5 })
    setPhase('idle')
    setSummary(null)
    setStatus(cameraReady ? 'Câmera pronta. Faça uma nova calibração quando quiser.' : 'Abra a câmera frontal e alinhe o rosto ao centro.')
    if (mainHeatmapRef.current) {
      drawLensHeatmap(mainHeatmapRef.current, heatmapRef.current, undefined, 'Mapa de calor da lente')
    }
    if (wideHeatmapRef.current) {
      drawLensHeatmap(wideHeatmapRef.current, heatmapRef.current, COMPARISON_PROFILES[0], COMPARISON_PROFILES[0].name)
    }
    if (narrowHeatmapRef.current) {
      drawLensHeatmap(narrowHeatmapRef.current, heatmapRef.current, COMPARISON_PROFILES[1], COMPARISON_PROFILES[1].name)
    }
  }

  function randomTarget() {
    return {
      x: SAFE_TARGET_MARGIN_X + Math.random() * (1 - SAFE_TARGET_MARGIN_X * 2),
      y: SAFE_TARGET_MARGIN_Y + Math.random() * (1 - SAFE_TARGET_MARGIN_Y * 2),
    }
  }

  function moveTarget(point = randomTarget()) {
    currentTargetRef.current = point
    targetStartedAtRef.current = performance.now()
    setTarget(point)
  }

  function startCalibration() {
    if (!cameraReady) return
    stopSessionTimers()
    calibrationSamplesRef.current = []
    setPhase('calibrating')
    setSummary(null)
    moveTarget({ x: 0.5, y: 0.5 })
    setStatus('Calibração rápida: peça para o cliente olhar para o ponto central por 3 segundos.')
    calibrationTimerRef.current = window.setTimeout(() => {
      const samples = calibrationSamplesRef.current
      if (!samples.length) {
        setStatus('Não houve rastreamento suficiente na calibração. Tente aproximar o rosto e melhorar a luz.')
        setPhase('idle')
        return
      }
      baselineRef.current = samples.reduce(
        (acc, sample) => ({
          eyeX: acc.eyeX + sample.eyeX / samples.length,
          eyeY: acc.eyeY + sample.eyeY / samples.length,
          headX: acc.headX + sample.headX / samples.length,
          headY: acc.headY + sample.headY / samples.length,
        }),
        { eyeX: 0, eyeY: 0, headX: 0, headY: 0 },
      )
      setHasCalibration(true)
      setPhase('idle')
      setStatus('Calibração concluída. Agora já podemos rodar a sessão com alvo móvel.')
    }, CALIBRATION_DURATION_MS)
  }

  function finishSession() {
    stopSessionTimers()
    setPhase('finished')
    const nextSummary = summarizeSession(samplesRef.current)
    setSummary(nextSummary)
    setStatus('Sessão concluída. Agora vale comparar o mapa contra geometrias de lente mais estreitas e mais amplas.')
  }

  function startSession() {
    if (!cameraReady) return
    if (!hasCalibration) {
      setStatus('Faça a calibração central antes de iniciar a sessão.')
      return
    }

    heatmapRef.current = makeHeatmap()
    samplesRef.current = []
    setSummary(null)
    setPhase('running')
    setStatus('Sessão em andamento. O cliente deve seguir a bolinha vermelha sem instrução extra sobre mexer a cabeça.')
    moveTarget()

    targetTimerRef.current = window.setInterval(() => {
      moveTarget()
    }, TARGET_INTERVAL_MS)

    sessionTimerRef.current = window.setTimeout(() => {
      finishSession()
    }, SESSION_DURATION_MS)
  }

  function startTrackingLoop() {
    if (animationRef.current) cancelAnimationFrame(animationRef.current)

    const loop = () => {
      const video = videoRef.current
      const overlay = overlayRef.current
      const landmarker = landmarkerRef.current
      if (!video || !overlay || !landmarker) {
        animationRef.current = requestAnimationFrame(loop)
        return
      }

      if (video.readyState < 2) {
        animationRef.current = requestAnimationFrame(loop)
        return
      }

      const now = performance.now()
      if (now - lastTickRef.current < 33) {
        animationRef.current = requestAnimationFrame(loop)
        return
      }
      lastTickRef.current = now

      const result = landmarker.detectForVideo(video, now)
      const landmarks = result.faceLandmarks?.[0] as NormalizedPoint[] | undefined
      const metrics = landmarks ? computeFaceMetrics(landmarks) : { faceDetected: false, eyeX: 0, eyeY: 0, headX: 0, headY: 0 }
      drawTrackingOverlay(overlay, landmarks ?? null, metrics)

      if (phaseRef.current === 'calibrating' && metrics.faceDetected) {
        calibrationSamplesRef.current.push(metrics)
      }

      if (phaseRef.current === 'running' && metrics.faceDetected && now - targetStartedAtRef.current > 260) {
        const relativeEyeX = clamp(metrics.eyeX - baselineRef.current.eyeX, -1.2, 1.2)
        const relativeEyeY = clamp(metrics.eyeY - baselineRef.current.eyeY, -1.2, 1.2)
        const relativeHeadX = clamp(metrics.headX - baselineRef.current.headX, -1.2, 1.2)
        const relativeHeadY = clamp(metrics.headY - baselineRef.current.headY, -1.2, 1.2)
        samplesRef.current.push({
          eyeX: relativeEyeX,
          eyeY: relativeEyeY,
          headX: relativeHeadX,
          headY: relativeHeadY,
        })
        addHeatPoint(heatmapRef.current, {
          x: 0.5 + relativeEyeX * 0.18,
          y: 0.52 + relativeEyeY * 0.16,
        })
      }

      if (now - lastUiTickRef.current > 120) {
        setLiveMetrics(metrics)
        if (mainHeatmapRef.current) {
          drawLensHeatmap(mainHeatmapRef.current, heatmapRef.current, undefined, 'Mapa de calor da lente')
        }
        if (wideHeatmapRef.current) {
          drawLensHeatmap(wideHeatmapRef.current, heatmapRef.current, COMPARISON_PROFILES[0], COMPARISON_PROFILES[0].name)
        }
        if (narrowHeatmapRef.current) {
          drawLensHeatmap(narrowHeatmapRef.current, heatmapRef.current, COMPARISON_PROFILES[1], COMPARISON_PROFILES[1].name)
        }
        lastUiTickRef.current = now
      }

      animationRef.current = requestAnimationFrame(loop)
    }

    animationRef.current = requestAnimationFrame(loop)
  }

  const wideProfile = summary ? Math.round(summary.wideScore * 100) : 0
  const narrowProfile = summary ? Math.round(summary.narrowScore * 100) : 0
  const headPercent = Math.round((summary?.headShare ?? 0) * 100)
  const eyePercent = Math.round((summary?.eyeShare ?? 0) * 100)

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="border-b border-white/10 bg-slate-900/90 px-5 py-4 backdrop-blur">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={backPath}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-800 px-4 py-2 text-sm font-bold text-slate-200 transition hover:bg-slate-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Link>
          <div className="min-w-0">
            <p className="text-xl font-black tracking-tight">Laboratório de mapa de calor ocular</p>
            <p className="text-sm text-slate-400">
              Loja {storeId} · MVP para Chrome em tablet usando câmera frontal e alvo guiado.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-5 px-5 py-5 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.12),_transparent_42%),linear-gradient(180deg,_rgba(15,23,42,0.98),_rgba(2,6,23,0.98))] p-5 shadow-[0_35px_90px_rgba(2,6,23,0.45)]">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-300/80">Teste guiado</p>
              <p className="text-sm text-slate-400">
                O ponto vermelho induz sacadas na tela enquanto medimos cabeça e íris.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={startCamera}
                disabled={loadingModel}
                className="inline-flex items-center gap-2 rounded-2xl bg-cyan-500 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-300"
              >
                {loadingModel ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                Abrir câmera
              </button>
              <button
                onClick={startCalibration}
                disabled={!cameraReady || phase === 'calibrating'}
                className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-800 px-4 py-2.5 text-sm font-black text-slate-200 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:text-slate-500"
              >
                <ScanFace className="h-4 w-4" />
                Calibrar
              </button>
              <button
                onClick={startSession}
                disabled={!cameraReady || phase === 'running' || !hasCalibration}
                className="inline-flex items-center gap-2 rounded-2xl border border-rose-400/30 bg-rose-500/15 px-4 py-2.5 text-sm font-black text-rose-200 transition hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:text-slate-500"
              >
                <Play className="h-4 w-4" />
                Iniciar sessão
              </button>
              <button
                onClick={finishSession}
                disabled={phase !== 'running'}
                className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-800 px-4 py-2.5 text-sm font-black text-slate-200 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:text-slate-500"
              >
                <StopCircle className="h-4 w-4" />
                Encerrar
              </button>
              <button
                onClick={resetLab}
                className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-800 px-4 py-2.5 text-sm font-black text-slate-200 transition hover:bg-slate-700"
              >
                <RotateCcw className="h-4 w-4" />
                Resetar
              </button>
            </div>
          </div>

          <div className="mb-4 rounded-3xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-slate-300">
            {status}
          </div>

          {secureContextWarning && (
            <div className="mb-4 rounded-3xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              O navegador não está em contexto seguro. No tablet Samsung, `getUserMedia` costuma exigir HTTPS ou origem confiável.
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <div
              ref={stageRef}
              className="relative aspect-video overflow-hidden rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_50%_20%,_rgba(59,130,246,0.18),_rgba(2,6,23,0.94)_55%),linear-gradient(180deg,_rgba(15,23,42,0.95),_rgba(2,6,23,1))]"
            >
              <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.06)_1px,transparent_1px)] bg-[size:32px_32px]" />
              <div
                className="absolute z-20 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500 shadow-[0_0_0_8px_rgba(239,68,68,0.16),0_0_34px_rgba(239,68,68,0.8)] transition-all duration-500"
                style={{
                  left: `${target.x * 100}%`,
                  top: `${target.y * 100}%`,
                }}
              />
              <div className="absolute bottom-4 left-4 rounded-full bg-slate-900/70 px-3 py-1 text-xs font-bold text-slate-300 backdrop-blur">
                {phase === 'running' ? 'Sessão ativa' : phase === 'calibrating' ? 'Calibração' : 'Aguardando'}
              </div>
            </div>

            <div className="space-y-4">
              <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-slate-900">
                <video
                  ref={videoRef}
                  className="aspect-video w-full object-cover scale-x-[-1]"
                  playsInline
                  muted
                  autoPlay
                />
                <canvas
                  ref={overlayRef}
                  width={VIDEO_W}
                  height={VIDEO_H}
                  className="absolute inset-0 h-full w-full scale-x-[-1]"
                />
              </div>

              <div className="rounded-[28px] border border-white/10 bg-slate-900/80 p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-slate-800/90 p-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Uso dos olhos</p>
                    <p className="mt-2 text-2xl font-black text-cyan-300">
                      {Math.round(Math.abs(liveMetrics.eyeX) * 100)}%
                    </p>
                    <p className="text-xs text-slate-500">Amplitude lateral instantânea da íris.</p>
                  </div>
                  <div className="rounded-2xl bg-slate-800/90 p-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Uso da cabeça</p>
                    <p className="mt-2 text-2xl font-black text-emerald-300">
                      {Math.round(Math.abs(liveMetrics.headX) * 100)}%
                    </p>
                    <p className="text-xs text-slate-500">Compensação lateral da cabeça.</p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  Neste MVP, o mapa de calor da lente é alimentado principalmente pelo deslocamento relativo da íris dentro dos olhos.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-5">
          <div className="rounded-[28px] border border-white/10 bg-slate-900/90 p-5 shadow-[0_25px_70px_rgba(2,6,23,0.38)]">
            <div className="mb-3 flex items-center gap-2">
              <CircleDot className="h-4 w-4 text-amber-300" />
              <p className="text-sm font-black text-white">Leitura da sessão</p>
            </div>
            {summary ? (
              <div className="space-y-3">
                <div className="rounded-3xl border border-white/10 bg-slate-800/80 p-4">
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">{summary.label}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-200">{summary.message}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-slate-800 p-4">
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Olhos</p>
                    <p className="mt-2 text-3xl font-black text-cyan-300">{eyePercent}%</p>
                  </div>
                  <div className="rounded-2xl bg-slate-800 p-4">
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Cabeça</p>
                    <p className="mt-2 text-3xl font-black text-emerald-300">{headPercent}%</p>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4">
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-100">Compatível com campo amplo</p>
                    <p className="mt-2 text-3xl font-black text-emerald-300">{wideProfile}%</p>
                  </div>
                  <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4">
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-amber-100">Compatível com campo compacto</p>
                    <p className="mt-2 text-3xl font-black text-amber-300">{narrowProfile}%</p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm leading-6 text-slate-400">
                Assim que a sessão terminar, este painel vai resumir quanto o cliente centraliza o olhar e o quanto ele tende a explorar as bordas da lente.
              </p>
            )}
          </div>

          <div className="rounded-[28px] border border-white/10 bg-slate-900/90 p-5 shadow-[0_25px_70px_rgba(2,6,23,0.38)]">
            <canvas ref={mainHeatmapRef} width={620} height={360} className="h-auto w-full" />
            <p className="mt-3 text-xs leading-5 text-slate-500">
              A ideia aqui é enxergar se o uso real do campo visual fica concentrado no centro ou escapa para zonas mais sensíveis das bordas.
            </p>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-[28px] border border-white/10 bg-slate-900/90 p-4">
              <canvas ref={wideHeatmapRef} width={420} height={270} className="h-auto w-full" />
              <p className="mt-2 text-xs text-slate-500">{COMPARISON_PROFILES[0].subtitle}</p>
            </div>
            <div className="rounded-[28px] border border-white/10 bg-slate-900/90 p-4">
              <canvas ref={narrowHeatmapRef} width={420} height={270} className="h-auto w-full" />
              <p className="mt-2 text-xs text-slate-500">{COMPARISON_PROFILES[1].subtitle}</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
