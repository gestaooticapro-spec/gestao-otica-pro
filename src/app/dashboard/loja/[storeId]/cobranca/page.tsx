import { getInadimplentes } from '@/lib/actions/collection.actions'
import { Megaphone } from 'lucide-react'
import CobrancaInterface from '@/components/cobranca/CobrancaInterface' // <-- Criaremos este componente a seguir

export default async function CobrancaPage({
  params,
  searchParams,
}: {
  params: { storeId: string }
  searchParams: { filtro?: string }
}) {
  const storeId = parseInt(params.storeId, 10)
  
  // Define o filtro baseado na URL (padrão 'todos')
  const filtroAtivo = searchParams.filtro === 'sem_spc' ? 'sem_spc' : 'todos'

  // Busca os dados direto do banco (Server Side)
  const devedores = await getInadimplentes(storeId, filtroAtivo)

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-gray-100 overflow-hidden">
      
      {/* Header da Página */}
      <div className="bg-white border-b border-gray-300 px-6 py-3 shadow-sm flex-shrink-0 flex justify-between items-center">
        <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg text-red-600">
                <Megaphone className="h-6 w-6" />
            </div>
            <div>
                <h1 className="text-xl font-bold text-gray-800">Central de Cobrança</h1>
                <p className="text-xs text-gray-500">Gerencie inadimplência e histórico de contatos</p>
            </div>
        </div>
        
        <div className="text-right">
            <p className="text-sm font-bold text-gray-600">Total de Devedores</p>
            <p className="text-2xl font-black text-red-600">{devedores.length}</p>
        </div>
      </div>

      {/* Área Principal (Client Component) */}
      <div className="flex-1 overflow-hidden p-4">
         {/* Passamos os dados iniciais para o componente interativo */}
         <CobrancaInterface 
            initialDevedores={devedores} 
            storeId={storeId}
            filtroAtual={filtroAtivo}
         />
      </div>
    </div>
  )
}