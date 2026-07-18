import { getCustomerXRay } from '@/lib/actions/history.actions'
import CustomerHistoryPage from '@/components/history/CustomerHistoryPage'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { BackgroundToggle } from '@/components/ui/BackgroundToggle'
import { HistoryBackgroundLayer } from '@/components/history/HistoryBackgroundLayer'
import { headers } from 'next/headers'

// FORCE DYNAMIC
export const dynamic = 'force-dynamic'

export default async function Page(
    props: {
        params: Promise<{ storeId: string, customerId: string }>
    }
) {
    const params = await props.params;
    const storeId = parseInt(params.storeId)
    const customerId = parseInt(params.customerId)

    const { success, data, error } = await getCustomerXRay(customerId, storeId)

    // Server-side Preference Check (Optional optimization)
    // For now we rely on client component to toggle, but we can have static bg here

    if (!success || !data) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-white">
                <h1 className="text-2xl font-bold mb-2">Erro ao carregar histórico</h1>
                <p className="text-slate-400 mb-6">{error || 'Cliente não encontrado'}</p>
                <Link href={`/dashboard/loja/${storeId}/atendimento`} className="px-4 py-2 bg-indigo-600 rounded-lg">Voltar</Link>
            </div>
        )
    }

    return (
        <div className="relative min-h-[calc(100vh-64px)] bg-slate-950 flex flex-col font-sans overflow-hidden">
            {/* BACKGROUND LAYER (Shared with other pages) */}
            <div className="absolute inset-0 z-0 pointer-events-none">
                <HistoryBackgroundLayer />
            </div>

            {/* CONTENT LAYER */}
            <div className="relative z-10 flex flex-col h-full p-6 max-w-[1600px] mx-auto w-full">

                {/* Page Header */}
                <div className="flex justify-between items-center mb-6 shrink-0">
                    <div className="flex items-center gap-4">
                        <Link
                            href={`/dashboard/loja/${storeId}?menu=atendimento`}
                            className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors border border-white/5"
                            title="Voltar para Atendimento"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <div>
                            <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 to-purple-400 uppercase tracking-tight">
                                Raio-X do Cliente
                            </h1>
                            <p className="text-xs text-slate-500 font-medium">Análise detalhada de perfil e consumo</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <BackgroundToggle />
                    </div>
                </div>

                <div className="flex-1 min-h-0">
                    <CustomerHistoryPage data={data} storeId={storeId} />
                </div>
            </div>
        </div>
    )
}
