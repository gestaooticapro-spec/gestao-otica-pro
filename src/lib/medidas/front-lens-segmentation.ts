export type LensSegmentationPoint = { x: number; y: number }

export type LensSegmentationDetection = {
  side: 'OD' | 'OE'
  confidence: number
  bbox: { x: number; y: number; width: number; height: number }
  center: LensSegmentationPoint
  areaPixels: number
  polygons: number[][][]
}

export type LensSegmentationResult = {
  imageWidth: number
  imageHeight: number
  mirrored: false
  lenses: LensSegmentationDetection[]
}

export type FrontLensHandleKey =
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

export type ExistingFrontLensHandles = Record<FrontLensHandleKey | 'pupilR' | 'pupilL', LensSegmentationPoint>

export type FrontLensSegmentationMap = {
  handles: Partial<Record<FrontLensHandleKey, LensSegmentationPoint>>
  warnings: string[]
}

function pointsFromDetection(detection: LensSegmentationDetection) {
  const points = detection.polygons.flatMap((polygon) => polygon)
    .filter((point) => point.length >= 2 && Number.isFinite(point[0]) && Number.isFinite(point[1]))
    .map(([x, y]) => ({ x, y }))
  if (points.length > 0) return points

  const { x, y, width, height } = detection.bbox
  const right = x + Math.max(width - 1, 0)
  const bottom = y + Math.max(height - 1, 0)
  return [{ x, y }, { x: right, y }, { x: right, y: bottom }, { x, y: bottom }]
}

function intersectionsAtX(detection: LensSegmentationDetection, targetX: number) {
  return detection.polygons.flatMap((polygon) => polygon.flatMap((point, index) => {
    const next = polygon[(index + 1) % polygon.length]
    if (!next || (point[0] < targetX && next[0] < targetX) || (point[0] > targetX && next[0] > targetX)) return []
    const deltaX = next[0] - point[0]
    if (Math.abs(deltaX) < 0.0001) return [point[1], next[1]]
    const ratio = (targetX - point[0]) / deltaX
    return ratio >= 0 && ratio <= 1 ? [point[1] + (next[1] - point[1]) * ratio] : []
  }))
}

/**
 * Bottom of the lens mask on the pupil column. Does not clamp X into the bbox:
 * if the column misses the mask, returns null so the current mount is kept.
 */
export function bottomAtPupilColumn(detection: LensSegmentationDetection, requestedX: number): number | null {
  if (!Number.isFinite(requestedX)) return null
  const intersections = intersectionsAtX(detection, requestedX)
  if (intersections.length > 0) return Math.max(...intersections)

  const { x, width, y, height } = detection.bbox
  const insideBox = requestedX >= x && requestedX <= x + Math.max(width - 1, 0)
  if (!insideBox) return null

  const points = pointsFromDetection(detection)
  const tolerance = Math.max(width * 0.08, 2)
  const nearby = points.filter((point) => Math.abs(point.x - requestedX) <= tolerance)
  if (nearby.length === 0) return null
  return Math.max(...nearby.map((point) => point.y), y + Math.max(height - 1, 0))
}

function assertDetection(detection: LensSegmentationDetection | undefined, side: 'OD' | 'OE') {
  if (!detection) throw new Error(`A segmentacao nao encontrou a lente ${side}.`)
  if (detection.bbox.width <= 0 || detection.bbox.height <= 0) {
    throw new Error(`A mascara da lente ${side} possui geometria invalida.`)
  }
  return detection
}

/**
 * Maps a non-mirrored frontal segmentation onto the tablet measurement handles.
 *
 * A/B/D is the OD eyewire only (same D the tablet already uses: min(x+y) to
 * max(x+y) with y downward). OE is used only for bridge nasal X and OE height.
 * R1/R2, pupils and eyelid points are never returned.
 * Bridge keeps its current Y. Mount keeps the current pupil X; if that column
 * misses the mask, the current mount is left unchanged and a warning is added.
 */
export function mapFrontLensSegmentationToHandles(
  result: LensSegmentationResult,
  captureSize: { width: number; height: number },
  current: ExistingFrontLensHandles,
): FrontLensSegmentationMap {
  if (result.mirrored !== false) throw new Error('A segmentacao frontal deve usar uma imagem nao espelhada.')
  if (result.imageWidth !== captureSize.width || result.imageHeight !== captureSize.height) {
    throw new Error('A segmentacao retornou dimensoes diferentes da foto frontal.')
  }

  const od = assertDetection(result.lenses.find((lens) => lens.side === 'OD'), 'OD')
  const oe = assertDetection(result.lenses.find((lens) => lens.side === 'OE'), 'OE')
  if (od.center.x >= oe.center.x) throw new Error('A ordem espacial OD/OE retornada pela segmentacao e invalida.')

  const odPoints = pointsFromDetection(od)
  const leftX = Math.min(...odPoints.map((point) => point.x))
  const rightX = Math.max(...odPoints.map((point) => point.x))
  const topY = Math.min(...odPoints.map((point) => point.y))
  const bottomY = Math.max(...odPoints.map((point) => point.y))
  const axisX = (leftX + rightX) / 2
  const centerY = (topY + bottomY) / 2
  const diagA = odPoints.reduce((best, point) => point.x + point.y < best.x + best.y ? point : best)
  const diagB = odPoints.reduce((best, point) => point.x + point.y > best.x + best.y ? point : best)
  const oePoints = pointsFromDetection(oe)
  const oeNasalX = Math.min(...oePoints.map((point) => point.x))

  const handles: Partial<Record<FrontLensHandleKey, LensSegmentationPoint>> = {
    lensLeft: { x: leftX, y: centerY },
    lensRight: { x: rightX, y: centerY },
    lensTop: { x: axisX, y: topY },
    lensBottom: { x: axisX, y: bottomY },
    diagA,
    diagB,
    bridgeR: { x: rightX, y: current.bridgeR.y },
    bridgeL: { x: oeNasalX, y: current.bridgeL.y },
  }

  const warnings: string[] = []
  const mountR = bottomAtPupilColumn(od, current.pupilR.x)
  if (mountR == null) {
    warnings.push('A coluna da pupila OD nao cruzou a lente; a altura OD nao foi alterada.')
  } else {
    handles.mountR = { x: current.pupilR.x, y: mountR }
  }

  const mountL = bottomAtPupilColumn(oe, current.pupilL.x)
  if (mountL == null) {
    warnings.push('A coluna da pupila OE nao cruzou a lente; a altura OE nao foi alterada.')
  } else {
    handles.mountL = { x: current.pupilL.x, y: mountL }
  }

  return { handles, warnings }
}

export function canvasPointToPhoto(
  point: LensSegmentationPoint,
  bounds: { x: number; y: number; w: number; h: number },
  photo: { width: number; height: number },
): LensSegmentationPoint {
  if (bounds.w <= 0 || bounds.h <= 0) throw new Error('Limites da foto no canvas invalidos.')
  return {
    x: ((point.x - bounds.x) / bounds.w) * photo.width,
    y: ((point.y - bounds.y) / bounds.h) * photo.height,
  }
}

export function photoPointToCanvas(
  point: LensSegmentationPoint,
  bounds: { x: number; y: number; w: number; h: number },
  photo: { width: number; height: number },
): LensSegmentationPoint {
  if (photo.width <= 0 || photo.height <= 0) throw new Error('Dimensoes da foto invalidas.')
  return {
    x: bounds.x + (point.x / photo.width) * bounds.w,
    y: bounds.y + (point.y / photo.height) * bounds.h,
  }
}
