import { randomBytes, randomInt } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { authenticateTowerDevice } from '@/lib/server/tower-device-auth'
import { verifyTowerMaintenanceGrant } from '@/lib/server/tower-maintenance-grant'
import { createAdminClient } from '@/lib/supabase/admin'
import { hashTowerAdminPin } from '@/lib/tower-admin-pin'

export const dynamic = 'force-dynamic'

type AccessRow = { public_code: string; updated_at: string }

function json(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  })
}

async function authorize(request: NextRequest) {
  const authentication = await authenticateTowerDevice(request)
  if (authentication.status === 'unavailable') return { response: json({ success: false, message: 'Servico indisponivel.' }, 503) }
  if (authentication.status === 'invalid') return { response: json({ success: false, message: 'Credencial de dispositivo invalida.' }, 401) }
  if (!verifyTowerMaintenanceGrant(request.headers.get('x-tower-maintenance-grant'), authentication.device)) {
    return { response: json({ success: false, message: 'Confirme novamente o PIN administrativo.' }, 403) }
  }
  return { device: authentication.device }
}

function remoteUrl(request: NextRequest, publicCode: string) {
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim()
  const origin = configuredOrigin ? new URL(configuredOrigin).origin : request.nextUrl.origin
  return new URL(`/torre/remota/${publicCode}`, origin).toString()
}

export async function GET(request: NextRequest) {
  const authorization = await authorize(request)
  if ('response' in authorization) return authorization.response

  const admin = createAdminClient() as unknown as {
    from: (table: 'tower_remote_config_access') => {
      select: (columns: string) => {
        eq: (column: string, value: number) => {
          maybeSingle: () => PromiseLike<{ data: AccessRow | null; error: unknown }>
        }
      }
    }
  }
  const { data, error } = await admin.from('tower_remote_config_access')
    .select('public_code,updated_at')
    .eq('store_id', authorization.device.storeId)
    .maybeSingle()
  if (error) return json({ success: false, message: 'Nao foi possivel consultar o acesso comercial.' }, 503)
  if (!data) return json({ success: true, configured: false })
  return json({
    success: true,
    configured: true,
    url: remoteUrl(request, data.public_code),
    updatedAt: data.updated_at,
  })
}

export async function POST(request: NextRequest) {
  const authorization = await authorize(request)
  if ('response' in authorization) return authorization.response

  const publicCode = randomBytes(24).toString('base64url').slice(0, 32)
  const commercialPin = String(randomInt(0, 1_000_000)).padStart(6, '0')
  const admin = createAdminClient() as unknown as {
    rpc: (name: 'rotate_tower_remote_config_access', args: Record<string, unknown>) => PromiseLike<{ error: unknown }>
  }
  const { error } = await admin.rpc('rotate_tower_remote_config_access', {
    p_store_id: authorization.device.storeId,
    p_public_code: publicCode,
    p_pin_hash: hashTowerAdminPin(commercialPin),
  })
  if (error) {
    console.error('[Torre] Falha ao criar acesso comercial:', error)
    return json({ success: false, message: 'Nao foi possivel criar o acesso comercial. Aplique a migracao do passo 8.' }, 503)
  }
  return json({
    success: true,
    configured: true,
    url: remoteUrl(request, publicCode),
    commercialPin,
    message: 'Acesso comercial criado. Anote o PIN: ele sera exibido somente agora.',
  })
}
