import type { ReactNode } from 'react'
import { requirePlatformAdmin } from '@/lib/auth/platform-admin'

export default async function PlatformAdminLayout({
  children,
}: {
  children: ReactNode
}) {
  await requirePlatformAdmin()

  return children
}
