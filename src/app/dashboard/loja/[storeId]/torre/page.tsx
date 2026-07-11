import { notFound, redirect } from 'next/navigation'

export default async function StoreTowerPage({
  params,
}: {
  params: { storeId: string }
}) {
  const storeId = parseInt(params.storeId, 10)
  if (Number.isNaN(storeId)) return notFound()

  return redirect(`/torre/${storeId}`)
}
