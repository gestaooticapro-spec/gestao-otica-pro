import type { FrameShapeTemplate } from '@/lib/visagismo/frame-shapes'

interface FrameShapePreviewProps {
  shape: FrameShapeTemplate
  className?: string
  stroke?: string
  showInnerLines?: boolean
}

export default function FrameShapePreview({
  shape,
  className,
  stroke = 'currentColor',
  showInnerLines = true,
}: FrameShapePreviewProps) {
  const { width, height } = shape.viewBox
  const strokeWidth = shape.guide.defaultStrokeWidth

  return (
    <svg
      aria-label={shape.name}
      className={className}
      role="img"
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      stroke={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      vectorEffect="non-scaling-stroke"
    >
      <path d={shape.paths.outerRight} strokeWidth={strokeWidth} />
      <path d={shape.paths.outerLeft} strokeWidth={strokeWidth} />
      {showInnerLines && shape.paths.innerRight && (
        <path d={shape.paths.innerRight} strokeWidth={Math.max(1, strokeWidth * 0.46)} opacity="0.55" />
      )}
      {showInnerLines && shape.paths.innerLeft && (
        <path d={shape.paths.innerLeft} strokeWidth={Math.max(1, strokeWidth * 0.46)} opacity="0.55" />
      )}
      <path d={shape.paths.bridge} strokeWidth={Math.max(1.4, strokeWidth * 0.7)} />
      {shape.paths.brow && <path d={shape.paths.brow} strokeWidth={Math.max(1.2, strokeWidth * 0.55)} opacity="0.7" />}
      {shape.paths.accents?.map((accent, index) => (
        <path key={`${shape.id}-accent-${index}`} d={accent} strokeWidth={Math.max(1, strokeWidth * 0.5)} opacity="0.6" />
      ))}
    </svg>
  )
}

