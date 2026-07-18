// ARQUIVO: src/app/dashboard/loja/[storeId]/assistencia/page.tsx
import { getAssistanceTickets } from '@/lib/actions/assistance.actions'
import AssistanceKanban from '@/components/assistencia/AssistanceKanban'
import Link from 'next/link'
import { LifeBuoy, ArrowLeft } from 'lucide-react'

export default async function AssistenciaPage(props: { params: Promise<{ storeId: string }> }) {
  const params = await props.params;
  const storeId = parseInt(params.storeId, 10)
  const tickets = await getAssistanceTickets(storeId)

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-slate-950 overflow-hidden">

      {/* Header */}
      <div className="bg-slate-900/50 backdrop-blur-md border-b border-white/10 px-6 py-3 shadow-sm flex-shrink-0 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <Link
            href={`/dashboard/loja/${storeId}?menu=atendimento`}
            className="p-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-slate-400 hover:text-white transition-all active:scale-95"
            title="Voltar para o Painel"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-lg">
            <LifeBuoy className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">Controle de Assistência</h1>
            <p className="text-xs text-slate-400">Gestão de Garantias e Reparos</p>
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