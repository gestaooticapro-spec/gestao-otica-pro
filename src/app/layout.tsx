// Caminho: src/app/layout.tsx
import type { Metadata, Viewport } from 'next' // <--- Importe Viewport
import { Inter } from 'next/font/google'
import { Toaster } from 'sonner'
import SupabaseCookieHygiene from '@/components/SupabaseCookieHygiene'
import { TabletOrientationSupport } from '@/components/tablet/TabletOrientationSupport'
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
  icons: {
    icon: [
      { url: '/favicon.ico', type: 'image/x-icon' },
      { url: '/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    shortcut: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'Gestão Ótica Pro',
    description: 'Sistema de gestão para redes de óticas',
    url: 'https://gestao-otica-pro.vercel.app',
    siteName: 'Gestão Ótica Pro',
    images: [
      {
        url: 'https://gestao-otica-pro.vercel.app/web-app-manifest-512x512.png',
        width: 1200,
        height: 630,
        alt: 'Gestão Ótica Pro - Painel de Controle',
      },
    ],
    type: 'website',
    locale: 'pt_BR',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Gestão Ótica Pro',
    description: 'Sistema de gestão para redes de óticas',
    images: ['https://gestao-otica-pro.vercel.app/web-app-manifest-512x512.png'],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Ótica Pro',
  },
  formatDetection: {
    telephone: false,
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
        <SupabaseCookieHygiene />
        <TabletOrientationSupport />
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  )
}
