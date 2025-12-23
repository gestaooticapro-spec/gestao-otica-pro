// Caminho: src/app/dashboard/loja/[storeId]/vendas/page.tsx
import { getSalesList } from '@/lib/actions/vendas.actions'
import Link from 'next/link'
// CORREÇÃO: Adicionei RefreshCcw na lista de imports abaixo
import { Plus, ShoppingCart, Calendar, User, ArrowRight, AlertCircle, CheckCircle2, XCircle, Clock, RefreshCcw } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import VendasFilter from '@/components/vendas/VendasFilter'

export const dynamic = 'force-dynamic'
// LAYOUT OTIMIZADO - Versão Compacta

export default async function VendasListPage({
  params,
  searchParams
}: {
  params: { storeId: string }
  searchParams: { mode?: string, inicio?: string, fim?: string }
}) {
  const storeId = parseInt(params.storeId)

  // Recupera filtros da URL
  const mode = (searchParams.mode as 'pendencias' | 'historico') || 'pendencias'
  const startDate = searchParams.inicio
  const endDate = searchParams.fim

  // Busca dados filtrados
  const { data: vendas, success } = await getSalesList(storeId, { mode, startDate, endDate })

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // Helper de Status Visual
  const getStatusBadge = (status: string) => {
    if (status === 'Fechada') return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-black bg-green-100 text-green-700 border border-green-200 uppercase"><CheckCircle2 className="h-3 w-3" /> Fechada</span>
    if (status === 'Cancelada') return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-black bg-red-100 text-red-700 border border-red-200 uppercase"><XCircle className="h-3 w-3" /> Cancelada</span>
    // Agora o ícone RefreshCcw vai funcionar
    if (status === 'Devolvida') return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-black bg-purple-100 text-purple-700 border border-purple-200 uppercase"><RefreshCcw className="h-3 w-3" /> Devolvida</span>
    return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-black bg-yellow-100 text-yellow-800 border border-yellow-200 uppercase"><Clock className="h-3 w-3" /> Em Aberto</span>
  }

  return (
    <div className="p-4 max-w-7xl mx-auto flex flex-col h-[calc(100vh-64px)]">

      {/* Header */}
      <div className="flex justify-between items-center mb-4 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-black text-gray-800 flex items-center gap-2 tracking-tight">
            <ShoppingCart className="h-6 w-6 text-blue-600" />
            Central de Vendas
          </h1>
          <p className="text-gray-500 text-xs font-medium mt-0.5">Gerencie fechamentos e histórico.</p>
        </div>
        <Link
          href={`/dashboard/loja/${storeId}/atendimento`}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 shadow-md shadow-green-200 transition-all hover:-translate-y-0.5 active:scale-95"
        >
          <Plus className="h-4 w-4" />
          NOVA VENDA
        </Link>
      </div>

      {/* Componente de Filtro */}
      <VendasFilter />

      {/* Tabela de Resultados */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col flex-1">

        <div className={`px-4 py-2 border-b border-slate-200 flex items-center justify-between flex-shrink-0 ${mode === 'pendencias' ? 'bg-yellow-50' : 'bg-slate-50'}`}>
          <h2 className={`font-bold text-sm flex items-center gap-2 ${mode === 'pendencias' ? 'text-yellow-800' : 'text-slate-700'}`}>
            {mode === 'pendencias' ? <AlertCircle className="h-4 w-4" /> : <Calendar className="h-4 w-4" />}
            {mode === 'pendencias' ? 'Fila de Pendências' : 'Histórico do Período'}
            <span className="opacity-60 text-xs ml-1">({vendas?.length || 0})</span>
          </h2>
        </div>

        <div className="overflow-y-auto flex-1 p-0">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 sticky top-0 z-10">
              <tr className="text-slate-500 text-[10px] uppercase font-bold border-b border-slate-200">
                <th className="p-2 w-32">ID / Data</th>
                <th className="p-2">Cliente</th>
                <th className="p-2 text-center">Status</th>
                <th className="p-2 text-right">Total</th>
                <th className="p-2 text-right">Falta Pagar</th>
                <th className="p-2 text-center w-20">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!success || !vendas || vendas.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-400">
                    <p className="text-base font-medium">Nenhum registro encontrado.</p>
                    {mode === 'pendencias' ? (
                      <p className="text-xs">Tudo limpo! Nenhuma venda em aberto.</p>
                    ) : (
                      <p className="text-xs">Tente ajustar as datas do filtro.</p>
                    )}
                  </td>
                </tr>
              ) : (
                vendas.map((venda: any) => (
                  <tr key={venda.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="p-2">
                      <div className="font-bold text-sm text-slate-800">#{venda.id}</div>
                      <div className="text-[9px] text-slate-500 flex items-center gap-1 mt-0.5">
                        <Calendar className="h-2.5 w-2.5" />
                        {formatDate(venda.created_at)}
                      </div>
                    </td>
                    <td className="p-2">
                      <div className="font-bold text-sm text-slate-700 flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 text-blue-400" />
                        {venda.customers?.full_name || 'Consumidor Final'}
                      </div>
                    </td>
                    <td className="p-2 text-center">
                      {getStatusBadge(venda.status)}
                    </td>
                    <td className="p-2 text-right font-bold text-sm text-slate-600">
                      {formatCurrency(venda.valor_final)}
                    </td>
                    <td className="p-2 text-right">
                      <span className={`font-black text-sm ${venda.valor_restante > 0.01 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {formatCurrency(venda.valor_restante)}
                      </span>
                    </td>
                    <td className="p-2 text-center">
                      <Link
                        href={`/dashboard/loja/${storeId}/vendas/${venda.id}/experimental`}
                        className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white transition-all"
                        title="Ver Detalhes"
                      >
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}