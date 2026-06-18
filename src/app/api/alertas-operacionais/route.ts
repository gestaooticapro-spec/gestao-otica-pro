// API Route para buscar alertas operacionais
// Caminho: src/app/api/alertas-operacionais/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { getAlertasOperacionais, getAniversariantes, getVencimentosProximos, getWhatsAppPendencias } from '@/lib/actions/consultas.actions';
import { getRetornosDeHoje } from '@/lib/actions/collection.actions';
import { getClientesMetrics } from '@/lib/actions/reports.actions';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const storeId = parseInt(searchParams.get('storeId') || '0', 10);

    if (!storeId) {
        return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
    }

    try {
        const supabaseAdmin = createAdminClient();
        const { data: whatsAppChannel } = await (supabaseAdmin.from('whatsapp_store_channels') as any)
            .select('connection_status, is_active')
            .eq('store_id', storeId)
            .eq('provider', 'evolution')
            .maybeSingle();

        const isWhatsAppConnected =
            whatsAppChannel?.connection_status === 'connected' &&
            whatsAppChannel?.is_active === true;

        // Busca todos os dados em paralelo
        const [alertas, aniversariantes, vencimentos, retornos, clientesMetrics, whatsAppPendencias] = await Promise.all([
            getAlertasOperacionais(storeId),
            getAniversariantes(storeId),
            getVencimentosProximos(storeId),
            getRetornosDeHoje(storeId),
            getClientesMetrics(storeId),
            isWhatsAppConnected ? getWhatsAppPendencias(storeId) : Promise.resolve([])
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
            isWhatsAppConnected
        });
    } catch (error) {
        console.error('Erro ao buscar alertas operacionais:', error);
        return NextResponse.json({ error: 'Failed to fetch alerts' }, { status: 500 });
    }
}
