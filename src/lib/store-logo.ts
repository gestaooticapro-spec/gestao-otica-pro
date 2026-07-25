export const STORE_LOGOS_BUCKET = 'store-logos'

export function getStoreLogoPublicUrl(logoPath?: string | null) {
  const normalizedPath = String(logoPath || '').trim().replace(/^\/+/, '')
  // Server actions/layouts may only expose SUPABASE_URL in production.
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)?.replace(/\/+$/, '')

  if (!normalizedPath || !supabaseUrl) return null

  return `${supabaseUrl}/storage/v1/object/public/${STORE_LOGOS_BUCKET}/${normalizedPath
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`
}
