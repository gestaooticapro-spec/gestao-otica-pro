import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAllLensGeometries } from '@/lib/actions/lens-geometry.actions'
import LensVisualizerView from '@/components/catalog/LensVisualizerView'
import { normalizeLensName } from '@/lib/utils/lens'

function resolveBackPath(storeId: number, rawReturnTo?: string): string {
  const fallback = `/dashboard/loja/${storeId}/tabela-precos`
  if (!rawReturnTo) return fallback

  const decoded = decodeURIComponent(rawReturnTo).trim()
  if (!decoded.startsWith('/dashboard/')) return fallback
  if (decoded.startsWith('//')) return fallback
  if (/^https?:\/\//i.test(decoded)) return fallback
  return decoded
}

export default async function LensVisualizerPage({
  params,
  searchParams,
}: {
  params: { storeId: string; familySlug: string }
  searchParams?: { returnTo?: string }
}) {
  const familyName = decodeURIComponent(params.familySlug)
  const storeId = parseInt(params.storeId, 10)

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return redirect('/login')

  const geometries = await getAllLensGeometries()
  const normalizedFamilyName = normalizeLensName(familyName)
  const geometry =
    geometries.find((g) => g.family_name === familyName) ??
    geometries.find((g) => normalizeLensName(g.family_name) === normalizedFamilyName)

  if (!geometry) return redirect(`/dashboard/loja/${storeId}`)
  const backPath = resolveBackPath(storeId, searchParams?.returnTo)

  return (
    <LensVisualizerView
      geometry={geometry}
      backPath={backPath}
      allGeometries={geometries}
      storeId={storeId}
    />
  )
}
