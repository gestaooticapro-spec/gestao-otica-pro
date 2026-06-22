import React from 'react'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Leitor de Bandeja | Gestão Ótica Pro',
  description: 'Gestão de Produção via NFC',
}

export default function NfcLayout({ children }: { children: React.ReactNode }) {
  // Layout 100% isolado. Sem navegação, sem sidebar, focado em mobile.
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden min-h-[60vh] flex flex-col">
        {/* Cabeçalho minimalista */}
        <div className="bg-blue-600 p-4 text-center">
          <h1 className="text-white font-bold text-xl tracking-tight">Gestão Ótica Pro</h1>
          <p className="text-blue-100 text-sm">Controle de Produção</p>
        </div>
        
        {/* Área Principal de Conteúdo */}
        <main className="flex-1 flex flex-col p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
