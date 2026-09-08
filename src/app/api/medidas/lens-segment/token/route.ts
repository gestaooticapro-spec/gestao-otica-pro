import { NextResponse } from 'next/server'
import { z } from 'zod'
import { authorizeLensSegmentStore } from '@/lib/medidas/lens-segment-access'
import { issueLensSegmentToken } from '@/lib/medidas/lens-segment-token'

export const runtime = 'nodejs'

const RequestSchema = z.object({
  storeId: z.number().int().positive(),
})

export async function POST(request: Request) {
  let parsed: z.infer<typeof RequestSchema>
  try {
    parsed = RequestSchema.parse(await request.json())
  } catch {
    return NextResponse.json({ error: 'Loja invalida.' }, { status: 400 })
  }

  const access = await authorizeLensSegmentStore(parsed.storeId)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  const issued = issueLensSegmentToken(parsed.storeId, access.secret)
  return NextResponse.json({
    token: issued.token,
    expiresAt: issued.exp,
    segmentUrl: `${access.segmentUrl}/v1/segment`,
  })
}
