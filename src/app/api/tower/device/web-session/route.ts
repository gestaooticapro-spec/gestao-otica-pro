import { NextRequest, NextResponse } from 'next/server'
import { authenticateTowerDevice } from '@/lib/server/tower-device-auth'
import { issueTowerDeviceWebSession } from '@/lib/server/tower-device-web-session'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const authentication = await authenticateTowerDevice(request)
  if (authentication.status === 'unavailable') {
    return NextResponse.json({ success: false, message: 'Servico de dispositivos indisponivel.' }, { status: 503 })
  }
  if (authentication.status === 'invalid') {
    return NextResponse.json({ success: false, message: 'Credencial de dispositivo invalida.' }, { status: 401 })
  }

  const issued = issueTowerDeviceWebSession(authentication.device)
  return NextResponse.json({
    success: true,
    token: issued.token,
    expiresAt: issued.expiresAt,
    storeId: authentication.device.storeId,
  }, {
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  })
}
