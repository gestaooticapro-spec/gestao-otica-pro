import { NextResponse } from 'next/server'
import { importIvisionEvaluationPreviewInternal } from '@/lib/server/evaluation-import'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const result = await importIvisionEvaluationPreviewInternal(body)
    const status = result.success ? 200 : 400

    return NextResponse.json(result, { status })
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Erro ao processar a importacao.'
      },
      { status: 500 }
    )
  }
}
