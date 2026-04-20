'use client'

import { useEffect } from 'react'

function getSupabaseProjectRef(url: string | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    const host = u.hostname || ''
    // Typical: https://<ref>.supabase.co
    const parts = host.split('.')
    if (parts.length >= 3 && parts[parts.length - 2] === 'supabase' && parts[parts.length - 1] === 'co') {
      return parts[0] || null
    }
    // Fallback: take first subdomain if present
    return parts[0] || null
  } catch {
    return null
  }
}

function deleteCookie(name: string) {
  // Path=/ is important; domain omitted for localhost compatibility.
  document.cookie = `${name}=; Max-Age=0; Path=/`
}

export default function SupabaseCookieHygiene() {
  useEffect(() => {
    const ref = getSupabaseProjectRef(process.env.NEXT_PUBLIC_SUPABASE_URL)
    if (!ref) return

    const allowedPrefix = `sb-${ref}-`
    const cookieNames = document.cookie
      .split(';')
      .map((c) => c.trim())
      .filter(Boolean)
      .map((c) => c.split('=')[0])
      .filter(Boolean)

    // Remove stale Supabase cookies from other projects to avoid 431 header overflow.
    for (const name of cookieNames) {
      if (!name.startsWith('sb-')) continue
      if (name.startsWith(allowedPrefix)) continue
      deleteCookie(name)
    }
  }, [])

  return null
}

