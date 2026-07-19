import 'server-only'

import { redirect } from 'next/navigation'
import { createAsyncClient } from '@/lib/supabase/server'
import { getProfileByAdmin } from '@/lib/supabase/admin'

export const PLATFORM_ADMIN_ROLE = 'platform_admin' as const

export type PlatformAdminProfile = {
  role: typeof PLATFORM_ADMIN_ROLE
  tenant_id: null
  store_id: null
}

type AccessProfile = {
  role: string | null
  tenant_id: string | null
  store_id: number | null
}

export function isPlatformAdminProfile(
  profile: AccessProfile | null | undefined
): profile is PlatformAdminProfile {
  return profile?.role === PLATFORM_ADMIN_ROLE
    && profile.tenant_id === null
    && profile.store_id === null
}

export async function getPlatformAdminContext() {
  const supabase = await createAsyncClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return null

  const profile = await getProfileByAdmin(user.id) as AccessProfile | null
  if (!isPlatformAdminProfile(profile)) return null

  return { user, profile }
}

export async function requirePlatformAdmin() {
  const context = await getPlatformAdminContext()

  if (!context) {
    redirect('/')
  }

  return context
}
