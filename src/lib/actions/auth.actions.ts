// Caminho: src/lib/actions/auth.actions.ts (CORREÇÃO DE CLIENTE ADMIN)

'use server'

import { createClient } from '@/lib/supabase/server'
import { Database } from '@/lib/database.types'
import { createAdminClient } from '@/lib/supabase/admin' // <-- IMPORTAÇÃO CORRIGIDA
import { resolveLoginRoute } from '@/lib/auth/login-route'

type Profile = Database['public']['Tables']['profiles']['Row']

// ----------------------------------------------------
// NOVO HELPER: Busca perfil usando o cliente Admin
// ----------------------------------------------------
export async function getProfileByAdmin(userId: string) {
  try {
    const supabaseAdmin = createAdminClient()
    const { data: profile } = await (supabaseAdmin
      .from('profiles')
      .select('role, store_id, tenant_id')
      .eq('id', userId)
      .single() as any)

    return profile
  } catch (e) {
    console.error("ERRO ao buscar perfil com Service Role:", e)
    return null
  }
}
// ----------------------------------------------------


export async function getLoginRoute() {
  return resolveLoginRoute()
}
