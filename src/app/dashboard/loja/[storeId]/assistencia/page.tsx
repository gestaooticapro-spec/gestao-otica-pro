// ARQUIVO: src/app/dashboard/loja/[storeId]/assistencia/page.tsx
import { getAssistanceTickets } from '@/lib/actions/assistance.actions'
import AssistanceKanban from '@/components/assistencia/AssistanceKanban'
import { LifeBuoy } from 'lucide-react'

export default async function AssistenciaPage({ params }: { params: { storeId: string } }) {
  const storeId = parseInt(params.storeId, 10)
  const tickets = await getAssistanceTickets(storeId)

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-slate-100 overflow-hidden">
      
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 shadow-sm flex-shrink-0 flex justify-between items-center">
        <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                <LifeBuoy className="h-6 w-6" />
            </div>
            <div>
                <h1 className="text-xl font-bold text-gray-800">Controle de Assistência</h1>
                <p className="text-xs text-gray-500">Gestão de Garantias e Reparos</p>
            </div>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-hidden">
         <AssistanceKanban initialData={tickets} storeId={storeId} />
      </div>
    </div>
  )
}