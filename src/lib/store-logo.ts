export const STORE_LOGOS_BUCKET = 'store-logos'

export function getStoreLogoPublicUrl(logoPath?: string | null) {
  const normalizedPath = String(logoPath || '').trim().replace(/^\/+/, '')
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '')

  if (!normalizedPath || !supabaseUrl) return null

  return `${supabaseUrl}/storage/v1/object/public/${STORE_LOGOS_BUCKET}/${normalizedPath
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`
}
