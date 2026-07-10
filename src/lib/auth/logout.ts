'use client'

import { createClient } from '@/lib/supabase/client'

export async function logoutAndRedirect(target = '/login') {
    const supabase = createClient()

    try {
        const { error } = await supabase.auth.signOut({ scope: 'local' })
        if (error) {
            console.warn('Sessao remota ja estava invalida ao sair:', error.message)
        }
    } catch (error) {
        console.warn('Nao foi possivel encerrar a sessao remotamente:', error)
    } finally {
        localStorage.removeItem('gestao_otica_session_date')
        window.location.replace(target)
    }
}
