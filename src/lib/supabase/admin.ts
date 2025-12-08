// Caminho: src/lib/supabase/admin.ts

import { createClient } from '@supabase/supabase-js'
import { Database } from '@/lib/database.types'

// Cliente Admin (Service Role)
export function createAdminClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !serviceRole) {
        throw new Error('Chaves de Service Role não configuradas.')
    }

    return createClient<Database>(url, serviceRole, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    })
}

export async function getProfileByAdmin(userId: string) {
    try {
        const supabaseAdmin = createAdminClient()

        const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('role, store_id, tenant_id')
            .eq('id', userId)
            .single()

        return profile
    } catch (e) {
        console.error("ERRO ao buscar perfil com Service Role:", e)
        return null
    }
}
