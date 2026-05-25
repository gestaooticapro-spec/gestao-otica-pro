'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

type Point = { x: number; y: number }

type TemplatePathPayload = {
  points?: Point[]
  path?: string
}

export type VisagismoTemplatePayload = {
  name: string
  viewBox?: { width?: number; height?: number }
  realWidthMm?: number | null
  calibration?: Record<string, unknown>
  paths?: Record<string, TemplatePathPayload>
  generated?: Record<string, unknown>
}

export type VisagismoTemplateActionResult = {
  success: boolean
  message: string
  id?: string
}

export type GlobalVisagismoFrameTemplate = {
  id: string
  slug: string
  name: string
  category: string | null
  description: string | null
  realWidthMm: number | null
  viewBox: { width: number; height: number }
  calibration: Record<string, unknown>
  sourcePaths: Record<string, unknown>
  generatedPaths: {
    outerFullPath?: string
    innerRightPath?: string
    innerLeftPath?: string
  }
}

type VisagismoTemplateTable = {
  upsert: (
    payload: Record<string, unknown>,
    options: { onConflict: string },
  ) => {
    select: (columns: string) => {
      single: () => Promise<{ data: { id?: string } | null; error: { message: string } | null }>
    }
  }
}

type VisagismoTemplateSelectTable = {
  select: (columns: string) => {
    eq: (column: string, value: boolean) => {
      order: (
        column: string,
        options?: { ascending?: boolean },
      ) => {
        order: (
          column: string,
          options?: { ascending?: boolean },
        ) => Promise<{ data: VisagismoTemplateRow[] | null; error: { message: string } | null }>
      }
    }
  }
}

type VisagismoTemplateRow = {
  id: string
  slug: string
  name: string
  category: string | null
  description: string | null
  real_width_mm: number | null
  viewbox_width: number | null
  viewbox_height: number | null
  calibration: Record<string, unknown> | null
  source_paths: Record<string, unknown> | null
  generated_paths: Record<string, unknown> | null
}

export async function getGlobalVisagismoFrameTemplates(): Promise<GlobalVisagismoFrameTemplate[]> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return []

  const templateTable = supabase
    .from('global_visagismo_frame_templates') as unknown as VisagismoTemplateSelectTable

  const { data, error } = await templateTable
    .select(
      [
        'id',
        'slug',
        'name',
        'category',
        'description',
        'real_width_mm',
        'viewbox_width',
        'viewbox_height',
        'calibration',
        'source_paths',
        'generated_paths',
      ].join(','),
    )
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) throw new Error(error.message)

  return (data ?? []).map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    description: row.description,
    realWidthMm: row.real_width_mm,
    viewBox: {
      width: Number(row.viewbox_width ?? 140),
      height: Number(row.viewbox_height ?? 60),
    },
    calibration: row.calibration ?? {},
    sourcePaths: row.source_paths ?? {},
    generatedPaths: normalizeGeneratedPaths(row.generated_paths),
  }))
}

export async function saveGlobalVisagismoFrameTemplate(
  storeId: number,
  payload: VisagismoTemplatePayload,
): Promise<VisagismoTemplateActionResult> {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, message: 'Usuario nao autenticado.' }
    }

    const name = payload.name?.trim()
    if (!name) {
      return { success: false, message: 'Informe um nome para o gabarito.' }
    }

    const slug = slugify(name)
    const generatedPaths = payload.generated ?? {}
    const sourcePaths = payload.paths ?? {}
    const calibration = payload.calibration ?? {}
    const viewBox = payload.viewBox ?? {}

    const templateTable = supabase
      .from('global_visagismo_frame_templates') as unknown as VisagismoTemplateTable

    const { data, error } = await templateTable
      .upsert(
        {
          slug,
          name,
          category: null,
          description: null,
          real_width_mm: payload.realWidthMm ?? null,
          viewbox_width: Number(viewBox.width ?? 140),
          viewbox_height: Number(viewBox.height ?? 60),
          calibration,
          source_paths: sourcePaths,
          generated_paths: generatedPaths,
          preview_svg_path: typeof generatedPaths.outerFullPath === 'string'
            ? generatedPaths.outerFullPath
            : null,
          is_active: true,
        },
        { onConflict: 'slug' },
      )
      .select('id')
      .single()

    if (error) {
      return { success: false, message: error.message }
    }

    revalidatePath(`/dashboard/loja/${storeId}/visagismo`)
    revalidatePath(`/dashboard/loja/${storeId}/visagismo/gabarito`)

    return {
      success: true,
      message: 'Gabarito salvo no catalogo global.',
      id: data?.id,
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Erro ao salvar gabarito.',
    }
  }
}

function normalizeGeneratedPaths(value: Record<string, unknown> | null): GlobalVisagismoFrameTemplate['generatedPaths'] {
  return {
    outerFullPath: typeof value?.outerFullPath === 'string' ? value.outerFullPath : undefined,
    innerRightPath: typeof value?.innerRightPath === 'string' ? value.innerRightPath : undefined,
    innerLeftPath: typeof value?.innerLeftPath === 'string' ? value.innerLeftPath : undefined,
  }
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'gabarito'
}
