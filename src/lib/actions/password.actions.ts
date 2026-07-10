'use server'

import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export type StoreAccessAccount = {
    id: string
    email: string
    role: string
    lastSignInAt: string | null
    isCurrentUser: boolean
}

export type PasswordActionResult = {
    success: boolean
    message: string
}

type AccessProfile = {
    id: string
    role: string | null
    store_id: number | null
}

async function getPasswordManagerContext(storeId: number) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) throw new Error('Usuario nao autenticado.')

    const profile = await getProfileByAdmin(user.id) as AccessProfile | null
    const isAdmin = profile?.role === 'admin'
    const isStoreManager = profile?.role === 'manager' && profile.store_id === storeId

    if (!isAdmin && !isStoreManager) {
        throw new Error('Permissao negada para gerenciar senhas desta loja.')
    }

    return {
        currentUserId: user.id,
        currentRole: profile.role,
        supabaseAdmin: createAdminClient()
    }
}

export async function getStoreAccessAccounts(storeId: number): Promise<StoreAccessAccount[]> {
    try {
        const { currentUserId, supabaseAdmin } = await getPasswordManagerContext(storeId)
        const { data: rawProfiles, error: profilesError } = await supabaseAdmin
            .from('profiles')
            .select('id, role')
            .eq('store_id', storeId)

        if (profilesError) throw profilesError
        const profiles = (rawProfiles || []) as Pick<AccessProfile, 'id' | 'role'>[]
        if (!profiles?.length) return []

        const profileById = new Map(profiles.map(profile => [profile.id, profile]))
        const accounts: StoreAccessAccount[] = []
        let page = 1

        while (profileById.size > accounts.length) {
            const { data, error } = await supabaseAdmin.auth.admin.listUsers({
                page,
                perPage: 200
            })

            if (error) throw error

            for (const user of data.users) {
                const profile = profileById.get(user.id)
                if (!profile) continue

                accounts.push({
                    id: user.id,
                    email: user.email || 'Conta sem e-mail',
                    role: profile.role || 'usuario',
                    lastSignInAt: user.last_sign_in_at || null,
                    isCurrentUser: user.id === currentUserId
                })
            }

            if (data.users.length < 200) break
            page += 1
        }

        return accounts.sort((a, b) => {
            if (a.isCurrentUser) return -1
            if (b.isCurrentUser) return 1
            return a.email.localeCompare(b.email)
        })
    } catch (error) {
        console.error('Erro ao listar contas de acesso:', error)
        return []
    }
}

export async function updateStoreAccessPassword(
    storeId: number,
    targetUserId: string,
    newPassword: string
): Promise<PasswordActionResult> {
    try {
        const { currentRole, supabaseAdmin } = await getPasswordManagerContext(storeId)
        const password = newPassword

        if (password.length < 6) {
            return { success: false, message: 'A nova senha deve ter pelo menos 6 caracteres.' }
        }

        const { data: rawTargetProfile, error: profileError } = await supabaseAdmin
            .from('profiles')
            .select('id, role, store_id')
            .eq('id', targetUserId)
            .eq('store_id', storeId)
            .maybeSingle()

        if (profileError) throw profileError
        const targetProfile = rawTargetProfile as AccessProfile | null
        if (!targetProfile) {
            return { success: false, message: 'Conta nao encontrada nesta loja.' }
        }

        if (targetProfile.role === 'admin' && currentRole !== 'admin') {
            return { success: false, message: 'Apenas administradores podem alterar outra conta administrativa.' }
        }

        const { error } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
            password
        })

        if (error) throw error

        return { success: true, message: 'Senha alterada com sucesso.' }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Nao foi possivel alterar a senha.'
        return { success: false, message }
    }
}
