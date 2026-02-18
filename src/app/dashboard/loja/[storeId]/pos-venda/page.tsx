// Caminho: src/app/dashboard/loja/[storeId]/pos-venda/page.tsx
import { getFilaPosVenda } from '@/lib/actions/postsales.actions'
import PostSalesInterface from '@/components/pos-venda/PostSalesInterface'

export default async function PosVendaPage({ params }: { params: { storeId: string } }) {
  const storeId = parseInt(params.storeId, 10)
  const fila = await getFilaPosVenda(storeId)

  return <PostSalesInterface initialQueue={fila} storeId={storeId} />
}