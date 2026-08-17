import { NextResponse } from 'next/server'
import { z } from 'zod'
import { isValidWhatsAppInternalRequest } from '@/lib/whatsapp/internal-auth'
import { resolveCustomerStatus } from '@/lib/whatsapp/customer-status'
import { Json } from '@/lib/database.types'

export const runtime = 'nodejs'
export const maxDuration = 90

const RequestSchema = z.object({
  instanceKey: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(8).max(30),
  providerMessageId: z.string().trim().min(1).max(255),
  messageText: z.string().max(5000).optional(),
  statusReferenceId: z.string().trim().min(1).max(255).nullable().optional(),
  statusInteractionType: z.enum(['reply', 'reaction']).nullable().optional(),
  providerCreatedAt: z.string().datetime().nullable().optional(),
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

    const result = await resolveCustomerStatus({
      ...parsed.data,
      payload: (parsed.data.payload ?? null) as Json,
    })
    return NextResponse.json(result)
  } catch (error) {
    console.error('[WhatsApp] Failed to resolve customer status:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
