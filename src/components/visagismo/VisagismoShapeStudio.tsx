'use client'

import Link from 'next/link'
import { useId, useMemo, useState, useTransition } from 'react'
import { ArrowLeft, Camera, Check, Glasses, PenTool, Rows3, Shapes, Trash2 } from 'lucide-react'
import FrameShapePreview from './FrameShapePreview'
import {
  FRAME_SHAPE_TEMPLATES,
  type FrameShapeCategory,
  type FrameShapeTemplate,
} from '@/lib/visagismo/frame-shapes'
import {
  deleteGlobalVisagismoFrameTemplate,
  type GlobalVisagismoFrameTemplate,
} from '@/lib/actions/visagismo.actions'

type CategoryFilter = 'all' | FrameShapeCategory

const CATEGORY_LABELS: Record<CategoryFilter, string> = {
  all: 'Todos',
  round: 'Redondos',
  oval: 'Ovais',
  panto: 'Panto',
  rectangular: 'Retangulares',
  square: 'Quadrados',
  'cat-eye': 'Gatinho',
  aviator: 'Aviador',
  geometric: 'Geometricos',
}

const CATEGORY_FILTERS: CategoryFilter[] = [
  'all',
  'round',
  'oval',
  'panto',
  'rectangular',
  'square',
  'cat-eye',
  'aviator',
  'geometric',
]

const DEFAULT_SELECTION = ['round-classic', 'rectangular-soft', 'cat-eye-soft']

interface VisagismoShapeStudioProps {
  storeId: number
  globalTemplates: GlobalVisagismoFrameTemplate[]
}

export default function VisagismoShapeStudio({ storeId, globalTemplates }: VisagismoShapeStudioProps) {
  const [isDeleting, startDeleteTransition] = useTransition()
  const [templates, setTemplates] = useState(globalTemplates)
  const [deleteResult, setDeleteResult] = useState<{ success: boolean; message: string } | null>(null)
  const [category, setCategory] = useState<CategoryFilter>('all')
  const [selectedIds, setSelectedIds] = useState<string[]>(
    templates.length > 0 ? templates.slice(0, 3).map((template) => template.id) : DEFAULT_SELECTION,
  )
  const hasGlobalTemplates = templates.length > 0

  const filteredShapes = useMemo(() => {
    if (category === 'all') return FRAME_SHAPE_TEMPLATES
    return FRAME_SHAPE_TEMPLATES.filter((shape) => shape.category === category)
  }, [category])

  const selectedGlobalTemplates = selectedIds
    .map((id) => templates.find((template) => template.id === id))
    .filter((template): template is GlobalVisagismoFrameTemplate => Boolean(template))

  const selectedShapes = selectedIds
    .map((id) => FRAME_SHAPE_TEMPLATES.find((shape) => shape.id === id))
    .filter((shape): shape is FrameShapeTemplate => Boolean(shape))

  function toggleShape(id: string) {
    setSelectedIds((current) => {
      if (current.includes(id)) {
        if (current.length === 1) return current
        return current.filter((item) => item !== id)
      }

      if (current.length >= 3) return [current[1], current[2], id]
      return [...current, id]
    })
  }

  function deleteTemplate(template: GlobalVisagismoFrameTemplate) {
    const confirmed = window.confirm(`Remover "${template.name}" da lista global?`)
    if (!confirmed) return

    startDeleteTransition(async () => {
      const result = await deleteGlobalVisagismoFrameTemplate(storeId, template.id)
      setDeleteResult(result)

      if (result.success) {
        setTemplates((current) => current.filter((item) => item.id !== template.id))
        setSelectedIds((current) => {
          const next = current.filter((id) => id !== template.id)
          if (next.length > 0) return next

          const fallback = templates.find((item) => item.id !== template.id)
          return fallback ? [fallback.id] : DEFAULT_SELECTION
        })
      }
    })
  }

  return (
    <div className="min-h-[calc(100vh-64px)] bg-slate-950 text-slate-100">
      <div className="border-b border-white/10 bg-slate-950/95">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href={`/dashboard/loja/${storeId}?menu=loja-vazia`}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
              title="Voltar"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">
                <Glasses className="h-3.5 w-3.5" />
                Visagismo
              </div>
              <h1 className="mt-1 truncate text-xl font-black tracking-tight text-white">
                Formatos base
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={`/dashboard/loja/${storeId}/visagismo/gabarito`}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-black uppercase text-slate-200 transition-colors hover:bg-white/10"
            >
              <PenTool className="h-4 w-4" />
              Gabarito
            </Link>
            <Link
              href={`/dashboard/loja/${storeId}/visagismo/prova`}
              className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-3 py-2 text-xs font-black uppercase text-slate-950 transition-colors hover:bg-cyan-400"
            >
              <Camera className="h-4 w-4" />
              Prova
            </Link>
            <div className="hidden items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-slate-300 sm:flex">
              <Rows3 className="h-4 w-4 text-cyan-300" />
              {FRAME_SHAPE_TEMPLATES.length} modelos
            </div>
          </div>
        </div>
      </div>

      <main className="mx-auto grid max-w-7xl gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[1fr_360px]">
        <section className="min-w-0">
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
            {!hasGlobalTemplates && CATEGORY_FILTERS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setCategory(item)}
                  className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-black uppercase transition-colors ${
                    category === item
                      ? 'border-cyan-400/60 bg-cyan-400/10 text-cyan-200'
                      : 'border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/10 hover:text-slate-200'
                  }`}
                >
                  {CATEGORY_LABELS[item]}
                </button>
              ))}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {deleteResult && (
              <div className={`rounded-lg border px-3 py-2 text-xs font-bold ${
                deleteResult.success
                  ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100'
                  : 'border-rose-400/30 bg-rose-500/10 text-rose-100'
              }`}>
                {deleteResult.message}
              </div>
            )}

            {hasGlobalTemplates ? templates.map((template) => {
              const selected = selectedIds.includes(template.id)

              return (
                <div
                  key={template.id}
                  onClick={() => toggleShape(template.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      toggleShape(template.id)
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  className={`group rounded-lg border p-3 text-left transition-colors ${
                    selected
                      ? 'border-cyan-400/60 bg-cyan-400/10'
                      : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]'
                  }`}
                >
                  <div className="relative flex h-32 items-center justify-center rounded-md bg-black/25">
                    <GlobalFrameTemplatePreview
                      template={template}
                      className={`h-20 w-full ${selected ? 'text-cyan-100' : 'text-slate-200'}`}
                    />
                    {selected && (
                      <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-md bg-cyan-400 text-slate-950">
                        <Check className="h-4 w-4" />
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        deleteTemplate(template)
                      }}
                      disabled={isDeleting}
                      title="Remover gabarito"
                      className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-md border border-rose-300/25 bg-rose-500/10 text-rose-100 opacity-0 transition-opacity hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50 group-hover:opacity-100"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-white">{template.name}</p>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">
                        {template.description || 'Gabarito global salvo no banco.'}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-bold uppercase text-slate-400">
                      {template.category || 'Global'}
                    </span>
                  </div>
                </div>
              )
            }) : filteredShapes.map((shape) => {
              const selected = selectedIds.includes(shape.id)

              return (
                <button
                  key={shape.id}
                  type="button"
                  onClick={() => toggleShape(shape.id)}
                  className={`group rounded-lg border p-3 text-left transition-colors ${
                    selected
                      ? 'border-cyan-400/60 bg-cyan-400/10'
                      : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]'
                  }`}
                >
                  <div className="relative flex h-32 items-center justify-center rounded-md bg-black/25">
                    <FrameShapePreview
                      shape={shape}
                      className={`h-20 w-full ${selected ? 'text-cyan-100' : 'text-slate-200'}`}
                    />
                    {selected && (
                      <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-md bg-cyan-400 text-slate-950">
                        <Check className="h-4 w-4" />
                      </span>
                    )}
                  </div>
                  <div className="mt-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-white">{shape.name}</p>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">
                        {shape.description}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-bold uppercase text-slate-400">
                      {CATEGORY_LABELS[shape.category]}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </section>

        <aside className="lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">
                  <Shapes className="h-3.5 w-3.5" />
                  Comparacao
                </div>
                <p className="mt-1 text-sm font-bold text-white">{selectedShapes.length} selecionados</p>
              </div>
            </div>

            <div className="space-y-3">
              {hasGlobalTemplates ? selectedGlobalTemplates.map((template) => (
                <div key={template.id} className="rounded-lg border border-white/10 bg-slate-950/50 p-3">
                  <div className="flex h-24 items-center justify-center rounded-md bg-black/20">
                    <GlobalFrameTemplatePreview template={template} className="h-16 w-full text-slate-100" />
                  </div>
                  <div className="mt-3">
                    <p className="text-sm font-black text-white">{template.name}</p>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                      <Metric label="Largura" value={template.realWidthMm ? `${template.realWidthMm} mm` : '-'} />
                      <Metric label="ViewBox" value={`${template.viewBox.width}x${template.viewBox.height}`} />
                      <Metric label="Origem" value="Banco" />
                      <Metric label="Status" value="ativo" />
                    </div>
                  </div>
                </div>
              )) : selectedShapes.map((shape) => (
                <div key={shape.id} className="rounded-lg border border-white/10 bg-slate-950/50 p-3">
                  <div className="flex h-24 items-center justify-center rounded-md bg-black/20">
                    <FrameShapePreview shape={shape} className="h-16 w-full text-slate-100" />
                  </div>
                  <div className="mt-3">
                    <p className="text-sm font-black text-white">{shape.name}</p>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                      <Metric label="Largura" value={`${shape.guide.totalWidth} mm`} />
                      <Metric label="Lente" value={`${shape.guide.lensWidth}x${shape.guide.lensHeight}`} />
                      <Metric label="Ponte" value={`${shape.guide.bridgeWidth} mm`} />
                      <Metric label="Linha" value={shape.intensity} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </main>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1.5">
      <p className="text-[9px] font-black uppercase text-slate-500">{label}</p>
      <p className="mt-0.5 font-mono text-xs font-bold text-slate-200">{value}</p>
    </div>
  )
}

function GlobalFrameTemplatePreview({
  template,
  className,
}: {
  template: GlobalVisagismoFrameTemplate
  className?: string
}) {
  const { width, height } = template.viewBox
  const { outerFullPath, innerRightPath, innerLeftPath, secondaryRightPath, secondaryLeftPath } = template.generatedPaths
  const construction = getTemplateConstruction(template)
  const isRimless = construction === 'rimless'
  const isSemiRimless = construction === 'semi-rimless'
  const outerFramePath = ensureClosedSvgPath(outerFullPath)
  const outerClipId = useId().replace(/:/g, '')
  const rightLensPath = ensureClosedSvgPath(innerRightPath)
  const leftLensPath = ensureClosedSvgPath(innerLeftPath)
  const frameFillPath = outerFramePath && !isRimless && !isSemiRimless
    ? [outerFramePath, rightLensPath, leftLensPath].filter(Boolean).join(' ')
    : undefined
  const semiRimlessFillPath = isSemiRimless && outerFramePath
    ? outerFramePath
    : undefined
  const renderedSecondaryRightPath = ensureRenderableSecondaryPath(secondaryRightPath, width)
  const renderedSecondaryLeftPath = ensureRenderableSecondaryPath(secondaryLeftPath, width)
  const outerStrokeWidth = isRimless ? 2.2 : isSemiRimless ? 1.25 : 2.4
  const innerStrokeWidth = isRimless ? 0.62 : isSemiRimless ? 0.86 : 1.2
  const innerOpacity = isRimless ? 0.42 : isSemiRimless ? 0.52 : 0.65
  const secondaryStrokeWidth = isRimless ? 2.1 : isSemiRimless ? 1.35 : 1.6

  return (
    <svg
      aria-label={template.name}
      className={className}
      role="img"
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      vectorEffect="non-scaling-stroke"
    >
      {outerFramePath && (
        <defs>
          <clipPath id={`visagismo-template-outer-${outerClipId}`}>
            <path d={outerFramePath} />
          </clipPath>
        </defs>
      )}
      {frameFillPath && (
        <path
          d={frameFillPath}
          fill="currentColor"
          fillRule="evenodd"
          stroke="none"
          opacity="0.28"
        />
      )}
      {semiRimlessFillPath && (
        <path
          d={semiRimlessFillPath}
          fill="currentColor"
          stroke="none"
          opacity="0.24"
        />
      )}
      {outerFullPath && <path d={outerFullPath} strokeWidth={outerStrokeWidth} opacity={isRimless ? 0.88 : 1} />}
      {innerRightPath && <path d={innerRightPath} strokeWidth={innerStrokeWidth} opacity={innerOpacity} />}
      {innerLeftPath && <path d={innerLeftPath} strokeWidth={innerStrokeWidth} opacity={innerOpacity} />}
      {renderedSecondaryRightPath && <path d={renderedSecondaryRightPath} strokeWidth={secondaryStrokeWidth} opacity="0.9" />}
      {renderedSecondaryLeftPath && <path d={renderedSecondaryLeftPath} strokeWidth={secondaryStrokeWidth} opacity="0.9" />}
    </svg>
  )
}

function getTemplateConstruction(template: GlobalVisagismoFrameTemplate) {
  const label = `${template.name} ${template.slug}`.toLowerCase()
  if (template.construction === 'rimless' || label.includes('parafus')) return 'rimless'
  if (template.construction === 'semi-rimless' || label.includes('nylon')) return 'semi-rimless'
  return 'full-rim'
}

function ensureRenderableSecondaryPath(path: string | undefined, width: number) {
  if (!path) return undefined
  const trimmed = path.trim()
  const moveOnly = trimmed.match(/^M\s*(-?\d*\.?\d+)\s+(-?\d*\.?\d+)$/i)
  if (!moveOnly) return path

  const x = Number(moveOnly[1])
  const y = Number(moveOnly[2])
  if (Number.isNaN(x) || Number.isNaN(y)) return path

  const halfDash = Math.max(width * 0.02, 1.8)
  return `M ${(x - halfDash).toFixed(2)} ${y.toFixed(2)} L ${(x + halfDash).toFixed(2)} ${y.toFixed(2)}`
}

function ensureClosedSvgPath(path: string | undefined) {
  if (!path) return undefined
  return /z\s*$/i.test(path.trim()) ? path : `${path} Z`
}
