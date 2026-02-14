// ARQUIVO: src/app/manifest.ts
import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Gestão Ótica Pro',
    short_name: 'Ótica Pro',
    description: 'Sistema de Gestão para Óticas',
    start_url: '/',
    display: 'fullscreen',
    background_color: '#020617',
    theme_color: '#2563eb',
    orientation: 'portrait',
    icons: [
      {
        src: '/favicon.ico',
        sizes: 'any',
        type: 'image/x-icon',
      },
      {
        src: '/web-app-manifest-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/web-app-manifest-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/apple-touch-icon.png',
        sizes: '180x180',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  }
}