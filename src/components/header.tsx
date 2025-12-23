// Caminho: src/components/header.tsx
'use client'

import Link from 'next/link'
import { LogOut } from 'lucide-react'
import LogoutButton from './LogoutButton'
import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function Header() {
  const router = useRouter()
  const supabase = createClient()

  // --- LÓGICA DE LOGOUT DIÁRIO ---
  useEffect(() => {
    const checkDate = async () => {
      const today = new Date().toLocaleDateString('pt-BR')
      const storedDate = localStorage.getItem('gestao_otica_session_date')

      if (!storedDate) {
        // Primeira vez: salva a data
        localStorage.setItem('gestao_otica_session_date', today)
        return
      }

      if (storedDate !== today) {
        console.log(`[Header] Data mudou de ${storedDate} para ${today}. Forçando logout...`)

        // Limpa e desloga
        localStorage.removeItem('gestao_otica_session_date')
        await supabase.auth.signOut()
        router.replace('/login?reason=daily_expired')
      }
    }

    // 1. Checa ao montar
    checkDate()

    // 2. Checa ao ganhar foco
    const onFocus = () => checkDate()
    window.addEventListener('focus', onFocus)

    return () => window.removeEventListener('focus', onFocus)
  }, [router, supabase])

  return (
    <header className="fixed top-0 left-0 w-full z-30 bg-white shadow-md">
      <div className="max-w-screen-2xl mx-auto flex items-center justify-between h-16 px-4 sm:px-6 lg:px-8">

        {/* Logo/Título */}
        <Link href="/dashboard/manager" className="text-xl font-bold text-gray-800 hover:text-blue-600 transition-colors">
          Gestão Ótica Pro
        </Link>

        {/* Informações da Sessão e Logout */}
        <div className="flex items-center space-x-4">

          {/* Ocultamos o LogoutButton para telas muito pequenas, ou o substituímos por um ícone se necessário. 
             Mantendo simples por enquanto. */}
          <div className="hidden sm:block">
            <LogoutButton />
          </div>
        </div>
      </div>
    </header>
  )
}