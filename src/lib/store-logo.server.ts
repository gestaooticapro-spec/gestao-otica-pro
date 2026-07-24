import 'server-only'
import { getStoreLogoPublicUrl } from '@/lib/store-logo'

export async function loadStoreLogoDataUrl(logoPath?: string | null) {
  const logoUrl = getStoreLogoPublicUrl(logoPath)
  if (!logoUrl) return null

  try {
    const response = await fetch(logoUrl, { cache: 'no-store' })
    if (!response.ok) return null

    const contentType = response.headers.get('content-type')?.split(';')[0] || ''
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(contentType)) return null

    const bytes = Buffer.from(await response.arrayBuffer())
    return `data:${contentType};base64,${bytes.toString('base64')}`
  } catch {
    return null
  }
}
