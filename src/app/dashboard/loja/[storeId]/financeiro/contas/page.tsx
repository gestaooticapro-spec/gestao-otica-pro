import { getBills } from '@/lib/actions/payable.actions'
import ContasInterface from '@/components/financeiro/ContasInterface'
import { CalendarRange } from 'lucide-react'

export default async function ContasPage({ 
    params,
    searchParams 
}: { 
    params: { storeId: string },
    searchParams: { mes?: string } 
}) {
    const storeId = parseInt(params.storeId, 10)
    
    // Padrão: Mês Atual se não vier na URL
    const dateRef = searchParams.mes || new Date().toISOString()
    
    const { data: bills } = await getBills(storeId, dateRef)

    // Formatação do Mês para Exibição
    const mesExtenso = new Date(dateRef).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

    return (
        <div className="flex flex-col h-[calc(100vh-64px)] bg-gray-100 overflow-hidden">
            <div className="bg-white border-b border-gray-300 px-6 py-4 shadow-sm flex justify-between items-center flex-shrink-0">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-100 text-indigo-700 rounded-lg">
                        <CalendarRange className="h-6 w-6" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-gray-800">Contas a Pagar</h1>
                        <p className="text-xs text-gray-500 capitalize">Referência: {mesExtenso}</p>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
                <ContasInterface bills={bills || []} storeId={storeId} />
            </div>
        </div>
    )
}