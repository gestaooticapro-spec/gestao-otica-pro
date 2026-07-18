// ARQUIVO: src/app/dashboard/loja/[storeId]/page.tsx

import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProfileByAdmin, createAdminClient } from '@/lib/supabase/admin'

// Importação das Actions de Dados
import { getManagerKPIs, getAdminKPIs } from '@/lib/actions/dashboard.actions'
import { getAlertasOperacionais, getAniversariantes, getVencimentosProximos, getWhatsAppHumanOverrideCount, getWhatsAppPendencias } from '@/lib/actions/consultas.actions'
import { getRetornosDeHoje } from '@/lib/actions/collection.actions'
import { getStoreModulesForStore } from '@/lib/store-modules.server'
import type { StoreSettings } from '@/lib/store-modules'

// Importação dos Painéis Visuais
import { ManagerDashboard, AdminDashboard } from '@/components/dashboard/DashboardViews'
import ActionMenuDashboard from '@/components/dashboard/ActionMenuDashboard'
import { TabletRedirect } from '@/components/tablet/TabletRedirect'

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

type StoreDashboardRow = {
    name: string | null
    settings: StoreSettings | null
}

type WhatsAppChannelDashboardRow = {
    connection_status: 'unknown' | 'connecting' | 'connected' | 'disconnected'
    is_active: boolean
    instance_key: string | null
}

type DashboardProfile = {
    role: string
    store_id?: number | null
}

export default async function StoreHomePage(props: { params: Promise<{ storeId: string }> }) {
    const params = await props.params;
    const storeId = parseInt(params.storeId, 10)
    if (isNaN(storeId)) return notFound()

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return redirect('/login')

    const profile = await getProfileByAdmin(user.id) as DashboardProfile | null
    if (!profile) return redirect('/login')

    // Busca nome da loja
    const supabaseAdmin = createAdminClient()
    const { data: storeRaw } = await supabaseAdmin.from('stores')
        .select('name, settings')
        .eq('id', storeId)
        .single()
    const store = storeRaw as StoreDashboardRow | null

    const { data: whatsAppChannelRaw } = await supabaseAdmin.from('whatsapp_store_channels')
        .select('connection_status, is_active, instance_key')
        .eq('store_id', storeId)
        .eq('provider', 'evolution')
        .maybeSingle()
    const whatsAppChannel = whatsAppChannelRaw as WhatsAppChannelDashboardRow | null

    const storeName = store?.name || `Loja ${storeId}`
    const deliveryDateEnabled = store?.settings?.delivery_date_enabled !== false
    const isWhatsAppAutomationEnabled = store?.settings?.whatsapp_automation?.enabled !== false
    const isWhatsAppChannelConfigured = Boolean(whatsAppChannel?.instance_key)
    const isWhatsAppConnected = whatsAppChannel?.connection_status === 'connected' && whatsAppChannel?.is_active === true

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
    const modules = await getStoreModulesForStore(storeId)
    const [alertas, aniversariantes, vencimentos, retornos, whatsAppPendencias, whatsAppHumanOverrides] = await Promise.all([
        getAlertasOperacionais(storeId),
        getAniversariantes(storeId),
        modules.installments ? getVencimentosProximos(storeId) : Promise.resolve([]),
        modules.installments ? getRetornosDeHoje(storeId) : Promise.resolve([]),
        isWhatsAppConnected ? getWhatsAppPendencias(storeId) : Promise.resolve([]),
        isWhatsAppConnected ? getWhatsAppHumanOverrideCount(storeId) : Promise.resolve(0)
    ])

    return (
        <>
            <TabletRedirect storeId={storeId} />
            <ActionMenuDashboard
                storeId={storeId}
                storeName={storeName}
                deliveryDateEnabled={deliveryDateEnabled}
                alerts={alertas}
                birthdays={aniversariantes}
                vencimentos={vencimentos}
                retornos={retornos}
                whatsAppPendencias={whatsAppPendencias}
                whatsAppHumanOverrides={whatsAppHumanOverrides}
                isWhatsAppAutomationEnabled={isWhatsAppAutomationEnabled}
                isWhatsAppChannelConfigured={isWhatsAppChannelConfigured}
                isWhatsAppConnected={isWhatsAppConnected}
            />
        </>
    )
}
