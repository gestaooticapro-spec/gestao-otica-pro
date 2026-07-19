'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authorizeTowerStoreAccess } from '@/lib/server/tower-device-web-session'

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
  construction?: FrameConstruction
  profile?: Partial<VisagismoFrameProfile>
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
    secondaryRightPath?: string
    secondaryLeftPath?: string
  }
  construction: FrameConstruction
  profile: VisagismoFrameProfile
}

export type FrameProfileShape =
  | 'round'
  | 'oval'
  | 'panto'
  | 'rectangular'
  | 'square'
  | 'cat-eye'
  | 'aviator'
  | 'browline'
  | 'geometric'
  | 'wayfarer'
  | 'other'

export type FrameProfileIntensity = 'light' | 'medium' | 'strong'
export type FrameProfileLineStyle = 'curved' | 'straight' | 'mixed'
export type FrameProfileDirection = 'neutral' | 'ascending' | 'descending'
export type FrameProfileSize = 'narrow' | 'medium' | 'wide'
export type FrameProfileLensHeight = 'low' | 'medium' | 'high'
export type FrameProfileEffect = 'softens' | 'structures' | 'elongates' | 'shortens' | 'lifts' | 'adds-presence' | 'balances'
export type FrameConstruction = 'full-rim' | 'rimless' | 'semi-rimless'

export type VisagismoFrameProfile = {
  shape: FrameProfileShape
  visualWeight: FrameProfileIntensity
  lineStyle: FrameProfileLineStyle
  direction: FrameProfileDirection
  visualWidth: FrameProfileSize
  lensHeight: FrameProfileLensHeight
  effects: FrameProfileEffect[]
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

type VisagismoTemplateDeleteTable = {
  delete: () => {
    eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>
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
  profile_shape?: string | null
  profile_visual_weight?: string | null
  profile_line_style?: string | null
  profile_line_direction?: string | null
  profile_visual_width?: string | null
  profile_lens_height?: string | null
  profile_effects?: string[] | null
}

export async function getGlobalVisagismoFrameTemplates(
  towerStoreId?: number,
): Promise<GlobalVisagismoFrameTemplate[]> {
  const browserClient = createClient()
  let supabase = browserClient as unknown as ReturnType<typeof createAdminClient>

  if (towerStoreId) {
    const access = await authorizeTowerStoreAccess(towerStoreId)
    if (!access.ok) return []
    supabase = createAdminClient()
  } else {
    const {
      data: { user },
    } = await browserClient.auth.getUser()
    if (!user) return []
  }

  const baseColumns = [
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
  ]
  const profileColumns = [
    'profile_shape',
    'profile_visual_weight',
    'profile_line_style',
    'profile_line_direction',
    'profile_visual_width',
    'profile_lens_height',
    'profile_effects',
  ]

  let { data, error } = await selectActiveTemplates(supabase, [...baseColumns, ...profileColumns])

  if (error && profileColumns.some((column) => error?.message.includes(column))) {
    const fallback = await selectActiveTemplates(supabase, baseColumns)
    data = fallback.data
    error = fallback.error
  }

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
    construction: normalizeConstruction(row.generated_paths?.construction ?? row.source_paths?.construction),
    profile: normalizeProfile(row),
  }))
}

async function selectActiveTemplates(
  supabase: ReturnType<typeof createAdminClient>,
  columns: string[],
) {
  const templateTable = supabase
    .from('global_visagismo_frame_templates') as unknown as VisagismoTemplateSelectTable

  return templateTable
    .select(columns.join(','))
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
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
    const profile = normalizeProfile({ name, ...payload.profile })
    const construction = normalizeConstruction(payload.construction ?? generatedPaths.construction)
    const generatedPathsWithConstruction: Record<string, unknown> = {
      ...generatedPaths,
      construction,
    }

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
          generated_paths: generatedPathsWithConstruction,
          profile_shape: profile.shape,
          profile_visual_weight: profile.visualWeight,
          profile_line_style: profile.lineStyle,
          profile_line_direction: profile.direction,
          profile_visual_width: profile.visualWidth,
          profile_lens_height: profile.lensHeight,
          profile_effects: profile.effects,
          preview_svg_path: typeof generatedPathsWithConstruction.outerFullPath === 'string'
            ? generatedPathsWithConstruction.outerFullPath
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

export async function deleteGlobalVisagismoFrameTemplate(
  storeId: number,
  templateId: string,
): Promise<VisagismoTemplateActionResult> {
  try {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, message: 'Usuario nao autenticado.' }
    }

    if (!templateId) {
      return { success: false, message: 'Gabarito nao informado.' }
    }

    const templateTable = supabase
      .from('global_visagismo_frame_templates') as unknown as VisagismoTemplateDeleteTable

    const { error } = await templateTable
      .delete()
      .eq('id', templateId)

    if (error) {
      return { success: false, message: error.message }
    }

    revalidatePath(`/dashboard/loja/${storeId}/visagismo`)
    revalidatePath(`/dashboard/loja/${storeId}/visagismo/gabarito`)
    revalidatePath(`/dashboard/loja/${storeId}/visagismo/prova`)

    return {
      success: true,
      message: 'Gabarito removido da lista.',
      id: templateId,
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Erro ao remover gabarito.',
    }
  }
}

function normalizeGeneratedPaths(value: Record<string, unknown> | null): GlobalVisagismoFrameTemplate['generatedPaths'] {
  return {
    outerFullPath: normalizePath(value?.outerFullPath),
    innerRightPath: normalizePath(value?.innerRightPath),
    innerLeftPath: normalizePath(value?.innerLeftPath),
    secondaryRightPath: normalizePath(value?.secondaryRightPath),
    secondaryLeftPath: normalizePath(value?.secondaryLeftPath),
  }
}

function normalizePath(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function normalizeConstruction(value: unknown): FrameConstruction {
  return value === 'rimless' || value === 'semi-rimless' ? value : 'full-rim'
}

function normalizeProfile(value: Record<string, unknown>): VisagismoFrameProfile {
  const inferred = inferProfileFromName(String(value.name ?? ''))
  const explicitShape = pickProfileValue(value.profile_shape ?? value.shape, PROFILE_SHAPES, inferred.shape)
  const shouldUseNameInference = explicitShape === 'other' && inferred.shape !== 'other'
  const shape = shouldUseNameInference ? inferred.shape : explicitShape
  const visualWeight = shouldUseNameInference
    ? inferred.visualWeight
    : pickProfileValue(value.profile_visual_weight ?? value.visualWeight, PROFILE_INTENSITIES, inferred.visualWeight)
  const lineStyle = shouldUseNameInference
    ? inferred.lineStyle
    : pickProfileValue(value.profile_line_style ?? value.lineStyle, PROFILE_LINE_STYLES, inferred.lineStyle)
  const direction = shouldUseNameInference
    ? inferred.direction
    : pickProfileValue(value.profile_line_direction ?? value.direction, PROFILE_DIRECTIONS, inferred.direction)
  const visualWidth = shouldUseNameInference
    ? inferred.visualWidth
    : pickProfileValue(value.profile_visual_width ?? value.visualWidth, PROFILE_WIDTHS, inferred.visualWidth)
  const lensHeight = shouldUseNameInference
    ? inferred.lensHeight
    : pickProfileValue(value.profile_lens_height ?? value.lensHeight, PROFILE_LENS_HEIGHTS, inferred.lensHeight)

  return {
    shape,
    visualWeight,
    lineStyle,
    direction,
    visualWidth,
    lensHeight,
    effects: deriveProfileEffects({ shape, visualWeight, lineStyle, direction, visualWidth, lensHeight }),
  }
}

function deriveProfileEffects(profile: Omit<VisagismoFrameProfile, 'effects'>): FrameProfileEffect[] {
  const effects = new Set<FrameProfileEffect>(['balances'])

  if (profile.lineStyle === 'curved' || ['round', 'oval', 'panto', 'aviator'].includes(profile.shape)) {
    effects.add('softens')
  }

  if (profile.lineStyle === 'straight' || ['rectangular', 'square', 'geometric', 'wayfarer', 'browline'].includes(profile.shape)) {
    effects.add('structures')
  }

  if (profile.direction === 'ascending' || profile.shape === 'cat-eye') {
    effects.add('lifts')
  }

  if (profile.visualWeight === 'strong' || ['cat-eye', 'aviator', 'geometric', 'browline', 'wayfarer'].includes(profile.shape)) {
    effects.add('adds-presence')
  }

  if (profile.lensHeight === 'low' || (profile.visualWidth === 'narrow' && profile.lensHeight !== 'high')) {
    effects.add('elongates')
  }

  if (profile.lensHeight === 'high' || (profile.visualWidth === 'wide' && profile.lensHeight !== 'low')) {
    effects.add('shortens')
  }

  return Array.from(effects)
}

function inferProfileFromName(name: string): VisagismoFrameProfile {
  const normalized = slugify(name)

  if (normalized.includes('gatinho') || normalized.includes('cat')) {
    return {
      shape: 'cat-eye',
      visualWeight: normalized.includes('marcado') ? 'strong' : 'medium',
      lineStyle: 'mixed',
      direction: 'ascending',
      visualWidth: 'wide',
      lensHeight: 'medium',
      effects: ['lifts', 'adds-presence'],
    }
  }

  if (normalized.includes('aviador')) {
    return {
      shape: 'aviator',
      visualWeight: 'medium',
      lineStyle: 'curved',
      direction: 'descending',
      visualWidth: 'wide',
      lensHeight: 'high',
      effects: ['softens', 'adds-presence'],
    }
  }

  if (normalized.includes('browline')) {
    return {
      shape: 'browline',
      visualWeight: 'medium',
      lineStyle: 'straight',
      direction: 'neutral',
      visualWidth: 'medium',
      lensHeight: 'medium',
      effects: ['structures', 'adds-presence'],
    }
  }

  if (normalized.includes('wayfarer')) {
    return {
      shape: 'wayfarer',
      visualWeight: 'medium',
      lineStyle: 'straight',
      direction: 'neutral',
      visualWidth: 'wide',
      lensHeight: 'medium',
      effects: ['structures', 'adds-presence'],
    }
  }

  if (normalized.includes('hexagonal') || normalized.includes('geometr')) {
    return {
      shape: 'geometric',
      visualWeight: 'strong',
      lineStyle: 'straight',
      direction: 'neutral',
      visualWidth: 'medium',
      lensHeight: 'medium',
      effects: ['structures', 'adds-presence'],
    }
  }

  if (normalized.includes('retangular')) {
    return {
      shape: 'rectangular',
      visualWeight: 'medium',
      lineStyle: 'straight',
      direction: 'neutral',
      visualWidth: 'wide',
      lensHeight: 'low',
      effects: ['structures', 'balances'],
    }
  }

  if (normalized.includes('quadrad')) {
    return {
      shape: 'square',
      visualWeight: normalized.includes('marcado') ? 'strong' : 'medium',
      lineStyle: 'straight',
      direction: 'neutral',
      visualWidth: 'medium',
      lensHeight: 'medium',
      effects: ['structures', 'adds-presence'],
    }
  }

  if (normalized.includes('panto')) {
    return {
      shape: 'panto',
      visualWeight: 'medium',
      lineStyle: 'mixed',
      direction: 'neutral',
      visualWidth: 'medium',
      lensHeight: 'medium',
      effects: ['softens', 'balances'],
    }
  }

  if (normalized.includes('oval')) {
    return {
      shape: 'oval',
      visualWeight: 'light',
      lineStyle: 'curved',
      direction: 'neutral',
      visualWidth: 'medium',
      lensHeight: 'medium',
      effects: ['softens', 'balances'],
    }
  }

  if (normalized.includes('redondo') || normalized.includes('arredond')) {
    return {
      shape: 'round',
      visualWeight: 'light',
      lineStyle: 'curved',
      direction: 'neutral',
      visualWidth: 'medium',
      lensHeight: 'high',
      effects: ['softens', 'balances'],
    }
  }

  return {
    shape: 'other',
    visualWeight: 'medium',
    lineStyle: 'mixed',
    direction: 'neutral',
    visualWidth: 'medium',
    lensHeight: 'medium',
    effects: ['balances'],
  }
}

function pickProfileValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && allowed.includes(value as T) ? value as T : fallback
}

const PROFILE_SHAPES = ['round', 'oval', 'panto', 'rectangular', 'square', 'cat-eye', 'aviator', 'browline', 'geometric', 'wayfarer', 'other'] as const
const PROFILE_INTENSITIES = ['light', 'medium', 'strong'] as const
const PROFILE_LINE_STYLES = ['curved', 'straight', 'mixed'] as const
const PROFILE_DIRECTIONS = ['neutral', 'ascending', 'descending'] as const
const PROFILE_WIDTHS = ['narrow', 'medium', 'wide'] as const
const PROFILE_LENS_HEIGHTS = ['low', 'medium', 'high'] as const

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'gabarito'
}
