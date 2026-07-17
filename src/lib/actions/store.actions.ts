'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'
import { Database, Json } from '@/lib/database.types'
import { createClient } from '@/lib/supabase/server'
import { syncStoreFiscalData } from './fiscal.actions'
import { StoreSettings } from '@/lib/store-modules'

const StoreProfileSchema = z.object({
    id: z.coerce.number(),
    name: z.string().min(2, "Nome Fantasia é obrigatório"),
    razao_social: z.string().optional().nullable(),
    cnpj: z.string().optional().nullable(),
    inscricao_estadual: z.string().optional().nullable(),
    whatsapp: z.string().optional().nullable(),
    phone: z.string().optional().nullable(),
    email: z.string().email().optional().or(z.literal('')).nullable(),
    website: z.string().optional().nullable(),
    cep: z.string().optional().nullable(),
    street: z.string().optional().nullable(),
    number: z.string().optional().nullable(),
    neighborhood: z.string().optional().nullable(),
    city: z.string().optional().nullable(),
    state: z.string().length(2).optional().or(z.literal('')).nullable(),
    pix_key: z.string().optional().nullable(),
    pix_city: z.string().optional().nullable(),
    csc_homologacao: z.string().optional().nullable(),
    csc_id_homologacao: z.string().optional().nullable(),
    csc_producao: z.string().optional().nullable(),
    csc_id_producao: z.string().optional().nullable(),
    nfce_serie: z.coerce.number().int().min(1).max(999).optional().nullable(),
    nfe_serie: z.coerce.number().int().min(1).max(999).optional().nullable(),
    codigo_municipio_ibge: z.string()
        .refine(value => !value || /^\d{7}$/.test(value), "Codigo IBGE deve ter 7 digitos")
        .optional()
        .nullable(),
    regime_tributario: z.string().optional().nullable(),
})

export type StoreActionResult = {
    success: boolean
    message: string
}

type ProfileRow = Database['public']['Tables']['profiles']['Row']
type StoreRow = Database['public']['Tables']['stores']['Row']
type StoreUpdatePayload = Database['public']['Tables']['stores']['Update']
type StorePublicRow = Pick<StoreRow, 'name' | 'tenant_id' | 'settings'>
type TenantRow = { name: string | null }
type QueryError = { message: string }
type SingleResult<T> = Promise<{ data: T | null; error: QueryError | null }>
type StoreSelectBuilder<T> = {
    eq: (column: string, value: number) => {
        single: () => SingleResult<T>
    }
}
type StoreTableApi = {
    select: (columns: string) => StoreSelectBuilder<StoreRow> & StoreSelectBuilder<StorePublicRow>
    update: (values: StoreUpdatePayload) => {
        eq: (column: string, value: number) => Promise<{ error: QueryError | null }>
    }
}
type TenantTableApi = {
    select: (columns: string) => {
        eq: (column: string, value: string) => {
            single: () => SingleResult<TenantRow>
        }
    }
}

function toErrorMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback
}

function onlyDigits(value: FormDataEntryValue | null) {
    return String(value ?? '').replace(/\D/g, '')
}

function normalizeTextValue(value: FormDataEntryValue | null) {
    const normalized = String(value ?? '').trim()
    return normalized || null
}

export async function getStoreProfile(storeId: number): Promise<StoreRow | null> {
    const storesTable = createAdminClient().from('stores') as unknown as StoreTableApi

    try {
        const { data } = await storesTable
            .select('*')
            .eq('id', storeId)
            .single()

        return data
    } catch {
        return null
    }
}

export async function updateStoreProfile(
    _prevState: StoreActionResult | null,
    formData: FormData
): Promise<StoreActionResult> {
    const supabase = createClient()
    const {
        data: { user }
    } = await supabase.auth.getUser()

    if (!user) {
        return { success: false, message: 'Sem permissão.' }
    }

    const profile = await getProfileByAdmin(user.id) as ProfileRow | null
    if (!profile) {
        return { success: false, message: 'Perfil não encontrado.' }
    }

    const storeId = parseInt(formData.get('id') as string, 10)
    if (profile.role !== 'admin' && profile.store_id !== storeId) {
        return { success: false, message: 'Acesso negado.' }
    }

    const rawData = {
        id: formData.get('id'),
        name: normalizeTextValue(formData.get('name')),
        razao_social: normalizeTextValue(formData.get('razao_social')),
        cnpj: onlyDigits(formData.get('cnpj')),
        inscricao_estadual: onlyDigits(formData.get('inscricao_estadual')),
        whatsapp: normalizeTextValue(formData.get('whatsapp')),
        phone: normalizeTextValue(formData.get('phone')),
        email: normalizeTextValue(formData.get('email')),
        website: normalizeTextValue(formData.get('website')),
        cep: onlyDigits(formData.get('cep')),
        street: normalizeTextValue(formData.get('street')),
        number: normalizeTextValue(formData.get('number')),
        neighborhood: normalizeTextValue(formData.get('neighborhood')),
        city: normalizeTextValue(formData.get('city')),
        state: String(formData.get('state') ?? '').trim().toUpperCase(),
        pix_key: normalizeTextValue(formData.get('pix_key')),
        pix_city: normalizeTextValue(formData.get('pix_city')),
        csc_homologacao: normalizeTextValue(formData.get('csc_homologacao')),
        csc_id_homologacao: normalizeTextValue(formData.get('csc_id_homologacao')),
        csc_producao: normalizeTextValue(formData.get('csc_producao')),
        csc_id_producao: normalizeTextValue(formData.get('csc_id_producao')),
        nfce_serie: formData.get('nfce_serie'),
        nfe_serie: formData.get('nfe_serie'),
        codigo_municipio_ibge: onlyDigits(formData.get('codigo_municipio_ibge')),
        regime_tributario: normalizeTextValue(formData.get('regime_tributario')),
    }
    const validated = StoreProfileSchema.safeParse(rawData)
    if (!validated.success) {
        return { success: false, message: 'Dados inválidos. Verifique os campos.' }
    }

    const { id, ...validatedData } = validated.data
    const updateData: StoreUpdatePayload = { ...validatedData }
    const storesTable = createAdminClient().from('stores') as unknown as StoreTableApi

    try {
        const currentStore = await getStoreProfile(id)
        if (!currentStore) {
            return { success: false, message: 'Loja nao encontrada.' }
        }
        const currentSettings = ((currentStore?.settings || {}) as StoreSettings | Json) as StoreSettings
        const certFile = formData.get('certificate_file')
        const certificateFile = certFile instanceof File && certFile.size > 0 ? certFile : null
        const certificatePasswordRaw = formData.get('certificate_password')
        const certificatePassword = typeof certificatePasswordRaw === 'string' && certificatePasswordRaw.trim()
            ? certificatePasswordRaw
            : null

        if (updateData.cnpj) {
            const syncResult = await syncStoreFiscalData(
                { ...currentStore, ...updateData, cnpj: updateData.cnpj },
                certificateFile,
                certificatePassword
            )

            if (!syncResult.success) {
                const errors = syncResult.results
                    .filter((result: { success: boolean }) => !result.success)
                    .map((result: { env?: string, error?: string }) =>
                        `${result.env ? `${result.env}: ` : ''}${result.error || 'falha desconhecida'}`
                    )
                console.error('Erro na sincronizacao fiscal:', syncResult.results)
                return {
                    success: false,
                    message: `A loja nao foi salva porque a sincronizacao fiscal falhou. ${errors.join(' | ')}`
                }
            }

            if (syncResult.thumbprint) {
                updateData.certificate_thumbprint = syncResult.thumbprint
                updateData.certificate_valid_until = syncResult.valid_until
            } else if (!syncResult.success) {
                console.error('Erro na sincronização fiscal:', syncResult.results)
            }
        }

        updateData.settings = currentSettings

        const { error: updateError } = await storesTable
            .update(updateData)
            .eq('id', id)
        if (updateError) {
            throw new Error(updateError.message)
        }

        revalidatePath(`/dashboard/loja/${id}/config`)
        revalidatePath(`/dashboard/loja/${id}`)
        revalidatePath(`/dashboard/loja/${id}`, 'layout')
        revalidatePath(`/dashboard/loja/${id}/avaliacao`)
        return { success: true, message: 'Dados da loja atualizados!' }
    } catch (error: unknown) {
        return { success: false, message: toErrorMessage(error, 'Erro ao atualizar loja.') }
    }
}

export async function getStorePublicProfile(storeId: number) {
    const storesTable = createAdminClient().from('stores') as unknown as StoreTableApi

    try {
        const { data } = await storesTable
            .select('name, tenant_id, settings')
            .eq('id', storeId)
            .single()

        if (!data) return null

        const settings = (data.settings || null) as StoreSettings | null
        const logoUrl = settings?.logo ? `/logos/${settings.logo}` : null
        return { name: data.name, tenant_id: data.tenant_id, logo_url: logoUrl }
    } catch {
        return null
    }
}

export async function getTenantName(tenantId: string) {
    const tenantsTable = createAdminClient().from('tenants') as unknown as TenantTableApi

    try {
        const { data } = await tenantsTable
            .select('name')
            .eq('id', tenantId)
            .single()

        return data?.name || null
    } catch {
        return null
    }
}

export async function updateStoreSettings(storeId: number, newSettings: Partial<StoreSettings>): Promise<StoreActionResult> {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return { success: false, message: 'Sem permissão.' }
    }

    const profile = await getProfileByAdmin(user.id) as ProfileRow | null
    if (!profile) {
        return { success: false, message: 'Perfil não encontrado.' }
    }

    if (profile.role !== 'admin' && profile.store_id !== storeId) {
        return { success: false, message: 'Acesso negado.' }
    }

    const storesTable = createAdminClient().from('stores') as unknown as StoreTableApi

    try {
        const currentStore = await getStoreProfile(storeId)
        if (!currentStore) {
            return { success: false, message: 'Loja não encontrada.' }
        }

        const currentSettings = ((currentStore.settings || {}) as StoreSettings | Json) as StoreSettings
        
        const updatedSettings = {
            ...currentSettings,
            ...newSettings
        }

        await storesTable
            .update({ settings: updatedSettings as Json })
            .eq('id', storeId)

        revalidatePath(`/dashboard/loja/${storeId}/config`)
        revalidatePath(`/dashboard/loja/${storeId}`)
        revalidatePath(`/dashboard/loja/${storeId}/vendas`, 'layout')
        return { success: true, message: 'Recursos atualizados!' }
    } catch (error: unknown) {
        return { success: false, message: toErrorMessage(error, 'Erro ao atualizar recursos.') }
    }
}

import {
    AiSuggestionConfig, AiConfigCatalogInfo, AiConfigBrandsByCategory, AiLabPreference,
    AI_SUGGESTION_CONFIG_DEFAULTS, CLINICAL_CATEGORY_LABELS, AiStoreProfileLevel, AiStoreInvestmentProfile
} from '@/lib/types/ai-config.types'

// ================================================================
// AI SUGGESTION CONFIG
// ================================================================

type ActiveCatalogActivationRow = {
    global_version_id: string | null
}

type ActiveCatalogVersionRow = {
    id: string | null
    laboratorio: string | null
}

type AiCatalogActivationRow = {
    id: number | string
    global_version_id: string | null
}

type AiCatalogVersionInfoRow = {
    id: string
    laboratorio: string
    versao: string
}

type AiTenantOfferRow = {
    global_offer_id: string | null
}

type AiLensOfferRow = {
    family_id: string | null
    clinical_category: string | null
    raw_label: string | null
    canonical_label: string | null
}

type AiLensFamilyRow = {
    id: string
    nome: string
    clinical_category: string | null
}

function resolveConfigBrandLabel(family: AiLensFamilyRow, offer: AiLensOfferRow): string {
    if (family.clinical_category !== 'mista') return family.nome

    const descriptor = `${offer.raw_label || ''} ${offer.canonical_label || ''}`
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()

    if (descriptor.includes('stellest')) return 'Stellest'
    if (descriptor.includes('miyosmart')) return 'MiYOSMART'
    if (descriptor.includes('miokids')) return 'MioKids'
    if (descriptor.includes('eyezen kids')) return 'Eyezen Kids'
    if (descriptor.includes('airwear') && descriptor.includes('kids')) return 'Airwear Kids'

    return family.nome
}

async function getActiveCatalogLabPreferences(storeId: number): Promise<AiLabPreference[]> {
    const supabaseAdmin = createAdminClient()

    const { data: activations } = await supabaseAdmin
        .from('tenant_catalog_activations')
        .select('global_version_id')
        .eq('store_id', storeId)
        .eq('status', 'active')

    const activeActivations = (activations || []) as ActiveCatalogActivationRow[]
    const versionIds = [
        ...new Set(
            activeActivations
                .map((activation) => activation.global_version_id)
                .filter((versionId): versionId is string => Boolean(versionId)),
        ),
    ]
    if (!versionIds.length) return []

    const { data: versions } = await supabaseAdmin
        .from('global_catalog_versions')
        .select('id,laboratorio')
        .in('id', versionIds)

    const activeVersions = (versions || []) as ActiveCatalogVersionRow[]

    return activeVersions
        .filter((version): version is { id: string; laboratorio: string } =>
            Boolean(version.id && version.laboratorio),
        )
        .map((version) => ({
            versionId: version.id,
            laboratorio: version.laboratorio,
            weight: 3,
        }))
}

function syncLabPreferencesWithActiveCatalogs(
    savedPreferences: AiLabPreference[] = [],
    activeCatalogs: AiLabPreference[] = [],
): AiLabPreference[] {
    if (!activeCatalogs.length) return savedPreferences

    return activeCatalogs.map((activeCatalog) => {
        const savedByVersion = savedPreferences.find((pref) => pref.versionId === activeCatalog.versionId)
        const savedByLab = savedPreferences.find(
            (pref) => pref.laboratorio?.toLowerCase() === activeCatalog.laboratorio.toLowerCase(),
        )
        const saved = savedByVersion || savedByLab

        return {
            versionId: activeCatalog.versionId,
            laboratorio: activeCatalog.laboratorio,
            weight: saved?.weight ?? 3,
        }
    })
}

async function fetchTenantOfferRowsByActivationIds(
    activationIds: Array<number | string>,
): Promise<AiTenantOfferRow[]> {
    if (!activationIds.length) return []

    const supabaseAdmin = createAdminClient()
    const pageSize = 1000
    const rows: AiTenantOfferRow[] = []

    for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabaseAdmin
            .from('tenant_commercial_offers')
            .select('global_offer_id')
            .in('activation_id', activationIds)
            .range(from, from + pageSize - 1)

        if (error) throw new Error(error.message)

        const page = (data || []) as AiTenantOfferRow[]
        rows.push(...page)

        if (page.length < pageSize) break
    }

    return rows
}

export async function getAiSuggestionConfig(storeId: number): Promise<AiSuggestionConfig> {
    const store = await getStoreProfile(storeId)
    if (!store) return { ...AI_SUGGESTION_CONFIG_DEFAULTS }

    const settings = (store.settings || {}) as StoreSettings
    const saved = settings.ai_suggestion_config as AiSuggestionConfig | undefined
    const activeCatalogPreferences = await getActiveCatalogLabPreferences(storeId)

    const legacyProfile = saved?.store_profile as Record<string, unknown> | undefined
    const legacySensitivity = legacyProfile?.price_sensitivity as AiStoreProfileLevel | undefined
    const legacyPremium = legacyProfile?.premium_preference as AiStoreProfileLevel | undefined

    let investmentProfile: AiStoreInvestmentProfile = AI_SUGGESTION_CONFIG_DEFAULTS.store_profile.investment_profile
    if (legacySensitivity || legacyPremium) {
        if (legacySensitivity === 'alto') investmentProfile = 'economico'
        if (legacyPremium === 'alto') investmentProfile = 'premium'
        if (legacySensitivity === 'baixo' && legacyPremium === 'baixo') investmentProfile = 'equilibrado'
    }

    return {
        lab_preferences: syncLabPreferencesWithActiveCatalogs(saved?.lab_preferences, activeCatalogPreferences),
        store_profile: {
            investment_profile: (legacyProfile?.investment_profile as AiStoreInvestmentProfile) || investmentProfile,
            tech_adoption: (legacyProfile?.tech_adoption as AiStoreProfileLevel) || 'medio',
            aesthetic_priority: (legacyProfile?.aesthetic_priority as AiStoreProfileLevel) || 'medio',
        },
        category_brand_preferences: saved?.category_brand_preferences ?? {},
    }
}

export async function saveAiSuggestionConfig(
    storeId: number,
    config: AiSuggestionConfig
): Promise<StoreActionResult> {
    const clampWeight = (w: number) => Math.max(0, Math.min(5, Math.round(w)))
    const validLevels: AiStoreProfileLevel[] = ['baixo', 'medio', 'alto']
    const clampLevel = (v: string): AiStoreProfileLevel =>
        validLevels.includes(v as AiStoreProfileLevel) ? v as AiStoreProfileLevel : 'medio'
    const validInvestment: AiStoreInvestmentProfile[] = ['economico', 'equilibrado', 'premium']
    const clampInvestment = (v: string): AiStoreInvestmentProfile =>
        validInvestment.includes(v as AiStoreInvestmentProfile) ? v as AiStoreInvestmentProfile : 'equilibrado'

    const sanitized: AiSuggestionConfig = {
        lab_preferences: (config.lab_preferences || []).map(lp => ({
            versionId: lp.versionId,
            laboratorio: lp.laboratorio,
            weight: clampWeight(lp.weight),
        })),
        store_profile: {
            investment_profile: clampInvestment(config.store_profile?.investment_profile || 'equilibrado'),
            tech_adoption: clampLevel(config.store_profile?.tech_adoption || 'medio'),
            aesthetic_priority: clampLevel(config.store_profile?.aesthetic_priority || 'medio'),
        },
        category_brand_preferences: Object.fromEntries(
            Object.entries(config.category_brand_preferences || {}).map(([cat, brands]) => [
                cat,
                (brands || []).map(b => ({ brand: b.brand, weight: clampWeight(b.weight) })),
            ])
        ),
    }

    return updateStoreSettings(storeId, { ai_suggestion_config: sanitized as unknown as Json })
}

export async function getAiConfigCatalogData(storeId: number): Promise<{
    catalogs: AiConfigCatalogInfo[]
    brandsByCategory: AiConfigBrandsByCategory[]
}> {
    const supabaseAdmin = createAdminClient()

    const { data: activations } = await supabaseAdmin
        .from('tenant_catalog_activations')
        .select('id,global_version_id')
        .eq('store_id', storeId)
        .eq('status', 'active')

    const activeActivations = (activations || []) as AiCatalogActivationRow[]
    if (!activeActivations.length) return { catalogs: [], brandsByCategory: [] }

    const versionIds = [
        ...new Set(
            activeActivations
                .map((activation) => activation.global_version_id)
                .filter((versionId): versionId is string => Boolean(versionId)),
        ),
    ]
    const { data: versions } = await supabaseAdmin
        .from('global_catalog_versions')
        .select('id,laboratorio,versao')
        .in('id', versionIds)

    const catalogVersions = (versions || []) as AiCatalogVersionInfoRow[]
    const catalogs: AiConfigCatalogInfo[] = catalogVersions.map((version) => ({
        versionId: version.id,
        laboratorio: version.laboratorio,
        versao: version.versao,
    }))

    const activationIds = activeActivations.map((activation) => activation.id)
    const activeTenantOffers = await fetchTenantOfferRowsByActivationIds(activationIds)
    const globalOfferIds = [
        ...new Set(
            activeTenantOffers
                .map((offer) => offer.global_offer_id)
                .filter((offerId): offerId is string => Boolean(offerId)),
        ),
    ]
    if (!globalOfferIds.length) return { catalogs, brandsByCategory: [] }

    const CHUNK = 150
    const allOffers: AiLensOfferRow[] = []
    for (let i = 0; i < globalOfferIds.length; i += CHUNK) {
        const chunk = globalOfferIds.slice(i, i + CHUNK)
        const { data } = await supabaseAdmin
            .from('global_lens_offers')
            .select('family_id,clinical_category,raw_label,canonical_label')
            .in('id', chunk)
        allOffers.push(...((data || []) as AiLensOfferRow[]))
    }

    const familyIds = [
        ...new Set(
            allOffers
                .map((offer) => offer.family_id)
                .filter((familyId): familyId is string => Boolean(familyId)),
        ),
    ]
    const allFamilies: AiLensFamilyRow[] = []
    for (let i = 0; i < familyIds.length; i += CHUNK) {
        const chunk = familyIds.slice(i, i + CHUNK)
        const { data } = await supabaseAdmin
            .from('global_lens_families')
            .select('id,nome,clinical_category')
            .in('id', chunk)
        allFamilies.push(...((data || []) as AiLensFamilyRow[]))
    }

    const familyById = new Map(allFamilies.map((family) => [family.id, family]))
    const brandsByCat = new Map<string, Set<string>>()

    for (const offer of allOffers) {
        if (!offer.family_id) continue
        const family = familyById.get(offer.family_id)
        if (!family) continue

        const effectiveCategory = offer.clinical_category !== 'indefinida'
            ? offer.clinical_category
            : family.clinical_category !== 'mista'
                ? family.clinical_category
                : null

        if (!effectiveCategory || effectiveCategory === 'mista' || effectiveCategory === 'indefinida') continue

        if (!brandsByCat.has(effectiveCategory)) {
            brandsByCat.set(effectiveCategory, new Set())
        }
        brandsByCat.get(effectiveCategory)!.add(resolveConfigBrandLabel(family, offer))
    }

    const targetCategories = ['multifocal', 'ocupacional', 'controle_miopia', 'visao_simples', 'bifocal', 'plana_solar']
    const brandsByCategory: AiConfigBrandsByCategory[] = targetCategories
        .filter(cat => brandsByCat.has(cat))
        .map(cat => ({
            category: cat,
            categoryLabel: CLINICAL_CATEGORY_LABELS[cat] || cat,
            brands: Array.from(brandsByCat.get(cat)!).sort(),
        }))

    return { catalogs, brandsByCategory }
}

export async function saveStoreHoursConfig(
    storeId: number,
    config: any
): Promise<StoreActionResult> {
    return updateStoreSettings(storeId, { store_hours: config })
}
