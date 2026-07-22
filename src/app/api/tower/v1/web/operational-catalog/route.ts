import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateTowerDeviceWebSessionToken } from '@/lib/server/tower-device-web-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const QuerySchema = z.object({
  storeId: z.coerce.number().int().positive(),
  resources: z.string().trim().min(1).max(80),
})
const RESOURCE_NAMES = new Set(['catalog', 'geometries', 'frames'])
const GEOMETRY_COLUMNS = [
  'id', 'family_name', 'visual_design_type', 'distance_present', 'distance_width',
  'intermediate_present', 'intermediate_width', 'near_present', 'near_width',
  'corridor_length', 'lateral_blur', 'inset', 'distance_reference_height',
  'near_reference_height', 'fitting_height', 'pins',
].join(', ')
const GEOMETRY_COLUMNS_WITH_CORRIDOR = `${GEOMETRY_COLUMNS}, corridor_opening`
const FRAME_BASE_COLUMNS = [
  'id', 'slug', 'name', 'category', 'description', 'real_width_mm',
  'viewbox_width', 'viewbox_height', 'calibration', 'source_paths', 'generated_paths',
]
const FRAME_PROFILE_COLUMNS = [
  'profile_shape', 'profile_visual_weight', 'profile_line_style',
  'profile_line_direction', 'profile_visual_width', 'profile_lens_height', 'profile_effects',
]

const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  typeof value === 'string' && allowed.includes(value as T) ? value as T : fallback
const pathValue = (value: unknown) => typeof value === 'string' && value.trim() ? value : undefined

function inferFrameProfile(name: string) {
  const normalized = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-')
  if (normalized.includes('gatinho') || normalized.includes('cat')) return { shape: 'cat-eye', visualWeight: normalized.includes('marcado') ? 'strong' : 'medium', lineStyle: 'mixed', direction: 'ascending', visualWidth: 'wide', lensHeight: 'medium' }
  if (normalized.includes('aviador')) return { shape: 'aviator', visualWeight: 'medium', lineStyle: 'curved', direction: 'descending', visualWidth: 'wide', lensHeight: 'high' }
  if (normalized.includes('browline')) return { shape: 'browline', visualWeight: 'medium', lineStyle: 'straight', direction: 'neutral', visualWidth: 'medium', lensHeight: 'medium' }
  if (normalized.includes('wayfarer')) return { shape: 'wayfarer', visualWeight: 'medium', lineStyle: 'straight', direction: 'neutral', visualWidth: 'wide', lensHeight: 'medium' }
  if (normalized.includes('hexagonal') || normalized.includes('geometr')) return { shape: 'geometric', visualWeight: 'strong', lineStyle: 'straight', direction: 'neutral', visualWidth: 'medium', lensHeight: 'medium' }
  if (normalized.includes('retangular')) return { shape: 'rectangular', visualWeight: 'medium', lineStyle: 'straight', direction: 'neutral', visualWidth: 'wide', lensHeight: 'low' }
  if (normalized.includes('quadrad')) return { shape: 'square', visualWeight: normalized.includes('marcado') ? 'strong' : 'medium', lineStyle: 'straight', direction: 'neutral', visualWidth: 'medium', lensHeight: 'medium' }
  if (normalized.includes('panto')) return { shape: 'panto', visualWeight: 'medium', lineStyle: 'mixed', direction: 'neutral', visualWidth: 'medium', lensHeight: 'medium' }
  if (normalized.includes('oval')) return { shape: 'oval', visualWeight: 'light', lineStyle: 'curved', direction: 'neutral', visualWidth: 'medium', lensHeight: 'medium' }
  if (normalized.includes('redondo') || normalized.includes('arredond')) return { shape: 'round', visualWeight: 'light', lineStyle: 'curved', direction: 'neutral', visualWidth: 'medium', lensHeight: 'high' }
  return { shape: 'other', visualWeight: 'medium', lineStyle: 'mixed', direction: 'neutral', visualWidth: 'medium', lensHeight: 'medium' }
}

function normalizeFrameProfile(row: any) {
  const inferred = inferFrameProfile(String(row.name ?? ''))
  const explicitShape = pick(row.profile_shape, ['round', 'oval', 'panto', 'rectangular', 'square', 'cat-eye', 'aviator', 'browline', 'geometric', 'wayfarer', 'other'] as const, inferred.shape as any)
  const useInference = explicitShape === 'other' && inferred.shape !== 'other'
  const profile = {
    shape: useInference ? inferred.shape : explicitShape,
    visualWeight: useInference ? inferred.visualWeight : pick(row.profile_visual_weight, ['light', 'medium', 'strong'] as const, inferred.visualWeight as any),
    lineStyle: useInference ? inferred.lineStyle : pick(row.profile_line_style, ['curved', 'straight', 'mixed'] as const, inferred.lineStyle as any),
    direction: useInference ? inferred.direction : pick(row.profile_line_direction, ['neutral', 'ascending', 'descending'] as const, inferred.direction as any),
    visualWidth: useInference ? inferred.visualWidth : pick(row.profile_visual_width, ['narrow', 'medium', 'wide'] as const, inferred.visualWidth as any),
    lensHeight: useInference ? inferred.lensHeight : pick(row.profile_lens_height, ['low', 'medium', 'high'] as const, inferred.lensHeight as any),
  }
  const effects = new Set<string>(['balances'])
  if (profile.lineStyle === 'curved' || ['round', 'oval', 'panto', 'aviator'].includes(profile.shape)) effects.add('softens')
  if (profile.lineStyle === 'straight' || ['rectangular', 'square', 'geometric', 'wayfarer', 'browline'].includes(profile.shape)) effects.add('structures')
  if (profile.direction === 'ascending' || profile.shape === 'cat-eye') effects.add('lifts')
  if (profile.visualWeight === 'strong' || ['cat-eye', 'aviator', 'geometric', 'browline', 'wayfarer'].includes(profile.shape)) effects.add('adds-presence')
  if (profile.lensHeight === 'low' || (profile.visualWidth === 'narrow' && profile.lensHeight !== 'high')) effects.add('elongates')
  if (profile.lensHeight === 'high' || (profile.visualWidth === 'wide' && profile.lensHeight !== 'low')) effects.add('shortens')
  return { ...profile, effects: [...effects] }
}

async function loadCatalog(admin: ReturnType<typeof createAdminClient>, tenantId: string, storeId: number) {
  const { data: rawActivations, error: activationError } = await (admin.from('tenant_catalog_activations') as any)
    .select('id, global_version_id, status, activated_at, last_synced_at')
    .eq('tenant_id', tenantId)
    .eq('store_id', storeId)
    .eq('status', 'active')
    .order('activated_at', { ascending: false })
  if (activationError) throw new Error(activationError.message)
  const activations = rawActivations ?? []
  const versionIds = [...new Set(activations.map((item: any) => item.global_version_id as string))]
  if (!versionIds.length) return { storeId, currentActivation: null, activeActivations: [], versions: [] }

  const { data: rawVersions, error: versionError } = await admin
    .from('global_catalog_versions')
    .select('id, laboratorio, versao, status, published_at, created_at')
    .in('id', versionIds)
  if (versionError) throw new Error(versionError.message)
  const versionById = new Map((rawVersions ?? []).map((item: any) => [item.id, item]))
  const summaries = activations.flatMap((activation: any) => {
    const version = versionById.get(activation.global_version_id) as any
    if (!version) return []
    return [{
      id: version.id,
      laboratorio: version.laboratorio,
      versao: version.versao,
      status: version.status,
      publishedAt: version.published_at,
      createdAt: version.created_at,
      familiesCount: 0,
      offersCount: 0,
      treatmentsCount: 0,
      activation: {
        id: activation.id,
        status: activation.status,
        activatedAt: activation.activated_at,
        lastSyncedAt: activation.last_synced_at,
      },
    }]
  })
  return { storeId, currentActivation: summaries[0] ?? null, activeActivations: summaries, versions: summaries }
}

async function loadGeometries(admin: ReturnType<typeof createAdminClient>) {
  let { data, error } = await admin.from('global_lens_geometry').select(GEOMETRY_COLUMNS_WITH_CORRIDOR).order('family_name')
  if (error && error.message?.toLowerCase().includes('corridor_opening')) {
    const fallback = await admin.from('global_lens_geometry').select(GEOMETRY_COLUMNS).order('family_name')
    data = fallback.data
    error = fallback.error
  }
  if (error) throw new Error(error.message)
  return (data ?? []).map((geometry: any) => {
    const corridorOpening = geometry.corridor_opening ?? geometry.intermediate_width ?? 50
    return { ...geometry, corridor_opening: corridorOpening, intermediate_width: geometry.intermediate_width ?? corridorOpening }
  })
}

async function selectFrames(admin: ReturnType<typeof createAdminClient>, columns: string[]) {
  return (admin.from('global_visagismo_frame_templates') as any)
    .select(columns.join(','))
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
}

async function loadFrames(admin: ReturnType<typeof createAdminClient>) {
  let { data, error } = await selectFrames(admin, [...FRAME_BASE_COLUMNS, ...FRAME_PROFILE_COLUMNS])
  if (error && FRAME_PROFILE_COLUMNS.some((column) => error?.message?.includes(column))) {
    const fallback = await selectFrames(admin, FRAME_BASE_COLUMNS)
    data = fallback.data
    error = fallback.error
  }
  if (error) throw new Error(error.message)
  return (data ?? []).map((row: any) => {
    const generated = row.generated_paths ?? {}
    const source = row.source_paths ?? {}
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      category: row.category,
      description: row.description,
      realWidthMm: row.real_width_mm,
      viewBox: { width: Number(row.viewbox_width ?? 140), height: Number(row.viewbox_height ?? 60) },
      calibration: row.calibration ?? {},
      sourcePaths: source,
      generatedPaths: {
        outerFullPath: pathValue(generated.outerFullPath),
        innerRightPath: pathValue(generated.innerRightPath),
        innerLeftPath: pathValue(generated.innerLeftPath),
        secondaryRightPath: pathValue(generated.secondaryRightPath),
        secondaryLeftPath: pathValue(generated.secondaryLeftPath),
      },
      construction: pick(generated.construction ?? source.construction, ['full-rim', 'rimless', 'semi-rimless'] as const, 'full-rim'),
      profile: normalizeFrameProfile(row),
    }
  })
}

export async function GET(request: NextRequest) {
  const parsed = QuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!parsed.success) return NextResponse.json({ success: false, message: 'Recursos operacionais invalidos.' }, { status: 400 })
  const resources = [...new Set(parsed.data.resources.split(',').map((item) => item.trim()).filter(Boolean))]
  if (!resources.length || resources.some((item) => !RESOURCE_NAMES.has(item))) {
    return NextResponse.json({ success: false, message: 'Recursos operacionais invalidos.' }, { status: 400 })
  }

  const authorization = request.headers.get('authorization') ?? ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!token) return NextResponse.json({ success: false, message: 'Torre nao autenticada.' }, { status: 401 })
  const auth = await authenticateTowerDeviceWebSessionToken(token, parsed.data.storeId)
  if (!auth.ok) return NextResponse.json({ success: false, message: auth.message }, { status: 401 })

  try {
    const admin = createAdminClient()
    const entries = await Promise.all(resources.map(async (resource) => {
      if (resource === 'catalog') return [resource, await loadCatalog(admin, auth.tenantId, parsed.data.storeId)]
      if (resource === 'geometries') return [resource, await loadGeometries(admin)]
      return [resource, await loadFrames(admin)]
    }))
    return NextResponse.json({ success: true, message: 'Snapshot operacional carregado.', data: Object.fromEntries(entries) })
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : 'Falha ao carregar snapshot operacional.' }, { status: 500 })
  }
}
