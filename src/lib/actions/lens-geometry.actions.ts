'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeLensName } from '@/lib/utils/lens'
import type { PostgrestError } from '@supabase/supabase-js'

export type LensPins = {
  distance: Array<{ x: number; y: number }>
  corridor: Array<{ x: number; y: number }>
  near: Array<{ x: number; y: number }>
  lineA: Array<{ x: number; y: number }>
  lineB: Array<{ x: number; y: number }>
  lensRim: Array<{ x: number; y: number }>
  fitting_height: number
}

export type LensGeometry = {
  id: string
  family_name: string
  visual_design_type: string
  distance_present: boolean
  distance_width: number | null
  intermediate_present: boolean
  intermediate_width: number | null
  corridor_opening: number | null
  near_present: boolean
  near_width: number | null
  corridor_length: number | null
  lateral_blur: number | null
  inset: number | null
  distance_reference_height: number | null
  near_reference_height: number | null
  fitting_height: number | null
  pins: LensPins | null
}

function mergePins(
  submitted: LensPins | null | undefined,
  fromDb: LensPins | null | undefined,
): LensPins {
  const base: LensPins = {
    distance: [], corridor: [], near: [],
    lineA: [], lineB: [],
    lensRim: [],
    fitting_height: 0.5,
  }
  return { ...base, ...(submitted ?? {}), ...(fromDb ?? {}) }
}

function normalizeLensGeometry(geometry: LensGeometry): LensGeometry {
  const corridorOpening = geometry.corridor_opening ?? geometry.intermediate_width ?? 50
  return {
    ...geometry,
    corridor_opening: corridorOpening,
    intermediate_width: geometry.intermediate_width ?? corridorOpening,
  }
}

type LensFamilyRow = {
  id: string
  nome: string
}

type LensOfferRow = {
  family_id: string
}

const LENS_GEOMETRY_COLUMNS = [
  'id', 'family_name', 'visual_design_type',
  'distance_present', 'distance_width',
  'intermediate_present', 'intermediate_width',
  'near_present', 'near_width',
  'corridor_length', 'lateral_blur', 'inset',
  'distance_reference_height', 'near_reference_height', 'fitting_height',
  'pins',
].join(', ')

const LENS_GEOMETRY_COLUMNS_WITH_CORRIDOR = LENS_GEOMETRY_COLUMNS + ', corridor_opening'

export async function getAllLensGeometries(): Promise<LensGeometry[]> {
  const sb = createClient()

  // Try with corridor_opening first; fall back to without if schema cache lags
  let { data, error } = await sb
    .from('global_lens_geometry')
    .select(LENS_GEOMETRY_COLUMNS_WITH_CORRIDOR)
    .order('family_name')

  if (error && error.message?.toLowerCase().includes('corridor_opening')) {
    const fallback = await sb
      .from('global_lens_geometry')
      .select(LENS_GEOMETRY_COLUMNS)
      .order('family_name')
    data = fallback.data
    error = fallback.error
  }

  if (error) throw new Error(error.message)
  return ((data ?? []) as unknown as LensGeometry[]).map(normalizeLensGeometry)
}

/** Nomes de famílias de lentes multifocais/ocupacionais do catálogo global.
 *  Usa global_lens_families.nome — que representa o design óptico (ex: "Kodak Precise",
 *  "iTop", "Varilux Comfort"), sem variações de índice/tratamento que estão nos offers.
 *  Inclui famílias com categoria 'indefinida' que possuem offers multifocal/ocupacional.
 *  Deduplicado por nome normalizado: mesma família em dois catálogos aparece uma vez,
 *  preferindo mixed-case sobre ALL-CAPS. */
export async function getCatalogFamilyNames(): Promise<string[]> {
  const sb = createAdminClient()

  // 1. Famílias com categoria multifocal/ocupacional/mista/bifocal diretamente
  const { data: directFamilies, error: dErr } = await sb
    .from('global_lens_families')
    .select('id, nome')
    .in('clinical_category', ['multifocal', 'ocupacional', 'mista', 'bifocal'])
  if (dErr) throw new Error(dErr.message)

  // 2. Ofertas multifocal/ocupacional (captura famílias com categoria 'indefinida')
  const { data: multifocalOffers, error: oErr } = await sb
    .from('global_lens_offers')
    .select('family_id')
    .in('clinical_category', ['multifocal', 'ocupacional'])
  if (oErr) throw new Error(oErr.message)

  const extraFamilyIds = (multifocalOffers as LensOfferRow[] | null ?? [])
    .map((offer) => offer.family_id)
    .filter((id) => !(directFamilies as LensFamilyRow[] | null ?? []).some((family) => family.id === id))
  const uniqueExtraIds = [...new Set(extraFamilyIds)]

  // 3. Busca nomes das famílias extras
  const extraFamilies: { nome: string }[] = []
  if (uniqueExtraIds.length > 0) {
    const { data: ef, error: eErr } = await sb
      .from('global_lens_families')
      .select('nome')
      .in('id', uniqueExtraIds)
    if (eErr) throw new Error(eErr.message)
    extraFamilies.push(...(ef ?? []))
  }

  // 4. Deduplicar por nome normalizado, preferindo mixed-case sobre ALL-CAPS
  const seen = new Map<string, string>()
  for (const f of [...(directFamilies as LensFamilyRow[] | null ?? []), ...extraFamilies]) {
    const name = (f.nome as string | null)?.trim()
    if (!name) continue
    const key = normalizeLensName(name)
    if (!seen.has(key)) {
      seen.set(key, name)
    } else {
      const existing = seen.get(key)!
      if (existing === existing.toUpperCase() && name !== name.toUpperCase()) {
        seen.set(key, name)
      }
    }
  }

  return [...seen.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

export async function deleteLensGeometry(id: string): Promise<void> {
  const sb = createClient()
  const { error } = await sb
    .from('global_lens_geometry')
    .delete()
    .eq('id', id)

  if (error) throw new Error(error.message)
}

export async function upsertLensGeometry(
  geometry: Omit<LensGeometry, 'id'>
): Promise<LensGeometry> {
  const sb = createClient()
  const corridorOpening = geometry.corridor_opening ?? geometry.intermediate_width ?? 50
  const { data, error } = await sb
    .from('global_lens_geometry')
    .upsert(
      {
        ...geometry,
        corridor_opening: corridorOpening,
        intermediate_width: geometry.intermediate_width ?? corridorOpening,
      },
      { onConflict: 'family_name' }
    )
    .select()
    .single()

  // Backward compatibility: some DBs may still be missing `corridor_opening`.
  // Retry with legacy payload so the calibration screen can keep saving.
  if (error && isMissingCorridorOpeningColumnError(error)) {
    const { data: legacyData, error: legacyError } = await sb
      .from('global_lens_geometry')
      .upsert(
        {
          ...geometry,
          intermediate_width: geometry.intermediate_width ?? corridorOpening,
        },
        { onConflict: 'family_name' }
      )
      .select()
      .single()

    if (legacyError) throw new Error(legacyError.message)
    const legacyResult = legacyData as LensGeometry
    legacyResult.pins = mergePins(geometry.pins, legacyResult.pins)
    return normalizeLensGeometry(legacyResult)
  }

  if (error) throw new Error(error.message)
  const result = data as LensGeometry
  result.pins = mergePins(geometry.pins, result.pins)
  return normalizeLensGeometry(result)
}

function isMissingCorridorOpeningColumnError(error: PostgrestError): boolean {
  const message = error.message?.toLowerCase() ?? ''
  return message.includes('corridor_opening') && message.includes('schema cache')
}
