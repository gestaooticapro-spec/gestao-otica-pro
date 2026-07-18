import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import MultifocalFocusDemo from '@/components/catalog/MultifocalFocusDemo'

export default async function StoreLensFocusDemoPage(
  props: {
    params: Promise<{ storeId: string }>
    searchParams?: Promise<{ client?: string }>
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const storeId = parseInt(params.storeId, 10)
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return redirect('/login')

  return <MultifocalFocusDemo storeId={storeId} clientMode={searchParams?.client === '1'} />
}
