import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import MultifocalFocusDemo from '@/components/catalog/MultifocalFocusDemo'

export default async function StoreLensFocusDemoPage({
  params,
  searchParams,
}: {
  params: { storeId: string }
  searchParams?: { client?: string }
}) {
  const storeId = parseInt(params.storeId, 10)
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return redirect('/login')

  return <MultifocalFocusDemo storeId={storeId} clientMode={searchParams?.client === '1'} />
}
