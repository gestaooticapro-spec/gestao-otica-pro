'use client'

import { LogOut } from 'lucide-react'
import { logoutAndRedirect } from '@/lib/auth/logout'

export default function LogoutButton() {
  return (
    <button
      onClick={() => logoutAndRedirect()}
      className="flex w-full items-center justify-center gap-2 p-3 rounded-lg text-red-400 bg-gray-800 hover:bg-red-700 hover:text-white transition-colors duration-150 shadow-md"
      title="Sair do Sistema"
    >
      <LogOut className="h-5 w-5" />
      <span className="font-medium text-sm">Sair</span>
    </button>
  )
}
