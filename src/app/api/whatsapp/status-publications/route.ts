import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { Json } from '@/lib/database.types'
import { isValidWhatsAppInternalRequest } from '@/lib/whatsapp/internal-auth'
import { registerWhatsAppStatusPublication } from '@/lib/whatsapp/status-publications'

export const runtime = 'nodejs'

const RequestSchema = z.object({
  instanceKey: z.string().trim().min(1).max(120),
  providerMessageId: z.string().trim().min(1).max(255),
  messageText: z.string().max(5000).optional(),
  mediaKind: z.string().trim().max(40).nullable().optional(),
  publishedAt: z.string().datetime().optional(),
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

    const result = await registerWhatsAppStatusPublication({
      ...parsed.data,
      payload: (parsed.data.payload ?? null) as Json,
    })
    return NextResponse.json(result)
  } catch (error) {
    console.error('[WhatsApp] Failed to register status publication:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
