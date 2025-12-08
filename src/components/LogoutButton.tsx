// Caminho: src/components/LogoutButton.tsx
'use client'

import { LogOut } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LogoutButton() {
  const router = useRouter()
  const supabase = createClient()

  const handleLogout = async () => {
    // Apaga a sessão do usuário no Supabase
    const { error } = await supabase.auth.signOut()

    if (error) {
      console.error('Erro ao fazer logout:', error)
      alert('Ocorreu um erro ao sair. Tente novamente.')
      return
    }

    // Redireciona para a tela de login
    router.push('/login')
  }

  return (
    <button
      onClick={handleLogout}
      className="flex w-full items-center justify-center gap-2 p-3 rounded-lg text-red-400 bg-gray-800 hover:bg-red-700 hover:text-white transition-colors duration-150 shadow-md"
      title="Sair do Sistema"
    >
      <LogOut className="h-5 w-5" />
      <span className="font-medium text-sm">Sair</span>
    </button>
  )
}