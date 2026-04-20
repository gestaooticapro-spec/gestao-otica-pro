import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProfileByAdmin } from '@/lib/supabase/admin'
import { getAllLensGeometries, getCatalogFamilyNames } from '@/lib/actions/lens-geometry.actions'
import LensGeometryCalibrationInterface from '@/components/catalog/LensGeometryCalibrationInterface'

export default async function LensGeometryPage({
  params,
}: {
  params: { storeId: string }
}) {
  const storeId = parseInt(params.storeId, 10)
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return redirect('/login')

  const profile = (await getProfileByAdmin(user.id)) as any
  const isAllowed = profile?.role === 'admin' || profile?.role === 'manager'
  if (!isAllowed) return redirect(`/dashboard/loja/${storeId}`)

  const [geometries, catalogFamilyNames] = await Promise.all([
    getAllLensGeometries(),
    getCatalogFamilyNames(),
  ])

  return (
    <LensGeometryCalibrationInterface
      geometries={geometries}
      catalogFamilyNames={catalogFamilyNames}
    />
  )
}
