import { createHash, randomBytes } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  clearTowerActivationAttempts,
  registerTowerActivationAttempt,
} from '@/lib/server/tower-activation-rate-limit'
import {
  extractTowerActivationSecret,
  type TowerDevicePairingResponse,
} from '@/lib/tower/device-activation-contract'
import { TOWER_ASSET_CREDENTIAL_PATTERN } from '@/lib/tower/asset-enrollment-contract'

export const dynamic = 'force-dynamic'

const requestSchema = z.object({
  method: z.enum(['qr', 'code']),
  credential: z.string().trim().min(1).max(96),
  assetCredential: z.string().regex(TOWER_ASSET_CREDENTIAL_PATTERN),
  deviceLabel: z.string().trim().min(2).max(120).default('Torre Windows'),
  appVersion: z.string().trim().max(60).nullable().default(null),
}).strict()

type PairTowerDeviceRpcArgs = {
  p_asset_credential_hash: string
  p_activation_method: 'qr' | 'code'
  p_activation_secret_hash: string
  p_device_credential_hash: string
  p_device_label: string
  p_app_version: string | null
}

type PairTowerDeviceRpcRow = {
  paired_device_id: string
  paired_asset_id: string
  paired_asset_public_code: string
  paired_tenant_id: string
  paired_store_id: number
  device_paired_at: string
}

type PairTowerDeviceRpcClient = {
  rpc: (
    functionName: 'pair_tower_asset_device',
    args: PairTowerDeviceRpcArgs,
  ) => PromiseLike<{ data: PairTowerDeviceRpcRow[] | null; error: unknown }>
}

function json(
  payload: TowerDevicePairingResponse,
  status = 200,
  headers?: HeadersInit,
) {
  return NextResponse.json(payload, {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      ...headers,
    },
  })
}

function errorMessage(error: unknown) {
  if (!error || typeof error !== 'object' || !('message' in error)) return ''
  return String((error as { message?: unknown }).message || '')
}

export async function POST(request: NextRequest) {
  const rateLimit = await registerTowerActivationAttempt(request)
  if (!rateLimit.allowed) {
    return json(
      { success: false, message: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' },
      429,
      { 'Retry-After': String(rateLimit.retryAfterSeconds) },
    )
  }

  try {
    const rawBody = await request.text()
    if (rawBody.length > 768) {
      return json({ success: false, message: 'Dados de pareamento invalidos.' }, 400)
    }

    const parsed = requestSchema.safeParse(JSON.parse(rawBody))
    if (!parsed.success) {
      return json({ success: false, message: 'Dados de pareamento invalidos.' }, 400)
    }

    const activationSecret = extractTowerActivationSecret(
      parsed.data.method,
      parsed.data.credential,
    )
    if (!activationSecret) {
      return json({ success: false, message: 'Dados de pareamento invalidos.' }, 400)
    }

    const hash = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex')
    const activationSecretHash = hash(activationSecret)
    const deviceCredential = `tower_device_v1_${randomBytes(32).toString('base64url')}`
    const deviceCredentialHash = hash(deviceCredential)
    const admin = createAdminClient()
    const pairRpc = admin as unknown as PairTowerDeviceRpcClient
    const { data, error } = await pairRpc.rpc('pair_tower_asset_device', {
      p_asset_credential_hash: hash(parsed.data.assetCredential),
      p_activation_method: parsed.data.method,
      p_activation_secret_hash: activationSecretHash,
      p_device_credential_hash: deviceCredentialHash,
      p_device_label: parsed.data.deviceLabel,
      p_app_version: parsed.data.appVersion,
    })

    const paired = data?.[0]
    if (error || !paired) {
      const databaseMessage = errorMessage(error)
      if (databaseMessage.includes('TOWER_ACTIVATION_INVALID')) {
        return json({
          success: false,
          message: 'Ativacao invalida, expirada, revogada ou ja utilizada.',
        }, 409)
      }
      if (databaseMessage.includes('TOWER_ASSET_IDENTITY_INVALID')) {
        return json({
          success: false,
          message: 'A identidade fisica desta Torre foi revogada ou nao esta preparada.',
        }, 409)
      }

      console.error('[Torre] Falha no pareamento:', error)
      return json({ success: false, message: 'Nao foi possivel parear a Torre agora.' }, 503)
    }

    await clearTowerActivationAttempts(rateLimit.key, rateLimit.scope)
    return json({
      success: true,
      status: 'paired',
      deviceId: paired.paired_device_id,
      assetId: paired.paired_asset_id,
      publicCode: paired.paired_asset_public_code,
      tenantId: paired.paired_tenant_id,
      storeId: paired.paired_store_id,
      deviceCredential,
      pairedAt: paired.device_paired_at,
    })
  } catch (error) {
    if (error instanceof SyntaxError) {
      return json({ success: false, message: 'Dados de pareamento invalidos.' }, 400)
    }

    console.error('[Torre] Erro inesperado no pareamento:', error)
    return json({ success: false, message: 'Nao foi possivel parear a Torre agora.' }, 500)
  }
}
