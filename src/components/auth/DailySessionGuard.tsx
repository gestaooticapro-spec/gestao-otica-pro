// ARQUIVO: src/components/auth/DailySessionGuard.tsx
'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function DailySessionGuard() {
    const router = useRouter()
    const supabase = createClient()

    useEffect(() => {
        const checkDate = async () => {
            const today = new Date().toLocaleDateString('pt-BR')
            const storedDate = localStorage.getItem('gestao_otica_session_date')

            if (!storedDate) {
                // Primeira vez ou cache limpo: define a data de hoje
                localStorage.setItem('gestao_otica_session_date', today)
                return
            }

            if (storedDate !== today) {
                console.log(`[SessionGuard] Data mudou de ${storedDate} para ${today}. Forçando logout...`)

                // Limpa a data para evitar loop se o logout falhar (mas vamos redirecionar)
                localStorage.removeItem('gestao_otica_session_date')

                // Faz logout no Supabase
                await supabase.auth.signOut()

                // Redireciona para login com aviso
                router.replace('/login?reason=daily_expired')
            }
        }

        // 1. Checa ao montar o componente (F5 ou navegação inicial)
        checkDate()

        // 2. Checa quando a janela ganha foco (Alt+Tab, voltar de outra aba)
        const onFocus = () => checkDate()
        window.addEventListener('focus', onFocus)

        // 3. Checa quando a visibilidade muda (minimizar/restaurar)
        const onVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                checkDate()
            }
        }
        document.addEventListener('visibilitychange', onVisibilityChange)

        return () => {
            window.removeEventListener('focus', onFocus)
            document.removeEventListener('visibilitychange', onVisibilityChange)
        }
    }, [router, supabase])

    return null // Componente invisível
}
