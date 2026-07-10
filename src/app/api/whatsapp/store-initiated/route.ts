import { NextResponse } from 'next/server'
import { z } from 'zod'
import { Json } from '@/lib/database.types'
import { isValidWhatsAppInternalRequest } from '@/lib/whatsapp/internal-auth'
import { markStoreInitiatedConversation } from '@/lib/whatsapp/customer-status'

export const runtime = 'nodejs'

const RequestSchema = z.object({
  instanceKey: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(8).max(30),
  providerMessageId: z.string().trim().min(1).max(255).optional(),
  messageText: z.string().max(5000).optional(),
  payload: z.unknown().optional(),
})

export async function POST(request: Request) {
  if (!isValidWhatsAppInternalRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const parsed = RequestSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const result = await markStoreInitiatedConversation({
      ...parsed.data,
      payload: (parsed.data.payload ?? null) as Json,
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('[WhatsApp] Failed to mark store initiated conversation:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
