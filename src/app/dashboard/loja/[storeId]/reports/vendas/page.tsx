import { getRelatorioVendas } from '@/lib/actions/reports.actions'
import TabelaVendas from '@/components/relatorios/TabelaVendas'
import { Calendar, Filter } from 'lucide-react'
import { redirect } from 'next/navigation'

export default async function RelatorioVendasPage({
  params,
  searchParams,
}: {
  params: { storeId: string }
  searchParams: { inicio?: string; fim?: string }
}) {
  const storeId = parseInt(params.storeId, 10)

  // Datas Padrão: Mês Atual
  const hoje = new Date()
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split('T')[0]
  const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().split('T')[0]

  const dataInicio = searchParams.inicio || inicioMes
  const dataFim = searchParams.fim || fimMes

  // Busca Dados no Server
  const dados = await getRelatorioVendas(storeId, dataInicio, dataFim)

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-gray-100 overflow-hidden">
      
      {/* HEADER DE FILTROS GLOBAIS */}
      <div className="bg-white border-b border-gray-300 px-4 py-3 flex items-center justify-between shadow-sm flex-shrink-0">
        <h1 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <Filter className="h-5 w-5 text-blue-600" />
            Relatório de Vendas Detalhado
        </h1>

        {/* Formulário de Filtro de Data (Server Side Navigation) */}
        <form className="flex items-center gap-2">
            <div className="flex items-center bg-gray-100 rounded border border-gray-300 px-2 py-1">
                <Calendar className="h-4 w-4 text-gray-500 mr-2" />
                <input 
                    name="inicio" 
                    type="date" 
                    defaultValue={dataInicio} 
                    className="bg-transparent border-none text-xs font-bold text-gray-700 focus:ring-0 p-0" 
                    required
                />
                <span className="mx-2 text-gray-400">-</span>
                <input 
                    name="fim" 
                    type="date" 
                    defaultValue={dataFim} 
                    className="bg-transparent border-none text-xs font-bold text-gray-700 focus:ring-0 p-0" 
                    required
                />
            </div>
            <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs font-bold shadow-sm">
                FILTRAR
            </button>
        </form>
      </div>

      {/* ÁREA DA TABELA */}
      <div className="flex-1 p-4 overflow-hidden">
         <TabelaVendas data={dados} storeId={storeId} />
      </div>
    </div>
  )
}