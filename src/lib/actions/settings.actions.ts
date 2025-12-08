// ARQUIVO: src/lib/actions/settings.actions.ts
'use server'

import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

// --- DEFINIÇÃO DO FORMATO DAS CONFIGURAÇÕES ---
export type StoreSettings = {
    print_receipt_template: 'thermal_80mm' | 'thermal_58mm' | 'a4_simple'
    print_os_template: 'a4_full' | 'a4_preprinted' | 'thermal_80mm'
    print_show_logo: boolean
    print_show_price_os: boolean
    custom_message_receipt?: string
}

// Valores padrão
const DEFAULT_SETTINGS: StoreSettings = {
    print_receipt_template: 'thermal_80mm',
    print_os_template: 'a4_full',
    print_show_logo: true,
    print_show_price_os: true,
    custom_message_receipt: 'Obrigado pela preferência!'
}

// --- 1. BUSCAR CONFIGURAÇÕES ---
export async function getStoreSettings(storeId: number): Promise<StoreSettings> {
    const supabaseAdmin = createAdminClient()

    try {
        // CORREÇÃO: Cast 'as any' para garantir leitura da coluna settings
        const { data, error } = await (supabaseAdmin
            .from('stores') as any)
            .select('settings')
            .eq('id', storeId)
            .single()

        if (error || !data) return DEFAULT_SETTINGS

        const savedSettings = data.settings as Partial<StoreSettings> || {}
        
        return {
            ...DEFAULT_SETTINGS,
            ...savedSettings
        }

    } catch (e) {
        console.error("Erro ao buscar settings:", e)
        return DEFAULT_SETTINGS
    }
}

// --- 2. SALVAR CONFIGURAÇÕES ---
const SettingsSchema = z.object({
    store_id: z.coerce.number(),
    print_receipt_template: z.enum(['thermal_80mm', 'thermal_58mm', 'a4_simple']),
    print_os_template: z.enum(['a4_full', 'a4_preprinted', 'thermal_80mm']),
    print_show_logo: z.coerce.boolean(),
    print_show_price_os: z.coerce.boolean(),
    custom_message_receipt: z.string().optional()
})

export async function updateStoreSettings(prevState: any, formData: FormData) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) return { success: false, message: 'Usuário não autenticado.' }
    
    // CORREÇÃO: Cast 'as any' para garantir acesso ao role
    const profile = await getProfileByAdmin(user.id) as any
    const role = profile?.role

    if (role !== 'admin' && role !== 'manager') {
        return { success: false, message: 'Permissão negada. Apenas gerentes alteram configurações.' }
    }

    // Prepara dados
    const rawData = {
        store_id: formData.get('store_id'),
        print_receipt_template: formData.get('print_receipt_template'),
        print_os_template: formData.get('print_os_template'),
        print_show_logo: formData.get('print_show_logo') === 'on',
        print_show_price_os: formData.get('print_show_price_os') === 'on',
        custom_message_receipt: formData.get('custom_message_receipt')
    }

    const validated = SettingsSchema.safeParse(rawData)

    if (!validated.success) {
        return { success: false, message: 'Dados inválidos.' }
    }

    const { store_id, ...newSettings } = validated.data
    const supabaseAdmin = createAdminClient()

    try {
        const current = await getStoreSettings(store_id)
        
        const updatedSettings = {
            ...current,
            ...newSettings
        }

        // CORREÇÃO: Cast 'as any' para update na coluna settings
        await (supabaseAdmin
            .from('stores') as any)
            .update({ settings: updatedSettings })
            .eq('id', store_id)

        revalidatePath(`/dashboard/loja/${store_id}/config`)
        return { success: true, message: 'Configurações de impressão salvas!' }

    } catch (e: any) {
        return { success: false, message: e.message }
    }
}