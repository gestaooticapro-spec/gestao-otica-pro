import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authenticateTowerDeviceWebSessionToken } from '@/lib/server/tower-device-web-session'
import { readTowerRemoteConfig } from '@/lib/server/tower-remote-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const QuerySchema = z.object({
  storeId: z.coerce.number().int().positive(),
})

export async function GET(request: NextRequest) {
  const parsed = QuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: 'Loja invalida.' }, { status: 400 })
  }

  const authorization = request.headers.get('authorization') ?? ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!token) return NextResponse.json({ success: false, message: 'Torre nao autenticada.' }, { status: 401 })

  const auth = await authenticateTowerDeviceWebSessionToken(token, parsed.data.storeId)
  if (!auth.ok) return NextResponse.json({ success: false, message: auth.message }, { status: 401 })

  const config = await readTowerRemoteConfig(parsed.data.storeId, auth.tenantId)
  if (!config) {
    return NextResponse.json({ success: false, message: 'Configuracao da loja indisponivel.' }, { status: 404 })
  }

  return NextResponse.json({
    success: true,
    message: 'Configuracao da Torre carregada.',
    data: { config },
  }, {
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  })
}
