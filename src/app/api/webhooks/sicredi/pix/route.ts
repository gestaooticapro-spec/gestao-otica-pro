import { NextResponse } from 'next/server'
import { processSicrediPixWebhookPayload } from '@/lib/actions/pix-installment.actions'

export async function POST(request: Request) {
  try {
    const payload = await request.json()
    const result = await processSicrediPixWebhookPayload(payload)
    return NextResponse.json(result)
  } catch (error) {
    console.error('[Sicredi Pix webhook] Falha ao processar notificacao:', error)
    return NextResponse.json({ message: 'Nao foi possivel processar a notificacao Pix.' }, { status: 500 })
  }
}
