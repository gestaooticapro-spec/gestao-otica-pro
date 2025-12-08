// Caminho: src/app/dashboard/loja/[storeId]/financeiro/comissoes/page.tsx
import { getRelatorioComissoes } from '@/lib/actions/commission.actions'
import ComissoesInterface from '@/components/financeiro/ComissoesInterface'
import { Percent } from 'lucide-react'

export default async function ComissoesPage({ 
    params, 
    searchParams 
}: { 
    params: { storeId: string },
    searchParams: { inicio?: string, fim?: string }
}) {
    const storeId = parseInt(params.storeId, 10)
    
    // Datas padrão: Mês Atual
    const hoje = new Date()
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split('T')[0]
    const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().split('T')[0]

    const dataInicio = searchParams.inicio || inicioMes
    const dataFim = searchParams.fim || fimMes

    // Busca dados
    const { data } = await getRelatorioComissoes(storeId, dataInicio, dataFim)

    return (
        <div className="flex flex-col h-[calc(100vh-64px)] bg-gray-100 overflow-hidden">
            
            {/* Header */}
            <div className="bg-white border-b border-gray-300 px-6 py-4 shadow-sm flex-shrink-0">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-100 text-purple-700 rounded-lg">
                        <Percent className="h-6 w-6" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-gray-800">Gestão de Comissões</h1>
                        <p className="text-xs text-gray-500">Acompanhe e realize o pagamento de bonificações.</p>
                    </div>
                </div>
            </div>

            {/* Conteúdo */}
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                <ComissoesInterface 
                    data={data || []} 
                    storeId={storeId} 
                    periodo={{ inicio: dataInicio, fim: dataFim }} 
                />
            </div>
        </div>
    )
}