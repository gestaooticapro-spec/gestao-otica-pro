// ARQUIVO: src/app/manifest.ts
import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Gestão Ótica Pro',
    short_name: 'Ótica Pro',
    description: 'Sistema de Gestão para Óticas',
    start_url: '/',
    display: 'standalone', // <--- ISSO REMOVE A BARRA DE ENDEREÇO
    background_color: '#f3f4f6', // Cor do bg-gray-100
    theme_color: '#2563eb',      // Cor do blue-600 (Header)
    orientation: 'portrait',     // Opcional: força modo retrato se quiser
    icons: [
      {
        src: '/favicon.ico',
        sizes: 'any',
        type: 'image/x-icon',
      },
      // Idealmente depois você adiciona ícones PNG (192x192 e 512x512) aqui
    ],
  }
}