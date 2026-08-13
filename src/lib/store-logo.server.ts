import 'server-only'
import sharp from 'sharp'
import { getStoreLogoPublicUrl } from '@/lib/store-logo'

const MAX_EMBEDDED_LOGO_BYTES = 300 * 1024
const MAX_EMBEDDED_LOGO_WIDTH = 600
const MAX_EMBEDDED_LOGO_HEIGHT = 300

export async function loadStoreLogoDataUrl(logoPath?: string | null) {
  const logoUrl = getStoreLogoPublicUrl(logoPath)
  if (!logoUrl) return null

  try {
    const response = await fetch(logoUrl, { cache: 'no-store' })
    if (!response.ok) return null

    const contentType = response.headers.get('content-type')?.split(';')[0] || ''
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(contentType)) return null

    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length <= MAX_EMBEDDED_LOGO_BYTES) {
      return `data:${contentType};base64,${bytes.toString('base64')}`
    }

    // Logos de alta resolucao nao precisam ser incorporados integralmente em
    // recibos pequenos. O fundo branco preserva logos PNG com transparencia e
    // JPEG reduz drasticamente o payload enviado para a Evolution.
    const optimized = await sharp(bytes)
      .rotate()
      .resize({
        width: MAX_EMBEDDED_LOGO_WIDTH,
        height: MAX_EMBEDDED_LOGO_HEIGHT,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer()

    return `data:image/jpeg;base64,${optimized.toString('base64')}`
  } catch {
    return null
  }
}
