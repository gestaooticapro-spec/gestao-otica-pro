'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { authorizeTowerStoreAccess } from '@/lib/server/tower-device-web-session'

export type StoreCatalogVersionSummary = {
  id: string
  laboratorio: string
  versao: string
  status: string
  publishedAt: string | null
  createdAt: string
  familiesCount: number
  offersCount: number
  treatmentsCount: number
  activation: {
    id: string
    status: string
    activatedAt: string
    lastSyncedAt: string | null
  } | null
}

export type StoreCatalogOverview = {
  storeId: number
  currentActivation: StoreCatalogVersionSummary | null
  activeActivations: StoreCatalogVersionSummary[]
  versions: StoreCatalogVersionSummary[]
}

export type GlobalCatalogActionResult = {
  success: boolean
  message: string
  data?: {
    activationId: string
    offersImported: number
    treatmentsImported: number
  }
}

const GLOBAL_CATALOG_PAGE_SIZE = 1000
const GLOBAL_CATALOG_CHUNK_SIZE = 200

type UserProfile = {
  role: string
  store_id: number | null
  tenant_id: string | null
}

type GlobalCatalogVersionRow = {
  id: string
  laboratorio: string
  versao: string
  status: string
  published_at: string | null
  created_at: string
}

type TenantCatalogActivationRow = {
  id: string
  global_version_id: string
  status: string
  activated_at: string
  last_synced_at: string | null
}

type GlobalLensFamilyRow = {
  id: string
  version_id: string
}

type GlobalLensOfferRow = {
  id: string
  family_id: string
  canonical_label: string | null
  raw_label: string | null
  features: Record<string, unknown> | null
}

type GlobalTreatmentRow = {
  id: string
  version_id: string
  nome: string | null
}

type ExistingTenantOfferRow = {
  global_offer_id: string
}

type ExistingTenantTreatmentRow = {
  global_treatment_id: string
}

type TenantOfferCostRow = {
  id: string
  global_offer_id: string
  price_cost: number | null
}

function formatActionError(error: unknown, fallback: string): string {
  if (!error) return fallback
  if (error instanceof Error && error.message) return error.message

  if (typeof error === 'object' && error !== null) {
    const candidate = error as { message?: unknown; details?: unknown; code?: unknown }
    const parts = [candidate.message, candidate.details, candidate.code]
      .filter((value) => typeof value === 'string' && value.trim().length > 0)
      .map((value) => String(value).trim())

    if (parts.length) return parts.join(' | ')
  }

  return fallback
}

async function getViewContext(storeId: number) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Usuario nao autenticado.')
  }

  const profile = (await getProfileByAdmin(user.id)) as UserProfile | null
  if (!profile) {
    throw new Error('Perfil invalido.')
  }

  const allowedRoles = ['admin', 'manager', 'store_operator', 'vendedor', 'tecnico']
  const isAllowed = allowedRoles.includes(profile.role)
  const hasStoreAccess = profile.role === 'admin' || profile.store_id === storeId

  if (!isAllowed || !hasStoreAccess) {
    throw new Error('Acesso negado.')
  }

  return {
    profile,
    supabaseAdmin: createAdminClient(),
  }
}

async function getManageContext(storeId: number) {
  const context = await getViewContext(storeId)
  const canManage = context.profile.role === 'admin' || context.profile.role === 'manager'

  if (!canManage) {
    throw new Error('Acesso negado.')
  }

  const { data: rawStore, error: storeError } = await context.supabaseAdmin
    .from('stores')
    .select('id,tenant_id')
    .eq('id', storeId)
    .single()

  const store = rawStore as any

  if (storeError || !store) {
    throw storeError || new Error('Loja nao encontrada.')
  }

  if (!store.tenant_id) {
    throw new Error('Loja sem tenant vinculado.')
  }

  return {
    ...context,
    store,
  }
}

async function fetchAllRows<T>(
  queryFactory: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = GLOBAL_CATALOG_PAGE_SIZE,
): Promise<T[]> {
  const rows: T[] = []

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1
    const { data, error } = await queryFactory(from, to)
    if (error) throw error

    const page = data || []
    rows.push(...page)

    if (page.length < pageSize) break
  }

  return rows
}

function chunkValues<T>(values: T[], size = GLOBAL_CATALOG_CHUNK_SIZE): T[][] {
  const chunks: T[][] = []

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }

  return chunks
}

async function getStoreGlobalCatalogOverviewWithAdmin(
  storeId: number,
  supabaseAdmin: ReturnType<typeof createAdminClient>,
): Promise<StoreCatalogOverview> {

  const [
    { data: versions, error: versionsError },
    { data: activations, error: activationsError },
  ] = await Promise.all([
    supabaseAdmin
      .from('global_catalog_versions')
      .select('id,laboratorio,versao,status,published_at,created_at')
      .order('created_at', { ascending: false }),
      (supabaseAdmin.from('tenant_catalog_activations') as any)
      .select('id,global_version_id,status,activated_at,last_synced_at')
      .eq('store_id', storeId)
      .order('activated_at', { ascending: false }),
  ])

  if (versionsError) throw versionsError
  if (activationsError) throw activationsError

  const typedVersions = (versions || []) as GlobalCatalogVersionRow[]
  const typedActivations = (activations || []) as TenantCatalogActivationRow[]

  const versionIds = typedVersions.map((version) => version.id)
  if (!versionIds.length) {
    return { storeId, currentActivation: null, activeActivations: [], versions: [] }
  }

  const [
    { data: families, error: familiesError },
    { data: treatments, error: treatmentsError },
  ] = await Promise.all([
    supabaseAdmin
      .from('global_lens_families')
      .select('id,version_id')
      .in('version_id', versionIds),
    supabaseAdmin
      .from('global_treatments')
      .select('id,version_id')
      .in('version_id', versionIds),
  ])

  if (familiesError) throw familiesError
  if (treatmentsError) throw treatmentsError

  const typedFamilies = (families || []) as GlobalLensFamilyRow[]
  const typedTreatments = (treatments || []) as GlobalTreatmentRow[]

  const familyIds = typedFamilies.map((family) => family.id)

  const { data: offers, error: offersError } = familyIds.length
    ? await supabaseAdmin
        .from('global_lens_offers')
        .select('id,family_id')
        .in('family_id', familyIds)
    : { data: [], error: null }

  if (offersError) throw offersError

  const typedOffers = (offers || []) as Pick<GlobalLensOfferRow, 'id' | 'family_id'>[]

  const familiesByVersion = new Map<string, number>()
  const familyVersionById = new Map<string, string>()

  for (const family of typedFamilies) {
    familyVersionById.set(family.id, family.version_id)
    familiesByVersion.set(family.version_id, (familiesByVersion.get(family.version_id) || 0) + 1)
  }

  const offersByVersion = new Map<string, number>()
  for (const offer of typedOffers) {
    const versionId = familyVersionById.get(offer.family_id)
    if (!versionId) continue
    offersByVersion.set(versionId, (offersByVersion.get(versionId) || 0) + 1)
  }

  const treatmentsByVersion = new Map<string, number>()
  for (const treatment of typedTreatments) {
    treatmentsByVersion.set(
      treatment.version_id,
      (treatmentsByVersion.get(treatment.version_id) || 0) + 1,
    )
  }

  const activationByVersionId = new Map(
    typedActivations.map((activation) => [activation.global_version_id, activation]),
  )

  const versionSummaries: StoreCatalogVersionSummary[] = typedVersions.map((version) => {
    const activation = activationByVersionId.get(version.id)
    return {
      id: version.id,
      laboratorio: version.laboratorio,
      versao: version.versao,
      status: version.status,
      publishedAt: version.published_at,
      createdAt: version.created_at,
      familiesCount: familiesByVersion.get(version.id) || 0,
      offersCount: offersByVersion.get(version.id) || 0,
      treatmentsCount: treatmentsByVersion.get(version.id) || 0,
      activation: activation
        ? {
            id: activation.id,
            status: activation.status,
            activatedAt: activation.activated_at,
            lastSyncedAt: activation.last_synced_at,
          }
        : null,
    }
  })

  const activeActivations = versionSummaries
    .filter((version) => version.activation?.status === 'active')
    .sort(
      (left, right) =>
        new Date(right.activation?.activatedAt || 0).getTime() -
        new Date(left.activation?.activatedAt || 0).getTime(),
    )

  return {
    storeId,
    currentActivation: activeActivations[0] || null,
    activeActivations,
    versions: versionSummaries,
  }
}

export async function getStoreGlobalCatalogOverview(storeId: number): Promise<StoreCatalogOverview> {
  const { supabaseAdmin } = await getViewContext(storeId)
  return getStoreGlobalCatalogOverviewWithAdmin(storeId, supabaseAdmin)
}

/** Leitura operacional do catálogo para uma Torre já pareada com a loja. */
export async function getTowerStoreGlobalCatalogOverview(storeId: number): Promise<StoreCatalogOverview> {
  const access = await authorizeTowerStoreAccess(storeId)
  if (!access.ok) throw new Error(access.message)
  return getStoreGlobalCatalogOverviewWithAdmin(storeId, createAdminClient())
}

export async function activateGlobalCatalogForStore(
  storeId: number,
  versionId: string,
): Promise<GlobalCatalogActionResult> {
  let step = 'iniciando ativacao'
  const debugContext: Record<string, unknown> = { storeId, versionId }

  try {
    step = 'carregando contexto da loja'
    const { store, supabaseAdmin } = await getManageContext(storeId)
    const now = new Date().toISOString()
    debugContext.tenantId = store.tenant_id

    step = 'carregando versao global'
    const { data: rawVersion, error: versionError } = await supabaseAdmin
      .from('global_catalog_versions')
      .select('id,laboratorio')
      .eq('id', versionId)
      .single()

    const version = rawVersion as any

    if (versionError || !version) {
      throw new Error('Versao global nao encontrada.')
    }

    step = 'carregando familias globais'
    const families = await fetchAllRows<Pick<GlobalLensFamilyRow, 'id'>>((from, to) =>
      supabaseAdmin
        .from('global_lens_families')
        .select('id')
        .eq('version_id', versionId)
        .range(from, to),
    )

    const familyIds = families.map((family) => family.id)
    debugContext.familiesCount = familyIds.length

    step = 'carregando ofertas globais'
    const offers = familyIds.length
      ? await fetchAllRows<Pick<GlobalLensOfferRow, 'id' | 'canonical_label' | 'raw_label' | 'features'>>((from, to) =>
          supabaseAdmin
            .from('global_lens_offers')
            .select('id,canonical_label,raw_label,features')
            .in('family_id', familyIds)
            .range(from, to),
        )
      : []

    step = 'carregando tratamentos globais'
    const treatments = await fetchAllRows<Pick<GlobalTreatmentRow, 'id' | 'nome'>>((from, to) =>
      supabaseAdmin
        .from('global_treatments')
        .select('id,nome')
        .eq('version_id', versionId)
        .range(from, to),
    )

    debugContext.offersCount = offers.length
    debugContext.treatmentsCount = treatments.length

    step = 'desativando versoes antigas do mesmo laboratorio'
    const { data: sameLabVersions, error: sameLabVersionsError } = await supabaseAdmin
      .from('global_catalog_versions')
      .select('id')
      .eq('laboratorio', version.laboratorio)

    if (sameLabVersionsError) throw sameLabVersionsError

    const sameLabVersionIds = ((sameLabVersions || []) as Array<Pick<GlobalCatalogVersionRow, 'id'>>).map(
      (row) => row.id,
    )

    if (sameLabVersionIds.length) {
      const { error: deactivateSameLabError } = await (supabaseAdmin.from('tenant_catalog_activations') as any)
        .update({ status: 'inactive' } as any)
        .eq('store_id', storeId)
        .eq('status', 'active')
        .in('global_version_id', sameLabVersionIds)
        .neq('global_version_id', versionId)

      if (deactivateSameLabError) throw deactivateSameLabError
    }

    step = 'gravando ativacao da loja'
    const { data: rawActivation, error: activationError } = await (supabaseAdmin.from('tenant_catalog_activations') as any)
      .upsert(
        {
          tenant_id: store.tenant_id,
          store_id: storeId,
          global_version_id: versionId,
          status: 'active',
          activated_at: now,
          last_synced_at: now,
        } as any,
        { onConflict: 'store_id,global_version_id' },
      )
      .select('id')
      .single()

    const activation = rawActivation as any

    if (activationError || !activation) {
      throw activationError || new Error('Nao foi possivel ativar o catalogo.')
    }

    debugContext.activationId = activation.id

    step = 'carregando ofertas e tratamentos ja sincronizados'
    const [existingOffers, existingTreatments] = await Promise.all([
      fetchAllRows<ExistingTenantOfferRow>((from, to) =>
        (supabaseAdmin.from('tenant_commercial_offers') as any)
          .select('global_offer_id')
          .eq('activation_id', activation.id)
          .range(from, to),
      ),
      fetchAllRows<ExistingTenantTreatmentRow>((from, to) =>
        (supabaseAdmin.from('tenant_commercial_treatments') as any)
          .select('global_treatment_id')
          .eq('activation_id', activation.id)
          .range(from, to),
      ),
    ])

    const existingOfferIds = new Set(existingOffers.map((row) => row.global_offer_id))
    const existingTreatmentIds = new Set(existingTreatments.map((row) => row.global_treatment_id))

    const missingOffers = offers
      .filter((offer) => !existingOfferIds.has(offer.id))
      .map((offer) => ({
        activation_id: activation.id,
        tenant_id: store.tenant_id,
        store_id: storeId,
        global_offer_id: offer.id,
        display_name: offer.canonical_label || offer.raw_label || null,
        price_cost:
          offer.features && typeof offer.features === 'object' && offer.features.cost_price != null
            ? Number(offer.features.cost_price)
            : null,
      }))

    const missingTreatments = treatments
      .filter((treatment) => !existingTreatmentIds.has(treatment.id))
      .map((treatment) => ({
        activation_id: activation.id,
        tenant_id: store.tenant_id,
        store_id: storeId,
        global_treatment_id: treatment.id,
        display_name: treatment.nome || null,
      }))

    debugContext.existingOffersCount = existingOffers.length
    debugContext.existingTreatmentsCount = existingTreatments.length
    debugContext.missingOffersCount = missingOffers.length
    debugContext.missingTreatmentsCount = missingTreatments.length

    if (missingOffers.length) {
      step = 'sincronizando ofertas da loja'
      const { error } = await (supabaseAdmin.from('tenant_commercial_offers') as any)
        .upsert(missingOffers as any, { onConflict: 'activation_id,global_offer_id' })

      if (error) throw error
    }

    const offersWithCost = offers.filter(
      (offer) =>
        offer.features && typeof offer.features === 'object' && offer.features.cost_price != null,
    )

    if (offersWithCost.length) {
      step = 'atualizando custos das ofertas sincronizadas'
      const offerIdsWithCost = offersWithCost.map((offer) => offer.id)
      const offerCostById = new Map(
        offersWithCost.map((offer) => [offer.id, Number(offer.features?.cost_price)]),
      )

      for (const offerIdChunk of chunkValues(offerIdsWithCost)) {
        const { data: tenantOffersToPatch, error: tenantOffersToPatchError } = await (supabaseAdmin.from('tenant_commercial_offers') as any)
          .select('id,global_offer_id,price_cost')
          .eq('activation_id', activation.id)
          .in('global_offer_id', offerIdChunk)

        if (tenantOffersToPatchError) throw tenantOffersToPatchError

        for (const tenantOffer of ((tenantOffersToPatch || []) as TenantOfferCostRow[])) {
          if (tenantOffer.price_cost != null) continue
          const nextCost = offerCostById.get(tenantOffer.global_offer_id)
          if (nextCost == null) continue

          const { error } = await (supabaseAdmin.from('tenant_commercial_offers') as any)
            .update({ price_cost: nextCost } as any)
            .eq('id', tenantOffer.id)

          if (error) throw error
        }
      }
    }

    if (missingTreatments.length) {
      step = 'sincronizando tratamentos da loja'
      const { error } = await (supabaseAdmin.from('tenant_commercial_treatments') as any)
        .upsert(missingTreatments as any, { onConflict: 'activation_id,global_treatment_id' })

      if (error) throw error
    }

    step = 'atualizando metadados finais da ativacao'
    const { error: refreshActivationError } = await (supabaseAdmin.from('tenant_catalog_activations') as any)
      .update({ status: 'active', last_synced_at: now } as any)
      .eq('id', activation.id)

    if (refreshActivationError) throw refreshActivationError

    revalidatePath(`/dashboard/loja/${storeId}/catalogo-global`)
    revalidatePath(`/dashboard/loja/${storeId}/tabela-precos`)
    revalidatePath(`/dashboard/loja/${storeId}/recomendacao-lentes`)
    revalidatePath(`/dashboard/loja/${storeId}/avaliacao`)
    revalidatePath(`/dashboard/loja/${storeId}`)

    console.info('[global-catalog] activation completed', {
      ...debugContext,
      laboratorio: version.laboratorio,
    })

    return {
      success: true,
      message: 'Catalogo global ativado na loja.',
      data: {
        activationId: activation.id,
        offersImported: missingOffers.length,
        treatmentsImported: missingTreatments.length,
      },
    }
  } catch (error) {
    console.error('[global-catalog] activation failed', {
      step,
      ...debugContext,
      error,
    })

    return {
      success: false,
      message: `Erro ao ativar catalogo global (${step}): ${formatActionError(
        error,
        'falha nao identificada.',
      )}`,
    }
  }
}

export async function deactivateGlobalCatalogForStore(
  storeId: number,
  versionId: string,
): Promise<GlobalCatalogActionResult> {
  try {
    const { supabaseAdmin } = await getManageContext(storeId)
    const now = new Date().toISOString()

    const { data: rawDeactivation, error: activationError } = await (supabaseAdmin.from('tenant_catalog_activations') as any)
      .select('id,status')
      .eq('store_id', storeId)
      .eq('global_version_id', versionId)
      .single()

    const activation = rawDeactivation as any

    if (activationError || !activation) {
      throw activationError || new Error('Ativacao nao encontrada.')
    }

    if (activation.status !== 'active') {
      return { success: true, message: 'Catalogo ja esta desativado.' }
    }

    const { error: updateError } = await (supabaseAdmin.from('tenant_catalog_activations') as any)
      .update({ status: 'inactive', last_synced_at: now } as any)
      .eq('id', activation.id)

    if (updateError) throw updateError

    revalidatePath(`/dashboard/loja/${storeId}/catalogo-global`)
    revalidatePath(`/dashboard/loja/${storeId}/tabela-precos`)
    revalidatePath(`/dashboard/loja/${storeId}/recomendacao-lentes`)
    revalidatePath(`/dashboard/loja/${storeId}/avaliacao`)
    revalidatePath(`/dashboard/loja/${storeId}`)

    return { success: true, message: 'Catalogo global desativado na loja.' }
  } catch (error) {
    return {
      success: false,
      message: formatActionError(error, 'Erro ao desativar catalogo global.'),
    }
  }
}
