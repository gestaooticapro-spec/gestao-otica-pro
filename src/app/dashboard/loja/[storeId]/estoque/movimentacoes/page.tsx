import { getStockMovements } from '@/lib/actions/stock.actions'
import { 
    ArrowUpCircle, ArrowDownCircle, AlertTriangle, 
    Calendar, Package, User 
} from 'lucide-react'
import StockFiltersBar from './_components/StockFiltersBar'

// Helper de formatação
const formatDate = (date: string) => new Date(date).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export default async function MovimentacoesPage({ 
    params, 
    searchParams 
}: { 
    params: { storeId: string },
    searchParams: { inicio?: string, fim?: string, tipo?: string, busca?: string } 
}) {
  const storeId = parseInt(params.storeId, 10)
  
  // Datas padrão se não vier na URL (Hoje)
  const hoje = new Date().toISOString().split('T')[0]
  const inicio = searchParams.inicio || hoje
  const fim = searchParams.fim || hoje

  // Busca dados filtrados
  const movimentos = await getStockMovements(storeId, {
      dataInicio: inicio,
      dataFim: fim,
      tipo: searchParams.tipo,
      busca: searchParams.busca
  })

  // --- CÁLCULO DOS KPIS (Baseado na lista filtrada) ---
  // Isso dá um resumo instantâneo do que está sendo visto
  const kpis = movimentos.reduce((acc: any, mov: any) => {
      if (mov.tipo === 'Entrada' || mov.tipo === 'Ajuste') {
          acc.entradas += mov.quantidade
      } else if (mov.tipo === 'Perda') {
          acc.perdas += mov.quantidade
      } else {
          // Saida, Brinde
          acc.saidas += mov.quantidade
      }
      return acc
  }, { entradas: 0, saidas: 0, perdas: 0 })

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-slate-100 overflow-hidden">
      
      {/* HEADER / KPIs (Topo) */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 shadow-sm flex-shrink-0">
          <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Card Entradas */}
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 flex items-center gap-3">
                  <div className="p-2 bg-white rounded-lg text-emerald-600 shadow-sm"><ArrowUpCircle className="h-5 w-5"/></div>
                  <div>
                      <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Entradas / Ajustes</p>
                      <p className="text-xl font-black text-slate-700">{kpis.entradas} <span className="text-xs font-medium text-slate-400">unid.</span></p>
                  </div>
              </div>
              
              {/* Card Saídas */}
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex items-center gap-3">
                  <div className="p-2 bg-white rounded-lg text-blue-600 shadow-sm"><ArrowDownCircle className="h-5 w-5"/></div>
                  <div>
                      <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">Saídas / Vendas</p>
                      <p className="text-xl font-black text-slate-700">{kpis.saidas} <span className="text-xs font-medium text-slate-400">unid.</span></p>
                  </div>
              </div>

              {/* Card Perdas */}
              <div className="bg-rose-50 border border-rose-100 rounded-xl p-3 flex items-center gap-3">
                  <div className="p-2 bg-white rounded-lg text-rose-600 shadow-sm"><AlertTriangle className="h-5 w-5"/></div>
                  <div>
                      <p className="text-[10px] font-bold text-rose-700 uppercase tracking-wider">Perdas / Quebras</p>
                      <p className="text-xl font-black text-rose-600">{kpis.perdas} <span className="text-xs font-medium text-slate-400">unid.</span></p>
                  </div>
              </div>
          </div>
      </div>

      {/* CORPO (SPLIT VIEW) */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* Coluna Esquerda: Filtros */}
        <div className="w-1/4 min-w-[250px] max-w-[300px] border-r border-slate-200 bg-white z-10">
            <StockFiltersBar storeId={storeId} />
        </div>

        {/* Coluna Direita: Lista */}
        <div className="flex-1 bg-slate-50/50 overflow-y-auto p-4 custom-scrollbar">
            <div className="max-w-5xl mx-auto bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] border-b border-slate-200 sticky top-0 z-10">
                        <tr>
                            <th className="px-4 py-3">Data / Hora</th>
                            <th className="px-4 py-3">Produto</th>
                            <th className="px-4 py-3 text-center">Tipo</th>
                            <th className="px-4 py-3 text-center">Qtd</th>
                            <th className="px-4 py-3">Motivo</th>
                            <th className="px-4 py-3 text-right">Resp.</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {movimentos.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="p-10 text-center text-slate-400 flex flex-col items-center justify-center">
                                    <Package className="h-10 w-10 mb-2 opacity-20" />
                                    <p className="text-xs">Nenhuma movimentação neste período.</p>
                                </td>
                            </tr>
                        ) : (
                            movimentos.map((mov: any) => (
                                <tr key={mov.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs font-medium">
                                        <div className="flex items-center gap-1">
                                            <Calendar className="h-3 w-3 opacity-50" />
                                            {formatDate(mov.created_at)}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <p className="font-bold text-slate-800 text-xs">{mov.products?.nome || 'Produto Removido'}</p>
                                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">{mov.products?.codigo_barras || '-'}</p>
                                        {mov.product_variants && (
                                            <span className="inline-block text-[9px] bg-slate-100 border border-slate-200 px-1.5 rounded text-slate-500 mt-1">
                                                {mov.product_variants.nome_variante}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <BadgeTipo tipo={mov.tipo} />
                                    </td>
                                    <td className="px-4 py-3 text-center font-bold text-slate-700 text-sm">
                                        {mov.quantidade}
                                    </td>
                                    <td className="px-4 py-3 text-slate-600 text-xs max-w-xs truncate" title={mov.motivo}>
                                        {mov.motivo}
                                    </td>
                                    <td className="px-4 py-3 text-right text-slate-500 text-xs">
                                        <div className="flex items-center justify-end gap-1">
                                            <User className="h-3 w-3 opacity-50" />
                                            {mov.employees?.full_name || 'Sistema'}
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>

      </div>
    </div>
  )
}

function BadgeTipo({ tipo }: { tipo: string }) {
    let style = 'bg-slate-100 text-slate-600'
    
    if (tipo === 'Entrada') style = 'bg-emerald-100 text-emerald-700 border-emerald-200'
    if (tipo === 'Saida') style = 'bg-blue-100 text-blue-700 border-blue-200'
    if (tipo === 'Perda') style = 'bg-rose-100 text-rose-800 border-rose-200 font-black'
    if (tipo === 'Brinde') style = 'bg-purple-100 text-purple-700 border-purple-200'
    if (tipo === 'Ajuste') style = 'bg-amber-100 text-amber-800 border-amber-200'

    return (
        <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide border border-transparent inline-flex items-center gap-1 ${style}`}>
            {tipo}
        </span>
    )
}