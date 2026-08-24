import type { LensGeometry } from '@/lib/actions/lens-geometry.actions'
import { projectCommercialHeatmapCompatibilityPoint } from '@/lib/tower/heatmap-commercial-projection'

type Point = { x: number; y: number }
export type PersistedHeatmapSample = Point & {
  targetX: number
  targetY: number
}
export type HeatmapCompatibilityStatus =
  | 'ideal'
  | 'compativel_com_sobra'
  | 'compativel_com_adaptacao'
  | 'nao_indicada'
  | 'sem_geometria'

export type HeatmapGeometryCompatibility = {
  status: HeatmapCompatibilityStatus
  scoreAdjustment: number
  coverage: number | null
  distanceCoverage: number | null
  intermediateCoverage: number | null
  nearCoverage: number | null
  message: string
}

const CUTOUT = { x: 0.24, y: 0.22, w: 0.52, h: 0.46 }

function normalizeName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function findGeometryForRecommendation(
  familyName: string,
  geometries: LensGeometry[],
): LensGeometry | null {
  const normalizedFamily = normalizeName(familyName)
  const exact = geometries.find((geometry) => normalizeName(geometry.family_name) === normalizedFamily)
  if (exact) return exact

  return geometries.find((geometry) => {
    const normalizedGeometry = normalizeName(geometry.family_name)
    return normalizedGeometry.length >= 8 &&
      (normalizedFamily.includes(normalizedGeometry) || normalizedGeometry.includes(normalizedFamily))
  }) ?? null
}

function remap(point: Point): Point {
  return {
    x: (point.x - CUTOUT.x) / CUTOUT.w,
    y: (point.y - CUTOUT.y) / CUTOUT.h,
  }
}

function isInsidePolygon(point: Point, polygon: Point[]) {
  let inside = false
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const current = polygon[index]
    const before = polygon[previous]
    const intersects =
      (current.y > point.y) !== (before.y > point.y) &&
      point.x < ((before.x - current.x) * (point.y - current.y)) / (before.y - current.y) + current.x
    if (intersects) inside = !inside
  }
  return inside
}

function targetZone(targetY: number): 'distance' | 'intermediate' | 'near' {
  if (targetY <= 0.5) return 'distance'
  if (targetY <= 0.72) return 'intermediate'
  return 'near'
}

export function evaluateHeatmapGeometryCompatibility(
  samples: PersistedHeatmapSample[],
  geometry: LensGeometry | null,
): HeatmapGeometryCompatibility {
  const pins = geometry?.pins
  if (!geometry || !pins || pins.distance.length < 3 || pins.corridor.length < 3 || pins.near.length < 3) {
    return {
      status: 'sem_geometria', scoreAdjustment: 0, coverage: null,
      distanceCoverage: null, intermediateCoverage: null, nearCoverage: null,
      message: 'Sem geometria completa para cruzar o mapa; a recomendação clínica e comercial foi preservada.',
    }
  }

  const polygons = {
    distance: pins.distance.map(remap),
    intermediate: pins.corridor.map(remap),
    near: pins.near.map(remap),
  }
  const commercialSamples = samples.map((sample) => ({
    ...sample,
    ...projectCommercialHeatmapCompatibilityPoint(sample),
  }))
  const zones = ['distance', 'intermediate', 'near'] as const
  const isCoveredByUsefulField = (sample: PersistedHeatmapSample) =>
    zones.some((zone) => isInsidePolygon({ x: sample.x, y: sample.y }, polygons[zone]))
  const coverageByZone = Object.fromEntries(zones.map((zone) => {
    const zoneSamples = commercialSamples.filter((sample) => targetZone(sample.targetY) === zone)
    const covered = zoneSamples.filter(isCoveredByUsefulField).length
    return [zone, zoneSamples.length ? covered / zoneSamples.length : 0]
  })) as Record<(typeof zones)[number], number>
  const coveredSamples = commercialSamples.filter(isCoveredByUsefulField).length
  const coverage = commercialSamples.length ? coveredSamples / commercialSamples.length : 0

  if (coverage >= 0.96) {
    return { status: 'compativel_com_sobra', scoreAdjustment: 2, coverage, ...withZones(coverageByZone), message: 'O campo da lente acolhe o mapa com margem confortável.' }
  }
  if (coverage >= 0.82) {
    return { status: 'ideal', scoreAdjustment: 8, coverage, ...withZones(coverageByZone), message: 'A geometria acompanha bem o padrão visual medido.' }
  }
  if (coverage >= 0.6) {
    return { status: 'compativel_com_adaptacao', scoreAdjustment: -10, coverage, ...withZones(coverageByZone), message: 'Parte do mapa se aproxima dos limites do campo útil desta geometria.' }
  }
  return { status: 'nao_indicada', scoreAdjustment: -30, coverage, ...withZones(coverageByZone), message: 'O campo útil da geometria é menor que uma parte relevante do mapa visual medido.' }
}

function withZones(coverage: Record<'distance' | 'intermediate' | 'near', number>) {
  return {
    distanceCoverage: coverage.distance,
    intermediateCoverage: coverage.intermediate,
    nearCoverage: coverage.near,
  }
}
