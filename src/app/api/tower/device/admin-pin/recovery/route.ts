import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authenticateTowerDevice } from '@/lib/server/tower-device-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { hashTowerAdminPin } from '@/lib/tower-admin-pin'
import { extractTowerPinRecoverySecret } from '@/lib/tower/admin-pin-recovery-contract'

export const dynamic = 'force-dynamic'

const requestSchema = z.object({
  method: z.enum(['qr', 'code']),
  credential: z.string().trim().min(1).max(96),
  newPin: z.string().regex(/^\d{6}$/),
}).strict()

type RecoveryRpcClient = {
  rpc: (
    functionName: 'consume_tower_admin_pin_recovery',
    args: {
      p_device_id: string
      p_store_id: number
      p_recovery_secret_hash: string
      p_new_pin_hash: string
    },
  ) => Promise<{ data: boolean | null; error: { message?: string } | null }>
}

function json(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  })
}

export async function POST(request: NextRequest) {
  const authentication = await authenticateTowerDevice(request)
  if (authentication.status === 'unavailable') {
    return json({ success: false, message: 'Servico de dispositivos indisponivel.' }, 503)
  }
  if (authentication.status === 'invalid') {
    return json({ success: false, message: 'Credencial de dispositivo invalida.' }, 401)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json({ success: false, message: 'Dados de recuperacao invalidos.' }, 400)
  }

  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    return json({ success: false, message: 'Informe o codigo de recuperacao e um novo PIN de seis digitos.' }, 400)
  }

  const secret = extractTowerPinRecoverySecret(parsed.data.method, parsed.data.credential)
  if (!secret) {
    return json({ success: false, message: 'Codigo de recuperacao invalido.' }, 400)
  }

  const admin = createAdminClient() as unknown as RecoveryRpcClient
  const { data, error } = await admin.rpc('consume_tower_admin_pin_recovery', {
    p_device_id: authentication.device.id,
    p_store_id: authentication.device.storeId,
    p_recovery_secret_hash: createHash('sha256').update(secret, 'utf8').digest('hex'),
    p_new_pin_hash: hashTowerAdminPin(parsed.data.newPin),
  })

  if (error) {
    console.error('[Torre] Falha ao recuperar PIN administrativo:', error)
    return json({ success: false, message: 'Nao foi possivel recuperar o PIN agora.' }, 503)
  }
  if (!data) {
    return json({
      success: false,
      message: 'Codigo expirado, ja utilizado ou emitido para outra loja.',
    }, 404)
  }

  return json({
    success: true,
    message: 'PIN recuperado. O codigo foi invalidado e o novo PIN ja esta ativo.',
  })
}
