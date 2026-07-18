import { notFound, redirect } from 'next/navigation'

export default async function StoreTowerPage(
  props: {
    params: Promise<{ storeId: string }>
  }
) {
  const params = await props.params;
  const storeId = parseInt(params.storeId, 10)
  if (Number.isNaN(storeId)) return notFound()

  return redirect(`/torre/${storeId}`)
}
