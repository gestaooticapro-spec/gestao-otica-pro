// Caminho: src/components/Header.tsx
'use client'

import Link from 'next/link'
import { LogOut } from 'lucide-react'
import LogoutButton from './LogoutButton' // Importamos o componente recém-criado

// O Header é um componente de cliente porque contém o LogoutButton e interatividade
export default function Header() {
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