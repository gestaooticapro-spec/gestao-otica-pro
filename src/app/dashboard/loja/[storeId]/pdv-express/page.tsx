import { getEmployees } from '@/lib/actions/employee.actions'
import PdvExpressInterface from '@/components/vendas/PdvExpressInterface'
import { Zap } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function PdvExpressPage({ params }: { params: { storeId: string } }) {
  const storeId = parseInt(params.storeId, 10)

  // Apenas buscamos os funcionários. 
  // NÃO INICIAMOS MAIS A VENDA AQUI (Isso corrige o bug de vendas fantasmas)
  const employees = await getEmployees(storeId)
  
  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-gray-100 overflow-hidden">
      
      {/* Header Simplificado */}
      <div className="bg-white border-b border-gray-300 px-6 py-3 shadow-sm flex justify-between items-center flex-shrink-0">
        <div className="flex items-center gap-2">
            <div className="p-1.5 bg-yellow-100 text-yellow-700 rounded-lg">
                <Zap className="h-6 w-6" />
            </div>
            <div>
                <h1 className="text-xl font-bold text-gray-800">PDV Express</h1>
                <p className="text-xs text-gray-500">Venda Rápida (Balcão)</p>
            </div>
        </div>
      </div>

      {/* Área de Trabalho */}
      <div className="flex-1 p-4 overflow-hidden">
         <PdvExpressInterface 
            storeId={storeId}
            employees={employees} 
      />
      </div>
    </div>
  )
}