'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'
import { Database, Json } from '@/lib/database.types'
import { createClient } from '@/lib/supabase/server'
import { syncStoreFiscalData } from './fiscal.actions'

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
type StoreSettings = {
    logo?: string
    pre_sale_analysis_enabled?: boolean
    [key: string]: Json | undefined
}
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
        name: formData.get('name'),
        razao_social: formData.get('razao_social'),
        cnpj: formData.get('cnpj'),
        inscricao_estadual: formData.get('inscricao_estadual'),
        whatsapp: formData.get('whatsapp'),
        phone: formData.get('phone'),
        email: formData.get('email'),
        website: formData.get('website'),
        cep: formData.get('cep'),
        street: formData.get('street'),
        number: formData.get('number'),
        neighborhood: formData.get('neighborhood'),
        city: formData.get('city'),
        state: formData.get('state'),
        pix_key: formData.get('pix_key'),
        pix_city: formData.get('pix_city'),
        csc_homologacao: formData.get('csc_homologacao'),
        csc_id_homologacao: formData.get('csc_id_homologacao'),
        csc_producao: formData.get('csc_producao'),
        csc_id_producao: formData.get('csc_id_producao'),
    }
    const preSaleAnalysisEnabled = formData.get('pre_sale_analysis_enabled') === 'on'

    const validated = StoreProfileSchema.safeParse(rawData)
    if (!validated.success) {
        return { success: false, message: 'Dados inválidos. Verifique os campos.' }
    }

    const { id, ...validatedData } = validated.data
    const updateData: StoreUpdatePayload = { ...validatedData }
    const storesTable = createAdminClient().from('stores') as unknown as StoreTableApi

    try {
        const currentStore = await getStoreProfile(id)
        const currentSettings = ((currentStore?.settings || {}) as StoreSettings | Json) as StoreSettings
        const certFile = formData.get('certificate_file')
        const certificateFile = certFile instanceof File && certFile.size > 0 ? certFile : null
        const certificatePasswordRaw = formData.get('certificate_password')
        const certificatePassword = typeof certificatePasswordRaw === 'string' && certificatePasswordRaw.trim()
            ? certificatePasswordRaw
            : null

        if (updateData.cnpj) {
            const syncResult = await syncStoreFiscalData(
                { ...updateData, cnpj: updateData.cnpj },
                certificateFile,
                certificatePassword
            )

            if (syncResult.success && syncResult.thumbprint) {
                updateData.certificate_thumbprint = syncResult.thumbprint
                updateData.certificate_valid_until = syncResult.valid_until
            } else if (!syncResult.success) {
                console.error('Erro na sincronização fiscal:', syncResult.results)
            }
        }

        updateData.settings = {
            ...currentSettings,
            pre_sale_analysis_enabled: preSaleAnalysisEnabled
        }

        await storesTable
            .update(updateData)
            .eq('id', id)

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
