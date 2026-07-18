import { NextRequest, NextResponse } from 'next/server'
import { authenticateTowerDevice } from '@/lib/server/tower-device-auth'
import type { TowerDeviceStatusResponse } from '@/lib/tower/device-activation-contract'

export const dynamic = 'force-dynamic'

function json(payload: TowerDeviceStatusResponse, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  })
}

export async function GET(request: NextRequest) {
  const authentication = await authenticateTowerDevice(request)
  if (authentication.status === 'unavailable') {
    return json({ success: false, message: 'Servico de dispositivos indisponivel.' }, 503)
  }

  if (authentication.status === 'invalid') {
    return json({ success: false, message: 'Credencial de dispositivo invalida.' }, 401)
  }

  const { device } = authentication

  return json({
    success: true,
    status: 'active',
    deviceId: device.id,
    assetId: device.assetId,
    publicCode: device.publicCode,
    tenantId: device.tenantId,
    storeId: device.storeId,
    deviceLabel: device.deviceLabel,
    pairedAt: device.pairedAt,
  })
}
