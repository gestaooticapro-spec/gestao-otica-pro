// Caminho: src/lib/actions/auth.actions.ts (CORREÇÃO DE CLIENTE ADMIN)

'use server'

import { createClient } from '@/lib/supabase/server'
import { Database } from '@/lib/database.types'
import { createAdminClient } from '@/lib/supabase/admin' // <-- IMPORTAÇÃO CORRIGIDA

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
  const supabaseRLS = createClient()
  const { data: { user } } = await supabaseRLS.auth.getUser()

  if (!user)
    return {
      success: false,
      route: '/login',
      message: 'Sessão não encontrada.',
    }

  try {
    // 1. Usa o Cliente Admin para ignorar o RLS
    const supabaseAdmin = createAdminClient()

    // 2. Busca o perfil ignorando o RLS (TIPADO COMO ANY)
    const { data: profile, error: profileError } = await (supabaseAdmin
      .from('profiles')
      .select('role, store_id, tenant_id')
      .eq('id', user.id)
      .single() as any)

    if (profileError || !profile) {
      console.error('Perfil não encontrado no roteamento:', profileError)
      return {
        success: false,
        route: '/login?error=profile_missing',
        message: 'Perfil não encontrado ou incompleto.',
      }
    }

    // 3. Lógica de Roteamento (COMPLETA)
    if (profile.role === 'admin') {
      const adminStoreId = profile.store_id || 1
      return {
        success: true,
        route: `/dashboard/loja/${adminStoreId}`,
      }
    } else if (profile.role === 'manager' || profile.role === 'store_operator') {
      if (profile.store_id) {
        return {
          success: true,
          route: `/dashboard/loja/${profile.store_id}`,
        }
      }
      return { success: true, route: '/dashboard/manager' }
    } else if (profile.role === 'vendedor') {
      return {
        success: false,
        route: '/login?error=unauthorized_role',
        message: 'Perfil de vendedor não tem acesso ao dashboard principal.',
      }
    }

    return {
      success: false,
      route: '/login?error=invalid_role',
      message: 'Cargo de usuário desconhecido.',
    }

  } catch (e) {
    console.error('Erro de Servidor no roteamento:', e)
    return {
      success: false,
      route: '/login?error=server_error',
      message: 'Erro interno do servidor.',
    }
  }
}
