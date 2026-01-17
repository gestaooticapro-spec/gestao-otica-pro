// API Route para buscar alertas operacionais
// Caminho: src/app/api/alertas-operacionais/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { getAlertasOperacionais, getAniversariantes, getVencimentosProximos } from '@/lib/actions/consultas.actions';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const storeId = parseInt(searchParams.get('storeId') || '0', 10);

    if (!storeId) {
        return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
    }

    try {
        // Busca todos os dados em paralelo
        const [alertas, aniversariantes, vencimentos] = await Promise.all([
            getAlertasOperacionais(storeId),
            getAniversariantes(storeId),
            getVencimentosProximos(storeId)
        ]);

        return NextResponse.json({
            laboratorio: alertas.laboratorio,
            entregas: alertas.entregas,
            vendasEmAberto: alertas.vendasEmAberto,
            aniversariantes: aniversariantes,
            vencimentos: vencimentos
        });
    } catch (error) {
        console.error('Erro ao buscar alertas operacionais:', error);
        return NextResponse.json({ error: 'Failed to fetch alerts' }, { status: 500 });
    }
}
