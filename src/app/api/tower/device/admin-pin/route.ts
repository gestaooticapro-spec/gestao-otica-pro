import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authenticateTowerDevice } from '@/lib/server/tower-device-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { hashTowerAdminPin, verifyTowerAdminPin } from '@/lib/tower-admin-pin'
import { issueTowerMaintenanceGrant } from '@/lib/server/tower-maintenance-grant'

export const dynamic = 'force-dynamic'

const pinRequestSchema = z.object({
  action: z.enum(['verify', 'change']),
  currentPin: z.string().regex(/^\d{6}$/),
  newPin: z.string().regex(/^\d{6}$/).optional(),
}).strict().superRefine((value, context) => {
  if (value.action === 'change' && !value.newPin) {
    context.addIssue({ code: 'custom', path: ['newPin'], message: 'Novo PIN obrigatorio.' })
  }
  if (value.action === 'change' && value.newPin === value.currentPin) {
    context.addIssue({ code: 'custom', path: ['newPin'], message: 'O novo PIN deve ser diferente.' })
  }
})

type PinRow = {
  pin_hash: string
  must_change: boolean
  failed_attempts: number
  locked_until: string | null
}

type PinStatusRow = Pick<PinRow, 'must_change' | 'failed_attempts' | 'locked_until'>

type PinAttemptResult = {
  pin_verified: boolean
  pin_must_change: boolean
  pin_failed_attempts: number
  pin_locked_until: string | null
}

type PinAttemptRpcClient = {
  rpc: (
    functionName: 'record_tower_admin_pin_attempt',
    args: {
      p_store_id: number
      p_expected_pin_hash: string
      p_verified: boolean
      p_new_pin_hash: string | null
    },
  ) => Promise<{ data: PinAttemptResult[] | null; error: { message: string } | null }>
}

function json(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  })
}

async function authenticate(request: NextRequest) {
  const result = await authenticateTowerDevice(request)
  if (result.status === 'unavailable') {
    return { response: json({ success: false, message: 'Servico de dispositivos indisponivel.' }, 503) }
  }
  if (result.status === 'invalid') {
    return { response: json({ success: false, message: 'Credencial de dispositivo invalida.' }, 401) }
  }
  return { device: result.device }
}

export async function GET(request: NextRequest) {
  const authentication = await authenticate(request)
  if ('response' in authentication) return authentication.response

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('tower_store_admin_pins')
    .select('must_change,failed_attempts,locked_until')
    .eq('store_id', authentication.device.storeId)
    .maybeSingle()

  const pinStatus = data as PinStatusRow | null
  if (error || !pinStatus) {
    console.error('[Torre] Falha ao consultar estado do PIN:', error)
    return json({ success: false, message: 'PIN administrativo indisponivel.' }, 503)
  }

  return json({
    success: true,
    mustChange: pinStatus.must_change,
    failedAttempts: pinStatus.failed_attempts,
    lockedUntil: pinStatus.locked_until,
  })
}

export async function POST(request: NextRequest) {
  const authentication = await authenticate(request)
  if ('response' in authentication) return authentication.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json({ success: false, message: 'Corpo da requisicao invalido.' }, 400)
  }

  const parsed = pinRequestSchema.safeParse(body)
  if (!parsed.success) {
    return json({ success: false, message: 'Informe um PIN de seis digitos valido.' }, 400)
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('tower_store_admin_pins')
    .select('pin_hash,must_change,failed_attempts,locked_until')
    .eq('store_id', authentication.device.storeId)
    .maybeSingle()

  const pin = data as PinRow | null
  if (error || !pin) {
    console.error('[Torre] Falha ao carregar PIN administrativo:', error)
    return json({ success: false, message: 'PIN administrativo indisponivel.' }, 503)
  }

  if (pin.locked_until && new Date(pin.locked_until).getTime() > Date.now()) {
    return json({
      success: false,
      message: 'Muitas tentativas incorretas. Aguarde antes de tentar novamente.',
      lockedUntil: pin.locked_until,
    }, 423)
  }

  const verified = verifyTowerAdminPin(parsed.data.currentPin, pin.pin_hash)
  const newPinHash = verified && parsed.data.action === 'change'
    ? hashTowerAdminPin(parsed.data.newPin!)
    : null
  const pinRpc = admin as unknown as PinAttemptRpcClient
  const { data: attemptData, error: attemptError } = await pinRpc.rpc(
    'record_tower_admin_pin_attempt',
    {
      p_store_id: authentication.device.storeId,
      p_expected_pin_hash: pin.pin_hash,
      p_verified: verified,
      p_new_pin_hash: newPinHash,
    },
  )

  if (attemptError || !attemptData?.[0]) {
    console.error('[Torre] Falha ao registrar tentativa de PIN:', attemptError)
    return json({ success: false, message: 'Nao foi possivel validar o PIN.' }, 503)
  }

  const result = attemptData[0]
  if (!result.pin_verified) {
    return json({
      success: false,
      message: result.pin_locked_until
        ? 'Muitas tentativas incorretas. O acesso foi bloqueado por 15 minutos.'
        : 'PIN incorreto.',
      failedAttempts: result.pin_failed_attempts,
      lockedUntil: result.pin_locked_until,
    }, result.pin_locked_until ? 423 : 401)
  }

  return json({
    success: true,
    mustChange: result.pin_must_change,
    maintenanceGrant: issueTowerMaintenanceGrant(authentication.device),
    message: parsed.data.action === 'change'
      ? 'PIN alterado com seguranca.'
      : 'PIN confirmado.',
  })
}
