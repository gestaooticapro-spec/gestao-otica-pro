import type { Metadata } from 'next'
import React from 'react'

export const metadata: Metadata = {
  title: 'Leitor de Envelope | Gestão Ótica Pro',
  description: 'Gestão de Produção via NFC',
}

export default function NfcLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden min-h-[60vh] flex flex-col">
        <div className="bg-blue-600 p-4 text-center">
          <h1 className="text-white font-bold text-xl tracking-tight">
            Gestão Ótica Pro
          </h1>
          <p className="text-blue-100 text-sm">Controle de Produção</p>
        </div>

        <main className="flex-1 flex flex-col p-6">{children}</main>
      </div>
    </div>
  )
}
