// Caminho: src/app/dashboard/loja/[storeId]/financeiro/comissoes/page.tsx
import { getRelatorioComissoes } from '@/lib/actions/commission.actions'
import ComissoesInterface from '@/components/financeiro/ComissoesInterface'
import { Percent, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function ComissoesPage(
    props: {
        params: Promise<{ storeId: string }>,
        searchParams: Promise<{ inicio?: string, fim?: string }>
    }
) {
    const searchParams = await props.searchParams;
    const params = await props.params;
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
        <div className="flex flex-col h-[calc(100vh-64px)] bg-slate-950 overflow-hidden font-sans">

            <div className="bg-slate-900/40 backdrop-blur-xl border-b border-white/10 px-6 py-4 shadow-xl shadow-black/20 flex-shrink-0 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link
                        href={`/dashboard/loja/${storeId}?menu=gerencia`}
                        className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-slate-400 hover:text-white transition-all active:scale-95"
                        title="Voltar para a Gerência"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </Link>
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-500/20 text-purple-400 rounded-xl border border-purple-500/20 shadow-[0_0_15px_rgba(168,85,247,0.15)]">
                            <Percent className="h-6 w-6" />
                        </div>
                        <div>
                            <h1 className="text-xl font-black text-white tracking-tight uppercase">Gestão de Comissões</h1>
                            <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">Acompanhe e realize o pagamento de bonificações.</p>
                        </div>
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