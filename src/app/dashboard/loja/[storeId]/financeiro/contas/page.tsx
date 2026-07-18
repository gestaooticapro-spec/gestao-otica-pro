import { getBills } from '@/lib/actions/payable.actions'
import ContasInterface from '@/components/financeiro/ContasInterface'
import { CalendarRange, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

function getReferenceDateParts(dateStr?: string) {
    if (!dateStr) {
        const now = new Date()
        return { year: now.getUTCFullYear(), monthIndex: now.getUTCMonth() }
    }

    const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(dateStr)
    if (match) {
        return {
            year: Number(match[1]),
            monthIndex: Number(match[2]) - 1,
        }
    }

    const parsed = new Date(dateStr)
    return { year: parsed.getUTCFullYear(), monthIndex: parsed.getUTCMonth() }
}

export default async function ContasPage(
    props: {
        params: Promise<{ storeId: string }>,
        searchParams: Promise<{ mes?: string }>
    }
) {
    const searchParams = await props.searchParams;
    const params = await props.params;
    const storeId = parseInt(params.storeId, 10)

    // Padrão: Mês Atual se não vier na URL
    const dateRef = searchParams.mes || new Date().toISOString()

    const { data: bills } = await getBills(storeId, dateRef)

    // Formatação do Mês para Exibição
    const { year, monthIndex } = getReferenceDateParts(dateRef)
    const mesExtenso = new Date(Date.UTC(year, monthIndex, 1)).toLocaleDateString('pt-BR', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
    })

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
                        <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.15)]">
                            <CalendarRange className="h-6 w-6" />
                        </div>
                        <div>
                            <h1 className="text-xl font-black text-white tracking-tight uppercase">Contas a Pagar</h1>
                            <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">Referência: {mesExtenso}</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
                <ContasInterface bills={bills || []} storeId={storeId} />
            </div>
        </div>
    )
}
