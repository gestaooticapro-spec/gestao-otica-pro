import { getRelatorioVendas } from '@/lib/actions/reports.actions'
import TabelaVendas from '@/components/relatorios/TabelaVendas'
import { Calendar, Filter, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default async function RelatorioVendasPage(
  props: {
    params: Promise<{ storeId: string }>
    searchParams: Promise<{ inicio?: string; fim?: string }>
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
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
    <div className="flex flex-col h-[calc(100vh-64px)] bg-slate-950 overflow-hidden">

      {/* HEADER DE FILTROS GLOBAIS */}
      <div className="bg-white/5 border-b border-white/10 px-4 py-3 flex items-center justify-between backdrop-blur-xl flex-shrink-0">
        <div className="flex items-center gap-4">
          <Link
            href={`/dashboard/loja/${storeId}/reports`}
            className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors text-sm font-medium group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            Voltar
          </Link>
          <h1 className="text-lg font-bold text-white flex items-center gap-2">
            <Filter className="h-5 w-5 text-blue-400" />
            Relatório de Vendas Detalhado
          </h1>
        </div>

        {/* Formulário de Filtro de Data (Server Side Navigation) */}
        <form className="flex items-center gap-2">
          <div className="flex items-center bg-white/10 rounded border border-white/10 px-2 py-1 backdrop-blur-md">
            <Calendar className="h-4 w-4 text-slate-400 mr-2" />
            <input
              name="inicio"
              type="date"
              defaultValue={dataInicio}
              className="bg-transparent border-none text-xs font-bold text-slate-200 focus:ring-0 p-0 [color-scheme:dark]"
              required
            />
            <span className="mx-2 text-slate-500">-</span>
            <input
              name="fim"
              type="date"
              defaultValue={dataFim}
              className="bg-transparent border-none text-xs font-bold text-slate-200 focus:ring-0 p-0 [color-scheme:dark]"
              required
            />
          </div>
          <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded text-xs font-bold shadow-lg shadow-blue-500/20 transition-colors">
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
