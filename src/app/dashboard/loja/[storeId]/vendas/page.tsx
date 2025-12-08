// Caminho: src/app/dashboard/loja/[storeId]/vendas/page.tsx
import { createClient } from '@/lib/supabase/server'
import { getSalesList } from '@/lib/actions/vendas.actions'
import Link from 'next/link'
import { Plus, ShoppingCart, Calendar, User, ArrowRight, AlertCircle } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function VendasListPage({
  params,
}: {
  params: { storeId: string }
}) {
  const storeId = parseInt(params.storeId)

  const { data: vendas, success } = await getSalesList(storeId)

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="p-6 max-w-7xl mx-auto flex flex-col h-[calc(100vh-64px)]">
      {/* Header */}
      <div className="flex justify-between items-center mb-6 flex-shrink-0">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
            <ShoppingCart className="h-8 w-8 text-blue-600" />
            Fechamento de Vendas
          </h1>
          <p className="text-gray-500">Fila de vendas em aberto aguardando finalização.</p>
        </div>
        <Link
          href={`/dashboard/loja/${storeId}/atendimento`}
          className="bg-green-600 hover:bg-green-700 text-white px-6 py-2.5 rounded-lg font-bold flex items-center gap-2 shadow-md transition-colors"
        >
          <Plus className="h-5 w-5" />
          Novo Atendimento
        </Link>
      </div>

      {/* Tabela de Vendas Pendentes */}
      <div className="bg-blue-50 rounded-xl shadow-sm border border-blue-200 overflow-hidden flex flex-col flex-1">
        
        {/* Cabeçalho da Tabela */}
        <div className="bg-blue-100 px-6 py-3 border-b border-blue-200 flex items-center justify-between flex-shrink-0">
            <h2 className="text-blue-900 font-bold flex items-center gap-2">
                <AlertCircle className="h-5 w-5" /> Pendências ({vendas?.length || 0})
            </h2>
        </div>

        <div className="overflow-y-auto flex-1 p-4">
          <table className="w-full text-left border-collapse">
            <thead className="bg-white/50 sticky top-0 z-10 backdrop-blur-sm">
              <tr className="text-blue-800 text-xs uppercase font-bold border-b border-blue-200">
                <th className="p-3 rounded-tl-lg">ID / Data</th>
                <th className="p-3">Cliente</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 text-right">Total</th>
                <th className="p-3 text-right">A Receber</th>
                <th className="p-3 text-center rounded-tr-lg">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-blue-100">
              {!success || !vendas || vendas.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-gray-500">
                    <p className="text-lg font-medium">Tudo limpo! 🎉</p>
                    <p className="text-sm">Nenhuma venda pendente no momento.</p>
                  </td>
                </tr>
              ) : (
                vendas.map((venda: any) => (
                  <tr key={venda.id} className="hover:bg-white transition-colors group rounded-lg">
                    <td className="p-3">
                      <div className="font-bold text-gray-800">#{venda.id}</div>
                      <div className="text-xs text-gray-500 flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(venda.created_at)}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="font-medium text-gray-900 flex items-center gap-2">
                        <User className="h-4 w-4 text-blue-400" />
                        {venda.customers?.full_name || 'Consumidor Final'}
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      <span className="px-2 py-1 rounded-full text-xs font-bold bg-yellow-100 text-yellow-800 border border-yellow-200">
                        {venda.status}
                      </span>
                    </td>
                    <td className="p-3 text-right font-medium text-gray-700">
                      {formatCurrency(venda.valor_final)}
                    </td>
                    <td className="p-3 text-right">
                      <span className={`font-bold ${venda.valor_restante > 0.01 ? 'text-red-600' : 'text-green-600'}`}>
                        {formatCurrency(venda.valor_restante)}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <Link
                        href={`/dashboard/loja/${storeId}/vendas/${venda.id}`}
                        className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-bold text-xs shadow-sm transition-all gap-1"
                      >
                        Abrir <ArrowRight className="h-3 w-3" />
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