export type FaceShape = 'round' | 'oval' | 'square' | 'long' | 'heart' | 'triangle' | 'balanced'

export type FaceAnalysisInputPoint = {
  x: number
  y: number
  z?: number
}

export type FaceAnalysisResult = {
  faceShape: FaceShape
  confidence: number
  proportions: {
    faceWidth: number
    faceHeight: number
    widthToHeight: number
    foreheadWidth: number
    cheekboneWidth: number
    jawWidth: number
    chinWidth: number
  }
  traits: {
    softLines: number
    angularLines: number
    verticalFace: number
    wideFace: number
    upperFaceDominance: number
    lowerFaceDominance: number
  }
}

const LM = {
  top: 10,
  chin: 152,
  leftCheek: 234,
  rightCheek: 454,
  leftTemple: 127,
  rightTemple: 356,
  leftJaw: 172,
  rightJaw: 397,
  leftChin: 148,
  rightChin: 377,
} as const

export function analyzeFaceLandmarks(landmarks: FaceAnalysisInputPoint[]): FaceAnalysisResult | null {
  const top = landmarks[LM.top]
  const chin = landmarks[LM.chin]
  const leftCheek = landmarks[LM.leftCheek]
  const rightCheek = landmarks[LM.rightCheek]
  const leftTemple = landmarks[LM.leftTemple]
  const rightTemple = landmarks[LM.rightTemple]
  const leftJaw = landmarks[LM.leftJaw]
  const rightJaw = landmarks[LM.rightJaw]
  const leftChin = landmarks[LM.leftChin]
  const rightChin = landmarks[LM.rightChin]

  if (!top || !chin || !leftCheek || !rightCheek || !leftTemple || !rightTemple || !leftJaw || !rightJaw || !leftChin || !rightChin) {
    return null
  }

  const faceHeight = Math.max(Math.abs(chin.y - top.y), 0.0001)
  const cheekboneWidth = distance(leftCheek, rightCheek)
  const foreheadWidth = distance(leftTemple, rightTemple)
  const jawWidth = distance(leftJaw, rightJaw)
  const chinWidth = distance(leftChin, rightChin)
  const faceWidth = Math.max(foreheadWidth, cheekboneWidth, jawWidth)
  const widthToHeight = faceWidth / faceHeight

  const wideFace = clamp01((widthToHeight - 0.62) / 0.28)
  const verticalFace = clamp01((0.74 - widthToHeight) / 0.22)
  const jawVsCheek = jawWidth / Math.max(cheekboneWidth, 0.0001)
  const foreheadVsJaw = foreheadWidth / Math.max(jawWidth, 0.0001)
  const chinVsJaw = chinWidth / Math.max(jawWidth, 0.0001)

  const angularLines = clamp01(
    (jawVsCheek - 0.78) * 1.4 +
    (0.72 - chinVsJaw) * 0.85 +
    Math.abs(foreheadWidth - jawWidth) / Math.max(faceWidth, 0.0001) * 0.6,
  )
  const softLines = clamp01(1 - angularLines * 0.72)
  const upperFaceDominance = clamp01((foreheadVsJaw - 1) / 0.26)
  const lowerFaceDominance = clamp01((1 / Math.max(foreheadVsJaw, 0.0001) - 1) / 0.22)

  const shapeScores: Record<FaceShape, number> = {
    round: wideFace * 0.55 + softLines * 0.45,
    oval: (1 - Math.abs(widthToHeight - 0.68) / 0.18) * 0.5 + softLines * 0.25 + (1 - upperFaceDominance) * 0.25,
    square: wideFace * 0.35 + angularLines * 0.5 + clamp01(jawVsCheek - 0.82) * 0.15,
    long: verticalFace * 0.75 + softLines * 0.15 + (1 - wideFace) * 0.1,
    heart: upperFaceDominance * 0.7 + clamp01(0.68 - chinVsJaw) * 0.3,
    triangle: lowerFaceDominance * 0.75 + clamp01(jawVsCheek - 0.88) * 0.25,
    balanced: (1 - Math.abs(widthToHeight - 0.7) / 0.25) * 0.35 + (1 - Math.abs(foreheadVsJaw - 1) / 0.25) * 0.35 + 0.3,
  }

  const sorted = Object.entries(shapeScores)
    .map(([shape, score]) => ({ shape: shape as FaceShape, score: clamp01(score) }))
    .sort((a, b) => b.score - a.score)
  const winner = sorted[0] ?? { shape: 'balanced' as FaceShape, score: 0.4 }

  return {
    faceShape: winner.shape,
    confidence: winner.score,
    proportions: {
      faceWidth,
      faceHeight,
      widthToHeight,
      foreheadWidth,
      cheekboneWidth,
      jawWidth,
      chinWidth,
    },
    traits: {
      softLines,
      angularLines,
      verticalFace,
      wideFace,
      upperFaceDominance,
      lowerFaceDominance,
    },
  }
}

function distance(a: FaceAnalysisInputPoint, b: FaceAnalysisInputPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

