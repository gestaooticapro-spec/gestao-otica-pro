import { NextResponse } from 'next/server'
import { z } from 'zod'
import { authorizeLensSegmentStore, getLensSegmentForwardOrigin } from '@/lib/medidas/lens-segment-access'
import { issueLensSegmentToken } from '@/lib/medidas/lens-segment-token'

export const runtime = 'nodejs'
export const maxDuration = 90

const RequestSchema = z.object({
  storeId: z.number().int().positive(),
  dataUrl: z.string().min(128).max(14 * 1024 * 1024),
})

export async function POST(request: Request) {
  let parsed: z.infer<typeof RequestSchema>
  try {
    parsed = RequestSchema.parse(await request.json())
  } catch {
    return NextResponse.json({ ok: false, message: 'Foto ou loja invalida.' }, { status: 400 })
  }

  if (!/^data:image\/(?:jpeg|png|webp);base64,/.test(parsed.dataUrl)) {
    return NextResponse.json({ ok: false, message: 'Formato da foto invalido.' }, { status: 400 })
  }

  const access = await authorizeLensSegmentStore(parsed.storeId)
  if (!access.ok) return NextResponse.json({ ok: false, message: access.error }, { status: access.status })

  const issued = issueLensSegmentToken(parsed.storeId, access.secret)
  try {
    const vpsResponse = await fetch(`${access.segmentUrl}/v1/segment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${issued.token}`,
        Origin: getLensSegmentForwardOrigin(),
      },
      body: JSON.stringify({ dataUrl: parsed.dataUrl }),
    })
    const payload = await vpsResponse.json().catch(() => null)
    if (!payload || typeof payload !== 'object') {
      return NextResponse.json({ ok: false, message: 'A VPS nao devolveu um resultado valido.' }, { status: 502 })
    }
    return NextResponse.json(payload, { status: vpsResponse.status })
  } catch {
    return NextResponse.json({ ok: false, message: 'Nao foi possivel alcançar o servico de analise.' }, { status: 502 })
  }
}
