// API Route para gerar PDF de etiquetas
// Caminho: src/app/api/labels/generate/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { generateLabelsPDF, LABEL_TEMPLATES, LabelItem } from '@/lib/label-generator'

export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { items, templateCode, startPosition, codeType } = body as {
            items: LabelItem[]
            templateCode: string
            startPosition: number
            codeType?: 'barcode' | 'qrcode'
        }

        if (!items || items.length === 0) {
            return NextResponse.json({ error: 'Nenhum item para imprimir.' }, { status: 400 })
        }

        const template = LABEL_TEMPLATES.find(t => t.code === templateCode)
        if (!template) {
            return NextResponse.json({ error: 'Template não encontrado.' }, { status: 400 })
        }

        const pdfBuffer = await generateLabelsPDF(items, template, startPosition || 1, codeType || 'barcode')
        const uint8Array = new Uint8Array(pdfBuffer)

        return new NextResponse(uint8Array, {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': 'inline; filename=etiquetas.pdf'
            }
        })
    } catch (error: any) {
        console.error('Erro ao gerar etiquetas:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
