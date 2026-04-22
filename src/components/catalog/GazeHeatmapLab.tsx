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
  eyeShareX: number
  headShareX: number
  eyeShareY: number
  headShareY: number
  heatSpreadX: number
  heatSpreadY: number
  sampleCount: number
  wideScore: number
  narrowScore: number
  label: string
  message: string
}
type SessionSample = {
  eyeX: number
  eyeY: number
  headX: number
  headY: number
  targetX: number
  targetY: number
}
type MediaPipeModule = typeof import('@mediapipe/tasks-vision')
type FaceLandmarkerInstance = Awaited<ReturnType<MediaPipeModule['FaceLandmarker']['createFromOptions']>>

const VIDEO_W = 960
const VIDEO_H = 540
const HEAT_COLS = 44
const HEAT_ROWS = 28
const TARGET_INTERVAL_MS = 1450
const CALIBRATION_DURATION_MS = 3000
const SAFE_TARGET_MARGIN_X = 0.04
const SAFE_TARGET_MARGIN_Y = 0.08
const EYE_DEADZONE_X = 0.035
const EYE_DEADZONE_Y = 0.04
const HEAD_DEADZONE_X = 0.09
const HEAD_DEADZONE_Y = 0.11
const EYE_RESPONSE_X = 0.58
const EYE_RESPONSE_Y = 0.52
const HEAD_RESPONSE_X = 0.64
const HEAD_RESPONSE_Y = 0.58

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

const applyDeadzone = (value: number, deadzone: number, limit = 1.2) => {
  const absValue = Math.abs(value)
  if (absValue <= deadzone) return 0
  const normalized = clamp((absValue - deadzone) / Math.max(limit - deadzone, 0.0001), 0, 1)
  return Math.sign(value) * normalized
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

function addHeatPoint(
  grid: Float32Array,
  point: NormalizedPoint,
  weight = 1,
  radius = 2.2,
  mode: 'sum' | 'max' = 'sum',
) {
  const px = clamp(point.x, 0.01, 0.99) * (HEAT_COLS - 1)
  const py = clamp(point.y, 0.01, 0.99) * (HEAT_ROWS - 1)

  for (let row = 0; row < HEAT_ROWS; row += 1) {
    for (let col = 0; col < HEAT_COLS; col += 1) {
      const dx = col - px
      const dy = row - py
      const value = Math.exp(-(dx * dx + dy * dy) / (2 * radius * radius)) * weight
      if (value < 0.015) continue
      const index = row * HEAT_COLS + col
      if (mode === 'max') grid[index] = Math.max(grid[index], value)
      else grid[index] += value
    }
  }
}

function shufflePoints(points: NormalizedPoint[]) {
  const next = [...points]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const swapIndex = Math.floor(Math.random() * (i + 1))
    const tmp = next[i]
    next[i] = next[swapIndex]
    next[swapIndex] = tmp
  }
  return next
}

function jitterPoint(point: NormalizedPoint, amountX = 0.025, amountY = 0.03) {
  return {
    x: clamp(point.x + (Math.random() * 2 - 1) * amountX, SAFE_TARGET_MARGIN_X, 1 - SAFE_TARGET_MARGIN_X),
    y: clamp(point.y + (Math.random() * 2 - 1) * amountY, SAFE_TARGET_MARGIN_Y, 1 - SAFE_TARGET_MARGIN_Y),
  }
}

function buildTargetSequence() {
  const anchors: NormalizedPoint[] = [
    { x: 0.5, y: 0.5 },
    { x: 0.08, y: 0.5 },
    { x: 0.92, y: 0.5 },
    { x: 0.5, y: 0.1 },
    { x: 0.5, y: 0.9 },
    { x: 0.08, y: 0.1 },
    { x: 0.92, y: 0.1 },
    { x: 0.08, y: 0.9 },
    { x: 0.92, y: 0.9 },
    { x: 0.24, y: 0.24 },
    { x: 0.76, y: 0.24 },
    { x: 0.24, y: 0.76 },
    { x: 0.76, y: 0.76 },
    { x: 0.5, y: 0.24 },
    { x: 0.5, y: 0.76 },
    { x: 0.24, y: 0.5 },
    { x: 0.76, y: 0.5 },
  ]

  const requiredExtremes = anchors.slice(1, 9)
  const exploratoryBand = anchors.slice(9)

  return [
    { x: 0.5, y: 0.5 },
    ...shufflePoints(requiredExtremes).map((point) => jitterPoint(point, 0.018, 0.024)),
    ...shufflePoints(exploratoryBand).map((point) => jitterPoint(point, 0.028, 0.034)),
  ]
}

function normalizeTargetOffset(targetX: number, targetY: number) {
  return {
    x: clamp((targetX - 0.5) / 0.5, -1, 1),
    y: clamp((targetY - 0.5) / 0.5, -1, 1),
  }
}

function getAxisEyeShare(eye: number, head: number, headPenalty: number) {
  const eyeStrength = clamp(Math.abs(eye) / 0.52, 0, 1.6)
  const headStrength = clamp(Math.abs(head) / 0.48, 0, 1.6) * headPenalty
  const rawShare = eyeStrength / Math.max(eyeStrength + headStrength, 0.0001)
  return smoothstep(0.1, 0.9, rawShare)
}

function projectSampleToLens(sample: SessionSample) {
  const target = normalizeTargetOffset(sample.targetX, sample.targetY)
  const demandX = Math.abs(target.x)
  const demandY = Math.abs(target.y)
  const normalizedEyeX = applyDeadzone(sample.eyeX, EYE_DEADZONE_X)
  const normalizedEyeY = applyDeadzone(sample.eyeY, EYE_DEADZONE_Y)
  const normalizedHeadX = applyDeadzone(sample.headX, HEAD_DEADZONE_X)
  const normalizedHeadY = applyDeadzone(sample.headY, HEAD_DEADZONE_Y)
  const eyeMag = Math.hypot(normalizedEyeX, normalizedEyeY)
  const eyeNorm = clamp(eyeMag / 0.48, 0, 1.35)
  const eyeShareX = getAxisEyeShare(
    normalizedEyeX * (0.55 + demandX * EYE_RESPONSE_X),
    normalizedHeadX * (0.38 + demandX * HEAD_RESPONSE_X),
    1.18,
  )
  const eyeShareY = getAxisEyeShare(
    normalizedEyeY * (0.5 + demandY * EYE_RESPONSE_Y),
    normalizedHeadY * (0.34 + demandY * HEAD_RESPONSE_Y),
    1.34,
  )
  const demandedWeight = Math.max(demandX + demandY, 0.0001)
  const eyeDemandShare = clamp((eyeShareX * demandX + eyeShareY * demandY) / demandedWeight, 0, 1)
  const headDemandShare = 1 - eyeDemandShare
  const lensDemandX = target.x * eyeShareX
  const lensDemandY = target.y * eyeShareY
  const edgeSpread = clamp(0.42 + eyeDemandShare * 1.25 + eyeNorm * 0.22, 0.42, 1.98)
  const verticalBias = clamp(0.82 + demandY * 0.95 + eyeShareY * 0.3, 0.82, 1.75)

  const point = {
    x: clamp(
      0.5 +
        lensDemandX * 0.42 +
        normalizedEyeX * 0.05,
      0.03,
      0.97,
    ),
    y: clamp(
      0.52 +
        lensDemandY * 0.42 * verticalBias +
        normalizedEyeY * 0.08,
      0.03,
      0.95,
    ),
  }

  return {
    point,
    radius: 1.7 + edgeSpread * 1.18,
    spreadX: 0.006 + demandX * 0.052 * eyeShareX + eyeDemandShare * 0.018,
    spreadY: 0.012 + demandY * 0.085 * eyeShareY + eyeDemandShare * 0.026 + headDemandShare * 0.008,
    weight: 1 + eyeDemandShare * 0.22,
    eyeDominance: eyeDemandShare,
    headDominance: headDemandShare,
    eyeShareX,
    eyeShareY,
    demandWeight: demandedWeight,
  }
}

function stampHeatSample(grid: Float32Array, sample: SessionSample) {
  const projection = projectSampleToLens(sample)
  addHeatPoint(grid, projection.point, projection.weight, projection.radius, 'max')

  const satelliteWeight = projection.weight * 0.56
  const satelliteRadius = projection.radius * 0.92
  addHeatPoint(
    grid,
    {
      x: clamp(projection.point.x + projection.spreadX, 0.02, 0.98),
      y: clamp(projection.point.y + projection.spreadY * 0.35, 0.02, 0.98),
    },
    satelliteWeight,
    satelliteRadius,
    'max',
  )
  addHeatPoint(
    grid,
    {
      x: clamp(projection.point.x - projection.spreadX, 0.02, 0.98),
      y: clamp(projection.point.y - projection.spreadY * 0.35, 0.02, 0.98),
    },
    satelliteWeight,
    satelliteRadius,
    'max',
  )
  addHeatPoint(
    grid,
    {
      x: clamp(projection.point.x, 0.02, 0.98),
      y: clamp(projection.point.y + projection.spreadY, 0.02, 0.98),
    },
    projection.weight * 0.34,
    projection.radius * 0.78,
    'max',
  )
  addHeatPoint(
    grid,
    {
      x: clamp(projection.point.x, 0.02, 0.98),
      y: clamp(projection.point.y - projection.spreadY * 0.92, 0.02, 0.98),
    },
    projection.weight * 0.3,
    projection.radius * 0.72,
    'max',
  )
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

function summarizeSession(samples: SessionSample[]): SessionSummary {
  if (!samples.length) {
    return {
      eyeShare: 0,
      headShare: 0,
      eyeShareX: 0,
      headShareX: 0,
      eyeShareY: 0,
      headShareY: 0,
      heatSpreadX: 0,
      heatSpreadY: 0,
      sampleCount: 0,
      wideScore: 0,
      narrowScore: 0,
      label: 'Sem amostras suficientes',
      message: 'A sessÃ£o ainda nÃ£o coletou dados estÃ¡veis do rosto.',
    }
  }

  let eyeTotal = 0
  let headTotal = 0
  let eyeTotalX = 0
  let headTotalX = 0
  let eyeTotalY = 0
  let headTotalY = 0
  let sumX = 0
  let sumY = 0
  let riskWide = 0
  let riskNarrow = 0

  const points = samples.map((sample) => {
    const projection = projectSampleToLens(sample)
    const { x, y } = projection.point
    eyeTotal += projection.eyeDominance * projection.demandWeight
    headTotal += projection.headDominance * projection.demandWeight
    eyeTotalX += projection.eyeShareX * Math.max(Math.abs(normalizeTargetOffset(sample.targetX, sample.targetY).x), 0.0001)
    headTotalX += (1 - projection.eyeShareX) * Math.max(Math.abs(normalizeTargetOffset(sample.targetX, sample.targetY).x), 0.0001)
    eyeTotalY += projection.eyeShareY * Math.max(Math.abs(normalizeTargetOffset(sample.targetX, sample.targetY).y), 0.0001)
    headTotalY += (1 - projection.eyeShareY) * Math.max(Math.abs(normalizeTargetOffset(sample.targetX, sample.targetY).y), 0.0001)
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
  const eyeShareX = eyeTotalX / Math.max(eyeTotalX + headTotalX, 0.0001)
  const headShareX = headTotalX / Math.max(eyeTotalX + headTotalX, 0.0001)
  const eyeShareY = eyeTotalY / Math.max(eyeTotalY + headTotalY, 0.0001)
  const headShareY = headTotalY / Math.max(eyeTotalY + headTotalY, 0.0001)
  const heatSpreadX = Math.sqrt(varianceX / points.length)
  const heatSpreadY = Math.sqrt(varianceY / points.length)
  const wideScore = 1 - riskWide / points.length
  const narrowScore = 1 - riskNarrow / points.length

  let label = 'Perfil misto'
  let message = 'O cliente alterna bem entre olhos e cabeÃ§a. Vale comparar conforto percebido entre campos mÃ©dios e amplos.'
  if (headShareX >= 0.62 && eyeShareY >= 0.56 && heatSpreadX < 0.11) {
    label = 'Perfil centralizado'
    message = 'Lateralmente o cliente leva bem a cabeÃ§a, mas no eixo vertical ainda usa os olhos com boa disciplina. Esse padrÃ£o tende a tolerar desenhos mais compactos.'
  } else if (eyeShareX >= 0.58 || heatSpreadX >= 0.145) {
    label = 'Perfil explorador com olhos'
    message = 'O mapa se espalhou mais nas laterais, indicando maior exigÃªncia do campo visual da lente. Esse padrÃ£o favorece campos mais generosos.'
  } else if (headShareY >= 0.58) {
    label = 'Perfil vertical com cabeÃ§a'
    message = 'Na vertical o cliente tende a levar a cabeÃ§a junto, o que pode atrapalhar o uso do perto em progressivas mais exigentes.'
  }

  return {
    eyeShare,
    headShare,
    eyeShareX,
    headShareX,
    eyeShareY,
    headShareY,
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
  const samplesRef = useRef<SessionSample[]>([])
  const calibrationSamplesRef = useRef<FaceMetrics[]>([])
  const baselineRef = useRef({ eyeX: 0, eyeY: 0, headX: 0, headY: 0 })
  const currentTargetRef = useRef<NormalizedPoint>({ x: 0.5, y: 0.5 })
  const targetStartedAtRef = useRef<number>(0)
  const targetSequenceRef = useRef<NormalizedPoint[]>([])
  const targetIndexRef = useRef<number>(0)

  const [cameraReady, setCameraReady] = useState(false)
  const [loadingModel, setLoadingModel] = useState(false)
  const [phase, setPhase] = useState<SessionPhase>('idle')
  const [hasCalibration, setHasCalibration] = useState(false)
  const [status, setStatus] = useState('Abra a cÃ¢mera frontal e alinhe o rosto ao centro.')
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
  const isFocusMode = phase === 'calibrating' || phase === 'running'

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
    const stage = stageRef.current
    if (!stage) return

    if (isFocusMode) {
      if (document.fullscreenElement !== stage) {
        stage.requestFullscreen?.().catch(() => {})
      }
      return
    }

    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {})
    }
  }, [isFocusMode])

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

      setStatus('Modelo pronto. Agora podemos abrir a cÃ¢mera frontal.')
      return landmarkerRef.current
    } finally {
      setLoadingModel(false)
    }
  }

  async function startCamera() {
    try {
      await ensureLandmarker()
      setStatus('Solicitando acesso Ã  cÃ¢mera frontal...')

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
      setStatus('CÃ¢mera ativa. Deixe o rosto centralizado e inicie a calibraÃ§Ã£o.')
      startTrackingLoop()
    } catch (error) {
      console.error(error)
      setStatus('NÃ£o foi possÃ­vel abrir a cÃ¢mera. No tablet, use HTTPS ou uma origem segura.')
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    const video = videoRef.current
    if (video) {
      video.pause()
      video.srcObject = null
    }
    const overlay = overlayRef.current
    overlay?.getContext('2d')?.clearRect(0, 0, overlay.width, overlay.height)
    setCameraReady(false)
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
    targetSequenceRef.current = []
    targetIndexRef.current = 0
    baselineRef.current = { eyeX: 0, eyeY: 0, headX: 0, headY: 0 }
    currentTargetRef.current = { x: 0.5, y: 0.5 }
    targetStartedAtRef.current = 0
    setHasCalibration(false)
    setTarget({ x: 0.5, y: 0.5 })
    setPhase('idle')
    setSummary(null)
    setStatus(cameraReady ? 'CÃ¢mera pronta. FaÃ§a uma nova calibraÃ§Ã£o quando quiser.' : 'Abra a cÃ¢mera frontal e alinhe o rosto ao centro.')
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

  function advanceSequenceTarget() {
    const sequence = targetSequenceRef.current
    if (!sequence.length) {
      moveTarget()
      return
    }

    if (targetIndexRef.current >= sequence.length) {
      finishSession()
      return
    }

    const point = sequence[targetIndexRef.current]
    moveTarget(point)
    targetIndexRef.current += 1
  }

  function startCalibration() {
    if (!cameraReady) return
    stopSessionTimers()
    calibrationSamplesRef.current = []
    setPhase('calibrating')
    setSummary(null)
    moveTarget({ x: 0.5, y: 0.5 })
    setStatus('CalibraÃ§Ã£o rÃ¡pida: peÃ§a para o cliente olhar para o ponto central por 3 segundos.')
    calibrationTimerRef.current = window.setTimeout(() => {
      const samples = calibrationSamplesRef.current
      if (!samples.length) {
        setStatus('NÃ£o houve rastreamento suficiente na calibraÃ§Ã£o. Tente aproximar o rosto e melhorar a luz.')
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
      setStatus('CalibraÃ§Ã£o concluÃ­da. Agora jÃ¡ podemos rodar a sessÃ£o com alvo mÃ³vel.')
    }, CALIBRATION_DURATION_MS)
  }

  function finishSession() {
    stopSessionTimers()
    setPhase('finished')
    const nextSummary = summarizeSession(samplesRef.current)
    setSummary(nextSummary)
    stopCamera()
    setStatus('SessÃ£o concluÃ­da. A cÃ¢mera foi desligada para aliviar o tablet. Reabra a cÃ¢mera quando quiser uma nova leitura.')
  }

  function startSession() {
    if (!cameraReady) return
    if (!hasCalibration) {
      setStatus('FaÃ§a a calibraÃ§Ã£o central antes de iniciar a sessÃ£o.')
      return
    }

    heatmapRef.current = makeHeatmap()
    samplesRef.current = []
    targetSequenceRef.current = buildTargetSequence()
    targetIndexRef.current = 0
    setSummary(null)
    setPhase('running')
    setStatus('SessÃ£o em andamento. O roteiro do alvo agora garante passagem por extremos, cantos e eixos para medir o campo realmente exigido.')
    advanceSequenceTarget()

    targetTimerRef.current = window.setInterval(() => {
      advanceSequenceTarget()
    }, TARGET_INTERVAL_MS)
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
        const sample = {
          eyeX: relativeEyeX,
          eyeY: relativeEyeY,
          headX: relativeHeadX,
          headY: relativeHeadY,
          targetX: currentTargetRef.current.x,
          targetY: currentTargetRef.current.y,
        }
        samplesRef.current.push(sample)
        stampHeatSample(heatmapRef.current, sample)
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
  const eyePercentX = Math.round((summary?.eyeShareX ?? 0) * 100)
  const headPercentX = Math.round((summary?.headShareX ?? 0) * 100)
  const eyePercentY = Math.round((summary?.eyeShareY ?? 0) * 100)
  const headPercentY = Math.round((summary?.headShareY ?? 0) * 100)
  const phaseIsRunning = phase === 'running'
  const phaseIsCalibrating = phase === 'calibrating'
  const phaseLabel = phaseIsRunning ? 'SessÃ£o ativa' : phaseIsCalibrating ? 'CalibraÃ§Ã£o' : 'Aguardando'
  const stageClassName = isFocusMode
    ? 'relative h-screen w-screen overflow-hidden bg-[radial-gradient(circle_at_50%_20%,_rgba(59,130,246,0.18),_rgba(2,6,23,0.94)_55%),linear-gradient(180deg,_rgba(15,23,42,0.98),_rgba(2,6,23,1))]'
    : 'relative h-[56vh] min-h-[420px] max-h-[760px] overflow-hidden rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_50%_20%,_rgba(59,130,246,0.18),_rgba(2,6,23,0.94)_55%),linear-gradient(180deg,_rgba(15,23,42,0.95),_rgba(2,6,23,1))] lg:h-[64vh]'
  const cameraPanelClassName = isFocusMode
    ? 'pointer-events-none fixed -left-[200vw] top-0 h-px w-px overflow-hidden opacity-0'
    : 'relative overflow-hidden rounded-[28px] border border-white/10 bg-slate-900'
  const targetClassName = isFocusMode
    ? 'absolute z-20 h-16 w-16 -translate-x-1/2 -translate-y-1/2 transition-all duration-700'
    : 'absolute z-20 h-12 w-12 -translate-x-1/2 -translate-y-1/2 transition-all duration-700'
  const targetRingClassName = isFocusMode
    ? 'absolute inset-0 rounded-full border-2 border-cyan-200/95 bg-cyan-300/14 shadow-[0_0_0_12px_rgba(34,211,238,0.12),0_0_58px_rgba(34,211,238,0.42)]'
    : 'absolute inset-0 rounded-full border-2 border-cyan-200/95 bg-cyan-300/14 shadow-[0_0_0_10px_rgba(34,211,238,0.1),0_0_42px_rgba(34,211,238,0.36)]'
  const targetInnerRingClassName = isFocusMode
    ? 'absolute inset-[24%] rounded-full border border-cyan-100/90'
    : 'absolute inset-[26%] rounded-full border border-cyan-100/90'
  const targetDotClassName = isFocusMode
    ? 'absolute left-1/2 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-300 shadow-[0_0_18px_rgba(252,211,77,0.85)]'
    : 'absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-300 shadow-[0_0_14px_rgba(252,211,77,0.8)]'
  const targetCrosshairClassName = isFocusMode
    ? 'absolute left-1/2 top-1/2 bg-cyan-100/90 -translate-x-1/2 -translate-y-1/2'
    : 'absolute left-1/2 top-1/2 bg-cyan-100/90 -translate-x-1/2 -translate-y-1/2'

  const stageNode = (
    <div ref={stageRef} className={stageClassName}>
      <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.06)_1px,transparent_1px)] bg-[size:32px_32px]" />
      <div
        className={targetClassName}
        style={{
          left: `${target.x * 100}%`,
          top: `${target.y * 100}%`,
        }}
      >
        <div className={targetRingClassName} />
        <div className={targetInnerRingClassName} />
        <div className={`${targetCrosshairClassName} h-[72%] w-px`} />
        <div className={`${targetCrosshairClassName} h-px w-[72%]`} />
        <div className={targetDotClassName} />
      </div>
      {!isFocusMode && (
        <div className="absolute bottom-4 left-4 rounded-full bg-slate-900/70 px-3 py-1 text-xs font-bold text-slate-300 backdrop-blur">
          {phaseLabel}
        </div>
      )}
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {isFocusMode && (
        <div className="fixed inset-0 z-50 bg-slate-950">
          {stageNode}
        </div>
      )}
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
            <p className="text-xl font-black tracking-tight">LaboratÃ³rio de mapa de calor ocular</p>
            <p className="text-sm text-slate-400">
              Loja {storeId} Â· MVP para Chrome em tablet usando cÃ¢mera frontal e alvo guiado.
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
                O ponto vermelho induz sacadas na tela enquanto medimos cabeÃ§a e Ã­ris.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={startCamera}
                disabled={loadingModel}
                className="inline-flex items-center gap-2 rounded-2xl bg-cyan-500 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-300"
              >
                {loadingModel ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                Abrir cÃ¢mera
              </button>
              <button
                onClick={startCalibration}
                disabled={!cameraReady || phaseIsCalibrating}
                className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-800 px-4 py-2.5 text-sm font-black text-slate-200 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:text-slate-500"
              >
                <ScanFace className="h-4 w-4" />
                Calibrar
              </button>
              <button
                onClick={startSession}
                disabled={!cameraReady || phaseIsRunning || !hasCalibration}
                className="inline-flex items-center gap-2 rounded-2xl border border-rose-400/30 bg-rose-500/15 px-4 py-2.5 text-sm font-black text-rose-200 transition hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:text-slate-500"
              >
                <Play className="h-4 w-4" />
                Iniciar sessÃ£o
              </button>
              <button
                onClick={finishSession}
                disabled={!phaseIsRunning}
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
              O navegador nÃ£o estÃ¡ em contexto seguro. No tablet Samsung, `getUserMedia` costuma exigir HTTPS ou origem confiÃ¡vel.
            </div>
          )}

          <div className="space-y-4">
            <div className={cameraPanelClassName}>
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

            {!isFocusMode && stageNode}

            <div className="grid gap-4 xl:grid-cols-[1fr]">
              <div className="rounded-[28px] border border-white/10 bg-slate-900/80 p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-slate-800/90 p-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Uso dos olhos</p>
                    <p className="mt-2 text-2xl font-black text-cyan-300">
                      {Math.round(Math.abs(liveMetrics.eyeX) * 100)}%
                    </p>
                    <p className="text-xs text-slate-500">Amplitude lateral instantÃ¢nea da Ã­ris.</p>
                  </div>
                  <div className="rounded-2xl bg-slate-800/90 p-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Uso da cabeÃ§a</p>
                    <p className="mt-2 text-2xl font-black text-emerald-300">
                      {Math.round(Math.abs(liveMetrics.headX) * 100)}%
                    </p>
                    <p className="text-xs text-slate-500">CompensaÃ§Ã£o lateral da cabeÃ§a.</p>
                  </div>
                </div>
                <div className="mt-3 rounded-2xl border border-cyan-400/15 bg-cyan-500/5 p-3 text-xs leading-5 text-slate-300">
                  Para o tablet ficar mais realista, esta fase agora ocupa bem mais tela. O ideal ÃƒÂ© segurar o aparelho entre 35 e 45 cm dos olhos do cliente e deixar a bolinha cruzar quase toda a largura.
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  Neste MVP, o mapa de calor da lente Ã© alimentado principalmente pelo deslocamento relativo da Ã­ris dentro dos olhos.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-5">
          <div className="rounded-[28px] border border-white/10 bg-slate-900/90 p-5 shadow-[0_25px_70px_rgba(2,6,23,0.38)]">
            <div className="mb-3 flex items-center gap-2">
              <CircleDot className="h-4 w-4 text-amber-300" />
              <p className="text-sm font-black text-white">Leitura da sessÃ£o</p>
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
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">CabeÃ§a</p>
                    <p className="mt-2 text-3xl font-black text-emerald-300">{headPercent}%</p>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-cyan-400/15 bg-cyan-500/10 p-4">
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-cyan-100">Lateral: olhos x cabeÃ§a</p>
                    <p className="mt-2 text-xl font-black text-cyan-300">{eyePercentX}% olhos</p>
                    <p className="text-sm font-bold text-emerald-300">{headPercentX}% cabeÃ§a</p>
                    <p className="mt-2 text-xs leading-5 text-slate-400">
                      Na horizontal, levar a cabeÃ§a pode ajudar a manter o uso mais central do campo.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-fuchsia-400/15 bg-fuchsia-500/10 p-4">
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-fuchsia-100">Vertical: olhos x cabeÃ§a</p>
                    <p className="mt-2 text-xl font-black text-cyan-300">{eyePercentY}% olhos</p>
                    <p className="text-sm font-bold text-emerald-300">{headPercentY}% cabeÃ§a</p>
                    <p className="mt-2 text-xs leading-5 text-slate-400">
                      Na vertical, queremos mais olhos e menos cabeÃ§a para facilitar o acesso ao perto e ao corredor.
                    </p>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4">
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-100">CompatÃ­vel com campo amplo</p>
                    <p className="mt-2 text-3xl font-black text-emerald-300">{wideProfile}%</p>
                  </div>
                  <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4">
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-amber-100">CompatÃ­vel com campo compacto</p>
                    <p className="mt-2 text-3xl font-black text-amber-300">{narrowProfile}%</p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm leading-6 text-slate-400">
                Assim que a sessÃ£o terminar, este painel vai resumir quanto o cliente centraliza o olhar e o quanto ele tende a explorar as bordas da lente.
              </p>
            )}
          </div>

          <div className="rounded-[28px] border border-white/10 bg-slate-900/90 p-5 shadow-[0_25px_70px_rgba(2,6,23,0.38)]">
            <canvas ref={mainHeatmapRef} width={620} height={360} className="h-auto w-full" />
            <p className="mt-3 text-xs leading-5 text-slate-500">
              A ideia aqui Ã© enxergar se o uso real do campo visual fica concentrado no centro ou escapa para zonas mais sensÃ­veis das bordas.
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

