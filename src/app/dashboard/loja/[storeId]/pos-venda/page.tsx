// Caminho: src/app/dashboard/loja/[storeId]/pos-venda/page.tsx
import { getFilaPosVenda } from '@/lib/actions/postsales.actions'
import PostSalesInterface from '@/components/pos-venda/PostSalesInterface'
import { HeartHandshake } from 'lucide-react'

export default async function PosVendaPage({ params }: { params: { storeId: string } }) {
  const storeId = parseInt(params.storeId, 10)
  const fila = await getFilaPosVenda(storeId)

  return (
    // 1. FUNDO GRADIENTE "SOFT UI"
    <div className="flex flex-col h-[calc(100vh-64px)] bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100 overflow-hidden">
      
      {/* Header Flutuante/Transparente */}
      <div className="px-8 py-5 flex-shrink-0 backdrop-blur-sm bg-white/50 border-b border-white/20">
        <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-3 drop-shadow-sm">
            <div className="p-2.5 bg-white rounded-xl shadow-md text-pink-500">
                <HeartHandshake className="h-7 w-7" />
            </div>
            Sucesso do Cliente
        </h1>
        <p className="text-sm font-medium text-slate-500 mt-1 ml-14">
            Gestão de adaptação e satisfação.
        </p>
      </div>

      {/* Área de Trabalho */}
      <div className="flex-1 overflow-hidden p-6">
         <PostSalesInterface initialQueue={fila} storeId={storeId} />
      </div>
    </div>
  )
}