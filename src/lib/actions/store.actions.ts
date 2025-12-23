'use server'

import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

// Schema de Validação
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

    // Pix
    pix_key: z.string().optional().nullable(),
    pix_city: z.string().optional().nullable(),
})

export type StoreActionResult = {
    success: boolean
    message: string
}

export async function getStoreProfile(storeId: number) {
    const supabaseAdmin = createAdminClient()
    try {
        // CORREÇÃO: Cast 'as any' para ler colunas novas
        const { data } = await (supabaseAdmin.from('stores') as any)
            .select('*')
            .eq('id', storeId)
            .single()
        return data
    } catch (e) {
        return null
    }
}

export async function updateStoreProfile(prevState: any, formData: FormData): Promise<StoreActionResult> {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { success: false, message: 'Sem permissão.' }
    const profile = await getProfileByAdmin(user.id) as any

    // Segurança: Apenas Admin ou Gerente da própria loja
    const storeId = parseInt(formData.get('id') as string)
    if (profile.role !== 'admin' && profile.store_id !== storeId) {
        return { success: false, message: 'Acesso negado.' }
    }

    const rawData = {
        id: formData.get('id'),
        name: formData.get('name'),
        razao_social: formData.get('razao_social'),
        cnpj: formData.get('cnpj'),
        inscricao_estadual: formData.get('inscricao_estadual'),
        whatsapp: formData.get('whatsapp'), // <--- CAMPO NOVO
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
    }

    const validated = StoreProfileSchema.safeParse(rawData)

    if (!validated.success) {
        return { success: false, message: 'Dados inválidos. Verifique os campos.' }
    }

    const { id, ...updateData } = validated.data
    const supabaseAdmin = createAdminClient()

    try {
        // CORREÇÃO: Cast 'as any' para update nas colunas novas
        await (supabaseAdmin.from('stores') as any)
            .update(updateData)
            .eq('id', id)

        revalidatePath(`/dashboard/loja/${id}/config`)
        return { success: true, message: 'Dados da loja atualizados!' }
    } catch (e: any) {
        return { success: false, message: e.message }
    }
}