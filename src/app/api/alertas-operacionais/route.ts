// API Route para buscar alertas operacionais
// Caminho: src/app/api/alertas-operacionais/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { getAlertasOperacionais, getAniversariantes, getVencimentosProximos, getWhatsAppHumanOverrideCount, getWhatsAppPendencias } from '@/lib/actions/consultas.actions';
import { getRetornosDeHoje } from '@/lib/actions/collection.actions';
import { getClientesMetrics } from '@/lib/actions/reports.actions';
import { createAdminClient } from '@/lib/supabase/admin';
import { getProfileByAdmin } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import type { StoreSettings } from '@/lib/store-modules';
import { countPendingWhatsAppStatusContexts } from '@/lib/whatsapp/status-publications';

type WhatsAppChannelStatusRow = {
    connection_status: 'unknown' | 'connecting' | 'connected' | 'disconnected'
    is_active: boolean
} | null

type StoreSettingsRow = {
    settings: StoreSettings | null
} | null

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const storeId = parseInt(searchParams.get('storeId') || '0', 10);

    if (!storeId) {
        return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
    }

    const auth = createClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Nao autenticado.' }, { status: 401 });

    const profile = await getProfileByAdmin(user.id) as { role?: string | null, store_id?: number | null } | null;
    if (!profile || (profile.role !== 'admin' && Number(profile.store_id) !== storeId)) {
        return NextResponse.json({ error: 'Acesso negado para esta loja.' }, { status: 403 });
    }

    try {
        const supabaseAdmin = createAdminClient();
        const [{ data: whatsAppChannel }, { data: storeRaw }] = await Promise.all([
            supabaseAdmin.from('whatsapp_store_channels')
                .select('connection_status, is_active')
                .eq('store_id', storeId)
                .eq('provider', 'evolution')
                .maybeSingle(),
            supabaseAdmin.from('stores')
                .select('settings')
                .eq('id', storeId)
                .maybeSingle()
        ]);
        const channel = (whatsAppChannel ?? null) as WhatsAppChannelStatusRow;
        const store = (storeRaw ?? null) as StoreSettingsRow;
        const isWhatsAppAutomationEnabled = store?.settings?.whatsapp_automation?.enabled !== false;

        const isWhatsAppConnected =
            channel?.connection_status === 'connected' &&
            channel?.is_active === true;

        // Busca todos os dados em paralelo
        const [alertas, aniversariantes, vencimentos, retornos, clientesMetrics, whatsAppPendencias, whatsAppHumanOverrides, whatsAppStatusContextsPending] = await Promise.all([
            getAlertasOperacionais(storeId),
            getAniversariantes(storeId),
            getVencimentosProximos(storeId),
            getRetornosDeHoje(storeId),
            getClientesMetrics(storeId),
            isWhatsAppAutomationEnabled && isWhatsAppConnected ? getWhatsAppPendencias(storeId) : Promise.resolve([]),
            isWhatsAppAutomationEnabled && isWhatsAppConnected ? getWhatsAppHumanOverrideCount(storeId) : Promise.resolve(0),
            isWhatsAppAutomationEnabled && isWhatsAppConnected ? countPendingWhatsAppStatusContexts(storeId) : Promise.resolve(0)
        ]);

        return NextResponse.json({
            laboratorio: alertas.laboratorio,
            entregas: alertas.entregas,
            vendasEmAberto: alertas.vendasEmAberto,
            aniversariantes: aniversariantes,
            vencimentos: vencimentos,
            retornos: retornos,
            clientesInativos: clientesMetrics.clientesInativos,
            whatsAppPendencias: whatsAppPendencias,
            whatsAppHumanOverrides,
            whatsAppStatusContextsPending,
            isWhatsAppAutomationEnabled,
            isWhatsAppConnected
        });
    } catch (error) {
        console.error('Erro ao buscar alertas operacionais:', error);
        return NextResponse.json({ error: 'Failed to fetch alerts' }, { status: 500 });
    }
}
