// Caminho: src/app/layout.tsx
import type { Metadata, Viewport } from 'next' // <--- Importe Viewport
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

// 1. CONFIGURAÇÃO DE APP NATIVO (ZOOM E CORES)
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false, // Impede zoom de pinça (sensação de app nativo)
  themeColor: '#2563eb', // Pinta a barra de status do celular de azul
}

// 2. METADADOS PARA iOS (IPHONE)
export const metadata: Metadata = {
  title: 'Gestão Ótica Pro',
  description: 'Sistema de gestão para redes de óticas',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Ótica Pro',
  },
  formatDetection: {
    telephone: false, // Evita que números aleatórios virem links de telefone
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-br">
      <body
        className={`${inter.className} flex flex-col min-h-screen bg-gray-100 text-slate-800`}
      >
        {children}
      </body>
    </html>
  )
}