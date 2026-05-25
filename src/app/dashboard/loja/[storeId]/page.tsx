// ARQUIVO: src/app/dashboard/loja/[storeId]/page.tsx

import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProfileByAdmin, createAdminClient } from '@/lib/supabase/admin'

// Importação das Actions de Dados
import { getManagerKPIs, getAdminKPIs } from '@/lib/actions/dashboard.actions'
import { getAlertasOperacionais, getAniversariantes, getVencimentosProximos } from '@/lib/actions/consultas.actions'
import { getRetornosDeHoje } from '@/lib/actions/collection.actions'

// Importação dos Painéis Visuais
import { ManagerDashboard, AdminDashboard } from '@/components/dashboard/DashboardViews'
import ActionMenuDashboard from '@/components/dashboard/ActionMenuDashboard'
import { TabletRedirect } from '@/components/tablet/TabletRedirect'
import { getStoreAppMode } from '@/lib/app-mode'

type StoreHomeProfile = {
    role?: string | null
}
type StoreHomeRow = {
    name?: string | null
    settings?: unknown
}
type StoreHomeTable = {
    select: (columns: string) => {
        eq: (column: string, value: number) => {
            single: () => Promise<{ data: StoreHomeRow | null }>
        }
    }
}

export default async function StoreHomePage({ params }: { params: { storeId: string } }) {
    const storeId = parseInt(params.storeId, 10)
    if (isNaN(storeId)) return notFound()

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return redirect('/login')

    const profile = await getProfileByAdmin(user.id) as StoreHomeProfile | null
    if (!profile) return redirect('/login')

    // Busca nome da loja
    const supabaseAdmin = createAdminClient()
    const storesTable = supabaseAdmin.from('stores') as unknown as StoreHomeTable
    const { data: store } = await storesTable
        .select('name, settings')
        .eq('id', storeId)
        .single()

    const storeName = store?.name || `Loja ${storeId}`
    const appMode = getStoreAppMode(store?.settings)

    // 1. ADMIN (Dono da Rede)
    if (profile.role === 'admin') {
        const kpis = await getAdminKPIs()
        return (
            <>
                <TabletRedirect storeId={storeId} />
                <div className="p-6 max-w-7xl mx-auto">
                    <h1 className="text-2xl font-black text-white mb-6 drop-shadow-md">Visão Geral da Rede (Admin)</h1>
                    <AdminDashboard data={kpis} />
                </div>
            </>
        )
    }

    // 2. MANAGER (Gerente)
    if (profile.role === 'manager') {
        const kpis = await getManagerKPIs(storeId)
        return (
            <>
                <TabletRedirect storeId={storeId} />
                <div className="p-6 max-w-7xl mx-auto">
                    <div className="flex justify-between items-center mb-6">
                        <h1 className="text-2xl font-black text-white drop-shadow-md">Painel Gerencial</h1>
                        <span className="text-sm font-bold text-white/80 bg-white/10 border border-white/10 px-4 py-1.5 rounded-full shadow-lg backdrop-blur-md">
                            {storeName}
                        </span>
                    </div>
                    <ManagerDashboard data={kpis} />
                </div>
            </>
        )
    }

    // 3. OPERADOR / VENDEDOR (Dashboard Operacional)
    const [alertas, aniversariantes, vencimentos, retornos] = await Promise.all([
        getAlertasOperacionais(storeId),
        getAniversariantes(storeId),
        getVencimentosProximos(storeId),
        getRetornosDeHoje(storeId)
    ])

    return (
        <>
            <TabletRedirect storeId={storeId} />
            <ActionMenuDashboard
                storeId={storeId}
                storeName={storeName}
                alerts={alertas}
                birthdays={aniversariantes}
                vencimentos={vencimentos}
                retornos={retornos}
                appMode={appMode}
            />
        </>
    )
}
