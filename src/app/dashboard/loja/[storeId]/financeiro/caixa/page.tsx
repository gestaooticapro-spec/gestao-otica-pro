import { getResumoCaixa } from '@/lib/actions/cashflow.actions'
import CaixaInterface from '@/components/financeiro/CaixaInterface'
import { DollarSign } from 'lucide-react'

export default async function CaixaPage({ params }: { params: { storeId: string } }) {
  const storeId = parseInt(params.storeId, 10)
  const resumo = await getResumoCaixa(storeId)

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-gray-100 overflow-y-auto">
      {/* Header */}
      <div className="bg-white border-b border-gray-300 px-6 py-4 shadow-sm flex-shrink-0">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <DollarSign className="h-6 w-6 text-emerald-600" />
            Livro Caixa (Movimento Diário)
        </h1>
      </div>

      {/* Conteúdo */}
      <div className="p-6 max-w-7xl mx-auto w-full">
         <CaixaInterface initialData={resumo} storeId={storeId} />
      </div>
    </div>
  )
}