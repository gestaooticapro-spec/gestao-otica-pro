import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const SUPPORT_BASE_URL = process.env.SUPPORT_BASE_URL || 'https://suporte.mentebinaria.com';
const SUPPORT_PROGRAM = 'gestao-otica-pro';

export async function POST(request: NextRequest) {
    const apiKey = process.env.SUPPORT_API_KEY;

    if (!apiKey) {
        return NextResponse.json({ error: 'SUPPORT_API_KEY is not configured' }, { status: 503 });
    }

    try {
        const body = await request.json();
        const storeId = String(body?.storeId || '').trim();

        if (!storeId) {
            return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
        }

        const response = await fetch(`${SUPPORT_BASE_URL}/api/support/status`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-support-api-key': apiKey,
            },
            body: JSON.stringify({
                programa: SUPPORT_PROGRAM,
                store_id: storeId,
            }),
            cache: 'no-store',
        });

        const payload = await response.json().catch(() => null);

        if (!response.ok) {
            return NextResponse.json(
                { error: payload?.error || 'Failed to fetch support status' },
                { status: response.status || 502 }
            );
        }

        return NextResponse.json(payload);
    } catch (error) {
        console.error('[Support] Failed to fetch support status:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
