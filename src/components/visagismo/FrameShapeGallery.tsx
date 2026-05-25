import { FRAME_SHAPE_TEMPLATES } from '@/lib/visagismo/frame-shapes'
import FrameShapePreview from './FrameShapePreview'

export default function FrameShapeGallery() {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
      {FRAME_SHAPE_TEMPLATES.map((shape) => (
        <div key={shape.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-slate-100">
          <div className="flex h-24 items-center justify-center rounded-md bg-slate-950/50">
            <FrameShapePreview shape={shape} className="h-16 w-full text-slate-200" />
          </div>
          <div className="mt-3">
            <p className="text-sm font-bold leading-tight">{shape.name}</p>
            <p className="mt-1 text-xs leading-snug text-slate-400">{shape.description}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

