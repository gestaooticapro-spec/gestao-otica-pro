import { NextRequest, NextResponse } from 'next/server'
import { getAiSuggestionConfig, saveAiSuggestionConfig, getAiConfigCatalogData } from '@/lib/actions/store.actions'
import { AiSuggestionConfig } from '@/lib/types/ai-config.types'

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ storeId: string }> }
) {
    const { storeId } = await params
    const id = parseInt(storeId, 10)
    if (isNaN(id)) return NextResponse.json({ error: 'Invalid storeId' }, { status: 400 })

    try {
        const [config, catalogData] = await Promise.all([
            getAiSuggestionConfig(id),
            getAiConfigCatalogData(id),
        ])

        return NextResponse.json({ config, ...catalogData })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ storeId: string }> }
) {
    const { storeId } = await params
    const id = parseInt(storeId, 10)
    if (isNaN(id)) return NextResponse.json({ error: 'Invalid storeId' }, { status: 400 })

    try {
        const body = await request.json()
        const result = await saveAiSuggestionConfig(id, body)

        if (!result.success) {
            return NextResponse.json({ error: result.message }, { status: 400 })
        }

        return NextResponse.json({ success: true, message: result.message })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
