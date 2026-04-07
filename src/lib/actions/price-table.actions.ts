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
}

export type PriceTableData = {
  storeId: number
  laboratorio: string
  versao: string
  activationId: string
  versionId: string
  families: PriceTableFamily[]
  offers: PriceTableOffer[]
  treatments: PriceTableTreatment[]
  compatibilities: PriceTableCompatibility[]
  grids: PriceTableGrid[]
}

type TenantOfferRow = {
  id: string
  global_offer_id: string
  display_name: string | null
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
): Promise<PriceTableData | null> {
  const { supabaseAdmin } = await getPriceTableContext(storeId)

  const { data: activation, error: activationError } = await supabaseAdmin
    .from('tenant_catalog_activations')
    .select('id,global_version_id')
    .eq('store_id', storeId)
    .eq('status', 'active')
    .order('activated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (activationError) throw activationError
  if (!activation) return null

  const versionId = activation.global_version_id

  const { data: version, error: versionError } = await supabaseAdmin
    .from('global_catalog_versions')
    .select('laboratorio,versao')
    .eq('id', versionId)
    .single()

  if (versionError) throw versionError

  const { data: tenantOffers, error: tenantOffersError } = await supabaseAdmin
    .from('tenant_commercial_offers')
    .select('id,global_offer_id,display_name')
    .eq('activation_id', activation.id)

  if (tenantOffersError) throw tenantOffersError

  const globalOfferIds = (tenantOffers || []).map((o: any) => o.global_offer_id)
  if (!globalOfferIds.length) {
    return {
      storeId,
      laboratorio: version.laboratorio,
      versao: version.versao,
      activationId: activation.id,
      versionId,
      families: [],
      offers: [],
      treatments: [],
      compatibilities: [],
      grids: [],
    }
  }

  const [
    { data: globalOffers, error: globalOffersError },
    { data: compatibilities, error: compatError },
    { data: gridsRaw, error: gridsError },
    { data: treatments, error: treatmentsError },
  ] = await Promise.all([
    supabaseAdmin
      .from('global_lens_offers')
      .select(
        'id,family_id,raw_label,canonical_label,clinical_category,material,indice_refracao,is_atomic_offer,already_includes_treatment,allows_composition,features,base_price',
      )
      .in('id', globalOfferIds),
    supabaseAdmin
      .from('global_offer_treatments_compatibility')
      .select('offer_id,treatment_id,special_price,price_mode')
      .in('offer_id', globalOfferIds),
    supabaseAdmin
      .from('global_offer_diopter_grids')
      .select('offer_id,sph_min,sph_max,cyl_min,cyl_max,add_min,add_max,metadata')
      .in('offer_id', globalOfferIds),
    supabaseAdmin
      .from('global_treatments')
      .select('id,nome,tipo')
      .eq('version_id', versionId),
  ])

  if (globalOffersError) throw globalOffersError
  if (compatError) throw compatError
  if (gridsError) throw gridsError
  if (treatmentsError) throw treatmentsError

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
    })),
    compatibilities: (compatibilities || []).map((c: any) => ({
      offerId: c.offer_id,
      treatmentId: c.treatment_id,
      specialPrice: c.special_price ? Number(c.special_price) : null,
      priceMode: c.price_mode === 'surcharge' ? 'surcharge' as const : 'final' as const,
    })),
    grids: (gridsRaw || []).map((g: any) => ({
      offerId: g.offer_id,
      sphMin: g.sph_min ? Number(g.sph_min) : null,
      sphMax: g.sph_max ? Number(g.sph_max) : null,
      cylMin: g.cyl_min ? Number(g.cyl_min) : null,
      cylMax: g.cyl_max ? Number(g.cyl_max) : null,
      addMin: g.add_min ? Number(g.add_min) : null,
      addMax: g.add_max ? Number(g.add_max) : null,
    })),
  }
}
