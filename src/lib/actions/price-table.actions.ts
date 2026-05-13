'use server'

import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export type PriceTableFamily = {
  id: string
  nome: string
  clinicalCategory: string
  design: string
}

export type PriceTableOffer = {
  id: string
  familyId: string
  globalOfferId: string
  rawLabel: string
  canonicalLabel: string | null
  displayName: string | null
  clinicalCategory: string
  material: string | null
  indiceRefracao: number | null
  isAtomicOffer: boolean
  alreadyIncludesTreatment: boolean
  allowsComposition: boolean
  features: Record<string, unknown>
  basePrice: number | null
  sectionName: string | null
  subsectionName: string | null
}

export type PriceTableTreatment = {
  id: string
  nome: string
  tipo: string | null
  features?: Record<string, unknown> | null
}

export type PriceTableCompatibility = {
  offerId: string
  treatmentId: string
  specialPrice: number | null
  priceMode: 'final' | 'surcharge'
}

export type PriceTableGrid = {
  offerId: string
  sphMin: number | null
  sphMax: number | null
  cylMin: number | null
  cylMax: number | null
  addMin: number | null
  addMax: number | null
  metadata?: Record<string, unknown> | null
}

function normalizeRange(min: number | null, max: number | null): { min: number | null; max: number | null } {
  if (min == null || max == null) return { min, max }
  return min <= max ? { min, max } : { min: max, max: min }
}

export type PriceTableCatalogOption = {
  activationId: string
  versionId: string
  laboratorio: string
  versao: string
  activatedAt: string | null
}

export type PriceTableData = {
  storeId: number
  laboratorio: string
  versao: string
  activationId: string
  versionId: string
  activeCatalogs: PriceTableCatalogOption[]
  families: PriceTableFamily[]
  offers: PriceTableOffer[]
  treatments: PriceTableTreatment[]
  compatibilities: PriceTableCompatibility[]
  grids: PriceTableGrid[]
}

export type PriceTableMixedOffer = {
  tenantOfferId: string
  globalOfferId: string
  familyId: string
  familyName: string
  rawLabel: string
  canonicalLabel: string | null
  displayName: string | null
  clinicalCategory: string
  material: string | null
  indiceRefracao: number | null
  features: Record<string, unknown>
  basePrice: number | null
  sourceLaboratorio: string
  sourceVersao: string
  sourceVersionId: string
}

export type PriceTableAllActiveOffersData = {
  storeId: number
  activeCatalogs: PriceTableCatalogOption[]
  offers: PriceTableMixedOffer[]
  compatibilities: PriceTableCompatibility[]
  treatments: PriceTableTreatment[]
}

type TenantOfferRow = {
  id: string
  global_offer_id: string
  display_name: string | null
}

type TenantMixedOfferRow = TenantOfferRow & {
  activation_id: string
}

const IN_QUERY_CHUNK_SIZE = 150
const SUPABASE_PAGE_SIZE = 1000

function chunkValues<T>(values: T[], size = IN_QUERY_CHUNK_SIZE): T[][] {
  if (!values.length) return []

  const chunks: T[][] = []
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }
  return chunks
}

async function runChunkedQuery<T>(
  values: string[],
  runner: (chunk: string[]) => Promise<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  if (!values.length) return []

  const results: T[] = []
  for (const chunk of chunkValues(values)) {
    const { data, error } = await runner(chunk)
    if (error) throw error
    results.push(...(data || []))
  }

  return results
}

async function fetchAllTenantCommercialOffers<T>(
  supabaseAdmin: any,
  columns: string,
  applyFilters: (query: any) => any,
): Promise<T[]> {
  const rows: T[] = []

  for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
    const to = from + SUPABASE_PAGE_SIZE - 1
    const { data, error } = await applyFilters(
      supabaseAdmin
        .from('tenant_commercial_offers')
        .select(columns)
        .order('id', { ascending: true }),
    ).range(from, to)

    if (error) throw error

    const page = (data || []) as T[]
    rows.push(...page)

    if (page.length < SUPABASE_PAGE_SIZE) break
  }

  return rows
}

async function getPriceTableContext(storeId: number) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new Error('Usuário não autenticado.')

  const profile = (await getProfileByAdmin(user.id)) as any
  if (!profile) throw new Error('Perfil inválido.')

  const allowedRoles = ['admin', 'manager', 'store_operator', 'vendedor', 'tecnico']
  if (!allowedRoles.includes(profile.role)) throw new Error('Acesso negado.')

  const hasStoreAccess = profile.role === 'admin' || profile.store_id === storeId
  if (!hasStoreAccess) throw new Error('Acesso negado.')

  return { profile, supabaseAdmin: createAdminClient() as any }
}

export async function getStorePriceTableData(
  storeId: number,
  selectedVersionId?: string | null,
): Promise<PriceTableData | null> {
  const { supabaseAdmin } = await getPriceTableContext(storeId)

  const { data: activations, error: activationError } = await supabaseAdmin
    .from('tenant_catalog_activations')
    .select('id,global_version_id,activated_at')
    .eq('store_id', storeId)
    .eq('status', 'active')
    .order('activated_at', { ascending: false })

  if (activationError) throw activationError
  if (!activations?.length) return null

  const activeVersionIds = [...new Set(activations.map((activation: any) => activation.global_version_id))]
  const { data: versions, error: versionError } = await supabaseAdmin
    .from('global_catalog_versions')
    .select('id,laboratorio,versao')
    .in('id', activeVersionIds)

  if (versionError) throw versionError

  const versionById = new Map<string, { id: string; laboratorio: string; versao: string }>(
    (versions || []).map((version: any) => [
      version.id,
      {
        id: version.id,
        laboratorio: version.laboratorio,
        versao: version.versao,
      },
    ]),
  )

  const activation =
    activations.find((row: any) => row.global_version_id === selectedVersionId) || activations[0]

  const versionId = activation.global_version_id
  const version = versionById.get(versionId)

  if (!version) {
    throw new Error('Versão ativa não encontrada para a tabela de preços.')
  }

  const activeCatalogs: PriceTableCatalogOption[] = activations
    .map((row: any) => {
      const activeVersion = versionById.get(row.global_version_id)
      if (!activeVersion) return null
      return {
        activationId: row.id,
        versionId: row.global_version_id,
        laboratorio: activeVersion.laboratorio,
        versao: activeVersion.versao,
        activatedAt: row.activated_at || null,
      }
    })
    .filter(Boolean) as PriceTableCatalogOption[]

  const tenantOffers = await fetchAllTenantCommercialOffers<TenantOfferRow>(
    supabaseAdmin,
    'id,global_offer_id,display_name',
    (query) => query.eq('activation_id', activation.id),
  )

  const globalOfferIds: string[] = (tenantOffers || []).map(
    (o: any): string => o.global_offer_id,
  )
  if (!globalOfferIds.length) {
    return {
      storeId,
      laboratorio: version.laboratorio,
      versao: version.versao,
      activationId: activation.id,
      versionId,
      activeCatalogs,
      families: [],
      offers: [],
      treatments: [],
      compatibilities: [],
      grids: [],
    }
  }

  const [globalOffers, compatibilities, gridsRaw, treatmentsResult] = await Promise.all([
    runChunkedQuery<any>(globalOfferIds, (chunk) =>
      supabaseAdmin
        .from('global_lens_offers')
        .select(
          'id,family_id,raw_label,canonical_label,clinical_category,material,indice_refracao,is_atomic_offer,already_includes_treatment,allows_composition,features,base_price',
        )
        .in('id', chunk),
    ),
    runChunkedQuery<any>(globalOfferIds, (chunk) =>
      supabaseAdmin
        .from('global_offer_treatments_compatibility')
        .select('offer_id,treatment_id,special_price,price_mode')
        .in('offer_id', chunk),
    ),
    runChunkedQuery<any>(globalOfferIds, (chunk) =>
      supabaseAdmin
        .from('global_offer_diopter_grids')
        .select('offer_id,sph_min,sph_max,cyl_min,cyl_max,add_min,add_max,metadata')
        .in('offer_id', chunk),
    ),
    supabaseAdmin
      .from('global_treatments')
      .select('id,nome,tipo,features')
      .eq('version_id', versionId),
  ])

  if (treatmentsResult.error) throw treatmentsResult.error
  const treatments = treatmentsResult.data || []

  const familyIds = [...new Set((globalOffers || []).map((o: any) => o.family_id))]

  const { data: families, error: familiesError } = familyIds.length
    ? await supabaseAdmin
        .from('global_lens_families')
        .select('id,nome,clinical_category,design')
        .in('id', familyIds)
    : { data: [], error: null }

  if (familiesError) throw familiesError

  // Derive section_name from grid metadata (first non-null per offer)
  const sectionByOffer = new Map<string, { section: string | null; subsection: string | null }>()
  for (const grid of gridsRaw || []) {
    const offerId = grid.offer_id
    if (sectionByOffer.has(offerId)) continue
    const meta = grid.metadata || {}
    sectionByOffer.set(offerId, {
      section: meta.section_name || null,
      subsection: meta.subsection_name || null,
    })
  }

  // Map tenant offer data for display_name lookup
  const tenantOfferByGlobalId = new Map<string, TenantOfferRow>(
    (tenantOffers || []).map((o: any) => [o.global_offer_id, o as TenantOfferRow]),
  )

  return {
    storeId,
    laboratorio: version.laboratorio,
    versao: version.versao,
    activationId: activation.id,
    versionId,
    activeCatalogs,
    families: (families || []).map((f: any) => ({
      id: f.id,
      nome: f.nome,
      clinicalCategory: f.clinical_category,
      design: f.design,
    })),
    offers: (globalOffers || []).map((o: any) => {
      const tenantOffer = tenantOfferByGlobalId.get(o.id)
      const sections = sectionByOffer.get(o.id)
      return {
        id: tenantOffer?.id || o.id,
        familyId: o.family_id,
        globalOfferId: o.id,
        rawLabel: o.raw_label,
        canonicalLabel: o.canonical_label || null,
        displayName: tenantOffer?.display_name || null,
        clinicalCategory: o.clinical_category,
        material: o.material || null,
        indiceRefracao: o.indice_refracao ? Number(o.indice_refracao) : null,
        isAtomicOffer: Boolean(o.is_atomic_offer),
        alreadyIncludesTreatment: Boolean(o.already_includes_treatment),
        allowsComposition: Boolean(o.allows_composition),
        features: o.features || {},
        basePrice: o.base_price ? Number(o.base_price) : null,
        sectionName: sections?.section || null,
        subsectionName: sections?.subsection || null,
      }
    }),
    treatments: (treatments || []).map((t: any) => ({
      id: t.id,
      nome: t.nome,
      tipo: t.tipo || null,
      features: t.features || null,
    })),
    compatibilities: (compatibilities || []).map((c: any) => ({
      offerId: c.offer_id,
      treatmentId: c.treatment_id,
      specialPrice: c.special_price ? Number(c.special_price) : null,
      priceMode: c.price_mode === 'surcharge' ? 'surcharge' as const : 'final' as const,
    })),
    grids: (gridsRaw || []).map((g: any) => {
      const sph = normalizeRange(
        g.sph_min != null ? Number(g.sph_min) : null,
        g.sph_max != null ? Number(g.sph_max) : null,
      )
      const cyl = normalizeRange(
        g.cyl_min != null ? Number(g.cyl_min) : null,
        g.cyl_max != null ? Number(g.cyl_max) : null,
      )
      const add = normalizeRange(
        g.add_min != null ? Number(g.add_min) : null,
        g.add_max != null ? Number(g.add_max) : null,
      )
      return {
        offerId: g.offer_id,
        sphMin: sph.min,
        sphMax: sph.max,
        cylMin: cyl.min,
        cylMax: cyl.max,
        addMin: add.min,
        addMax: add.max,
        metadata: g.metadata || null,
      }
    }),
  }
}

export async function getStorePriceTableAllActiveOffersData(
  storeId: number,
): Promise<PriceTableAllActiveOffersData | null> {
  const { supabaseAdmin } = await getPriceTableContext(storeId)

  const { data: activations, error: activationError } = await supabaseAdmin
    .from('tenant_catalog_activations')
    .select('id,global_version_id,activated_at')
    .eq('store_id', storeId)
    .eq('status', 'active')
    .order('activated_at', { ascending: false })

  if (activationError) throw activationError
  if (!activations?.length) return null

  const versionIds = [...new Set(activations.map((activation: any) => activation.global_version_id))]
  const { data: versions, error: versionError } = await supabaseAdmin
    .from('global_catalog_versions')
    .select('id,laboratorio,versao')
    .in('id', versionIds)

  if (versionError) throw versionError

  const versionById = new Map<string, { id: string; laboratorio: string; versao: string }>(
    (versions || []).map((version: any) => [
      version.id,
      {
        id: version.id,
        laboratorio: version.laboratorio,
        versao: version.versao,
      },
    ]),
  )

  const activationById = new Map<string, { id: string; versionId: string }>(
    activations.map((activation: any) => [
      activation.id,
      {
        id: activation.id,
        versionId: activation.global_version_id,
      },
    ]),
  )

  const activeCatalogs: PriceTableCatalogOption[] = activations
    .map((row: any) => {
      const version = versionById.get(row.global_version_id)
      if (!version) return null
      return {
        activationId: row.id,
        versionId: row.global_version_id,
        laboratorio: version.laboratorio,
        versao: version.versao,
        activatedAt: row.activated_at || null,
      }
    })
    .filter(Boolean) as PriceTableCatalogOption[]

  const activationIds = activations.map((activation: any) => activation.id)
  const tenantOffers = await fetchAllTenantCommercialOffers<TenantMixedOfferRow>(
    supabaseAdmin,
    'id,activation_id,global_offer_id,display_name',
    (query) => query.in('activation_id', activationIds),
  )

  const globalOfferIds: string[] = [
    ...new Set<string>((tenantOffers || []).map((offer: any): string => offer.global_offer_id)),
  ]
  if (!globalOfferIds.length) {
    return {
      storeId,
      activeCatalogs,
      offers: [],
      compatibilities: [],
      treatments: [],
    }
  }

  const [globalOffers, compatibilities, treatmentsResult] = await Promise.all([
    runChunkedQuery<any>(globalOfferIds, (chunk) =>
      supabaseAdmin
        .from('global_lens_offers')
        .select(
          'id,family_id,raw_label,canonical_label,clinical_category,material,indice_refracao,features,base_price',
        )
        .in('id', chunk),
    ),
    runChunkedQuery<any>(globalOfferIds, (chunk) =>
      supabaseAdmin
        .from('global_offer_treatments_compatibility')
        .select('offer_id,treatment_id,special_price,price_mode')
        .in('offer_id', chunk),
    ),
    supabaseAdmin
      .from('global_treatments')
      .select('id,nome,tipo,features,version_id')
      .in('version_id', versionIds),
  ])
  if (treatmentsResult.error) throw treatmentsResult.error
  const treatments = treatmentsResult.data || []

  const familyIds = [...new Set((globalOffers || []).map((offer: any) => offer.family_id))]
  const { data: families, error: familiesError } = familyIds.length
    ? await supabaseAdmin
        .from('global_lens_families')
        .select('id,nome')
        .in('id', familyIds)
    : { data: [], error: null }

  if (familiesError) throw familiesError

  const familyNameById = new Map<string, string>((families || []).map((family: any) => [family.id, family.nome]))
  const globalOfferById = new Map<string, any>((globalOffers || []).map((offer: any) => [offer.id, offer]))

  const offers: PriceTableMixedOffer[] = (tenantOffers || [])
    .map((tenantOffer: TenantMixedOfferRow) => {
      const globalOffer = globalOfferById.get(tenantOffer.global_offer_id)
      if (!globalOffer) return null

      const activation = activationById.get(tenantOffer.activation_id)
      if (!activation) return null

      const version = versionById.get(activation.versionId)
      if (!version) return null

      return {
        tenantOfferId: tenantOffer.id,
        globalOfferId: globalOffer.id,
        familyId: globalOffer.family_id,
        familyName: familyNameById.get(globalOffer.family_id) || 'Sem familia',
        rawLabel: globalOffer.raw_label,
        canonicalLabel: globalOffer.canonical_label || null,
        displayName: tenantOffer.display_name || null,
        clinicalCategory: globalOffer.clinical_category,
        material: globalOffer.material || null,
        indiceRefracao: globalOffer.indice_refracao != null ? Number(globalOffer.indice_refracao) : null,
        features: globalOffer.features || {},
        basePrice: globalOffer.base_price != null ? Number(globalOffer.base_price) : null,
        sourceLaboratorio: version.laboratorio,
        sourceVersao: version.versao,
        sourceVersionId: version.id,
      }
    })
    .filter(Boolean) as PriceTableMixedOffer[]

  return {
    storeId,
    activeCatalogs,
    offers,
    compatibilities: (compatibilities || []).map((compatibility: any) => ({
      offerId: compatibility.offer_id,
      treatmentId: compatibility.treatment_id,
      specialPrice:
        compatibility.special_price != null ? Number(compatibility.special_price) : null,
      priceMode: compatibility.price_mode === 'surcharge' ? 'surcharge' as const : 'final' as const,
    })),
    treatments: (treatments || []).map((t: any) => ({
      id: t.id,
      nome: t.nome,
      tipo: t.tipo || null,
      features: t.features || null,
    })),
  }
}
