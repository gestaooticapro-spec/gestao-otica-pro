export type HeatmapPoint = { x: number; y: number }

const COMMERCIAL_HEATMAP_TOP_ANCHOR_Y = 0.4
const COMMERCIAL_HEATMAP_BOTTOM_X_SCALE = 0.44
const COMMERCIAL_HEATMAP_BOTTOM_Y_SCALE = 0.64
const COMMERCIAL_HEATMAP_FUNNEL_START_Y = 0.28
const COMMERCIAL_HEATMAP_FUNNEL_END_Y = 0.92
const COMMERCIAL_HEATMAP_FUNNEL_BOTTOM_HALF_WIDTH = 0.16
const COMMERCIAL_HEATMAP_FUNNEL_EDGE_FADE = 0.055

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const smoothstep = (edge0: number, edge1: number, value: number) => {
  const progress = clamp((value - edge0) / (edge1 - edge0), 0, 1)
  return progress * progress * (3 - 2 * progress)
}

export function projectCommercialHeatmapPoint(point: HeatmapPoint): HeatmapPoint {
  const lowerProgress = smoothstep(COMMERCIAL_HEATMAP_TOP_ANCHOR_Y, 1, point.y)
  const xScale = 1 - (1 - COMMERCIAL_HEATMAP_BOTTOM_X_SCALE) * lowerProgress
  const yScale = 1 - (1 - COMMERCIAL_HEATMAP_BOTTOM_Y_SCALE) * lowerProgress
  return {
    x: clamp(0.5 + (point.x - 0.5) * xScale, 0.02, 0.98),
    y: clamp(COMMERCIAL_HEATMAP_TOP_ANCHOR_Y + (point.y - COMMERCIAL_HEATMAP_TOP_ANCHOR_Y) * yScale, 0.02, 0.98),
  }
}

export function commercialHeatmapFunnelHalfWidth(y: number) {
  const progress = smoothstep(COMMERCIAL_HEATMAP_FUNNEL_START_Y, COMMERCIAL_HEATMAP_FUNNEL_END_Y, y)
  return 0.5 - (0.5 - COMMERCIAL_HEATMAP_FUNNEL_BOTTOM_HALF_WIDTH) * progress
}

export function projectCommercialHeatmapCompatibilityPoint(point: HeatmapPoint): HeatmapPoint {
  const projected = projectCommercialHeatmapPoint(point)
  const visibleHalfWidth = Math.max(0.02, commercialHeatmapFunnelHalfWidth(projected.y) - COMMERCIAL_HEATMAP_FUNNEL_EDGE_FADE)
  return {
    x: clamp(projected.x, 0.5 - visibleHalfWidth, 0.5 + visibleHalfWidth),
    y: projected.y,
  }
}
