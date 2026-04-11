'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

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

  const profile = (await getProfileByAdmin(user.id)) as any
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
    supabaseAdmin: createAdminClient() as any,
  }
}

async function getManageContext(storeId: number) {
  const context = await getViewContext(storeId)
  const canManage = context.profile.role === 'admin' || context.profile.role === 'manager'

  if (!canManage) {
    throw new Error('Acesso negado.')
  }

  return context
}

export async function getStoreGlobalCatalogOverview(storeId: number): Promise<StoreCatalogOverview> {
  const { supabaseAdmin } = await getViewContext(storeId)

  const [
    { data: versions, error: versionsError },
    { data: activations, error: activationsError },
  ] = await Promise.all([
    supabaseAdmin
      .from('global_catalog_versions')
      .select('id,laboratorio,versao,status,published_at,created_at')
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('tenant_catalog_activations')
      .select('id,global_version_id,status,activated_at,last_synced_at')
      .eq('store_id', storeId)
      .order('activated_at', { ascending: false }),
  ])

  if (versionsError) throw versionsError
  if (activationsError) throw activationsError

  const versionIds = (versions || []).map((version: any) => version.id)
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

  const familyIds = (families || []).map((family: any) => family.id)

  const { data: offers, error: offersError } = familyIds.length
    ? await supabaseAdmin
        .from('global_lens_offers')
        .select('id,family_id')
        .in('family_id', familyIds)
    : { data: [], error: null }

  if (offersError) throw offersError

  const familiesByVersion = new Map<string, number>()
  const familyVersionById = new Map<string, string>()

  for (const family of families || []) {
    familyVersionById.set(family.id, family.version_id)
    familiesByVersion.set(family.version_id, (familiesByVersion.get(family.version_id) || 0) + 1)
  }

  const offersByVersion = new Map<string, number>()
  for (const offer of offers || []) {
    const versionId = familyVersionById.get(offer.family_id)
    if (!versionId) continue
    offersByVersion.set(versionId, (offersByVersion.get(versionId) || 0) + 1)
  }

  const treatmentsByVersion = new Map<string, number>()
  for (const treatment of treatments || []) {
    treatmentsByVersion.set(
      treatment.version_id,
      (treatmentsByVersion.get(treatment.version_id) || 0) + 1,
    )
  }

  const activationByVersionId = new Map(
    (activations || []).map((activation: any) => [activation.global_version_id, activation]),
  )

  const versionSummaries: StoreCatalogVersionSummary[] = (versions || []).map((version: any) => {
    const activation = activationByVersionId.get(version.id) as any
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

export async function activateGlobalCatalogForStore(
  storeId: number,
  versionId: string,
): Promise<GlobalCatalogActionResult> {
  try {
    const { profile, supabaseAdmin } = await getManageContext(storeId)
    const now = new Date().toISOString()

    const { data: version, error: versionError } = await supabaseAdmin
      .from('global_catalog_versions')
      .select('id,laboratorio')
      .eq('id', versionId)
      .single()

    if (versionError || !version) {
      throw new Error('Versao global nao encontrada.')
    }

    const { data: families, error: familiesError } = await supabaseAdmin
      .from('global_lens_families')
      .select('id')
      .eq('version_id', versionId)

    if (familiesError) throw familiesError

    const familyIds = (families || []).map((family: any) => family.id)

    const [
      { data: offers, error: offersError },
      { data: treatments, error: treatmentsError },
    ] = await Promise.all([
      familyIds.length
        ? supabaseAdmin
            .from('global_lens_offers')
            .select('id,canonical_label,raw_label,features')
            .in('family_id', familyIds)
        : Promise.resolve({ data: [] as any[], error: null }),
      supabaseAdmin.from('global_treatments').select('id,nome').eq('version_id', versionId),
    ])

    if (offersError) throw offersError
    if (treatmentsError) throw treatmentsError

    const { data: sameLabVersions, error: sameLabVersionsError } = await supabaseAdmin
      .from('global_catalog_versions')
      .select('id')
      .eq('laboratorio', version.laboratorio)

    if (sameLabVersionsError) throw sameLabVersionsError

    const sameLabVersionIds = (sameLabVersions || []).map((row: any) => row.id)

    if (sameLabVersionIds.length) {
      const { error: deactivateSameLabError } = await supabaseAdmin
        .from('tenant_catalog_activations')
        .update({ status: 'inactive' })
        .eq('store_id', storeId)
        .eq('status', 'active')
        .in('global_version_id', sameLabVersionIds)
        .neq('global_version_id', versionId)

      if (deactivateSameLabError) throw deactivateSameLabError
    }

    const { data: activation, error: activationError } = await supabaseAdmin
      .from('tenant_catalog_activations')
      .upsert(
        {
          tenant_id: profile.tenant_id,
          store_id: storeId,
          global_version_id: versionId,
          status: 'active',
          activated_at: now,
          last_synced_at: now,
        },
        { onConflict: 'store_id,global_version_id' },
      )
      .select('id')
      .single()

    if (activationError || !activation) {
      throw activationError || new Error('Nao foi possivel ativar o catalogo.')
    }

    const [
      { data: existingOffers, error: existingOffersError },
      { data: existingTreatments, error: existingTreatmentsError },
    ] = await Promise.all([
      supabaseAdmin
        .from('tenant_commercial_offers')
        .select('global_offer_id')
        .eq('activation_id', activation.id),
      supabaseAdmin
        .from('tenant_commercial_treatments')
        .select('global_treatment_id')
        .eq('activation_id', activation.id),
    ])

    if (existingOffersError) throw existingOffersError
    if (existingTreatmentsError) throw existingTreatmentsError

    const existingOfferIds = new Set((existingOffers || []).map((row: any) => row.global_offer_id))
    const existingTreatmentIds = new Set(
      (existingTreatments || []).map((row: any) => row.global_treatment_id),
    )

    const missingOffers = (offers || [])
      .filter((offer: any) => !existingOfferIds.has(offer.id))
      .map((offer: any) => ({
        activation_id: activation.id,
        tenant_id: profile.tenant_id,
        store_id: storeId,
        global_offer_id: offer.id,
        display_name: offer.canonical_label || offer.raw_label || null,
        price_cost:
          offer.features && typeof offer.features === 'object' && offer.features.cost_price != null
            ? Number(offer.features.cost_price)
            : null,
      }))

    const missingTreatments = (treatments || [])
      .filter((treatment: any) => !existingTreatmentIds.has(treatment.id))
      .map((treatment: any) => ({
        activation_id: activation.id,
        tenant_id: profile.tenant_id,
        store_id: storeId,
        global_treatment_id: treatment.id,
        display_name: treatment.nome || null,
      }))

    if (missingOffers.length) {
      const { error } = await supabaseAdmin
        .from('tenant_commercial_offers')
        .upsert(missingOffers, { onConflict: 'activation_id,global_offer_id' })

      if (error) throw error
    }

    const offersWithCost = (offers || []).filter(
      (offer: any) =>
        offer.features && typeof offer.features === 'object' && offer.features.cost_price != null,
    )

    if (offersWithCost.length) {
      const offerIdsWithCost = offersWithCost.map((offer: any) => offer.id)
      const offerCostById = new Map(
        offersWithCost.map((offer: any) => [offer.id, Number(offer.features.cost_price)]),
      )

      const { data: tenantOffersToPatch, error: tenantOffersToPatchError } = await supabaseAdmin
        .from('tenant_commercial_offers')
        .select('id,global_offer_id,price_cost')
        .eq('activation_id', activation.id)
        .in('global_offer_id', offerIdsWithCost)

      if (tenantOffersToPatchError) throw tenantOffersToPatchError

      for (const tenantOffer of tenantOffersToPatch || []) {
        if (tenantOffer.price_cost != null) continue
        const nextCost = offerCostById.get(tenantOffer.global_offer_id)
        if (nextCost == null) continue

        const { error } = await supabaseAdmin
          .from('tenant_commercial_offers')
          .update({ price_cost: nextCost })
          .eq('id', tenantOffer.id)

        if (error) throw error
      }
    }

    if (missingTreatments.length) {
      const { error } = await supabaseAdmin
        .from('tenant_commercial_treatments')
        .upsert(missingTreatments, { onConflict: 'activation_id,global_treatment_id' })

      if (error) throw error
    }

    const { error: refreshActivationError } = await supabaseAdmin
      .from('tenant_catalog_activations')
      .update({ status: 'active', last_synced_at: now })
      .eq('id', activation.id)

    if (refreshActivationError) throw refreshActivationError

    revalidatePath(`/dashboard/loja/${storeId}/catalogo-global`)
    revalidatePath(`/dashboard/loja/${storeId}/tabela-precos`)
    revalidatePath(`/dashboard/loja/${storeId}/recomendacao-lentes`)
    revalidatePath(`/dashboard/loja/${storeId}/avaliacao`)
    revalidatePath(`/dashboard/loja/${storeId}`)

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
    return {
      success: false,
      message: formatActionError(error, 'Erro ao ativar catalogo global.'),
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

    const { data: activation, error: activationError } = await supabaseAdmin
      .from('tenant_catalog_activations')
      .select('id,status')
      .eq('store_id', storeId)
      .eq('global_version_id', versionId)
      .single()

    if (activationError || !activation) {
      throw activationError || new Error('Ativacao nao encontrada.')
    }

    if (activation.status !== 'active') {
      return { success: true, message: 'Catalogo ja esta desativado.' }
    }

    const { error: updateError } = await supabaseAdmin
      .from('tenant_catalog_activations')
      .update({ status: 'inactive', last_synced_at: now })
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
