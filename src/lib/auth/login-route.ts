import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { isPlatformAdminProfile } from '@/lib/auth/platform-admin'

export type LoginRouteResult = {
  success: boolean
  route: string
  message?: string
}

// Consulta de leitura usada após a autenticação. Ela não altera sessão, perfil
// nem dados da loja e pode ser exposta por uma rota GET durante a manutenção.
export async function resolveLoginRoute(): Promise<LoginRouteResult> {
  const supabaseRLS = createClient()
  const { data: { user } } = await supabaseRLS.auth.getUser()

  if (!user) {
    return {
      success: false,
      route: '/login',
      message: 'Sessão não encontrada.',
    }
  }

  try {
    const supabaseAdmin = createAdminClient()
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

    if (isPlatformAdminProfile(profile)) {
      return { success: true, route: '/admin/torres' }
    }

    if (profile.role === 'platform_admin') {
      return {
        success: false,
        route: '/login?error=invalid_platform_admin_scope',
        message: 'Administrador de plataforma vinculado indevidamente a uma loja.',
      }
    }

    if (profile.role === 'admin') {
      return { success: true, route: `/dashboard/loja/${profile.store_id || 1}` }
    }

    if (profile.role === 'manager' || profile.role === 'store_operator') {
      return profile.store_id
        ? { success: true, route: `/dashboard/loja/${profile.store_id}` }
        : { success: true, route: '/dashboard/manager' }
    }

    if (profile.role === 'vendedor') {
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
  } catch (error) {
    console.error('Erro de servidor no roteamento:', error)
    return {
      success: false,
      route: '/login?error=server_error',
      message: 'Erro interno do servidor.',
    }
  }
}
