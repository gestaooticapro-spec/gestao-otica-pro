'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Bookmark, Camera, CircleDot, Loader2, Maximize2, Minimize2, Play, RotateCcw, ScanFace, StopCircle } from 'lucide-react'
import type { LensGeometry, LensPins } from '@/lib/actions/lens-geometry.actions'
import {
  cancelTowerHeatmapSession,
  completeTowerHeatmapSession,
  loadTowerHeatmapDemoTemplate,
  resetTowerHeatmapSession,
  saveTowerHeatmapDemoTemplate,
  startTowerHeatmapSession,
} from '@/lib/actions/tower-heatmap.actions'
import { completeTowerSession } from '@/lib/actions/tower-session.actions'
import { closeTowerClientScreen, openTowerClientScreen } from '@/lib/tower/client-screen'
import LensRecommendationSearchAnimation from '@/components/evaluation/LensRecommendationSearchAnimation'
import type { RecommendationOption } from '@/lib/server/lens-recommendation'
import type { LensSalesAssist } from '@/lib/actions/gemini-narratives.actions'
import { findGeometryForRecommendation } from '@/lib/server/heatmap-geometry-compatibility'

type NormalizedPoint = { x: number; y: number }
type FaceMetrics = {
  faceDetected: boolean
  eyeX: number
  eyeY: number
  headX: number
  headY: number
}
type HeadOffset = {
  headX: number
  headY: number
}
type HeadSandboxCalibration = {
  xNegative: number
  xPositive: number
  yNegative: number
  yPositive: number
}
type CameraSettings = {
  width?: number
  height?: number
  frameRate?: number
  deviceId?: string
  facingMode?: string
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
  distanceCoverage: number
  intermediateCoverage: number
  nearCoverage: number
  isReliable: boolean
  label: string
  message: string
}
type ClientVisualFront = {
  key: 'distance' | 'intermediate' | 'near'
  label: string
  state: 'good' | 'wide' | 'guidance' | 'attention' | 'partial'
  status: string
  detail: string
  recommendation: string
}
type ClientVisualAnalysis = {
  fronts: ClientVisualFront[]
}
type SessionSample = {
  eyeX: number
  eyeY: number
  headX: number
  headY: number
  targetX: number
  targetY: number
  headOnlyProjection?: boolean
  verticalHeadDebug?: boolean
  headCalibration?: HeadSandboxCalibration
  persistedLensX?: number
  persistedLensY?: number
}
type ProjectionDebugTrace = {
  mode: 'headSandbox' | 'vertical'
  decision: 'centralized' | 'partial' | 'target'
  targetX: number
  targetY: number
  normalizedTargetX: number
  normalizedTargetY: number
  headX: number
  headY: number
  headCarryX: number
  headCarryY: number
  headShareX: number
  headShareY: number
  eyeShareX: number
  eyeShareY: number
  residualX: number
  residualY: number
  compensated: boolean
  sampleCount: number
}
type SandboxCalibrationStep = {
  key: string
  target: NormalizedPoint
  instruction: string
}
type ClientSyncPayload = {
  type: 'state'
  phase: SessionPhase
  target: NormalizedPoint
  status: string
}
type RemoteCommand =
  | 'openCamera'
  | 'startCalibration'
  | 'startSandboxCalibration'
  | 'startHeadOnlySandbox'
  | 'startVerticalHeadDebug'
  | 'startSession'
  | 'finishSession'
  | 'cancelRun'
  | 'resetLab'
type CommandPayload = {
  type: 'command'
  command: RemoteCommand
}
type RecommendationSearchPayload = {
  type: 'recommendation-search'
  active: boolean
  recommendations?: RecommendationOption[]
  salesAssist?: LensSalesAssist | null
}
type RecommendationVisualPhase = 'idle' | 'dismantling' | 'search' | 'results'
type DemoTemplateSamplePayload = {
  eyeX: number
  eyeY: number
  headX: number
  headY: number
  targetX: number
  targetY: number
  lensX: number
  lensY: number
  headOnlyProjection?: boolean
  verticalHeadDebug?: boolean
}
type DemoTemplatePayload = {
  type: 'demo-template'
  summary: SessionSummary
  targetSamples: DemoTemplateSamplePayload[]
}
type ReportPayload = {
  type: 'report'
  cameraReady: boolean
  hasCalibration: boolean
  phase: SessionPhase
  status: string
  target: NormalizedPoint
  liveMetrics: FaceMetrics
  liveHeadOffset: HeadOffset
  summary: SessionSummary | null
  prepSecondsLeft: number
  heatmap: Float32Array
  samples: SessionSample[]
  targetSamples: SessionSample[]
  projectionDebugTrace: ProjectionDebugTrace[]
  cameraSettings: CameraSettings | null
}
type PendingRemoteCommand = {
  id: number
  command: RemoteCommand
}
type MediaPipeModule = typeof import('@mediapipe/tasks-vision')
type FaceLandmarkerInstance = Awaited<ReturnType<MediaPipeModule['FaceLandmarker']['createFromOptions']>>

const VIDEO_W = 960
const VIDEO_H = 540
const MIRROR_VIDEO_W = 1280
const MIRROR_VIDEO_H = 720
const HEAT_COLS = 44
const HEAT_ROWS = 28
const TARGET_INTERVAL_MS = 2200
const TARGET_SETTLE_MS = 1100
const TARGET_CAPTURE_END_MS = 2100
const CALIBRATION_DURATION_MS = 3000
const EYE_TARGETS_MERGE_MS = 760
const EYE_FOLLOW_INTRO_MS = 10000
const SANDBOX_CALIBRATION_STEP_MS = 2600
const SANDBOX_CALIBRATION_SETTLE_MS = 700
const SAFE_TARGET_MARGIN_X = 0.04
const SAFE_TARGET_MARGIN_Y = 0.08
const EYE_DEADZONE_X = 0.035
const EYE_DEADZONE_Y = 0.04
const HEAD_DEADZONE_X = 0.09
const HEAD_DEADZONE_Y = 0.18
const EYE_RESPONSE_X = 0.58
const EYE_RESPONSE_Y = 0.52
const HEAD_RESPONSE_X = 0.64
const HEAD_RESPONSE_Y = 0.58
const HEAD_ONLY_HEAD_X_SCALE = 0.55
const HEAD_ONLY_HEAD_Y_SCALE = 0.09
const DEFAULT_HEAD_SANDBOX_CALIBRATION: HeadSandboxCalibration = {
  xNegative: HEAD_ONLY_HEAD_X_SCALE,
  xPositive: HEAD_ONLY_HEAD_X_SCALE,
  yNegative: HEAD_ONLY_HEAD_Y_SCALE,
  yPositive: HEAD_ONLY_HEAD_Y_SCALE,
}
const HEAD_SANDBOX_NOISE_FLOOR_X = 0.055
const HEAD_SANDBOX_NOISE_FLOOR_Y = 0.07
const HEAD_SANDBOX_MIN_SCALE_DEMAND = 0.45
const VERTICAL_DEBUG_HEAD_THRESHOLD = 0.055
const HEAD_COMPENSATION_DOT_Y_GAIN = 2.6
const LENS_DISTANCE_REFERENCE_Y = 0.38
const LENS_UP_GAIN = 0.26
const LENS_DOWN_GAIN = 0.58
const FAR_TARGET_Y = 0.24
const NEAR_TARGET_Y = 0.92
const MID_FAR_TARGET_Y = 0.34
const MID_NEAR_TARGET_Y = 0.76
const EYE_FOLLOW_GAIN_X = 1.42
const EYE_FOLLOW_GAIN_Y = 0.86
const EYE_FOLLOW_SMOOTHING = 0.92
const ENVELOPE_BINS = 72
const CUTOUT = { x: 0.24, y: 0.22, w: 0.52, h: 0.46 }
const HEATMAP_LAB_BUILD = 'heatmap-v10-geometry-picker-2026-04-30'
const SANDBOX_CALIBRATION_STEPS: SandboxCalibrationStep[] = [
  { key: 'center', target: { x: 0.5, y: 0.5 }, instruction: '1/9 · centro · cabeça neutra' },
  { key: 'eyeLeft', target: { x: 0.08, y: 0.5 }, instruction: '2/9 · só olhos · esquerda' },
  { key: 'eyeRight', target: { x: 0.92, y: 0.5 }, instruction: '3/9 · só olhos · direita' },
  { key: 'eyeUp', target: { x: 0.5, y: 0.1 }, instruction: '4/9 · só olhos · cima' },
  { key: 'eyeDown', target: { x: 0.5, y: 0.9 }, instruction: '5/9 · só olhos · baixo' },
  { key: 'headLeft', target: { x: 0.08, y: 0.5 }, instruction: '6/9 · acompanhe com a cabeça · esquerda' },
  { key: 'headRight', target: { x: 0.92, y: 0.5 }, instruction: '7/9 · acompanhe com a cabeça · direita' },
  { key: 'headUp', target: { x: 0.5, y: 0.1 }, instruction: '8/9 · acompanhe com a cabeça · cima' },
  { key: 'headDown', target: { x: 0.5, y: 0.9 }, instruction: '9/9 · acompanhe com a cabeça · baixo' },
]
const SESSION_TARGET_REGION_TOTALS = {
  distance: 9,
  intermediate: 6,
  near: 4,
} as const

const LANDMARKS = {
  nose: 1,
  forehead: 10,
  chin: 152,
  leftFace: 234,
  rightFace: 454,
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

function averageFaceMetrics(samples: FaceMetrics[]) {
  if (!samples.length) return { faceDetected: false, eyeX: 0, eyeY: 0, headX: 0, headY: 0 }
  return samples.reduce(
    (acc, sample) => ({
      faceDetected: true,
      eyeX: acc.eyeX + sample.eyeX / samples.length,
      eyeY: acc.eyeY + sample.eyeY / samples.length,
      headX: acc.headX + sample.headX / samples.length,
      headY: acc.headY + sample.headY / samples.length,
    }),
    { faceDetected: true, eyeX: 0, eyeY: 0, headX: 0, headY: 0 },
  )
}

function median(values: number[]) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

function calibrationMagnitude(
  a: FaceMetrics | undefined,
  b: FaceMetrics | undefined,
  axis: 'eyeX' | 'eyeY' | 'headX' | 'headY',
) {
  if (!a || !b) return 1
  return clamp(Math.abs(a[axis] - b[axis]) / 2, 0.18, 1.2)
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
  const leftFace = getLandmark(landmarks, LANDMARKS.leftFace)
  const rightFace = getLandmark(landmarks, LANDMARKS.rightFace)

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
  const faceCenter = {
    x: (leftFace.x + rightFace.x) / 2,
    y: (leftFace.y + rightFace.y) / 2,
  }
  const faceWidth = Math.max(distance(leftFace, rightFace), 0.0001)
  const faceShiftX = clamp((eyeCenter.x - 0.5) / 0.22, -1.4, 1.4)
  const faceShiftY = clamp((eyeCenter.y - 0.5) / 0.26, -1.4, 1.4)
  const poseHeadX = clamp((nose.x - eyeCenter.x) / (eyeDistance * 0.5), -1.4, 1.4)
  const poseHeadY = clamp(((nose.y - eyeCenter.y) / faceHeight - 0.08) * 3.2, -1.4, 1.4)
  const yawHeadX = clamp((nose.x - faceCenter.x) / (faceWidth * 0.26), -1.4, 1.4)
  const pitchHeadY = clamp((nose.y - faceCenter.y) / (faceHeight * 0.22), -1.4, 1.4)

  return {
    faceDetected: true,
    eyeX,
    eyeY,
    headX: clamp(yawHeadX * 0.72 + poseHeadX * 0.38 + faceShiftX * 0.42, -1.4, 1.4),
    headY: clamp(-(pitchHeadY * 0.28 + poseHeadY * 0.26 + faceShiftY * 0.22), -1.4, 1.4),
  }
}

function makeHeatmap() {
  return new Float32Array(HEAT_COLS * HEAT_ROWS)
}

function normalizePins(p: LensPins | null | undefined): LensPins {
  return { distance: [], corridor: [], near: [], lineA: [], lineB: [], lensRim: [], fitting_height: 0.5, ...p }
}

function remapPins(pins: LensPins): LensPins {
  const remap = (arr: Array<{ x: number; y: number }>) =>
    arr.map((p) => ({ x: (p.x - CUTOUT.x) / CUTOUT.w, y: (p.y - CUTOUT.y) / CUTOUT.h }))
  return {
    distance: remap(pins.distance),
    corridor: remap(pins.corridor),
    near: remap(pins.near),
    lineA: remap(pins.lineA),
    lineB: remap(pins.lineB),
    lensRim: remap(pins.lensRim),
    fitting_height: pins.fitting_height,
  }
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

function shuffleTargetPoints(points: NormalizedPoint[]) {
  const shuffled = [...points]
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

function getTargetSide(point: NormalizedPoint) {
  if (point.x < 0.4) return 'left'
  if (point.x > 0.6) return 'right'
  return 'center'
}

function getTargetBand(point: NormalizedPoint) {
  if (point.y <= 0.5) return 'distance'
  if (point.y <= 0.72) return 'intermediate'
  return 'near'
}

function buildBalancedTargetOrder(points: NormalizedPoint[]) {
  const remaining = shuffleTargetPoints(points)
  const ordered: NormalizedPoint[] = []
  let previousSide: string | null = 'center'
  let previousBand: string | null = 'distance'

  while (remaining.length) {
    const nextIndex = remaining.findIndex((point) => (
      getTargetSide(point) !== previousSide && getTargetBand(point) !== previousBand
    ))
    const alternateIndex = remaining.findIndex((point) => getTargetSide(point) !== previousSide)
    const chosenIndex = nextIndex >= 0 ? nextIndex : alternateIndex >= 0 ? alternateIndex : 0
    const [next] = remaining.splice(chosenIndex, 1)
    ordered.push(next)
    previousSide = getTargetSide(next)
    previousBand = getTargetBand(next)
  }

  return ordered
}

function buildTargetSequence() {
  const sessionUpperBridgeY = 0.42
  const requiredCoverage = [
    // Longe: faixa superior ampla, sem depender das bordas extremas.
    { x: 0.12, y: FAR_TARGET_Y },
    { x: 0.3, y: FAR_TARGET_Y },
    { x: 0.5, y: FAR_TARGET_Y },
    { x: 0.7, y: FAR_TARGET_Y },
    { x: 0.88, y: FAR_TARGET_Y },
    { x: 0.2, y: sessionUpperBridgeY },
    { x: 0.5, y: sessionUpperBridgeY },
    { x: 0.8, y: sessionUpperBridgeY },
    // Intermediario: cobre os dois lados, mas reduz a repeticao lateral.
    { x: 0.16, y: 0.58 },
    { x: 0.34, y: 0.58 },
    { x: 0.66, y: 0.58 },
    { x: 0.84, y: 0.58 },
    { x: 0.35, y: 0.68 },
    { x: 0.65, y: 0.68 },
    // Perto: preserva a leitura na parte inferior central e deixa os cantos livres.
    { x: 0.36, y: 0.78 },
    { x: 0.64, y: 0.78 },
    { x: 0.5, y: 0.84 },
    { x: 0.5, y: 0.92 },
  ]

  return [
    { x: 0.5, y: LENS_DISTANCE_REFERENCE_Y },
    ...buildBalancedTargetOrder(requiredCoverage),
  ]
}

function normalizeTargetOffset(targetX: number, targetY: number) {
  const verticalRange = targetY < LENS_DISTANCE_REFERENCE_Y
    ? LENS_DISTANCE_REFERENCE_Y
    : 1 - LENS_DISTANCE_REFERENCE_Y

  return {
    x: clamp((targetX - 0.5) / 0.5, -1, 1),
    y: clamp((targetY - LENS_DISTANCE_REFERENCE_Y) / Math.max(verticalRange, 0.0001), -1, 1),
  }
}

function getAxisEyeShare(eye: number, head: number, headPenalty: number) {
  const eyeStrength = clamp(Math.abs(eye) / 0.52, 0, 1.6)
  const headStrength = clamp(Math.abs(head) / 0.48, 0, 1.6) * headPenalty
  const rawShare = eyeStrength / Math.max(eyeStrength + headStrength, 0.0001)
  return smoothstep(0.1, 0.9, rawShare)
}

function suppressHeadAxis(head: number, eye: number, demand: number, axis: 'x' | 'y') {
  const absHead = Math.abs(head)
  const absEye = Math.abs(eye)
  const floor = axis === 'x' ? 0.08 : 0.1
  const demandBoost = axis === 'x' ? 0.06 : 0.07
  const eyeAllowance = axis === 'x' ? 0.8 : 0.95
  if (absHead < floor + demand * demandBoost && absHead <= absEye * eyeAllowance) {
    return 0
  }
  if (absHead < floor * 1.25 && absEye > absHead * 1.35) {
    return 0
  }
  return head
}

function getHeadOnlyCarryX(headX: number, targetX = 0) {
  const direction = Math.abs(targetX) > 0.08 ? Math.sign(targetX) : Math.sign(headX)
  const carry = Math.abs(headX) / HEAD_ONLY_HEAD_X_SCALE
  const maxCarry = Math.abs(targetX) > 0.08 ? Math.abs(targetX) : 1.25
  return clamp(direction * Math.min(carry, maxCarry), -1.25, 1.25)
}

function getHeadOnlyCarryY(headY: number, targetY = 0) {
  const direction = Math.abs(targetY) > 0.08 ? Math.sign(targetY) : Math.sign(-headY)
  const carry = Math.abs(headY) / HEAD_ONLY_HEAD_Y_SCALE
  const maxCarry = Math.abs(targetY) > 0.08 ? Math.abs(targetY) : 1.25
  return clamp(direction * Math.min(carry, maxCarry), -1.25, 1.25)
}

function getCalibratedHeadCarry(
  head: number,
  target: number,
  negativeFullHead: number,
  positiveFullHead: number,
  noiseFloor: number,
) {
  const demand = Math.abs(target)
  if (demand < 0.08) return { carry: 0, share: 0 }
  const directionalHead = -head
  if (Math.sign(directionalHead) !== Math.sign(target)) return { carry: 0, share: 0 }

  const fullHead = target < 0 ? negativeFullHead : positiveFullHead
  const absHead = Math.abs(directionalHead)
  if (absHead <= noiseFloor) return { carry: 0, share: 0 }

  const expectedHeadForTarget = noiseFloor + fullHead * Math.max(demand, HEAD_SANDBOX_MIN_SCALE_DEMAND)
  const usableHead = absHead - noiseFloor
  const usableExpectedHead = Math.max(expectedHeadForTarget - noiseFloor, 0.0001)
  const headShare = clamp(usableHead / usableExpectedHead, 0, 1)

  return {
    carry: target * headShare,
    share: headShare,
  }
}

function projectHeadSandboxSample(sample: SessionSample) {
  const target = normalizeTargetOffset(sample.targetX, sample.targetY)
  const calibration = sample.headCalibration ?? DEFAULT_HEAD_SANDBOX_CALIBRATION
  const xProjection = getCalibratedHeadCarry(
    sample.headX,
    target.x,
    calibration.xNegative,
    calibration.xPositive,
    HEAD_SANDBOX_NOISE_FLOOR_X,
  )
  const yProjection = getCalibratedHeadCarry(
    sample.headY,
    target.y,
    calibration.yNegative,
    calibration.yPositive,
    HEAD_SANDBOX_NOISE_FLOOR_Y,
  )
  const lensEyeX = clamp(target.x - xProjection.carry, -1.2, 1.2)
  const lensEyeY = clamp(target.y - yProjection.carry, -1.2, 1.2)

  return {
    target,
    lensEyeX,
    lensEyeY,
    headShareX: xProjection.share,
    headShareY: yProjection.share,
    eyeShareX: 1 - xProjection.share,
    eyeShareY: 1 - yProjection.share,
  }
}

function buildHeadSandboxCalibration(samplesByStep: Record<string, FaceMetrics>, center: FaceMetrics) {
  const headMagnitude = (key: string, axis: 'headX' | 'headY', fallback: number) => {
    const sample = samplesByStep[key]
    if (!sample?.faceDetected) return fallback
    const minimum = axis === 'headY' ? fallback : fallback * 0.55
    return clamp(Math.abs(sample[axis] - center[axis]), minimum, fallback * 2.8)
  }

  return {
    xNegative: headMagnitude('headLeft', 'headX', DEFAULT_HEAD_SANDBOX_CALIBRATION.xNegative),
    xPositive: headMagnitude('headRight', 'headX', DEFAULT_HEAD_SANDBOX_CALIBRATION.xPositive),
    yNegative: headMagnitude('headUp', 'headY', DEFAULT_HEAD_SANDBOX_CALIBRATION.yNegative),
    yPositive: headMagnitude('headDown', 'headY', DEFAULT_HEAD_SANDBOX_CALIBRATION.yPositive),
  }
}

function getVerticalDebugCarryY(headY: number, targetY: number) {
  if (Math.abs(targetY) < 0.08) return 0
  if (Math.abs(headY) < VERTICAL_DEBUG_HEAD_THRESHOLD) return 0
  return targetY
}

function projectLensY(lensEyeY: number, multiplier = 1) {
  const gain = lensEyeY < 0 ? LENS_UP_GAIN : LENS_DOWN_GAIN
  return clamp(LENS_DISTANCE_REFERENCE_Y + lensEyeY * gain * multiplier, 0.03, 0.95)
}

function projectSandboxLensY(lensEyeY: number, multiplier = 1) {
  const range = lensEyeY < 0 ? LENS_DISTANCE_REFERENCE_Y * 1.45 : 1 - LENS_DISTANCE_REFERENCE_Y
  return clamp(LENS_DISTANCE_REFERENCE_Y + lensEyeY * range * multiplier, 0.03, 0.95)
}

function dramaticEyeFollow(value: number) {
  const absValue = Math.abs(value)
  if (absValue < 0.025) return 0
  const curved = Math.pow(clamp((absValue - 0.025) / 0.55, 0, 1), 0.42)
  return Math.sign(value) * curved
}

function buildVerticalDebugTargetSequence() {
  return [
    { x: 0.5, y: LENS_DISTANCE_REFERENCE_Y },
    { x: 0.5, y: FAR_TARGET_Y },
    { x: 0.5, y: NEAR_TARGET_Y },
    { x: 0.5, y: MID_FAR_TARGET_Y },
    { x: 0.5, y: MID_NEAR_TARGET_Y },
    { x: 0.5, y: FAR_TARGET_Y },
    { x: 0.5, y: NEAR_TARGET_Y },
  ]
}

function projectSampleToLens(sample: SessionSample) {
  if (sample.persistedLensX !== undefined && sample.persistedLensY !== undefined) {
    return {
      point: { x: sample.persistedLensX, y: sample.persistedLensY },
      heatPoint: { x: sample.persistedLensX, y: sample.persistedLensY },
      radius: 1.9,
      spreadX: 0.018,
      spreadY: 0.018,
      weight: 1,
      eyeDominance: 0.5,
      headDominance: 0.5,
      eyeShareX: 0.5,
      eyeShareY: 0.5,
      demandWeight: 1,
    }
  }

  const target = normalizeTargetOffset(sample.targetX, sample.targetY)
  const demandX = Math.abs(target.x)
  const demandY = Math.abs(target.y)
  const normalizedEyeX = applyDeadzone(sample.eyeX, EYE_DEADZONE_X)
  const normalizedEyeY = applyDeadzone(sample.eyeY, EYE_DEADZONE_Y)
  const normalizedHeadX = applyDeadzone(sample.headX, HEAD_DEADZONE_X)
  const normalizedHeadY = applyDeadzone(sample.headY, HEAD_DEADZONE_Y)

  if (sample.verticalHeadDebug) {
    const headCarryY = getVerticalDebugCarryY(sample.headY, target.y)
    const lensEyeY = clamp(target.y - headCarryY, -1.2, 1.2)
    const headShareY = Math.abs(target.y) > 0.08 && Math.abs(sample.headY) >= VERTICAL_DEBUG_HEAD_THRESHOLD ? 1 : 0
    const eyeShareY = 1 - headShareY
    const eyeNorm = clamp(Math.abs(lensEyeY) / 0.65, 0, 1.5)
    const edgeSpread = clamp(0.52 + eyeNorm * 1.05 + eyeShareY * 0.32, 0.52, 1.92)

    return {
      point: {
        x: 0.5,
        y: projectLensY(lensEyeY, 0.94),
      },
      heatPoint: {
        x: 0.5,
        y: projectLensY(lensEyeY, 0.98),
      },
      radius: 1.7 + edgeSpread * 1.18,
      spreadX: 0.006,
      spreadY: 0.012 + Math.abs(lensEyeY) * 0.075 + eyeShareY * 0.016,
      weight: 1 + eyeShareY * 0.22,
      eyeDominance: eyeShareY,
      headDominance: headShareY,
      eyeShareX: 1,
      eyeShareY,
      demandWeight: Math.max(demandY, 0.0001),
    }
  }

  if (sample.headOnlyProjection) {
    const sandboxProjection = projectHeadSandboxSample(sample)
    const lensEyeX = sandboxProjection.lensEyeX
    const lensEyeY = sandboxProjection.lensEyeY
    const headShareX = sandboxProjection.headShareX
    const headShareY = sandboxProjection.headShareY
    const eyeShareX = sandboxProjection.eyeShareX
    const eyeShareY = sandboxProjection.eyeShareY
    const demandedWeight = Math.max(demandX + demandY, 0.0001)
    const eyeDemandShare = clamp((eyeShareX * demandX + eyeShareY * demandY) / demandedWeight, 0, 1)
    const eyeNorm = clamp(Math.hypot(lensEyeX, lensEyeY) / 0.65, 0, 1.5)
    const edgeSpread = clamp(0.48 + eyeNorm * 0.88 + eyeDemandShare * 0.24, 0.48, 1.58)

    return {
      point: {
        x: clamp(0.5 + lensEyeX * 0.5, 0.03, 0.97),
        y: projectSandboxLensY(lensEyeY, 0.98),
      },
      heatPoint: {
        x: clamp(0.5 + lensEyeX * 0.52, 0.03, 0.97),
        y: projectSandboxLensY(lensEyeY, 1),
      },
      radius: 1.55 + edgeSpread * 0.98,
      spreadX: 0.006 + Math.abs(lensEyeX) * 0.052 + eyeDemandShare * 0.012,
      spreadY: 0.011 + Math.abs(lensEyeY) * 0.05 + eyeDemandShare * 0.011,
      weight: 1 + eyeDemandShare * 0.22,
      eyeDominance: eyeDemandShare,
      headDominance: 1 - eyeDemandShare,
      eyeShareX,
      eyeShareY,
      demandWeight: demandedWeight,
    }
  }

  const eyeConfirmsTargetX =
    demandX < 0.08 ? 0 : smoothstep(0.02, 0.16, Math.sign(target.x) * -normalizedEyeX)
  const measuredEyeConfirmsTargetY =
    demandY < 0.08 ? 0 : smoothstep(0.02, 0.14, Math.abs(normalizedEyeY))
  const verticalHeadEvidence = smoothstep(0.12, 0.38, Math.abs(sample.headY))
  const effectiveHeadY = normalizedHeadY * (1 - measuredEyeConfirmsTargetY * 0.45)
  const eyeShareX = getAxisEyeShare(
    normalizedEyeX * (0.72 + demandX * EYE_RESPONSE_X),
    normalizedHeadX * (0.44 + demandX * HEAD_RESPONSE_X),
    1.12,
  )
  const eyeShareY = getAxisEyeShare(
    normalizedEyeY * (0.78 + demandY * EYE_RESPONSE_Y),
    effectiveHeadY * (0.32 + demandY * HEAD_RESPONSE_Y),
    1.22,
  )
  const eyeConfirmsTargetY =
    demandY < 0.08
      ? 0
      : Math.max(measuredEyeConfirmsTargetY, smoothstep(0.44, 0.72, eyeShareY)) *
        (1 - verticalHeadEvidence * 0.94)
  const lensTargetX = target.x * eyeShareX * eyeConfirmsTargetX
  const lensTargetY = target.y * eyeShareY * eyeConfirmsTargetY
  const lensEyeX = clamp(lensTargetX * 0.88 - normalizedEyeX * 0.24, -1.2, 1.2)
  const lensEyeY = clamp(lensTargetY * 1.04 + normalizedEyeY * 0.05 * (1 - verticalHeadEvidence), -1.2, 1.2)
  const demandedWeight = Math.max(demandX + demandY, 0.0001)
  const eyeDemandShare = clamp((eyeShareX * demandX + eyeShareY * demandY) / demandedWeight, 0, 1)
  const headDemandShare = 1 - eyeDemandShare
  const eyeMag = Math.hypot(lensEyeX, lensEyeY)
  const eyeNorm = clamp(eyeMag / 0.65, 0, 1.5)
  const edgeSpread = clamp(0.52 + eyeNorm * 1.05 + eyeDemandShare * 0.32, 0.52, 1.92)

  const point = {
    x: clamp(0.5 + lensEyeX * 0.62, 0.03, 0.97),
    y: projectLensY(lensEyeY, 1),
  }
  const heatPoint = {
    x: clamp(0.5 + lensEyeX * 0.64, 0.03, 0.97),
    y: projectLensY(lensEyeY, 1.04),
  }

  return {
    point,
    heatPoint,
    radius: 1.7 + edgeSpread * 1.18,
    spreadX: 0.006 + Math.abs(lensEyeX) * 0.052 + eyeDemandShare * 0.012,
    spreadY: 0.012 + Math.abs(lensEyeY) * 0.075 + eyeDemandShare * 0.016,
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
  addHeatPoint(grid, projection.heatPoint, projection.weight, projection.radius * 1.05, 'sum')

  const satelliteWeight = projection.weight * 0.34
  const satelliteRadius = projection.radius * 0.82
  addHeatPoint(
    grid,
    {
      x: clamp(projection.heatPoint.x + projection.spreadX, 0.02, 0.98),
      y: clamp(projection.heatPoint.y + projection.spreadY * 0.35, 0.02, 0.98),
    },
    satelliteWeight,
    satelliteRadius,
    'sum',
  )
  addHeatPoint(
    grid,
    {
      x: clamp(projection.heatPoint.x - projection.spreadX, 0.02, 0.98),
      y: clamp(projection.heatPoint.y - projection.spreadY * 0.35, 0.02, 0.98),
    },
    satelliteWeight,
    satelliteRadius,
    'sum',
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

function buildPinPath(pins: Array<{ x: number; y: number }>, width: number, height: number) {
  const path = new Path2D()
  if (pins.length < 3) return path
  const abs = pins.map((pt) => ({ x: pt.x * width, y: pt.y * height }))
  const last = abs[abs.length - 1]
  const first = abs[0]
  path.moveTo((last.x + first.x) / 2, (last.y + first.y) / 2)
  for (let i = 0; i < abs.length; i += 1) {
    const current = abs[i]
    const next = abs[(i + 1) % abs.length]
    path.quadraticCurveTo(current.x, current.y, (current.x + next.x) / 2, (current.y + next.y) / 2)
  }
  path.closePath()
  return path
}

function buildOpenLinePath(pins: Array<{ x: number; y: number }>, width: number, height: number) {
  const path = new Path2D()
  if (pins.length < 2) return path
  const abs = pins.map((pt) => ({ x: pt.x * width, y: pt.y * height }))
  path.moveTo(abs[0].x, abs[0].y)
  if (abs.length === 2) {
    path.lineTo(abs[1].x, abs[1].y)
    return path
  }
  path.lineTo((abs[0].x + abs[1].x) / 2, (abs[0].y + abs[1].y) / 2)
  for (let i = 1; i < abs.length - 1; i += 1) {
    const current = abs[i]
    const next = abs[i + 1]
    path.quadraticCurveTo(current.x, current.y, (current.x + next.x) / 2, (current.y + next.y) / 2)
  }
  path.lineTo(abs[abs.length - 1].x, abs[abs.length - 1].y)
  return path
}

function getRenderablePins(geometry?: LensGeometry | null) {
  if (!geometry?.pins) return null
  return remapPins(normalizePins(geometry.pins))
}

function getRiskInsetAtY(y: number, profile: ProfileDescriptor) {
  const topBlend = smoothstep(0, 0.42, y)
  const bottomBlend = smoothstep(0.48, 1, y)
  const topValue = profile.topInset + (profile.midInset - profile.topInset) * topBlend
  return topValue + (profile.bottomInset - topValue) * bottomBlend
}

function getHeatmapLateralOpenness(grid: Float32Array, samples: SessionSample[]) {
  const maxValue = getHeatMax(grid)
  if (maxValue <= 0) {
    if (!samples.length) return 0.2
    const points = samples.map((sample) => projectSampleToLens(sample).point)
    const sideDemand = points.reduce((max, point) => Math.max(max, Math.abs(point.x - 0.5)), 0)
    return clamp((sideDemand - 0.16) / 0.34, 0, 1)
  }

  const threshold = maxValue * 0.14
  let sideDemand = 0
  for (let row = 0; row < HEAT_ROWS; row += 1) {
    for (let col = 0; col < HEAT_COLS; col += 1) {
      const value = grid[row * HEAT_COLS + col]
      if (value < threshold) continue
      const x = (col + 0.5) / HEAT_COLS
      sideDemand = Math.max(sideDemand, Math.abs(x - 0.5))
    }
  }

  return clamp((sideDemand - 0.18) / 0.3, 0, 1)
}

function buildFallbackKodakLinePaths(width: number, height: number, grid: Float32Array, samples: SessionSample[]) {
  const openness = getHeatmapLateralOpenness(grid, samples)
  const edgeMode = smoothstep(0.45, 0.95, openness)
  const pushX = width * (0.02 + edgeMode * 0.14)
  const pushY = height * edgeMode * 0.2

  const makeSide = (mirror: boolean) => {
    const path = new Path2D()
    const direction = mirror ? -1 : 1
    const mirrorX = (x: number) => (mirror ? width - x : x)
    const point = (x: number, y: number) => ({
      x: clamp(mirrorX(width * x) - direction * pushX, width * 0.018, width * 0.982),
      y: clamp(height * y + pushY, height * 0.12, height * 0.94),
    })

    const start = point(0.055, 0.3)
    const c1 = point(0.18, 0.3)
    const c2 = point(0.29, 0.31)
    const neck = point(0.29, 0.44)
    const c3 = point(0.29, 0.57)
    const c4 = point(0.22, 0.68)
    const end = point(0.16, 0.92)

    path.moveTo(start.x, start.y)
    path.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, neck.x, neck.y)
    path.bezierCurveTo(c3.x, c3.y, c4.x, c4.y, end.x, end.y)
    return path
  }

  return {
    left: makeSide(false),
    right: makeSide(true),
  }
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

function drawContinuousHeat(ctx: CanvasRenderingContext2D, grid: Float32Array, width: number, height: number, maxValue: number) {
  for (let row = 0; row < HEAT_ROWS; row += 1) {
    for (let col = 0; col < HEAT_COLS; col += 1) {
      const value = grid[row * HEAT_COLS + col] / maxValue
      if (value < 0.08) continue
      const intensity = Math.pow(value, 0.82)
      const centerX = ((col + 0.5) / HEAT_COLS) * width
      const centerY = ((row + 0.5) / HEAT_ROWS) * height
      const radius = (width / HEAT_COLS) * (1 + intensity * 1.65)
      const gradient = ctx.createRadialGradient(centerX, centerY, radius * 0.12, centerX, centerY, radius)
      gradient.addColorStop(0, `rgba(239, 92, 68, ${0.1 + intensity * 0.3})`)
      gradient.addColorStop(0.38, `rgba(249, 130, 22, ${0.08 + intensity * 0.24})`)
      gradient.addColorStop(0.76, `rgba(251, 191, 36, ${0.05 + intensity * 0.14})`)
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

function getTargetRegion(targetY: number) {
  if (targetY <= 0.5) return 'distance'
  if (targetY <= 0.72) return 'intermediate'
  return 'near'
}

function drawConsolidatedTargetPoints(
  ctx: CanvasRenderingContext2D,
  samples: SessionSample[],
  width: number,
  height: number,
) {
  samples.forEach((sample, index) => {
    const projection = projectSampleToLens(sample)
    const x = projection.point.x * width
    const y = projection.point.y * height
    const color = projection.headDominance >= projection.eyeDominance ? '#6ee7b7' : '#67e8f9'

    ctx.beginPath()
    ctx.arc(x, y, 7, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(15, 23, 42, 0.82)'
    ctx.fill()
    ctx.lineWidth = 2.4
    ctx.strokeStyle = color
    ctx.stroke()

    ctx.fillStyle = '#f8fafc'
    ctx.font = '700 8px ui-sans-serif, system-ui'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(index + 1), x, y + 0.5)
  })
  ctx.textBaseline = 'alphabetic'
}

function getEnvelopeRadii(samples: SessionSample[]) {
  const bins = new Float32Array(ENVELOPE_BINS)

  for (const sample of samples) {
    const projection = projectSampleToLens(sample)
    const dx = (projection.point.x - 0.5) / 0.46
    const dy = (projection.point.y - LENS_DISTANCE_REFERENCE_Y) / 0.44
    const angle = Math.atan2(dy, dx)
    const normalized = ((angle + Math.PI) / (Math.PI * 2)) * ENVELOPE_BINS
    const bin = Math.max(0, Math.min(ENVELOPE_BINS - 1, Math.round(normalized) % ENVELOPE_BINS))
    const radial = clamp(Math.hypot(dx, dy), 0, 1.2)
    const demandedRadius = clamp(
      radial * (0.58 + projection.demandWeight * 0.28 + projection.eyeDominance * 0.14),
      0.08,
      1,
    )
    bins[bin] = Math.max(bins[bin], demandedRadius)
  }

  const smoothed = new Float32Array(ENVELOPE_BINS)
  for (let i = 0; i < ENVELOPE_BINS; i += 1) {
    const prev = bins[(i - 1 + ENVELOPE_BINS) % ENVELOPE_BINS]
    const current = bins[i]
    const next = bins[(i + 1) % ENVELOPE_BINS]
    smoothed[i] = Math.max(current, (prev + current + next) / 3)
  }
  return smoothed
}

function getEnvelopeRadiusForAngle(radii: Float32Array, angle: number) {
  if (!radii.length) return 0
  const normalized = ((angle + Math.PI) / (Math.PI * 2)) * radii.length
  const base = ((Math.floor(normalized) % radii.length) + radii.length) % radii.length
  const next = (base + 1) % radii.length
  const t = normalized - Math.floor(normalized)
  return radii[base] * (1 - t) + radii[next] * t
}

function buildEnvelopePath(width: number, height: number, radii: Float32Array) {
  const path = new Path2D()
  if (!radii.length) return path

  const centerX = width * 0.5
  const centerY = height * LENS_DISTANCE_REFERENCE_Y
  const radiusX = width * 0.45
  const radiusY = height * 0.43

  for (let i = 0; i < radii.length; i += 1) {
    const angle = -Math.PI + (i / radii.length) * Math.PI * 2
    const radius = clamp(radii[i], 0.04, 1)
    const x = centerX + Math.cos(angle) * radiusX * radius
    const y = centerY + Math.sin(angle) * radiusY * radius
    if (i === 0) path.moveTo(x, y)
    else path.lineTo(x, y)
  }
  path.closePath()
  return path
}

function drawLensHeatmap(
  canvas: HTMLCanvasElement,
  grid: Float32Array,
  profile?: ProfileDescriptor,
  title?: string,
  geometry?: LensGeometry | null,
  samples: SessionSample[] = [],
  mode: 'grid' | 'normalized' | 'contour' | 'continuous' | 'audit' = 'grid',
  showGuides = true,
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
  const renderablePins = getRenderablePins(geometry)
  const lensPath = renderablePins?.lensRim.length
    ? buildPinPath(renderablePins.lensRim, lensWidth, lensHeight)
    : buildLensPath(lensWidth, lensHeight)
  const envelopeRadii = samples.length ? getEnvelopeRadii(samples) : new Float32Array(0)
  const envelopePath = envelopeRadii.length ? buildEnvelopePath(lensWidth, lensHeight, envelopeRadii) : null

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

  if (mode === 'normalized' && envelopePath) {
    const radial = ctx.createRadialGradient(
      lensWidth * 0.5,
      lensHeight * LENS_DISTANCE_REFERENCE_Y,
      lensWidth * 0.04,
      lensWidth * 0.5,
      lensHeight * LENS_DISTANCE_REFERENCE_Y,
      lensWidth * 0.42,
    )
    radial.addColorStop(0, 'rgba(255, 237, 213, 0.18)')
    radial.addColorStop(0.46, 'rgba(253, 186, 116, 0.34)')
    radial.addColorStop(0.74, 'rgba(251, 146, 60, 0.54)')
    radial.addColorStop(1, 'rgba(239, 68, 68, 0.78)')

    ctx.save()
    ctx.clip(envelopePath)
    ctx.fillStyle = radial
    ctx.fillRect(0, 0, lensWidth, lensHeight)
    ctx.restore()

    ctx.strokeStyle = 'rgba(249, 115, 22, 0.95)'
    ctx.lineWidth = 2.6
    ctx.stroke(envelopePath)
  } else if (mode === 'contour' && envelopePath) {
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.92)'
    ctx.lineWidth = 4
    ctx.stroke(envelopePath)
    ctx.strokeStyle = 'rgba(251, 146, 60, 0.56)'
    ctx.lineWidth = 10
    ctx.stroke(envelopePath)
  } else if (mode === 'continuous' && maxValue > 0) {
    drawContinuousHeat(ctx, grid, lensWidth, lensHeight, maxValue)
  } else if (mode !== 'audit' && maxValue > 0) {
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

  if (showGuides) {
    if (renderablePins?.lineA.length && renderablePins?.lineB.length) {
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.95)'
      ctx.lineWidth = 3
      ctx.lineCap = 'round'
      ctx.stroke(buildOpenLinePath(renderablePins.lineA, lensWidth, lensHeight))
      ctx.stroke(buildOpenLinePath(renderablePins.lineB, lensWidth, lensHeight))
    } else {
      const fallbackLines = buildFallbackKodakLinePaths(lensWidth, lensHeight, grid, samples)
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.92)'
      ctx.lineWidth = 3.2
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.shadowColor = 'rgba(250, 204, 21, 0.32)'
      ctx.shadowBlur = 8
      ctx.stroke(fallbackLines.left)
      ctx.stroke(fallbackLines.right)
      ctx.shadowBlur = 0
    }
  }

  if (mode === 'audit') {
    drawConsolidatedTargetPoints(ctx, samples, lensWidth, lensHeight)
  }

  if (mode === 'normalized' && envelopeRadii.length) {
    ctx.save()
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.18)'
    ctx.lineWidth = 1
    for (let i = 0; i < 8; i += 1) {
      const angle = (-Math.PI + i * Math.PI) / 4
      const radius = getEnvelopeRadiusForAngle(envelopeRadii, angle)
      const x = lensWidth * 0.5 + Math.cos(angle) * lensWidth * 0.45 * radius
      const y = lensHeight * LENS_DISTANCE_REFERENCE_Y + Math.sin(angle) * lensHeight * 0.43 * radius
      ctx.beginPath()
      ctx.moveTo(lensWidth * 0.5, lensHeight * LENS_DISTANCE_REFERENCE_Y)
      ctx.lineTo(x, y)
      ctx.stroke()
    }
    ctx.restore()
  }

  ctx.restore()
  ctx.stroke(lensPath)
  ctx.restore()
}

function getProjectedSampleStats(samples: SessionSample[]) {
  if (!samples.length) {
    return { meanX: 0.5, meanY: LENS_DISTANCE_REFERENCE_Y, spreadX: 0.08, spreadY: 0.12 }
  }

  const points = samples.map((sample) => projectSampleToLens(sample).point)
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length
  const spreadX = Math.sqrt(points.reduce((sum, point) => sum + (point.x - meanX) ** 2, 0) / points.length)
  const spreadY = Math.sqrt(points.reduce((sum, point) => sum + (point.y - meanY) ** 2, 0) / points.length)

  return { meanX, meanY, spreadX, spreadY }
}

function getHeatmapFieldOpenness(grid: Float32Array, samples: SessionSample[]) {
  const maxValue = getHeatMax(grid)
  if (maxValue <= 0) {
    const fallback = getProjectedSampleStats(samples)
    return clamp((fallback.spreadX - 0.06) / 0.26, 0, 1)
  }

  const threshold = maxValue * 0.12
  let sideDemand = 0

  for (let row = 0; row < HEAT_ROWS; row += 1) {
    for (let col = 0; col < HEAT_COLS; col += 1) {
      const value = grid[row * HEAT_COLS + col]
      if (value < threshold) continue

      const x = (col + 0.5) / HEAT_COLS
      sideDemand = Math.max(sideDemand, Math.abs(x - 0.5))
    }
  }

  return clamp((sideDemand - 0.17) / 0.25, 0, 1)
}

function buildAdaptiveVisionBoundaryPaths(width: number, height: number, grid: Float32Array, samples: SessionSample[]) {
  const openness = getHeatmapFieldOpenness(grid, samples)
  const edgeMode = smoothstep(0.48, 0.9, openness)
  const shiftX = width * (0.03 + edgeMode * 0.11)
  const shiftY = height * edgeMode * 0.16

  const makeSide = (mirror: boolean) => {
    const path = new Path2D()
    const direction = mirror ? -1 : 1
    const mirrorX = (x: number) => (mirror ? width - x : x)
    const point = (x: number, y: number) => ({
      x: clamp(mirrorX(width * x) - direction * shiftX, width * 0.025, width * 0.975),
      y: clamp(height * y + shiftY, height * 0.16, height * 0.94),
    })

    // Curva rigida inspirada nas geometrias reais: a forma nao muda, so e deslocada.
    const start = point(0.06, 0.29)
    const c1 = point(0.18, 0.29)
    const c2 = point(0.3, 0.31)
    const neck = point(0.3, 0.44)
    const c3 = point(0.3, 0.57)
    const c4 = point(0.23, 0.68)
    const end = point(0.16, 0.91)

    path.moveTo(start.x, start.y)
    path.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, neck.x, neck.y)
    path.bezierCurveTo(c3.x, c3.y, c4.x, c4.y, end.x, end.y)
    return path
  }

  return {
    left: makeSide(false),
    right: makeSide(true),
  }
}

function drawClientIdealLensResult(
  canvas: HTMLCanvasElement,
  grid: Float32Array,
  summary: SessionSummary | null,
  geometry: LensGeometry | null,
  samples: SessionSample[],
  revealProgress = 1,
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const width = canvas.width
  const height = canvas.height
  const paddingX = 56
  const paddingY = 44
  const availableWidth = width - paddingX * 2
  const availableHeight = height - paddingY * 2
  const targetLensAspect = 1.9
  let lensWidth = availableWidth
  let lensHeight = lensWidth / targetLensAspect
  if (lensHeight > availableHeight) {
    lensHeight = availableHeight
    lensWidth = lensHeight * targetLensAspect
  }
  const lensX = (width - lensWidth) / 2
  const lensY = (height - lensHeight) / 2
  const visibleSampleCount = Math.min(samples.length, Math.ceil(samples.length * clamp(revealProgress, 0, 1)))
  const visibleSamples = samples.slice(0, visibleSampleCount)
  const visibleGrid = visibleSampleCount === samples.length
    ? grid
    : visibleSamples.reduce<Float32Array>((partialGrid, sample) => {
      stampHeatSample(partialGrid, sample)
      return partialGrid
    }, makeHeatmap())
  const maxValue = getHeatMax(visibleGrid)
  const renderablePins = getRenderablePins(geometry)
  const lensPath = renderablePins?.lensRim.length
    ? buildPinPath(renderablePins.lensRim, lensWidth, lensHeight)
    : buildLensPath(lensWidth, lensHeight)
  const fieldBoundaries = buildAdaptiveVisionBoundaryPaths(lensWidth, lensHeight, visibleGrid, visibleSamples)

  ctx.clearRect(0, 0, width, height)

  const background = ctx.createLinearGradient(0, 0, width, height)
  background.addColorStop(0, '#07111f')
  background.addColorStop(0.48, '#0d1c2f')
  background.addColorStop(1, '#020617')
  ctx.fillStyle = background
  ctx.fillRect(0, 0, width, height)

  ctx.save()
  ctx.translate(lensX, lensY)
  ctx.shadowColor = 'rgba(34, 211, 238, 0.24)'
  ctx.shadowBlur = 42
  ctx.fillStyle = 'rgba(241, 245, 249, 0.96)'
  ctx.fill(lensPath)
  ctx.shadowBlur = 0
  ctx.save()
  ctx.clip(lensPath)

  const lensGradient = ctx.createLinearGradient(0, 0, 0, lensHeight)
  lensGradient.addColorStop(0, '#eff6ff')
  lensGradient.addColorStop(0.48, '#e0f2fe')
  lensGradient.addColorStop(1, '#eef2ff')
  ctx.fillStyle = lensGradient
  ctx.fillRect(0, 0, lensWidth, lensHeight)

  if (maxValue > 0) {
    drawContinuousHeat(ctx, visibleGrid, lensWidth, lensHeight, maxValue)
  }

  ctx.save()
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.48)'
  ctx.lineWidth = 6.2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.stroke(fieldBoundaries.left)
  ctx.stroke(fieldBoundaries.right)
  ctx.strokeStyle = 'rgba(250, 204, 21, 0.96)'
  ctx.lineWidth = 3.6
  ctx.shadowColor = 'rgba(250, 204, 21, 0.32)'
  ctx.shadowBlur = 10
  ctx.stroke(fieldBoundaries.left)
  ctx.stroke(fieldBoundaries.right)
  ctx.restore()

  ctx.restore()
  ctx.strokeStyle = 'rgba(129, 140, 248, 0.48)'
  ctx.lineWidth = 6
  ctx.stroke(lensPath)
  ctx.strokeStyle = 'rgba(226, 232, 240, 0.9)'
  ctx.lineWidth = 1.4
  ctx.stroke(lensPath)
  ctx.restore()
}

function drawTrackingOverlay(
  canvas: HTMLCanvasElement,
  landmarks: NormalizedPoint[] | null,
  metrics: FaceMetrics,
  introStartedAt: number | null,
  mergeStartedAt: number | null,
  now: number,
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  if (!landmarks || !metrics.faceDetected) return

  const leftEyeOuter = getLandmark(landmarks, LANDMARKS.leftEyeOuter)
  const leftEyeInner = getLandmark(landmarks, LANDMARKS.leftEyeInner)
  const leftEyeTop = getLandmark(landmarks, LANDMARKS.leftEyeTop)
  const leftEyeBottom = getLandmark(landmarks, LANDMARKS.leftEyeBottom)
  const rightEyeOuter = getLandmark(landmarks, LANDMARKS.rightEyeOuter)
  const rightEyeInner = getLandmark(landmarks, LANDMARKS.rightEyeInner)
  const rightEyeTop = getLandmark(landmarks, LANDMARKS.rightEyeTop)
  const rightEyeBottom = getLandmark(landmarks, LANDMARKS.rightEyeBottom)
  const leftFace = getLandmark(landmarks, LANDMARKS.leftFace)
  const rightFace = getLandmark(landmarks, LANDMARKS.rightFace)
  const elapsed = introStartedAt ? now - introStartedAt : 0
  const lineProgress = clamp(elapsed / 520, 0, 1)
  const boxProgress = clamp((elapsed - 360) / 620, 0, 1)
  const targetsProgress = clamp((elapsed - 880) / 360, 0, 1)
  const width = canvas.width
  const height = canvas.height
  const eyeLineY = ((leftEyeTop.y + leftEyeBottom.y + rightEyeTop.y + rightEyeBottom.y) / 4) * height
  const templeLeft = leftFace.x * width
  const templeRight = rightFace.x * width

  ctx.save()
  ctx.lineCap = 'round'
  ctx.shadowColor = 'rgba(103, 232, 249, 0.72)'
  ctx.shadowBlur = 12
  ctx.strokeStyle = 'rgba(165, 243, 252, 0.92)'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.moveTo(templeLeft, eyeLineY)
  ctx.lineTo(templeLeft + (templeRight - templeLeft) * lineProgress, eyeLineY)
  ctx.stroke()

  const left = Math.min(leftEyeOuter.x, leftEyeInner.x, rightEyeOuter.x, rightEyeInner.x) * width - 28
  const right = Math.max(leftEyeOuter.x, leftEyeInner.x, rightEyeOuter.x, rightEyeInner.x) * width + 28
  const top = Math.min(leftEyeTop.y, rightEyeTop.y) * height - 30
  const bottom = Math.max(leftEyeBottom.y, rightEyeBottom.y) * height + 30
  const perimeter = 2 * ((right - left) + (bottom - top))
  ctx.strokeStyle = 'rgba(103, 232, 249, 0.9)'
  ctx.lineWidth = 2
  ctx.setLineDash([perimeter * boxProgress, perimeter])
  ctx.beginPath()
  ctx.roundRect(left, top, right - left, bottom - top, 18)
  ctx.stroke()
  ctx.setLineDash([])

  if (targetsProgress > 0) {
    const mergeProgress = mergeStartedAt ? clamp((now - mergeStartedAt) / EYE_TARGETS_MERGE_MS, 0, 1) : 0
    const centers = [
      {
        x: ((leftEyeOuter.x + leftEyeInner.x) / 2) * width,
        y: ((leftEyeTop.y + leftEyeBottom.y) / 2) * height,
      },
      {
        x: ((rightEyeOuter.x + rightEyeInner.x) / 2) * width,
        y: ((rightEyeTop.y + rightEyeBottom.y) / 2) * height,
      },
    ]
    const center = { x: width / 2, y: height / 2 }

    for (const eye of centers) {
      const x = eye.x + (center.x - eye.x) * mergeProgress
      const y = eye.y + (center.y - eye.y) * mergeProgress
      const radius = (17 - mergeProgress * 4) * targetsProgress
      ctx.globalAlpha = mergeProgress === 1 ? 0.5 : 1
      ctx.strokeStyle = 'rgba(207, 250, 254, 0.98)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(x, y, radius, 0, Math.PI * 2)
      ctx.stroke()
      ctx.strokeStyle = 'rgba(103, 232, 249, 0.8)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(x, y, radius * 0.56, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(x - radius * 1.4, y)
      ctx.lineTo(x + radius * 1.4, y)
      ctx.moveTo(x, y - radius * 1.4)
      ctx.lineTo(x, y + radius * 1.4)
      ctx.stroke()
      ctx.fillStyle = 'rgba(103, 232, 249, 1)'
      ctx.beginPath()
      ctx.arc(x, y, Math.max(3, radius * 0.18), 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()
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
      distanceCoverage: 0,
      intermediateCoverage: 0,
      nearCoverage: 0,
      isReliable: false,
      label: 'Sem amostras suficientes',
      message: 'A sessão ainda não coletou dados estáveis do rosto.',
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
  let distanceSamples = 0
  let intermediateSamples = 0
  let nearSamples = 0

  const points = samples.map((sample) => {
    const projection = projectSampleToLens(sample)
    const { x, y } = projection.point
    const region = getTargetRegion(sample.targetY)
    if (region === 'distance') distanceSamples += 1
    else if (region === 'intermediate') intermediateSamples += 1
    else nearSamples += 1
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
  const distanceCoverage = clamp(distanceSamples / SESSION_TARGET_REGION_TOTALS.distance, 0, 1)
  const intermediateCoverage = clamp(intermediateSamples / SESSION_TARGET_REGION_TOTALS.intermediate, 0, 1)
  const nearCoverage = clamp(nearSamples / SESSION_TARGET_REGION_TOTALS.near, 0, 1)
  const isReliable = distanceCoverage >= 0.7 && intermediateCoverage >= 0.7 && nearCoverage >= 0.7

  let label = 'Perfil misto'
  let message = 'O cliente alterna bem entre olhos e cabeça. Vale comparar conforto percebido entre campos médios e amplos.'
  if (headShareX >= 0.62 && eyeShareY >= 0.56 && heatSpreadX < 0.11) {
    label = 'Perfil centralizado'
    message = 'Lateralmente o cliente leva bem a cabeça, mas no eixo vertical ainda usa os olhos com boa disciplina. Esse padrão tende a tolerar desenhos mais compactos.'
  } else if (eyeShareX >= 0.58 || heatSpreadX >= 0.145) {
    label = 'Perfil explorador com olhos'
    message = 'O mapa se espalhou mais nas laterais, indicando maior exigência do campo visual da lente. Esse padrão favorece campos mais generosos.'
  } else if (headShareY >= 0.58) {
    label = 'Perfil vertical com cabeça'
    message = 'Na vertical o cliente tende a levar a cabeça junto, o que pode atrapalhar o uso do perto em progressivas mais exigentes.'
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
    distanceCoverage,
    intermediateCoverage,
    nearCoverage,
    isReliable,
    label,
    message,
  }
}

function buildClientVisualAnalysis(samples: SessionSample[]): ClientVisualAnalysis {
  const fronts: ClientVisualFront[] = (['distance', 'intermediate', 'near'] as const).map((key) => {
    const regionSamples = samples.filter((sample) => getTargetRegion(sample.targetY) === key)
    const expectedSamples = SESSION_TARGET_REGION_TOTALS[key]
    const label = key === 'distance' ? 'Longe' : key === 'intermediate' ? 'Intermediário' : 'Perto'

    if (regionSamples.length < expectedSamples * 0.6) {
      return {
        key,
        label,
        state: 'partial',
        status: 'Leitura parcial',
        detail: 'Esta área precisa de mais leitura para ser analisada.',
        recommendation: 'Repita esta etapa para termos uma análise segura.',
      }
    }

    const projections = regionSamples.map((sample) => ({
      sample,
      projection: projectSampleToLens(sample),
      target: normalizeTargetOffset(sample.targetX, sample.targetY),
    }))
    const horizontalDemand = projections.reduce((sum, item) => sum + Math.abs(item.target.x), 0)
    const verticalDemand = projections.reduce((sum, item) => sum + Math.abs(item.target.y), 0)
    const eyeShareX = projections.reduce((sum, item) => sum + item.projection.eyeShareX * Math.abs(item.target.x), 0) / Math.max(horizontalDemand, 0.0001)
    const eyeShareY = projections.reduce((sum, item) => sum + item.projection.eyeShareY * Math.abs(item.target.y), 0) / Math.max(verticalDemand, 0.0001)
    const lateralReach = projections.reduce((sum, item) => sum + Math.abs(item.projection.point.x - 0.5), 0) / projections.length
    const lowerEyeReach = projections.reduce((sum, item) => sum + Math.max(0, item.projection.point.y - LENS_DISTANCE_REFERENCE_Y), 0) / projections.length

    if (key === 'near' && eyeShareY < 0.46 && lowerEyeReach < 0.13) {
      return {
        key,
        label,
        state: 'attention',
        status: 'Atenção à leitura',
        detail: 'Você acompanhou mais com a cabeça do que com os olhos.',
        recommendation: 'Uma boa adaptação depende de praticar o uso dos olhos na leitura.',
      }
    }

    if (key === 'intermediate' && eyeShareY < 0.48) {
      return {
        key,
        label,
        state: 'guidance',
        status: 'Atenção ao uso da cabeça',
        detail: 'Você acompanhou essa distância mais com a cabeça do que com os olhos.',
        recommendation: 'Para acessar bem o intermediário, é importante deslocar os olhos pela área correta da lente.',
      }
    }

    if (key === 'intermediate' && eyeShareY >= 0.48 && eyeShareX >= 0.56 && lateralReach >= 0.105) {
      return {
        key,
        label,
        state: 'wide',
        status: 'Campo mais amplo',
        detail: 'Seus olhos exploram mais as laterais nesta distância.',
        recommendation: 'Você precisa de lentes com intermediário amplo para maior conforto.',
      }
    }

    if (key === 'distance' && eyeShareX >= 0.6 && lateralReach >= 0.115) {
      return {
        key,
        label,
        state: 'wide',
        status: 'Campo lateral ativo',
        detail: 'Você usa os olhos nas laterais ao olhar longe.',
        recommendation: 'Você precisa de lentes amplas para longe.',
      }
    }

    const lowerLateralReach = projections
      .filter((item) => item.sample.targetY >= 0.78)
      .reduce((sum, item, _index, items) => sum + Math.abs(item.projection.point.x - 0.5) / Math.max(items.length, 1), 0)

    if (key === 'near' && eyeShareY >= 0.5 && lowerLateralReach >= 0.075) {
      return {
        key,
        label,
        state: 'wide',
        status: 'Olhar ativo',
        detail: 'Você usou bem os olhos na área de leitura.',
        recommendation: 'Você terá mais facilidade de adaptação, com campo amplo para perto.',
      }
    }

    return {
      key,
      label,
      state: 'good',
      status: key === 'near' ? 'Olhar ativo' : 'Equilibrado',
      detail:
        key === 'near'
          ? 'Você usou bem os olhos na área de leitura.'
          : 'Olhos e cabeça trabalharam de forma equilibrada.',
      recommendation:
        key === 'near'
          ? 'Você tende a se adaptar bem às lentes multifocais.'
          : 'Este padrão ajuda a equilibrar conforto e campo visual.',
    }
  })

  return { fronts }
}

function ClientLensRecommendationResults({
  recommendations,
  salesAssist,
  geometries,
  heatmap,
  samples,
}: {
  recommendations: RecommendationOption[]
  salesAssist: LensSalesAssist | null
  geometries: LensGeometry[]
  heatmap: Float32Array
  samples: SessionSample[]
}) {
  const canvasRefs = useRef<Array<HTMLCanvasElement | null>>([])

  useEffect(() => {
    recommendations.slice(0, 3).forEach((recommendation, index) => {
      const canvas = canvasRefs.current[index]
      const geometry = findGeometryForRecommendation(recommendation.familyName, geometries)
      if (!canvas || !geometry) return
      drawLensHeatmap(canvas, heatmap, undefined, undefined, geometry, samples, 'continuous', true)
    })
  }, [geometries, heatmap, recommendations, samples])

  return (
    <section className="client-recommendation-results fixed inset-0 z-[90] overflow-y-auto bg-slate-950 px-5 py-8 text-white sm:px-8 sm:py-10">
      <div className="mx-auto w-full max-w-[1180px]">
        <header className="text-center">
          <p className="text-xs font-black uppercase tracking-[0.32em] text-cyan-200">Seu jeito de olhar</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">Encontramos três lentes para você conhecer.</h1>
          <p className="mx-auto mt-4 max-w-3xl text-base leading-7 text-slate-300 sm:text-xl">
            Veja como o seu mapa visual se comporta dentro da geometria de cada opção.
          </p>
        </header>

        <div className="mt-8 grid gap-6">
          {recommendations.slice(0, 3).map((recommendation, index) => {
            const geometry = findGeometryForRecommendation(recommendation.familyName, geometries)
            const narrative = salesAssist?.options.find((item) => item.configKey === recommendation.configKey)

            return (
              <article
                key={recommendation.configKey}
                className="client-recommendation-card grid gap-5 rounded-[34px] border border-white/12 bg-[linear-gradient(135deg,_rgba(8,47,73,0.58),_rgba(15,23,42,0.92)_48%,_rgba(2,6,23,0.98))] p-5 shadow-[0_28px_90px_rgba(2,6,23,0.48)] md:grid-cols-[minmax(0,0.9fr)_minmax(360px,1.1fr)] md:items-center sm:p-7"
                style={{ animationDelay: `${index * 180}ms` }}
              >
                <div>
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full border border-cyan-200/25 bg-cyan-300/10 text-lg font-black text-cyan-100">{index + 1}</span>
                    <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-200">Opção selecionada</p>
                  </div>
                  <h2 className="mt-5 text-3xl font-black leading-tight sm:text-4xl">{recommendation.familyName}</h2>
                  <p className="mt-3 text-lg font-bold leading-7 text-slate-100 sm:text-xl">{recommendation.offerLabel}</p>
                  {recommendation.treatmentName && <p className="mt-2 text-base text-cyan-100">{recommendation.treatmentName}</p>}
                  {narrative && (
                    <div className="mt-6 border-t border-cyan-200/15 pt-5">
                      <h3 className="text-xl font-black leading-tight text-cyan-100 sm:text-2xl">{narrative.headline}</h3>
                      <p className="mt-3 text-base leading-7 text-slate-200 sm:text-lg">
                        {narrative.whyThisLens || narrative.sellerArgument}
                      </p>
                    </div>
                  )}
                </div>

                <div className="overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/70 p-4">
                  {geometry ? (
                    <>
                      <canvas
                        ref={(canvas) => { canvasRefs.current[index] = canvas }}
                        width={760}
                        height={390}
                        className="mx-auto h-auto w-full"
                      />
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 text-sm text-slate-400">
                        <span>Geometria: {geometry.family_name}</span>
                        <span>{geometry.visual_design_type}</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex min-h-[260px] items-center justify-center px-6 text-center">
                      <div>
                        <p className="text-lg font-black text-slate-200">Geometria ainda não cadastrada</p>
                        <p className="mt-2 text-sm leading-6 text-slate-400">A indicação permanece válida, mas esta comparação visual ainda não está disponível.</p>
                      </div>
                    </div>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      </div>

      <style jsx>{`
        .client-recommendation-results { animation: recommendation-results-in 620ms cubic-bezier(.16,1,.3,1) both; }
        .client-recommendation-card { opacity: 0; animation: recommendation-card-in 620ms cubic-bezier(.16,1,.3,1) forwards; }
        @keyframes recommendation-results-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes recommendation-card-in {
          from { opacity: 0; transform: translateY(28px) scale(.985); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </section>
  )
}

export default function GazeHeatmapLab({
  storeId,
  backPath,
  geometry,
  geometries = [],
  clientMode = false,
  heatmapSessionId = null,
  towerSessionId = null,
  towerMode = false,
}: {
  storeId: number
  backPath: string
  geometry?: LensGeometry | null
  geometries?: LensGeometry[]
  clientMode?: boolean
  heatmapSessionId?: string | null
  towerSessionId?: string | null
  towerMode?: boolean
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const mainHeatmapRef = useRef<HTMLCanvasElement>(null)
  const auditHeatmapRef = useRef<HTMLCanvasElement>(null)
  const contourHeatmapRef = useRef<HTMLCanvasElement>(null)
  const wideHeatmapRef = useRef<HTMLCanvasElement>(null)
  const narrowHeatmapRef = useRef<HTMLCanvasElement>(null)
  const clientResultCanvasRef = useRef<HTMLCanvasElement>(null)
  const clientResultAnimationFrameRef = useRef<number | null>(null)
  const clientResultProgressRef = useRef(0)
  const stageRef = useRef<HTMLDivElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const landmarkerRef = useRef<FaceLandmarkerInstance | null>(null)
  const landmarkerPromiseRef = useRef<Promise<FaceLandmarkerInstance> | null>(null)
  const animationRef = useRef<number | null>(null)
  const targetTimerRef = useRef<number | null>(null)
  const sessionTimerRef = useRef<number | null>(null)
  const calibrationTimerRef = useRef<number | null>(null)
  const prepCountdownTimerRef = useRef<number | null>(null)
  const eyeTargetsMergeTimerRef = useRef<number | null>(null)
  const eyeScanStartedAtRef = useRef<number | null>(null)
  const eyeTargetsMergeStartedAtRef = useRef<number | null>(null)
  const lastTickRef = useRef<number>(0)
  const lastUiTickRef = useRef<number>(0)
  const phaseRef = useRef<SessionPhase>('idle')
  const clientResultVisibleRef = useRef(false)
  const heatmapRef = useRef<Float32Array>(makeHeatmap())
  const samplesRef = useRef<SessionSample[]>([])
  const targetHeatSamplesRef = useRef<SessionSample[]>([])
  const targetSamplesRef = useRef<SessionSample[]>([])
  const calibrationSamplesRef = useRef<FaceMetrics[]>([])
  const baselineRef = useRef({ eyeX: 0, eyeY: 0, headX: 0, headY: 0 })
  const sandboxStepRef = useRef<{ step: SandboxCalibrationStep; startedAt: number; samples: FaceMetrics[] } | null>(null)
  const sandboxCollectedRef = useRef<Record<string, FaceMetrics[]>>({})
  const headSandboxCalibrationRef = useRef<HeadSandboxCalibration>(DEFAULT_HEAD_SANDBOX_CALIBRATION)
  const eyeFollowIntroRef = useRef<{ point: NormalizedPoint; baselineEyeX: number | null; baselineEyeY: number | null } | null>(null)
  const headOnlyProjectionRef = useRef(false)
  const verticalHeadDebugRef = useRef(false)
  const projectionDebugTraceRef = useRef<ProjectionDebugTrace[]>([])
  const currentTargetRef = useRef<NormalizedPoint>({ x: 0.5, y: 0.5 })
  const targetStartedAtRef = useRef<number>(0)
  const targetSequenceRef = useRef<NormalizedPoint[]>([])
  const targetIndexRef = useRef<number>(0)
  const broadcastRef = useRef<BroadcastChannel | null>(null)
  const recommendationTransitionTimerRef = useRef<number | null>(null)
  const applyDemoTemplateRef = useRef<((summary: SessionSummary, targetSamples: DemoTemplateSamplePayload[]) => void) | null>(null)

  const [cameraReady, setCameraReady] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [loadingModel, setLoadingModel] = useState(false)
  const [phase, setPhase] = useState<SessionPhase>('idle')
  const [clientResultVisible, setClientResultVisible] = useState(false)
  const [clientResultAnimationComplete, setClientResultAnimationComplete] = useState(false)
  const [hasCalibration, setHasCalibration] = useState(false)
  const [status, setStatus] = useState('Abra a câmera frontal e alinhe o rosto ao centro.')
  const [target, setTarget] = useState<NormalizedPoint>({ x: 0.5, y: 0.5 })
  const [selectedGeometryId, setSelectedGeometryId] = useState(() => geometry?.id ?? geometries[0]?.id ?? '')
  const [liveMetrics, setLiveMetrics] = useState<FaceMetrics>({
    faceDetected: false,
    eyeX: 0,
    eyeY: 0,
    headX: 0,
    headY: 0,
  })
  const [liveHeadOffset, setLiveHeadOffset] = useState<HeadOffset>({ headX: 0, headY: 0 })
  const [summary, setSummary] = useState<SessionSummary | null>(null)
  const [prepSecondsLeft, setPrepSecondsLeft] = useState(0)
  const [secureContextWarning, setSecureContextWarning] = useState(false)
  const [pendingRemoteCommand, setPendingRemoteCommand] = useState<PendingRemoteCommand | null>(null)
  const [remoteReportVersion, setRemoteReportVersion] = useState(0)
  const [cameraSettings, setCameraSettings] = useState<CameraSettings | null>(null)
  const [headOnlyProjection, setHeadOnlyProjection] = useState(false)
  const [verticalHeadDebug, setVerticalHeadDebug] = useState(false)
  const [projectionDebugTrace, setProjectionDebugTrace] = useState<ProjectionDebugTrace[]>([])
  const [sessionPersistenceStatus, setSessionPersistenceStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [towerActionBusy, setTowerActionBusy] = useState(false)
  const [demoTemplateSaved, setDemoTemplateSaved] = useState(false)
  const [recommendationSearchActive, setRecommendationSearchActive] = useState(false)
  const [recommendationVisualPhase, setRecommendationVisualPhase] = useState<RecommendationVisualPhase>('idle')
  const [clientRecommendations, setClientRecommendations] = useState<RecommendationOption[]>([])
  const [clientSalesAssist, setClientSalesAssist] = useState<LensSalesAssist | null>(null)
  const isFocusMode = phase === 'calibrating' || phase === 'running'
  const selectedGeometry = geometries.find((item) => item.id === selectedGeometryId) ?? geometry ?? geometries[0] ?? null
  const clientVisualAnalysis = buildClientVisualAnalysis(targetHeatSamplesRef.current)

  const redrawHeatmaps = useCallback(() => {
    if (mainHeatmapRef.current) {
      drawLensHeatmap(
        mainHeatmapRef.current,
        heatmapRef.current,
        undefined,
        towerMode ? undefined : selectedGeometry ? `Mapa de calor sobreposto · ${selectedGeometry.family_name}` : 'Mapa de calor sobreposto',
        selectedGeometry,
        targetHeatSamplesRef.current,
        'continuous',
        !towerMode,
      )
    }
    if (auditHeatmapRef.current) {
      drawLensHeatmap(
        auditHeatmapRef.current,
        heatmapRef.current,
        undefined,
        `Auditoria por alvo · ${targetHeatSamplesRef.current.length} pontos consolidados`,
        selectedGeometry,
        targetHeatSamplesRef.current,
        'audit',
      )
    }
    if (contourHeatmapRef.current) {
      drawLensHeatmap(
        contourHeatmapRef.current,
        heatmapRef.current,
        undefined,
        selectedGeometry ? `Contorno máximo · ${selectedGeometry.family_name}` : 'Contorno máximo de alcance',
        selectedGeometry,
        targetHeatSamplesRef.current,
        'contour',
      )
    }
    if (wideHeatmapRef.current) {
      drawLensHeatmap(
        wideHeatmapRef.current,
        heatmapRef.current,
        COMPARISON_PROFILES[0],
        COMPARISON_PROFILES[0].name,
        selectedGeometry,
        targetHeatSamplesRef.current,
        'continuous',
      )
    }
    if (narrowHeatmapRef.current) {
      drawLensHeatmap(
        narrowHeatmapRef.current,
        heatmapRef.current,
        COMPARISON_PROFILES[1],
        COMPARISON_PROFILES[1].name,
        selectedGeometry,
        targetHeatSamplesRef.current,
        'continuous',
      )
    }
    if (clientResultCanvasRef.current) {
      drawClientIdealLensResult(
        clientResultCanvasRef.current,
        heatmapRef.current,
        summary,
        selectedGeometry,
        targetHeatSamplesRef.current,
        clientResultProgressRef.current,
      )
    }
  }, [selectedGeometry, summary, towerMode])

  useEffect(() => {
    setSecureContextWarning(typeof window !== 'undefined' && !window.isSecureContext)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const channel = new BroadcastChannel(`heatmap-lab-${storeId}`)
    broadcastRef.current = channel

    channel.onmessage = (event: MessageEvent<CommandPayload | ReportPayload | RecommendationSearchPayload | DemoTemplatePayload>) => {
      const data = event.data
      if (!data) return

      if (data.type === 'recommendation-search') {
        if (clientMode) {
          if (recommendationTransitionTimerRef.current !== null) {
            window.clearTimeout(recommendationTransitionTimerRef.current)
            recommendationTransitionTimerRef.current = null
          }

          if (data.active) {
            setClientRecommendations([])
            setClientSalesAssist(null)
            setRecommendationSearchActive(false)
            setRecommendationVisualPhase('dismantling')
            recommendationTransitionTimerRef.current = window.setTimeout(() => {
              setRecommendationSearchActive(true)
              setRecommendationVisualPhase('search')
              recommendationTransitionTimerRef.current = null
            }, 1150)
          } else if (data.recommendations?.length) {
            setClientRecommendations(data.recommendations.slice(0, 3))
            setClientSalesAssist(data.salesAssist ?? null)
            setRecommendationSearchActive(false)
            setRecommendationVisualPhase('results')
          } else {
            setClientRecommendations([])
            setClientSalesAssist(null)
            setRecommendationSearchActive(false)
            setRecommendationVisualPhase('idle')
          }
        }
        return
      }

      if (data.type === 'demo-template') {
        if (clientMode) applyDemoTemplateRef.current?.(data.summary, data.targetSamples)
        return
      }

      if (clientMode) {
        if (data.type === 'command') {
          setPendingRemoteCommand({ id: Date.now(), command: data.command })
        }
        return
      }

      if (data.type === 'report') {
        setCameraReady(data.cameraReady)
        setHasCalibration(data.hasCalibration)
        setPhase(data.phase)
        setStatus(data.status)
        setTarget(data.target)
        setLiveMetrics(data.liveMetrics)
        setLiveHeadOffset(data.liveHeadOffset)
        setSummary(data.summary)
        setPrepSecondsLeft(data.prepSecondsLeft)
        heatmapRef.current = new Float32Array(data.heatmap)
        samplesRef.current = data.samples
        targetHeatSamplesRef.current = data.targetSamples ?? []
        projectionDebugTraceRef.current = data.projectionDebugTrace ?? []
        setProjectionDebugTrace(data.projectionDebugTrace ?? [])
        setCameraSettings(data.cameraSettings)
        setRemoteReportVersion((version) => version + 1)
      }
    }

    return () => {
      if (recommendationTransitionTimerRef.current !== null) {
        window.clearTimeout(recommendationTransitionTimerRef.current)
        recommendationTransitionTimerRef.current = null
      }
      channel.close()
      broadcastRef.current = null
    }
  }, [clientMode, storeId])

  useEffect(() => {
    if (!clientMode || !pendingRemoteCommand) return

    if (pendingRemoteCommand.command === 'openCamera') void startCamera()
    if (pendingRemoteCommand.command === 'startCalibration') void startCalibration()
    if (pendingRemoteCommand.command === 'startSandboxCalibration') void startSandboxCalibration()
    if (pendingRemoteCommand.command === 'startHeadOnlySandbox') void startHeadOnlySandbox()
    if (pendingRemoteCommand.command === 'startVerticalHeadDebug') void startVerticalHeadDebug()
    if (pendingRemoteCommand.command === 'startSession') startSession()
    if (pendingRemoteCommand.command === 'finishSession') finishSession()
    if (pendingRemoteCommand.command === 'cancelRun') cancelRun()
    if (pendingRemoteCommand.command === 'resetLab') resetLab()

    setPendingRemoteCommand(null)
  }, [clientMode, pendingRemoteCommand])

  useEffect(() => {
    if (!clientMode) return
    const channel = broadcastRef.current
    if (!channel) return
    channel.postMessage({
      type: 'report',
      cameraReady,
      hasCalibration,
      phase,
      status,
      target,
      liveMetrics,
      liveHeadOffset,
      summary,
      prepSecondsLeft,
      heatmap: heatmapRef.current,
      samples: samplesRef.current,
      targetSamples: targetHeatSamplesRef.current,
      projectionDebugTrace,
      cameraSettings,
    } satisfies ReportPayload)
  }, [clientMode, cameraReady, cameraSettings, hasCalibration, liveHeadOffset, liveMetrics, phase, prepSecondsLeft, projectionDebugTrace, status, summary, target])

  useEffect(() => {
    if (!clientMode) return
    if (phase === 'finished' || clientResultVisible) return
    if (cameraReady) return
    void startCamera()
  }, [clientMode, cameraReady, clientResultVisible, phase])

  useEffect(() => {
    if (!clientMode || !cameraReady || phase !== 'idle' || landmarkerRef.current) return

    const previewTimer = window.setTimeout(() => {
      void ensureLandmarker()
        .then(() => {
          if (phaseRef.current === 'idle') startTrackingLoop()
        })
        .catch((error) => console.warn('Não foi possível iniciar a prévia do avatar.', error))
    }, 450)

    return () => window.clearTimeout(previewTimer)
  }, [cameraReady, clientMode, phase])

  useEffect(() => {
    const onFullscreenChange = () => {
      const stage = stageRef.current
      setIsFullscreen(Boolean(stage && document.fullscreenElement === stage))
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    onFullscreenChange()
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  useEffect(() => {
    redrawHeatmaps()
  }, [redrawHeatmaps, remoteReportVersion])

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  useEffect(() => {
    if (!clientMode) return
    const stage = stageRef.current
    if (!stage) return

    if (isFocusMode || phase === 'finished' || clientResultVisible) {
      if (document.fullscreenElement !== stage) {
        stage.requestFullscreen?.().catch(() => {})
      }
      return
    }

    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {})
    }
  }, [clientMode, clientResultVisible, isFocusMode, phase])

  useEffect(() => {
    if (!clientMode || (!clientResultVisible && phase !== 'finished')) return

    clientResultProgressRef.current = 0
    setClientResultAnimationComplete(false)
    const animationDuration = clamp(targetHeatSamplesRef.current.length * 420, 12000, 16000)
    let startedAt: number | null = null

    const animateResult = (timestamp: number) => {
      if (startedAt === null) startedAt = timestamp
      const elapsed = timestamp - startedAt
      const rawProgress = clamp(elapsed / animationDuration, 0, 1)
      // Acelera levemente no inicio para a pintura parecer uma leitura viva, sem pular alvos.
      clientResultProgressRef.current = 1 - (1 - rawProgress) ** 2.15

      const canvas = clientResultCanvasRef.current
      if (canvas) {
        drawClientIdealLensResult(
          canvas,
          heatmapRef.current,
          summary,
          selectedGeometry,
          targetHeatSamplesRef.current,
          clientResultProgressRef.current,
        )
      }

      if (rawProgress < 1) {
        clientResultAnimationFrameRef.current = requestAnimationFrame(animateResult)
      } else {
        clientResultAnimationFrameRef.current = null
        setClientResultAnimationComplete(true)
      }
    }

    clientResultAnimationFrameRef.current = requestAnimationFrame(animateResult)
    return () => {
      if (clientResultAnimationFrameRef.current !== null) {
        cancelAnimationFrame(clientResultAnimationFrameRef.current)
        clientResultAnimationFrameRef.current = null
      }
    }
  }, [clientMode, clientResultVisible, phase, selectedGeometry, summary])

  const toggleFullscreen = useCallback(async () => {
    const stage = stageRef.current
    if (!stage) return

    try {
      if (document.fullscreenElement === stage) {
        await document.exitFullscreen?.()
      } else {
        await stage.requestFullscreen?.()
      }
    } catch {}
  }, [])

  useEffect(() => {
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
      if (clientResultAnimationFrameRef.current) cancelAnimationFrame(clientResultAnimationFrameRef.current)
      if (targetTimerRef.current) window.clearInterval(targetTimerRef.current)
      if (sessionTimerRef.current) window.clearTimeout(sessionTimerRef.current)
      if (calibrationTimerRef.current) window.clearTimeout(calibrationTimerRef.current)
      if (prepCountdownTimerRef.current) window.clearInterval(prepCountdownTimerRef.current)
      if (eyeTargetsMergeTimerRef.current) window.clearTimeout(eyeTargetsMergeTimerRef.current)
      landmarkerRef.current?.close?.()
      streamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  async function ensureLandmarker() {
    if (landmarkerRef.current) return landmarkerRef.current
    if (landmarkerPromiseRef.current) return landmarkerPromiseRef.current

    const loadingPromise = (async () => {
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
        landmarkerPromiseRef.current = null
      }
    })()

    landmarkerPromiseRef.current = loadingPromise
    return loadingPromise
  }

  async function startCamera() {
    try {
      setStatus('Solicitando acesso à câmera frontal...')

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: 'user',
          width: { ideal: MIRROR_VIDEO_W },
          height: { ideal: MIRROR_VIDEO_H },
          frameRate: { ideal: 30, max: 30 },
        },
      })

      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = stream
      setCameraSettings(stream.getVideoTracks()[0]?.getSettings() ?? null)

      const video = videoRef.current
      if (!video) return

      video.srcObject = stream
      await video.play()
      if (clientResultVisibleRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        if (streamRef.current === stream) streamRef.current = null
        setCameraSettings(null)
        if (video.srcObject === stream) video.srcObject = null
        return
      }
      setCameraReady(true)
      eyeScanStartedAtRef.current = null
      eyeTargetsMergeStartedAtRef.current = null
      setStatus('Câmera ativa. Deixe o rosto centralizado e inicie a calibração.')
    } catch (error) {
      console.error(error)
      setStatus('Não foi possível abrir a câmera. No tablet, use HTTPS ou uma origem segura.')
    }
  }

  function stopCamera() {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }
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
    setCameraSettings(null)
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
    if (prepCountdownTimerRef.current) {
      window.clearInterval(prepCountdownTimerRef.current)
      prepCountdownTimerRef.current = null
    }
    if (eyeTargetsMergeTimerRef.current) {
      window.clearTimeout(eyeTargetsMergeTimerRef.current)
      eyeTargetsMergeTimerRef.current = null
    }
  }

  async function applyTrackingCameraProfile() {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    try {
      await track.applyConstraints({
        width: { ideal: VIDEO_W },
        height: { ideal: VIDEO_H },
        frameRate: { ideal: 30, max: 30 },
      })
      setCameraSettings(track.getSettings())
    } catch (error) {
      console.warn('Não foi possível reduzir a câmera para o perfil de tracking.', error)
      setCameraSettings(track.getSettings())
    }
  }

  function resetLab() {
    clientResultVisibleRef.current = false
    setClientResultVisible(false)
    stopSessionTimers()
    heatmapRef.current = makeHeatmap()
    samplesRef.current = []
    targetHeatSamplesRef.current = []
    targetSamplesRef.current = []
    calibrationSamplesRef.current = []
    targetSequenceRef.current = []
    targetIndexRef.current = 0
    baselineRef.current = { eyeX: 0, eyeY: 0, headX: 0, headY: 0 }
    headSandboxCalibrationRef.current = DEFAULT_HEAD_SANDBOX_CALIBRATION
    sandboxStepRef.current = null
    sandboxCollectedRef.current = {}
    eyeFollowIntroRef.current = null
    eyeScanStartedAtRef.current = null
    eyeTargetsMergeStartedAtRef.current = null
    headOnlyProjectionRef.current = false
    verticalHeadDebugRef.current = false
    projectionDebugTraceRef.current = []
    currentTargetRef.current = { x: 0.5, y: 0.5 }
    targetStartedAtRef.current = 0
    setHasCalibration(false)
    setLiveMetrics({ faceDetected: false, eyeX: 0, eyeY: 0, headX: 0, headY: 0 })
    setLiveHeadOffset({ headX: 0, headY: 0 })
    setHeadOnlyProjection(false)
    setVerticalHeadDebug(false)
    setProjectionDebugTrace([])
    setTarget({ x: 0.5, y: 0.5 })
    phaseRef.current = 'idle'
    setPhase('idle')
    setPrepSecondsLeft(0)
    setSummary(null)
    setStatus(cameraReady ? 'Câmera pronta. Faça uma nova calibração quando quiser.' : 'Abra a câmera frontal e alinhe o rosto ao centro.')
    redrawHeatmaps()
  }

  function cancelRun() {
    clientResultVisibleRef.current = false
    setClientResultVisible(false)
    stopSessionTimers()
    sandboxStepRef.current = null
    targetSamplesRef.current = []
    targetSequenceRef.current = []
    targetIndexRef.current = 0
    currentTargetRef.current = { x: 0.5, y: 0.5 }
    eyeFollowIntroRef.current = null
    eyeScanStartedAtRef.current = null
    eyeTargetsMergeStartedAtRef.current = null
    headSandboxCalibrationRef.current = DEFAULT_HEAD_SANDBOX_CALIBRATION
    headOnlyProjectionRef.current = false
    verticalHeadDebugRef.current = false
    projectionDebugTraceRef.current = []
    baselineRef.current = { eyeX: 0, eyeY: 0, headX: 0, headY: 0 }
    setTarget({ x: 0.5, y: 0.5 })
    setHeadOnlyProjection(false)
    setVerticalHeadDebug(false)
    setProjectionDebugTrace([])
    setLiveMetrics({ faceDetected: false, eyeX: 0, eyeY: 0, headX: 0, headY: 0 })
    setLiveHeadOffset({ headX: 0, headY: 0 })
    setPrepSecondsLeft(0)
    phaseRef.current = 'idle'
    setPhase('idle')
    setStatus(cameraReady ? 'Teste parado. A câmera continua pronta para recomeçar.' : 'Teste parado.')
    if (heatmapSessionId) {
      void cancelTowerHeatmapSession({ storeId, sessionId: heatmapSessionId }).then((result) => {
        if (!result.success) console.error('Nao foi possivel cancelar a sessao do mapa visual:', result.message)
      })
    }
  }

  function markSessionAsRunning() {
    if (!heatmapSessionId) return
    setSessionPersistenceStatus('saving')
    void startTowerHeatmapSession({ storeId, sessionId: heatmapSessionId }).then((result) => {
      if (!result.success) {
        console.error('Nao foi possivel iniciar a sessao do mapa visual:', result.message)
        setSessionPersistenceStatus('error')
        return
      }
      setSessionPersistenceStatus('idle')
    })
  }

  function persistCompletedSession(nextSummary: SessionSummary) {
    if (!heatmapSessionId) return

    setSessionPersistenceStatus('saving')
    const targetSamples = targetHeatSamplesRef.current.map((sample) => {
      const projection = projectSampleToLens(sample)
      return {
        eyeX: sample.eyeX,
        eyeY: sample.eyeY,
        headX: sample.headX,
        headY: sample.headY,
        targetX: sample.targetX,
        targetY: sample.targetY,
        lensX: projection.point.x,
        lensY: projection.point.y,
        headOnlyProjection: sample.headOnlyProjection,
        verticalHeadDebug: sample.verticalHeadDebug,
      }
    })

    void completeTowerHeatmapSession({
      storeId,
      sessionId: heatmapSessionId,
      summary: nextSummary,
      targetSamples,
    }).then((result) => {
      if (!result.success) {
        console.error('Nao foi possivel salvar o mapa visual:', result.message)
        setSessionPersistenceStatus('error')
        return
      }
      setSessionPersistenceStatus('saved')
    })
  }

  function randomTarget() {
    return {
      x: SAFE_TARGET_MARGIN_X + Math.random() * (1 - SAFE_TARGET_MARGIN_X * 2),
      y: SAFE_TARGET_MARGIN_Y + Math.random() * (1 - SAFE_TARGET_MARGIN_Y * 2),
    }
  }

  function moveTarget(point = randomTarget()) {
    currentTargetRef.current = point
    setTarget(point)
    window.requestAnimationFrame(() => {
      targetStartedAtRef.current = performance.now()
    })
  }

  function pushProjectionDebugTrace(sample: SessionSample, sampleCount: number) {
    if (sampleCount <= 0) return

    const normalizedTarget = normalizeTargetOffset(sample.targetX, sample.targetY)
    const isVerticalDebug = Boolean(sample.verticalHeadDebug)
    const sandboxProjection = projectHeadSandboxSample(sample)
    const headCarryX = isVerticalDebug ? 0 : normalizedTarget.x - sandboxProjection.lensEyeX
    const headCarryY = isVerticalDebug
      ? getVerticalDebugCarryY(sample.headY, normalizedTarget.y)
      : normalizedTarget.y - sandboxProjection.lensEyeY
    const residualX = clamp(normalizedTarget.x - headCarryX, -1.2, 1.2)
    const residualY = clamp(normalizedTarget.y - headCarryY, -1.2, 1.2)
    const demand = Math.hypot(normalizedTarget.x, normalizedTarget.y)
    const residual = Math.hypot(residualX, residualY)
    const headDemandShare = clamp(
      (sandboxProjection.headShareX * Math.abs(normalizedTarget.x) +
        sandboxProjection.headShareY * Math.abs(normalizedTarget.y)) /
        Math.max(Math.abs(normalizedTarget.x) + Math.abs(normalizedTarget.y), 0.0001),
      0,
      1,
    )
    const verticalCompensated =
      Math.abs(normalizedTarget.y) > 0.08 && Math.abs(sample.headY) >= VERTICAL_DEBUG_HEAD_THRESHOLD
    const headSandboxCentralized = demand <= 0.08 || residual <= Math.max(0.14, demand * 0.35)
    const headSandboxPartial = residual <= Math.max(0.28, demand * 0.68)
    const decision = isVerticalDebug
      ? verticalCompensated
        ? 'centralized'
        : 'target'
      : headDemandShare >= 0.72 || headSandboxCentralized
        ? 'centralized'
        : headDemandShare >= 0.32 || headSandboxPartial
          ? 'partial'
          : 'target'
    const trace: ProjectionDebugTrace = {
      mode: isVerticalDebug ? 'vertical' : 'headSandbox',
      decision,
      targetX: sample.targetX,
      targetY: sample.targetY,
      normalizedTargetX: normalizedTarget.x,
      normalizedTargetY: normalizedTarget.y,
      headX: sample.headX,
      headY: sample.headY,
      headCarryX,
      headCarryY,
      headShareX: sandboxProjection.headShareX,
      headShareY: sandboxProjection.headShareY,
      eyeShareX: sandboxProjection.eyeShareX,
      eyeShareY: sandboxProjection.eyeShareY,
      residualX,
      residualY,
      compensated: decision === 'centralized',
      sampleCount,
    }
    const nextTrace = [...projectionDebugTraceRef.current, trace]
    projectionDebugTraceRef.current = nextTrace
    setProjectionDebugTrace(nextTrace)
  }

  function flushTargetHeatSample() {
    const samples = targetSamplesRef.current
    if (!samples.length) {
      if (headOnlyProjectionRef.current) {
        const fallbackSample: SessionSample = {
          eyeX: 0,
          eyeY: 0,
          headX: 0,
          headY: 0,
          targetX: currentTargetRef.current.x,
          targetY: currentTargetRef.current.y,
          headOnlyProjection: headOnlyProjectionRef.current,
          verticalHeadDebug: verticalHeadDebugRef.current,
          headCalibration: headSandboxCalibrationRef.current,
        }
        pushProjectionDebugTrace(fallbackSample, 0)
      }
      return
    }

    const consolidatedSample: SessionSample = {
      eyeX: median(samples.map((sample) => sample.eyeX)),
      eyeY: median(samples.map((sample) => sample.eyeY)),
      headX: median(samples.map((sample) => sample.headX)),
      headY: median(samples.map((sample) => sample.headY)),
      targetX: median(samples.map((sample) => sample.targetX)),
      targetY: median(samples.map((sample) => sample.targetY)),
      headOnlyProjection: samples.some((sample) => sample.headOnlyProjection),
      verticalHeadDebug: samples.some((sample) => sample.verticalHeadDebug),
      headCalibration: samples.find((sample) => sample.headCalibration)?.headCalibration,
    }

    if (consolidatedSample.headOnlyProjection) {
      pushProjectionDebugTrace(consolidatedSample, samples.length)
    }
    targetHeatSamplesRef.current.push(consolidatedSample)
    stampHeatSample(heatmapRef.current, consolidatedSample)
    targetSamplesRef.current = []
  }

  function advanceSequenceTarget() {
    if (phaseRef.current === 'running') {
      flushTargetHeatSample()
    }

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

  function startPreparedSession(requireCalibration = true) {
    if (!cameraReady) return
    if (requireCalibration && !hasCalibration) {
      setStatus('Faça a calibração central antes de iniciar a sessão.')
      return
    }

    stopSessionTimers()
    clientResultVisibleRef.current = false
    setClientResultVisible(false)

    heatmapRef.current = makeHeatmap()
    samplesRef.current = []
    targetHeatSamplesRef.current = []
    targetSamplesRef.current = []
    projectionDebugTraceRef.current = []
    targetSequenceRef.current = verticalHeadDebugRef.current ? buildVerticalDebugTargetSequence() : buildTargetSequence()
    targetIndexRef.current = 0
    setPrepSecondsLeft(0)
    setProjectionDebugTrace([])
    setSummary(null)
    setPhase('running')
    markSessionAsRunning()
    setStatus(
      headOnlyProjectionRef.current
        ? verticalHeadDebugRef.current
          ? 'Debug vertical em andamento: alvo só sobe/desce; qualquer movimento vertical da cabeça centraliza o calor.'
          : 'Sandbox cabeça em andamento: o mapa assume que o alvo foi olhado e desconta o movimento da cabeça.'
        : 'Sessão em andamento. O roteiro do alvo agora garante passagem por extremos, cantos e eixos para medir o campo realmente exigido.',
    )
    advanceSequenceTarget()

    targetTimerRef.current = window.setInterval(() => {
      advanceSequenceTarget()
    }, TARGET_INTERVAL_MS)
  }

  function beginCentralCalibration() {
    eyeFollowIntroRef.current = null
    calibrationSamplesRef.current = []
    setLiveHeadOffset({ headX: 0, headY: 0 })
    moveTarget({ x: 0.5, y: LENS_DISTANCE_REFERENCE_Y })
    setStatus('Calibração rápida: peça para o cliente olhar para o ponto de longe por 3 segundos.')
    calibrationTimerRef.current = window.setTimeout(() => {
      const samples = calibrationSamplesRef.current
      if (!samples.length) {
        setStatus('Não houve rastreamento suficiente na calibração. Tente aproximar o rosto e melhorar a luz.')
        setPhase('idle')
        return
      }
      baselineRef.current = averageFaceMetrics(samples)
      headOnlyProjectionRef.current = false
      verticalHeadDebugRef.current = false
      setHeadOnlyProjection(false)
      setVerticalHeadDebug(false)
      setHasCalibration(true)
      setLiveHeadOffset({ headX: 0, headY: 0 })
      startPreparedSession(false)
    }, CALIBRATION_DURATION_MS)
  }

  async function startHeadOnlySandbox() {
    if (!cameraReady) return
    clientResultVisibleRef.current = false
    setClientResultVisible(false)
    await applyTrackingCameraProfile()
    await ensureLandmarker()
    startTrackingLoop()
    stopSessionTimers()
    calibrationSamplesRef.current = []
    sandboxStepRef.current = null
    sandboxCollectedRef.current = {}
    heatmapRef.current = makeHeatmap()
    samplesRef.current = []
    targetHeatSamplesRef.current = []
    targetSamplesRef.current = []
    projectionDebugTraceRef.current = []
    headSandboxCalibrationRef.current = DEFAULT_HEAD_SANDBOX_CALIBRATION
    headOnlyProjectionRef.current = true
    verticalHeadDebugRef.current = false
    setHeadOnlyProjection(true)
    setVerticalHeadDebug(false)
    setProjectionDebugTrace([])
    setHasCalibration(false)
    setLiveHeadOffset({ headX: 0, headY: 0 })
    setSummary(null)
    moveTarget({ x: 0.5, y: 0.5 })
    setStatus('Centralizando os alvos para iniciar a leitura.')
    eyeTargetsMergeStartedAtRef.current = performance.now()

    eyeTargetsMergeTimerRef.current = window.setTimeout(() => {
      eyeTargetsMergeTimerRef.current = null
      eyeTargetsMergeStartedAtRef.current = null
      eyeScanStartedAtRef.current = null
      phaseRef.current = 'calibrating'
      setPhase('calibrating')
      setPrepSecondsLeft(3)
      setStatus('Mantenha o rosto centralizado. O alvo começa em 3 segundos.')

      let secondsLeft = 3
      prepCountdownTimerRef.current = window.setInterval(() => {
        secondsLeft -= 1
        setPrepSecondsLeft(secondsLeft)
        if (secondsLeft <= 0 && prepCountdownTimerRef.current) {
          window.clearInterval(prepCountdownTimerRef.current)
          prepCountdownTimerRef.current = null
        }
      }, 1000)

      calibrationTimerRef.current = window.setTimeout(() => {
        const samples = calibrationSamplesRef.current
        if (!samples.length) {
          setStatus('Não houve rastreamento suficiente na calibração central da sandbox.')
          phaseRef.current = 'idle'
          setPhase('idle')
          return
        }
        baselineRef.current = averageFaceMetrics(samples)
        setHasCalibration(true)
        setLiveHeadOffset({ headX: 0, headY: 0 })
        startPreparedSession(false)
      }, CALIBRATION_DURATION_MS)
    }, EYE_TARGETS_MERGE_MS)
  }

  async function startCalibration() {
    if (!cameraReady) return
    clientResultVisibleRef.current = false
    setClientResultVisible(false)
    await applyTrackingCameraProfile()
    await ensureLandmarker()
    startTrackingLoop()
    stopSessionTimers()
    calibrationSamplesRef.current = []
    projectionDebugTraceRef.current = []
    eyeFollowIntroRef.current = { point: { x: 0.5, y: LENS_DISTANCE_REFERENCE_Y }, baselineEyeX: null, baselineEyeY: null }
    headOnlyProjectionRef.current = false
    verticalHeadDebugRef.current = false
    setHeadOnlyProjection(false)
    setVerticalHeadDebug(false)
    setHasCalibration(false)
    setLiveHeadOffset({ headX: 0, headY: 0 })
    setProjectionDebugTrace([])
    setPhase('calibrating')
    setSummary(null)
    moveTarget({ x: 0.5, y: LENS_DISTANCE_REFERENCE_Y })
    setStatus('Pré-calibração: siga a mira só com os olhos. Ela vai acompanhar seu olhar por alguns segundos.')
    calibrationTimerRef.current = window.setTimeout(() => {
      beginCentralCalibration()
    }, EYE_FOLLOW_INTRO_MS)
  }

  async function startVerticalHeadDebug() {
    if (!cameraReady) return
    clientResultVisibleRef.current = false
    setClientResultVisible(false)
    await applyTrackingCameraProfile()
    await ensureLandmarker()
    startTrackingLoop()
    stopSessionTimers()
    calibrationSamplesRef.current = []
    sandboxStepRef.current = null
    sandboxCollectedRef.current = {}
    heatmapRef.current = makeHeatmap()
    samplesRef.current = []
    targetHeatSamplesRef.current = []
    targetSamplesRef.current = []
    projectionDebugTraceRef.current = []
    headSandboxCalibrationRef.current = DEFAULT_HEAD_SANDBOX_CALIBRATION
    headOnlyProjectionRef.current = true
    verticalHeadDebugRef.current = true
    setHeadOnlyProjection(true)
    setVerticalHeadDebug(true)
    setProjectionDebugTrace([])
    setHasCalibration(false)
    setLiveHeadOffset({ headX: 0, headY: 0 })
    setPhase('calibrating')
    setSummary(null)
    moveTarget({ x: 0.5, y: LENS_DISTANCE_REFERENCE_Y })
    setStatus('Debug vertical: olhe para o ponto de longe por 3 segundos. Depois o alvo só sobe e desce.')
    calibrationTimerRef.current = window.setTimeout(() => {
      const samples = calibrationSamplesRef.current
      if (!samples.length) {
        setStatus('Não houve rastreamento suficiente na calibração central do debug vertical.')
        setPhase('idle')
        return
      }
      baselineRef.current = averageFaceMetrics(samples)
      setHasCalibration(true)
      setLiveHeadOffset({ headX: 0, headY: 0 })
      startPreparedSession(false)
    }, CALIBRATION_DURATION_MS)
  }

  function finishSandboxCalibration() {
    const collected = sandboxCollectedRef.current
    const averaged = Object.fromEntries(
      Object.entries(collected).map(([key, samples]) => [key, averageFaceMetrics(samples)]),
    ) as Record<string, FaceMetrics>
    const center = averaged.center

    if (!center?.faceDetected) {
      setStatus('Sandbox sem amostras centrais suficientes. Rode novamente com o rosto mais centralizado.')
      sandboxStepRef.current = null
      setPhase('idle')
      return
    }

    baselineRef.current = center
    headSandboxCalibrationRef.current = buildHeadSandboxCalibration(averaged, center)
    headOnlyProjectionRef.current = true
    verticalHeadDebugRef.current = false
    setHeadOnlyProjection(true)
    setVerticalHeadDebug(false)
    sandboxStepRef.current = null
    setHasCalibration(true)
    setLiveHeadOffset({ headX: 0, headY: 0 })
    setStatus('Sandbox cabeça calibrada. O mapa vai assumir que o alvo foi olhado e descontar apenas o movimento da cabeça.')
    startPreparedSession(false)
  }

  function runSandboxCalibrationStep(index: number) {
    const step = SANDBOX_CALIBRATION_STEPS[index]
    if (!step) {
      finishSandboxCalibration()
      return
    }

    sandboxStepRef.current = { step, startedAt: performance.now(), samples: [] }
    moveTarget(step.target)
    setStatus(step.instruction)
    calibrationTimerRef.current = window.setTimeout(() => {
      const current = sandboxStepRef.current
      if (current?.step.key === step.key) {
        sandboxCollectedRef.current[step.key] = current.samples
      }
      runSandboxCalibrationStep(index + 1)
    }, SANDBOX_CALIBRATION_STEP_MS)
  }

  async function startSandboxCalibration() {
    if (!cameraReady) return
    clientResultVisibleRef.current = false
    setClientResultVisible(false)
    await applyTrackingCameraProfile()
    await ensureLandmarker()
    startTrackingLoop()
    stopSessionTimers()
    heatmapRef.current = makeHeatmap()
    samplesRef.current = []
    targetHeatSamplesRef.current = []
    targetSamplesRef.current = []
    calibrationSamplesRef.current = []
    sandboxCollectedRef.current = {}
    sandboxStepRef.current = null
    headSandboxCalibrationRef.current = DEFAULT_HEAD_SANDBOX_CALIBRATION
    verticalHeadDebugRef.current = false
    setHasCalibration(false)
    setVerticalHeadDebug(false)
    setLiveHeadOffset({ headX: 0, headY: 0 })
    setPhase('calibrating')
    setSummary(null)
    setPrepSecondsLeft(0)
    setStatus('Iniciando sandbox de calibração...')
    runSandboxCalibrationStep(0)
  }

  function finishSession() {
    flushTargetHeatSample()
    stopSessionTimers()
    phaseRef.current = 'finished'
    clientResultVisibleRef.current = true
    setClientResultVisible(true)
    setPhase('finished')
    const nextSummary = summarizeSession(targetHeatSamplesRef.current)
    setSummary(nextSummary)
    persistCompletedSession(nextSummary)
    stopCamera()
    setStatus('Sessão concluída. A câmera foi desligada para aliviar o tablet. Reabra a câmera quando quiser uma nova leitura.')
  }

  function startSession() {
    startPreparedSession(true)
  }

  function openClientScreen() {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    url.searchParams.set('client', '1')
    openTowerClientScreen(url.toString())
  }

  function sendCommand(command: RemoteCommand) {
    const channel = broadcastRef.current
    if (!channel) return
    channel.postMessage({ type: 'command', command } satisfies CommandPayload)
  }

  async function restartTowerReading() {
    if (!heatmapSessionId || towerActionBusy) return

    setTowerActionBusy(true)
    const result = await resetTowerHeatmapSession({ storeId, sessionId: heatmapSessionId })
    if (result.success) {
      setSessionPersistenceStatus('idle')
      resetLab()
      sendCommand('resetLab')
    } else {
      setStatus(result.message)
    }
    setTowerActionBusy(false)
  }

  async function saveAsDemoTemplate() {
    if (!heatmapSessionId || towerActionBusy) return

    setTowerActionBusy(true)
    const result = await saveTowerHeatmapDemoTemplate({ storeId, sessionId: heatmapSessionId })
    setStatus(result.message)
    if (result.success) setDemoTemplateSaved(true)
    setTowerActionBusy(false)
  }

  function applyDemoTemplate(summary: SessionSummary, targetSamples: DemoTemplateSamplePayload[]) {
    stopSessionTimers()
    stopCamera()
    const loadedSamples = targetSamples.map((sample) => ({
      eyeX: sample.eyeX,
      eyeY: sample.eyeY,
      headX: sample.headX,
      headY: sample.headY,
      targetX: sample.targetX,
      targetY: sample.targetY,
      headOnlyProjection: sample.headOnlyProjection,
      verticalHeadDebug: sample.verticalHeadDebug,
      persistedLensX: sample.lensX,
      persistedLensY: sample.lensY,
    })) satisfies SessionSample[]

    const loadedHeatmap = makeHeatmap()
    loadedSamples.forEach((sample) => stampHeatSample(loadedHeatmap, sample))
    heatmapRef.current = loadedHeatmap
    samplesRef.current = loadedSamples
    targetHeatSamplesRef.current = loadedSamples
    targetSamplesRef.current = []
    phaseRef.current = 'finished'
    clientResultVisibleRef.current = true
    setClientResultVisible(true)
    setPhase('finished')
    setSummary(summary)
    setHasCalibration(true)
    setHeadOnlyProjection(loadedSamples.some((sample) => sample.headOnlyProjection))
    setVerticalHeadDebug(loadedSamples.some((sample) => sample.verticalHeadDebug))
    setSessionPersistenceStatus('idle')
    requestAnimationFrame(() => redrawHeatmaps())
  }

  applyDemoTemplateRef.current = applyDemoTemplate

  async function loadDemoTemplate() {
    if (towerActionBusy) return

    setTowerActionBusy(true)
    const result = await loadTowerHeatmapDemoTemplate({ storeId })
    if (!result.success || !result.data) {
      setStatus(result.message)
      setTowerActionBusy(false)
      return
    }

    applyDemoTemplate(result.data.summary, result.data.targetSamples)
    broadcastRef.current?.postMessage({
      type: 'demo-template',
      summary: result.data.summary,
      targetSamples: result.data.targetSamples,
    } satisfies DemoTemplatePayload)
    setStatus(`${result.message} Use-o como base para testar a avaliação.`)
    setSessionPersistenceStatus('idle')
    setTowerActionBusy(false)
    requestAnimationFrame(() => redrawHeatmaps())
  }

  async function endTowerService() {
    if (!towerSessionId || towerActionBusy) return

    setTowerActionBusy(true)
    const result = await completeTowerSession({ storeId, sessionId: towerSessionId })
    if (result.success) {
      window.location.assign(`/torre/${storeId}`)
      return
    }
    setStatus(result.message)
    setTowerActionBusy(false)
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
      if (clientMode && phaseRef.current === 'idle' && metrics.faceDetected && !eyeScanStartedAtRef.current) {
        eyeScanStartedAtRef.current = now
      }
      drawTrackingOverlay(
        overlay,
        landmarks ?? null,
        metrics,
        eyeScanStartedAtRef.current,
        eyeTargetsMergeStartedAtRef.current,
        now,
      )

      const eyeFollowIntro = eyeFollowIntroRef.current
      if (eyeFollowIntro && metrics.faceDetected) {
        const baselineEyeX = eyeFollowIntro.baselineEyeX ?? metrics.eyeX
        const baselineEyeY = eyeFollowIntro.baselineEyeY ?? metrics.eyeY
        const followEyeX = dramaticEyeFollow(metrics.eyeX - baselineEyeX)
        const followEyeY = dramaticEyeFollow(metrics.eyeY - baselineEyeY)
        const desiredPoint = {
          x: clamp(0.5 - followEyeX * EYE_FOLLOW_GAIN_X, SAFE_TARGET_MARGIN_X, 1 - SAFE_TARGET_MARGIN_X),
          y: clamp(
            LENS_DISTANCE_REFERENCE_Y + followEyeY * EYE_FOLLOW_GAIN_Y,
            SAFE_TARGET_MARGIN_Y,
            1 - SAFE_TARGET_MARGIN_Y,
          ),
        }
        const nextPoint = {
          x: eyeFollowIntro.point.x + (desiredPoint.x - eyeFollowIntro.point.x) * EYE_FOLLOW_SMOOTHING,
          y: eyeFollowIntro.point.y + (desiredPoint.y - eyeFollowIntro.point.y) * EYE_FOLLOW_SMOOTHING,
        }
        eyeFollowIntroRef.current = { point: nextPoint, baselineEyeX, baselineEyeY }
        currentTargetRef.current = nextPoint
        setTarget(nextPoint)
      }

      if (phaseRef.current === 'calibrating' && metrics.faceDetected && !eyeFollowIntro) {
        calibrationSamplesRef.current.push(metrics)
        const sandboxStep = sandboxStepRef.current
        if (sandboxStep && now - sandboxStep.startedAt > SANDBOX_CALIBRATION_SETTLE_MS) {
          sandboxStep.samples.push(metrics)
        }
      }

      const targetElapsed = now - targetStartedAtRef.current
      const isStableCaptureWindow = targetElapsed > TARGET_SETTLE_MS && targetElapsed < TARGET_CAPTURE_END_MS

      if (phaseRef.current === 'running' && metrics.faceDetected && isStableCaptureWindow) {
        const relativeEyeX = clamp(metrics.eyeX - baselineRef.current.eyeX, -1.2, 1.2)
        const relativeEyeY = clamp(metrics.eyeY - baselineRef.current.eyeY, -1.2, 1.2)
        const rawHeadX = clamp(metrics.headX - baselineRef.current.headX, -1.2, 1.2)
        const rawHeadY = clamp(metrics.headY - baselineRef.current.headY, -1.2, 1.2)
        const sample = {
          eyeX: relativeEyeX,
          eyeY: relativeEyeY,
          headX: rawHeadX,
          headY: rawHeadY,
          targetX: currentTargetRef.current.x,
          targetY: currentTargetRef.current.y,
          headOnlyProjection: headOnlyProjectionRef.current,
          verticalHeadDebug: verticalHeadDebugRef.current,
          headCalibration: headSandboxCalibrationRef.current,
        }
        samplesRef.current.push(sample)
        targetSamplesRef.current.push(sample)
      }

      if (now - lastUiTickRef.current > 120) {
        const phaseAllowsAvatarMotion = phaseRef.current === 'idle' || phaseRef.current === 'running'
        const nextHeadOffset = metrics.faceDetected && phaseAllowsAvatarMotion
          ? {
              headX: phaseRef.current === 'idle'
                ? clamp(metrics.headX, -1.2, 1.2)
                : clamp(metrics.headX - baselineRef.current.headX, -1.2, 1.2),
              headY: phaseRef.current === 'idle'
                ? clamp(metrics.headY, -1.2, 1.2)
                : clamp(metrics.headY - baselineRef.current.headY, -1.2, 1.2),
            }
          : { headX: 0, headY: 0 }
        setLiveMetrics(metrics)
        setLiveHeadOffset(nextHeadOffset)
        redrawHeatmaps()
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
  const distanceCoverage = Math.round((summary?.distanceCoverage ?? 0) * 100)
  const intermediateCoverage = Math.round((summary?.intermediateCoverage ?? 0) * 100)
  const nearCoverage = Math.round((summary?.nearCoverage ?? 0) * 100)
  const calibratedLiveHeadX = liveHeadOffset.headX
  const calibratedLiveHeadY = liveHeadOffset.headY
  const realHeadX = clamp(calibratedLiveHeadX, -1, 1)
  const realHeadY = clamp(calibratedLiveHeadY * HEAD_COMPENSATION_DOT_Y_GAIN, -1, 1)
  const compensationHeadX = clamp(getHeadOnlyCarryX(calibratedLiveHeadX), -1, 1)
  const compensationHeadY = clamp(getHeadOnlyCarryY(calibratedLiveHeadY), -1, 1)
  const avatarHeadX = realHeadX
  const avatarHeadY = realHeadY
  const avatarFaceTransform = `perspective(720px) rotateY(${-avatarHeadX * 38}deg) rotateX(${avatarHeadY * 30}deg)`
  const realHeadDotStyle = {
    left: `${50 + realHeadX * 38}%`,
    top: `${50 + realHeadY * 44}%`,
  }
  const compensationDotStyle = {
    left: `${50 + compensationHeadX * 38}%`,
    top: `${50 + compensationHeadY * 44}%`,
  }
  const phaseIsRunning = phase === 'running'
  const phaseIsCalibrating = phase === 'calibrating'
  const phaseIsBusy = phaseIsRunning || phaseIsCalibrating
  const phaseLabel = phaseIsRunning
    ? 'Sessão ativa'
    : phaseIsCalibrating
      ? 'Calibração'
      : 'Aguardando'
  const stageClassName = clientMode
    ? phase === 'finished' || clientResultVisible
      ? 'relative min-h-screen w-screen overflow-visible bg-[radial-gradient(circle_at_50%_20%,_rgba(59,130,246,0.18),_rgba(2,6,23,0.94)_55%),linear-gradient(180deg,_rgba(15,23,42,0.98),_rgba(2,6,23,1))]'
      : 'relative h-screen w-screen overflow-hidden bg-[radial-gradient(circle_at_50%_20%,_rgba(59,130,246,0.18),_rgba(2,6,23,1)_55%),linear-gradient(180deg,_rgba(15,23,42,0.98),_rgba(2,6,23,1))]'
    : isFocusMode
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
  const floatingActionClassName =
    'absolute top-1/2 z-30 inline-flex -translate-y-1/2 items-center gap-2 rounded-2xl border border-white/15 bg-slate-950/74 px-4 py-3 text-sm font-black text-slate-100 shadow-[0_18px_42px_rgba(2,6,23,0.34)] backdrop-blur transition hover:bg-slate-900/88 disabled:cursor-not-allowed disabled:border-white/5 disabled:bg-slate-950/42 disabled:text-slate-500'
  const clientResultMode = clientMode && (clientResultVisible || phase === 'finished')
  const clientVideoVisible = clientMode && !isFocusMode && !clientResultMode
  const showClientTarget = !clientMode || (isFocusMode && !clientResultMode)
  const clientBackgroundOffsetX = (0.5 - target.x) * 64
  const clientBackgroundOffsetY = (0.5 - target.y) * 64

  const stageNode = (
    <div
      ref={stageRef}
      className={`${stageClassName} ${recommendationVisualPhase === 'dismantling' ? 'client-result-dismantling' : ''}`}
    >
      <video
        ref={videoRef}
        className={
          clientMode
            ? `absolute inset-0 h-full w-full ${clientVideoVisible ? 'object-contain bg-black opacity-100' : 'object-cover opacity-0'} scale-x-[-1]`
            : 'pointer-events-none fixed -left-[200vw] top-0 h-px w-px overflow-hidden opacity-0'
        }
        style={clientVideoVisible ? undefined : { opacity: 0, pointerEvents: 'none' }}
        playsInline
        muted
        autoPlay
      />
      <canvas
        ref={overlayRef}
        width={VIDEO_W}
        height={VIDEO_H}
        className={
          clientMode && phase === 'idle'
            ? 'pointer-events-none absolute inset-0 z-10 h-full w-full scale-x-[-1] opacity-100'
            : 'pointer-events-none fixed -left-[200vw] top-0 h-px w-px overflow-hidden opacity-0'
        }
        style={clientMode && phase === 'idle' ? undefined : { opacity: 0, pointerEvents: 'none' }}
      />
      {clientMode && phaseIsRunning && !clientResultMode && (
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden bg-slate-950">
          <div
            className="client-parallax-background absolute -inset-[18%] bg-cover bg-center opacity-80 transition-transform duration-700 ease-in-out"
            style={{
              backgroundImage: "url('/lens-demo/foto1.png')",
              transform: `translate3d(${clientBackgroundOffsetX}px, ${clientBackgroundOffsetY}px, 0) scale(1.34)`,
            }}
          />
          <div className="absolute inset-0 bg-slate-950/38" />
        </div>
      )}
      {clientResultMode && recommendationVisualPhase !== 'search' && recommendationVisualPhase !== 'results' && (
        <div className="relative z-20 flex min-h-screen items-start justify-center px-5 py-8 sm:px-8 sm:py-10">
          <div className="client-result-shell relative flex w-full max-w-[1180px] flex-col items-center justify-start overflow-visible rounded-[44px] border border-cyan-200/18 bg-[linear-gradient(145deg,_rgba(8,47,73,0.62),_rgba(15,23,42,0.82)_48%,_rgba(2,6,23,0.96))] p-5 shadow-[0_36px_110px_rgba(2,6,23,0.62)] sm:p-7">
            <div className="pointer-events-none absolute -left-20 top-10 h-64 w-64 rounded-full bg-cyan-300/12 blur-3xl" />
            <div className="pointer-events-none absolute -right-16 bottom-4 h-72 w-72 rounded-full bg-emerald-300/12 blur-3xl" />
            <div className="client-result-heading relative z-10 mb-5 text-center">
              <p className="text-[11px] font-black uppercase tracking-[0.32em] text-cyan-200/90">
                Analisando padrão visual
              </p>
            </div>
            <div className="client-result-lens relative z-10 w-full max-w-4xl overflow-hidden rounded-[36px] border border-white/12 bg-slate-950/42 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_28px_80px_rgba(2,6,23,0.45)]">
              <div className="pointer-events-none absolute inset-y-4 left-0 z-20 w-1/4 animate-[heatmap-sweep_3.2s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-cyan-100/18 to-transparent blur-md" />
              <div className="pointer-events-none absolute inset-x-12 top-1/2 z-20 h-px animate-pulse bg-gradient-to-r from-transparent via-cyan-100/60 to-transparent shadow-[0_0_24px_rgba(125,211,252,0.55)]" />
              <canvas
                ref={clientResultCanvasRef}
                width={1100}
                height={600}
                className="mx-auto max-h-[38vh] w-auto max-w-full rounded-[28px]"
              />
            </div>
            {clientResultAnimationComplete && (
              <div className="client-result-cards relative z-10 mt-6 grid w-full max-w-4xl grid-cols-1 gap-4">
              {clientVisualAnalysis.fronts.map((front, index) => {
                const tone = front.state === 'good'
                  ? 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100'
                  : front.state === 'wide' || front.state === 'guidance'
                    ? 'border-amber-300/25 bg-amber-400/10 text-amber-100'
                    : front.state === 'attention'
                      ? 'border-rose-300/30 bg-rose-400/10 text-rose-100'
                      : 'border-slate-400/20 bg-slate-400/10 text-slate-200'
                const dot = front.state === 'good'
                  ? 'bg-emerald-300'
                  : front.state === 'wide' || front.state === 'guidance'
                    ? 'bg-amber-300'
                    : front.state === 'attention'
                      ? 'bg-rose-300'
                      : 'bg-slate-300'
                return (
                  <div
                    key={front.key}
                    className={`client-analysis-card animate-[analysis-card-in_420ms_ease-out_forwards] rounded-3xl border px-7 py-6 text-left opacity-0 ${tone}`}
                    style={{ animationDelay: `${index * 620}ms` }}
                  >
                    <div className="flex items-center gap-3 text-sm font-black uppercase tracking-[0.2em]">
                      <span className={`h-3 w-3 rounded-full ${dot}`} />
                      {front.label}
                    </div>
                    <p className="mt-3 text-2xl font-black leading-tight text-white sm:text-3xl">{front.status}</p>
                    <p className="mt-3 text-lg leading-7 text-slate-200 sm:text-xl sm:leading-8">{front.detail}</p>
                    <p className="mt-4 border-t border-white/10 pt-4 text-lg font-bold leading-7 text-white sm:text-xl sm:leading-8">{front.recommendation}</p>
                  </div>
                )
              })}
              </div>
            )}
            <style jsx>{`
              @keyframes analysis-card-in {
                from {
                  opacity: 0;
                  transform: translateY(16px) scale(0.98);
                }
                to {
                  opacity: 1;
                  transform: translateY(0) scale(1);
                }
              }

              @keyframes heatmap-sweep {
                0% {
                  transform: translateX(-140%);
                  opacity: 0;
                }
                25% {
                  opacity: 0.9;
                }
                100% {
                  transform: translateX(520%);
                  opacity: 0;
                }
              }

              .client-result-dismantling .client-result-heading {
                animation: client-heading-out 320ms ease-in forwards;
              }

              .client-result-dismantling .client-analysis-card {
                animation: client-card-out 460ms ease-in forwards;
              }

              .client-result-dismantling .client-analysis-card:nth-child(3) {
                animation-delay: 60ms;
              }

              .client-result-dismantling .client-analysis-card:nth-child(2) {
                animation-delay: 150ms;
              }

              .client-result-dismantling .client-analysis-card:nth-child(1) {
                animation-delay: 240ms;
              }

              .client-result-dismantling .client-result-lens {
                animation: client-lens-out 650ms cubic-bezier(0.4, 0, 0.8, 0.2) 330ms forwards;
              }

              .client-result-dismantling .client-result-shell {
                animation: client-shell-out 980ms ease-in 120ms forwards;
              }

              @keyframes client-heading-out {
                to {
                  opacity: 0;
                  transform: translateY(-18px);
                }
              }

              @keyframes client-card-out {
                to {
                  opacity: 0;
                  transform: translateY(30px) scale(0.96);
                  filter: blur(5px);
                }
              }

              @keyframes client-lens-out {
                45% {
                  opacity: 0.8;
                  transform: scale(0.9);
                }
                to {
                  opacity: 0;
                  transform: translateY(-18px) scale(0.7);
                  filter: blur(12px);
                }
              }

              @keyframes client-shell-out {
                65% {
                  border-color: rgba(103, 232, 249, 0.08);
                  background: rgba(2, 6, 23, 0.62);
                }
                to {
                  opacity: 0;
                  transform: scale(0.985);
                  border-color: transparent;
                  background: rgba(2, 6, 23, 0);
                  box-shadow: none;
                }
              }
            `}</style>
          </div>
        </div>
      )}
      {showClientTarget && (
        <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.06)_1px,transparent_1px)] bg-[size:32px_32px]" />
      )}
      {!clientMode && (
        <>
          <button
            type="button"
            onClick={() => (clientMode ? void startCalibration() : sendCommand('startCalibration'))}
            disabled={!cameraReady || phaseIsBusy}
            className={`${floatingActionClassName} left-4`}
          >
            <ScanFace className="h-4 w-4" />
            Calibrar e iniciar
          </button>
          <button
            type="button"
            onClick={() => (clientMode ? startSession() : sendCommand('startSession'))}
            disabled={!cameraReady || phaseIsBusy || !hasCalibration}
            className={`${floatingActionClassName} right-4 border-rose-300/30 bg-rose-950/58 text-rose-100 hover:bg-rose-900/72 disabled:border-white/5 disabled:bg-slate-950/42 disabled:text-slate-500`}
          >
            <Play className="h-4 w-4" />
            Iniciar sessão
          </button>
        </>
      )}
      {showClientTarget && (
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
      )}
      {clientMode && phaseIsCalibrating && prepSecondsLeft > 0 && (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center">
          <div className="text-[clamp(11rem,38vw,27rem)] font-black leading-none text-cyan-100 drop-shadow-[0_0_42px_rgba(103,232,249,0.8)]">
            {prepSecondsLeft}
          </div>
        </div>
      )}
      {!clientMode && !isFocusMode && (
        <div className="absolute bottom-4 left-4 rounded-full bg-slate-900/70 px-3 py-1 text-xs font-bold text-slate-300 backdrop-blur">
          {phaseLabel}
        </div>
      )}
    </div>
  )

  if (clientMode) {
    return (
      <div className={clientResultMode ? 'min-h-screen w-screen overflow-y-auto bg-slate-950 text-white' : 'h-screen w-screen overflow-hidden bg-slate-950 text-white'}>
        {stageNode}
        {recommendationSearchActive && <LensRecommendationSearchAnimation geometries={geometries} />}
        {recommendationVisualPhase === 'results' && clientRecommendations.length > 0 && (
          <ClientLensRecommendationResults
            recommendations={clientRecommendations}
            salesAssist={clientSalesAssist}
            geometries={geometries}
            heatmap={heatmapRef.current}
            samples={targetHeatSamplesRef.current}
          />
        )}
        <button
          type="button"
          onClick={toggleFullscreen}
          className="fixed right-4 top-4 z-[75] inline-flex items-center gap-2 rounded-xl border border-white/20 bg-slate-900/75 px-3 py-2 text-xs font-bold text-slate-100 backdrop-blur transition hover:bg-slate-800/85"
        >
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          {isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
        </button>
        {!cameraReady && !clientResultMode && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/72 p-6 backdrop-blur-sm">
            <div className="max-w-sm rounded-[28px] border border-cyan-300/25 bg-slate-900/92 p-5 text-center shadow-[0_30px_90px_rgba(2,6,23,0.5)]">
              <p className="text-sm font-black uppercase tracking-[0.22em] text-cyan-200">Tela do cliente</p>
              <p className="mt-3 text-sm leading-6 text-slate-300">{status}</p>
              <button
                type="button"
                onClick={startCamera}
                disabled={loadingModel}
                className="mt-5 inline-flex items-center justify-center gap-2 rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-300 disabled:cursor-wait disabled:bg-slate-700 disabled:text-slate-300"
              >
                {loadingModel ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                Ativar câmera
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  if (towerMode) {
    const towerReadingFinished = phase === 'finished' || summary !== null || status.startsWith('Sessão concluída')
    const towerPhaseLabel = phaseIsRunning
      ? 'Leitura em andamento'
      : phaseIsCalibrating
        ? 'Preparando leitura'
        : towerReadingFinished
          ? 'Leitura concluída'
          : cameraReady
            ? 'Pronto para iniciar'
            : 'Aguardando câmera'

    return (
      <main className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-slate-950 px-5 py-4 text-white sm:px-7 sm:py-5">
        <header className="flex shrink-0 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href={backPath}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
              title="Voltar"
              aria-label="Voltar"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300">Torre de experiência</p>
              <h1 className="truncate text-xl font-black tracking-tight text-white">Campo Visual</h1>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={closeTowerClientScreen} className="rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-xs font-black text-slate-300 transition hover:bg-slate-800">
              Fechar tela
            </button>
            <button
              type="button"
              onClick={openClientScreen}
              className="rounded-xl border border-cyan-300/25 bg-cyan-400/10 px-3 py-2 text-xs font-black text-cyan-100 transition hover:bg-cyan-400/20"
            >
              Abrir tela cliente
            </button>
          </div>
        </header>

        <section className="flex min-h-0 flex-1 items-center justify-center py-5">
          <div className="w-full max-w-4xl rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.15),_transparent_46%),linear-gradient(180deg,_rgba(15,23,42,0.98),_rgba(2,6,23,0.98))] p-5 shadow-[0_28px_80px_rgba(2,6,23,0.45)] sm:p-6">
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${phaseIsBusy ? 'animate-pulse bg-cyan-300' : towerReadingFinished ? 'bg-emerald-300' : cameraReady ? 'bg-emerald-300' : 'bg-slate-500'}`} />
              <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-200">{towerPhaseLabel}</p>
            </div>
            <h2 className="mt-5 text-2xl font-black leading-tight text-white sm:text-3xl">
              {towerReadingFinished ? 'Campo visual registrado.' : 'Conduza a leitura pela tela do cliente.'}
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-300 sm:text-base">{status}</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-[minmax(0,1fr)_170px]">
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/55 p-2">
                <canvas ref={mainHeatmapRef} width={620} height={360} className="h-auto w-full" />
              </div>
              <div className="rounded-2xl border border-emerald-400/15 bg-slate-950/60 p-3">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-200">Compensação cabeça</p>
                <div className="relative mx-auto mt-3 h-36 w-36 rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_center,_rgba(15,23,42,0.95),_rgba(2,6,23,0.96))]">
                  <div className="absolute left-1/2 top-3 h-[calc(100%-24px)] w-px -translate-x-1/2 bg-white/10" />
                  <div className="absolute left-3 top-1/2 h-px w-[calc(100%-24px)] -translate-y-1/2 bg-white/10" />
                  <div
                    className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-200 bg-cyan-300 shadow-[0_0_18px_rgba(103,232,249,0.55)]"
                    style={realHeadDotStyle}
                  />
                  <div
                    className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-200 bg-amber-300 shadow-[0_0_18px_rgba(252,211,77,0.55)]"
                    style={compensationDotStyle}
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div
                      className="relative h-20 w-[4.2rem] rounded-[42%_42%_46%_46%] border border-cyan-200/50 bg-slate-800 shadow-[inset_0_0_28px_rgba(34,211,238,0.1),0_18px_38px_rgba(2,6,23,0.45)] transition-transform duration-150"
                      style={{ transform: avatarFaceTransform, transformStyle: 'preserve-3d' }}
                    >
                      <div className="absolute -left-2 top-8 h-5 w-3 rounded-full border border-cyan-200/30 bg-slate-700" />
                      <div className="absolute -right-2 top-8 h-5 w-3 rounded-full border border-cyan-200/30 bg-slate-700" />
                      <div className="absolute left-3.5 top-9 h-2.5 w-2.5 rounded-full bg-cyan-200" />
                      <div className="absolute right-3.5 top-9 h-2.5 w-2.5 rounded-full bg-cyan-200" />
                      <div className="absolute left-1/2 top-9 h-7 w-px -translate-x-1/2 bg-emerald-300/80" />
                      <div className="absolute bottom-4 left-1/2 h-1.5 w-7 -translate-x-1/2 rounded-full bg-slate-500" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {summary && towerReadingFinished && (
              <div className="mt-5 rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-4 py-3">
                <p className="text-sm font-black text-emerald-100">{summary.label}</p>
                <p className="mt-1 text-sm leading-5 text-emerald-50/80">{summary.message}</p>
              </div>
            )}
          </div>
        </section>

        <footer className="shrink-0 border-t border-white/10 pt-4">
          {towerReadingFinished ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <Link
                href={towerSessionId ? `/torre/${storeId}/avaliacao?session=${towerSessionId}&heatmap=${heatmapSessionId ?? ''}` : backPath}
                className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-cyan-400 px-4 text-center text-sm font-black text-slate-950 transition hover:bg-cyan-300"
              >
                Continuar para avaliação
              </Link>
              <button
                type="button"
                onClick={() => void restartTowerReading()}
                disabled={towerActionBusy}
                className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-amber-300/25 bg-amber-400/10 px-4 text-sm font-black text-amber-100 transition hover:bg-amber-400/20 disabled:cursor-wait disabled:opacity-50"
              >
                <RotateCcw className="h-4 w-4" />
                Refazer rastreamento
              </button>
              <button
                type="button"
                onClick={() => void saveAsDemoTemplate()}
                disabled={towerActionBusy}
                className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-violet-300/25 bg-violet-400/10 px-4 text-sm font-black text-violet-100 transition hover:bg-violet-400/20 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {towerActionBusy && !demoTemplateSaved ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bookmark className="h-4 w-4" />}
                {demoTemplateSaved ? 'Mapa demonstrativo gravado' : 'Gravar mapa demonstrativo'}
              </button>
              <button
                type="button"
                onClick={() => void loadDemoTemplate()}
                disabled={towerActionBusy}
                className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-cyan-300/25 bg-cyan-400/10 px-4 text-sm font-black text-cyan-100 transition hover:bg-cyan-400/20 disabled:cursor-wait disabled:opacity-45"
              >
                {towerActionBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bookmark className="h-4 w-4" />}
                Carregar mapa salvo
              </button>
              <button
                type="button"
                onClick={() => void endTowerService()}
                disabled={!towerSessionId || towerActionBusy}
                className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-slate-900 px-4 text-sm font-black text-slate-100 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <StopCircle className="h-4 w-4" />
                Encerrar atendimento
              </button>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => sendCommand('openCamera')}
                disabled={loadingModel || cameraReady || phaseIsBusy}
                className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-slate-900 px-4 text-sm font-black text-slate-100 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {loadingModel ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                {cameraReady ? 'Câmera pronta' : 'Ativar câmera'}
              </button>
              {phaseIsBusy ? (
            <button
              type="button"
              onClick={() => sendCommand('cancelRun')}
              className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-amber-300/25 bg-amber-400/10 px-4 text-sm font-black text-amber-100 transition hover:bg-amber-400/20"
            >
              <StopCircle className="h-4 w-4" />
              Cancelar leitura
            </button>
          ) : (
            <button
              type="button"
              onClick={() => sendCommand('startHeadOnlySandbox')}
              disabled={!cameraReady}
              className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-cyan-400 px-4 text-sm font-black text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            >
              <Play className="h-4 w-4" />
              Iniciar Campo Visual
            </button>
          )}
              <button
                type="button"
                onClick={() => void loadDemoTemplate()}
                disabled={towerActionBusy}
                className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-cyan-300/25 bg-cyan-400/10 px-4 text-sm font-black text-cyan-100 transition hover:bg-cyan-400/20 disabled:cursor-wait disabled:opacity-45"
              >
                {towerActionBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bookmark className="h-4 w-4" />}
                Carregar mapa salvo
              </button>
            </div>
          )}
        </footer>
      </main>
    )
  }

  return (
    <div className={`${towerMode ? 'min-h-[100dvh]' : 'min-h-screen'} bg-slate-950 text-white`}>
      <div className="border-b border-white/10 bg-slate-900/90 px-5 py-4 backdrop-blur">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={backPath}
            className={towerMode
              ? 'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300 transition-colors hover:bg-white/10 hover:text-white'
              : 'inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-800 px-4 py-2 text-sm font-bold text-slate-200 transition hover:bg-slate-700'}
            title="Voltar"
            aria-label="Voltar"
          >
            <ArrowLeft className="h-4 w-4" />
            {!towerMode && 'Voltar'}
          </Link>
          <div className="min-w-0">
            <p className="text-xl font-black tracking-tight">Laboratório de mapa de calor ocular</p>
            <p className="text-sm text-slate-400">
              Loja {storeId} · MVP para Chrome em tablet usando câmera frontal e alvo guiado.
            </p>
          </div>
          <div className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3 py-1 text-xs font-black tracking-[0.18em] text-cyan-200">
            {HEATMAP_LAB_BUILD}
          </div>
        </div>
      </div>

      <div className="grid gap-5 px-5 py-5 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.12),_transparent_42%),linear-gradient(180deg,_rgba(15,23,42,0.98),_rgba(2,6,23,0.98))] p-5 shadow-[0_35px_90px_rgba(2,6,23,0.45)]">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-300/80">Teste guiado</p>
              <p className="text-sm text-slate-400">
                A mira segue uma sequência fixa de pontos enquanto medimos olhos e cabeça.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => (clientMode ? startCamera() : sendCommand('openCamera'))}
                disabled={loadingModel}
                className="inline-flex items-center gap-2 rounded-2xl bg-cyan-500 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-300"
              >
                {loadingModel ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                Abrir câmera
              </button>
              <button
                onClick={() => (clientMode ? void startCalibration() : sendCommand('startCalibration'))}
                disabled={!cameraReady || phaseIsBusy}
                className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-800 px-4 py-2.5 text-sm font-black text-slate-200 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:text-slate-500"
              >
                <ScanFace className="h-4 w-4" />
                Calibrar e iniciar
              </button>
              <button
                onClick={() => (clientMode ? void startHeadOnlySandbox() : sendCommand('startHeadOnlySandbox'))}
                disabled={!cameraReady || phaseIsRunning}
                className="inline-flex items-center gap-2 rounded-2xl border border-amber-300/30 bg-amber-500/10 px-4 py-2.5 text-sm font-black text-amber-100 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:text-slate-500"
              >
                <ScanFace className="h-4 w-4" />
                {phaseIsCalibrating ? 'Recomeçar sandbox' : 'Sandbox cabeça'}
              </button>
              <button
                onClick={() => (clientMode ? void startVerticalHeadDebug() : sendCommand('startVerticalHeadDebug'))}
                disabled={!cameraReady || phaseIsRunning}
                className="inline-flex items-center gap-2 rounded-2xl border border-violet-300/30 bg-violet-500/10 px-4 py-2.5 text-sm font-black text-violet-100 transition hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:text-slate-500"
              >
                <ScanFace className="h-4 w-4" />
                Debug vertical
              </button>
              <button
                onClick={() => (clientMode ? startSession() : sendCommand('startSession'))}
                disabled={!cameraReady || phaseIsBusy || !hasCalibration}
                className="inline-flex items-center gap-2 rounded-2xl border border-rose-400/30 bg-rose-500/15 px-4 py-2.5 text-sm font-black text-rose-200 transition hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:text-slate-500"
              >
                <Play className="h-4 w-4" />
                Iniciar sessão
              </button>
              <button
                onClick={openClientScreen}
                className="inline-flex items-center gap-2 rounded-2xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-2.5 text-sm font-black text-cyan-100 transition hover:bg-cyan-500/20"
              >
                Abrir tela cliente
              </button>
              <button
                onClick={() => (clientMode ? finishSession() : sendCommand('finishSession'))}
                disabled={!phaseIsRunning}
                className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-800 px-4 py-2.5 text-sm font-black text-slate-200 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:text-slate-500"
              >
                <StopCircle className="h-4 w-4" />
                Encerrar
              </button>
              <button
                onClick={() => (clientMode ? cancelRun() : sendCommand('cancelRun'))}
                disabled={!phaseIsBusy}
                className="inline-flex items-center gap-2 rounded-2xl border border-amber-300/25 bg-slate-800 px-4 py-2.5 text-sm font-black text-amber-100 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:text-slate-500"
              >
                <StopCircle className="h-4 w-4" />
                Parar
              </button>
              <button
                onClick={() => (clientMode ? resetLab() : sendCommand('resetLab'))}
                className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-800 px-4 py-2.5 text-sm font-black text-slate-200 transition hover:bg-slate-700"
              >
                <RotateCcw className="h-4 w-4" />
                Resetar
              </button>
            </div>
          </div>

          <div className="mb-4 rounded-3xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-slate-300">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{status}</span>
              <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-black tracking-[0.14em] text-emerald-200">
                {cameraSettings
                  ? `CAM ${cameraSettings.width ?? '-'}x${cameraSettings.height ?? '-'} · ${Math.round(cameraSettings.frameRate ?? 0) || '-'}FPS`
                  : 'CAM aguardando tela cliente'}
              </span>
              {heatmapSessionId && !clientMode && (
                <span className={`rounded-full border px-3 py-1.5 text-xs font-black tracking-[0.14em] ${
                  sessionPersistenceStatus === 'saved'
                    ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200'
                    : sessionPersistenceStatus === 'error'
                      ? 'border-rose-400/30 bg-rose-500/10 text-rose-100'
                      : 'border-cyan-400/20 bg-cyan-500/10 text-cyan-100'
                }`}>
                  {sessionPersistenceStatus === 'saved'
                    ? 'MAPA SALVO'
                    : sessionPersistenceStatus === 'error'
                      ? 'ERRO AO SALVAR'
                      : sessionPersistenceStatus === 'saving'
                        ? 'SALVANDO MAPA'
                        : 'SESSAO VINCULADA'}
                </span>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-400">
                  Geometria
                  <select
                    value={selectedGeometry?.id ?? ''}
                    onChange={(event) => setSelectedGeometryId(event.target.value)}
                    disabled={!geometries.length}
                    className="min-w-[220px] rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-100 outline-none transition focus:border-cyan-300/60 disabled:cursor-not-allowed disabled:text-slate-500"
                  >
                    {!geometries.length && <option value="">Nenhuma geometria cadastrada</option>}
                    {geometries.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.family_name}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="rounded-full bg-slate-800 px-2.5 py-1 text-[10px] font-black tracking-[0.16em] text-cyan-200">
                  BUILD {HEATMAP_LAB_BUILD}
                </span>
                {cameraSettings && (
                  <span className="rounded-full bg-slate-800 px-2.5 py-1 text-[10px] font-black tracking-[0.16em] text-emerald-200">
                    CAM {cameraSettings.width ?? '-'}x{cameraSettings.height ?? '-'} · {Math.round(cameraSettings.frameRate ?? 0) || '-'}FPS
                  </span>
                )}
              </div>
            </div>
          </div>

          {secureContextWarning && (
            <div className="mb-4 rounded-3xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              O navegador não está em contexto seguro. No tablet Samsung, `getUserMedia` costuma exigir HTTPS ou origem confiável.
            </div>
          )}

          <div className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-[1fr]">
              <div className="rounded-[28px] border border-white/10 bg-slate-900/80 p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-slate-800/90 p-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Ao vivo agora · olhos</p>
                    <p className="mt-2 text-2xl font-black text-cyan-300">
                      {Math.round(Math.abs(liveMetrics.eyeX) * 100)}%
                    </p>
                    <p className="text-xs text-slate-500">Leitura instantânea, não é o resumo final da sessão.</p>
                  </div>
                  <div className="rounded-2xl bg-slate-800/90 p-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Ao vivo agora · cabeça</p>
                    <p className="mt-2 text-2xl font-black text-emerald-300">
                      {Math.round(Math.abs(liveMetrics.headX) * 100)}%
                    </p>
                    <p className="text-xs text-slate-500">Serve para checar captura no momento, não para comparar com o resultado final.</p>
                  </div>
                </div>
                <div className="mt-3 rounded-2xl border border-cyan-400/15 bg-cyan-500/5 p-3 text-xs leading-5 text-slate-300">
                  <div className="grid gap-2 sm:grid-cols-4">
                    <div>
                      <span className="block font-black uppercase tracking-[0.16em] text-cyan-200">Olho X</span>
                      <span className="text-slate-100">{Math.round(liveMetrics.eyeX * 100)}%</span>
                    </div>
                    <div>
                      <span className="block font-black uppercase tracking-[0.16em] text-cyan-200">Olho Y</span>
                      <span className="text-slate-100">{Math.round(liveMetrics.eyeY * 100)}%</span>
                    </div>
                    <div>
                      <span className="block font-black uppercase tracking-[0.16em] text-emerald-200">Cabeça X</span>
                      <span className="text-slate-100">{Math.round(liveMetrics.headX * 100)}%</span>
                    </div>
                    <div>
                      <span className="block font-black uppercase tracking-[0.16em] text-emerald-200">Cabeça Y</span>
                      <span className="text-slate-100">{Math.round(liveMetrics.headY * 100)}%</span>
                    </div>
                  </div>
                </div>
                <div className="mt-3 grid gap-3 lg:grid-cols-[220px_1fr]">
                  <div className="rounded-2xl border border-emerald-400/15 bg-slate-950/60 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-[11px] font-black uppercase tracking-[0.16em] text-emerald-200">
                        Compensação cabeça
                      </span>
                      <span className="text-[10px] font-bold text-slate-500">
                        X {Math.round(calibratedLiveHeadX * 100)} · Y {Math.round(calibratedLiveHeadY * 100)}
                      </span>
                    </div>
                    <div className="relative mx-auto h-40 w-40 rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_center,_rgba(15,23,42,0.95),_rgba(2,6,23,0.96))]">
                      <div className="absolute left-1/2 top-3 h-[calc(100%-24px)] w-px -translate-x-1/2 bg-white/10" />
                      <div className="absolute left-3 top-1/2 h-px w-[calc(100%-24px)] -translate-y-1/2 bg-white/10" />
                      <div
                        className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-200 bg-cyan-300 shadow-[0_0_18px_rgba(103,232,249,0.55)]"
                        style={realHeadDotStyle}
                      />
                      <div
                        className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-amber-200 bg-amber-300 shadow-[0_0_18px_rgba(252,211,77,0.55)]"
                        style={compensationDotStyle}
                      />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div
                          className="relative h-24 w-20 rounded-[42%_42%_46%_46%] border border-cyan-200/50 bg-slate-800 shadow-[inset_0_0_28px_rgba(34,211,238,0.1),0_18px_38px_rgba(2,6,23,0.45)] transition-transform duration-150"
                          style={{ transform: avatarFaceTransform, transformStyle: 'preserve-3d' }}
                        >
                          <div className="absolute -left-2 top-10 h-6 w-3 rounded-full border border-cyan-200/30 bg-slate-700" />
                          <div className="absolute -right-2 top-10 h-6 w-3 rounded-full border border-cyan-200/30 bg-slate-700" />
                          <div className="absolute left-4 top-9 h-2.5 w-2.5 rounded-full bg-cyan-200" />
                          <div className="absolute right-4 top-9 h-2.5 w-2.5 rounded-full bg-cyan-200" />
                          <div className="absolute left-1/2 top-10 h-8 w-px -translate-x-1/2 bg-emerald-300/80" />
                          <div className="absolute bottom-5 left-1/2 h-1.5 w-8 -translate-x-1/2 rounded-full bg-slate-500" />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-3 text-xs leading-5 text-slate-300">
                    <p className="font-bold text-slate-200">Como ler a compensação</p>
                    <p className="mt-1 text-slate-400">
                      A bolinha mostra a compensação usada pelo mapa, por isso pode ir no sentido oposto ao rosto.
                      Se ela quase não mexe em um eixo, a captura desse eixo está fraca.
                    </p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <div className="rounded-xl bg-slate-900/70 px-3 py-2">
                        <span className="block font-black uppercase tracking-[0.16em] text-emerald-200">Horizontal</span>
                        <span className="text-slate-100">{Math.round(Math.abs(calibratedLiveHeadX) * 100)}%</span>
                      </div>
                      <div className="rounded-xl bg-slate-900/70 px-3 py-2">
                        <span className="block font-black uppercase tracking-[0.16em] text-emerald-200">Vertical</span>
                        <span className="text-slate-100">{Math.round(Math.abs(calibratedLiveHeadY) * 100)}%</span>
                      </div>
                    </div>
                  </div>
                </div>
                {projectionDebugTrace.length > 0 && (
                  <div className="mt-3 rounded-2xl border border-violet-300/20 bg-violet-500/10 p-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-violet-100">
                        {projectionDebugTrace.some((trace) => trace.mode === 'headSandbox')
                          ? 'Sandbox cabeça · decisão por alvo'
                          : 'Debug vertical · decisão por alvo'}
                      </p>
                      <span className="rounded-full border border-white/10 bg-slate-950/55 px-2.5 py-1 text-[10px] font-black text-slate-300">
                        limiar cabeça Y {Math.round(VERTICAL_DEBUG_HEAD_THRESHOLD * 100)}%
                      </span>
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                      {projectionDebugTrace
                        .slice()
                        .reverse()
                        .map((trace, index) => (
                          <div
                            key={`${trace.mode}-${trace.targetX}-${trace.targetY}-${trace.headX}-${trace.headY}-${index}`}
                            className={`rounded-xl border px-3 py-2 text-xs ${
                              trace.decision === 'centralized'
                                ? 'border-emerald-300/25 bg-emerald-500/10 text-emerald-100'
                                : trace.decision === 'partial'
                                  ? 'border-cyan-300/25 bg-cyan-500/10 text-cyan-100'
                                  : 'border-amber-300/25 bg-amber-500/10 text-amber-100'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-black uppercase tracking-[0.12em]">
                                {trace.decision === 'centralized'
                                  ? 'Centralizou'
                                  : trace.decision === 'partial'
                                    ? 'Parcial'
                                    : 'Pintou alvo'}
                              </span>
                              <span className="font-bold text-slate-300">{trace.sampleCount} amostras</span>
                            </div>
                            <div className="mt-2 grid gap-2 text-[11px] text-slate-300 sm:grid-cols-2 lg:grid-cols-4">
                              <span>
                                <b className="block text-slate-100">Alvo lente</b>
                                X {Math.round(trace.normalizedTargetX * 100)} · Y {Math.round(trace.normalizedTargetY * 100)}%
                              </span>
                              <span>
                                <b className="block text-emerald-100">Cabeça compensou</b>
                                X {Math.round(trace.headCarryX * 100)} · Y {Math.round(trace.headCarryY * 100)}%
                              </span>
                              <span>
                                <b className="block text-cyan-100">Olho restante</b>
                                X {Math.round(trace.residualX * 100)} · Y {Math.round(trace.residualY * 100)}%
                              </span>
                              <span>
                                <b className="block text-amber-100">Cabeça eixo</b>
                                X {Math.round(trace.headShareX * 100)} · Y {Math.round(trace.headShareY * 100)}%
                              </span>
                            </div>
                            <div className="mt-2 text-[10px] text-slate-400">
                              leitura consolidada cabeça X {Math.round(trace.headX * 100)} · Y {Math.round(trace.headY * 100)}%
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
                <p className="mt-3 text-xs text-slate-500">
                  Cada cartão é um alvo consolidado pela mediana das amostras estáveis. Os mapas abaixo usam exatamente esses mesmos pontos.
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
                <div className={`rounded-2xl border p-4 ${summary.isReliable ? 'border-emerald-400/20 bg-emerald-500/10' : 'border-amber-400/20 bg-amber-500/10'}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-200">Cobertura para decisão</p>
                    <span className={`text-xs font-black ${summary.isReliable ? 'text-emerald-300' : 'text-amber-300'}`}>
                      {summary.isReliable ? 'Sessão utilizável' : 'Sessão incompleta'}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm font-bold sm:grid-cols-3">
                    <span className="text-slate-200">Longe: {distanceCoverage}%</span>
                    <span className="text-slate-200">Intermediário: {intermediateCoverage}%</span>
                    <span className="text-slate-200">Perto: {nearCoverage}%</span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-400">
                    A recomendação futura só deve usar este resultado quando cada região tiver pelo menos 70% dos alvos consolidados.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-cyan-400/15 bg-cyan-500/10 p-4">
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-cyan-100">Lateral: olhos x cabeça</p>
                    <p className="mt-2 text-xl font-black text-cyan-300">{eyePercentX}% olhos</p>
                    <p className="text-sm font-bold text-emerald-300">{headPercentX}% cabeça</p>
                    <p className="mt-2 text-xs leading-5 text-slate-400">
                      Na horizontal, levar a cabeça pode ajudar a manter o uso mais central do campo.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-fuchsia-400/15 bg-fuchsia-500/10 p-4">
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-fuchsia-100">Vertical: olhos x cabeça</p>
                    <p className="mt-2 text-xl font-black text-cyan-300">{eyePercentY}% olhos</p>
                    <p className="text-sm font-bold text-emerald-300">{headPercentY}% cabeça</p>
                    <p className="mt-2 text-xs leading-5 text-slate-400">
                      Na vertical, queremos mais olhos e menos cabeça para facilitar o acesso ao perto e ao corredor.
                    </p>
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
              Este é o mapa principal da sessão: um heatmap contínuo sobreposto à lente real. A intensidade mostra frequência relativa, não a posição exata de cada alvo.
            </p>
          </div>

          <div className="rounded-[28px] border border-cyan-300/20 bg-slate-900/90 p-5 shadow-[0_25px_70px_rgba(2,6,23,0.38)]">
            <canvas ref={auditHeatmapRef} width={620} height={360} className="h-auto w-full" />
            <p className="mt-3 text-xs leading-5 text-cyan-100/70">
              Auditoria: cada número é um alvo do roteiro e marca o ponto exato que alimentou o heatmap. Ciano indica maior participação dos olhos; verde, maior compensação pela cabeça.
            </p>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-slate-900/90 p-5 shadow-[0_25px_70px_rgba(2,6,23,0.38)]">
            <canvas ref={contourHeatmapRef} width={620} height={300} className="h-auto w-full" />
            <p className="mt-3 text-xs leading-5 text-slate-500">
              Este contorno mostra o alcance máximo capturado em cada direção. Ele ajuda a separar “frequência” de “limite realmente exigido”.
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

