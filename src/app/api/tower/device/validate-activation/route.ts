import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  extractTowerActivationSecret,
  type TowerActivationValidationResponse,
} from '@/lib/tower/device-activation-contract'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  clearTowerActivationAttempts,
  registerTowerActivationAttempt,
} from '@/lib/server/tower-activation-rate-limit'

export const dynamic = 'force-dynamic'

const requestSchema = z.object({
  method: z.enum(['qr', 'code']),
  credential: z.string().trim().min(1).max(96),
}).strict()

type ActivationRow = {
  status: 'pending' | 'consumed' | 'revoked'
  expires_at: string
}

function json(
  payload: TowerActivationValidationResponse,
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

export async function POST(request: NextRequest) {
  const rateLimit = await registerTowerActivationAttempt(request)
  if (!rateLimit.allowed) {
    return json(
      {
        success: false,
        message: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
      },
      429,
      { 'Retry-After': String(rateLimit.retryAfterSeconds) },
    )
  }

  try {
    const rawBody = await request.text()
    if (rawBody.length > 512) {
      return json({ success: false, message: 'Dados de ativacao invalidos.' }, 400)
    }

    const parsed = requestSchema.safeParse(JSON.parse(rawBody))
    if (!parsed.success) {
      return json({ success: false, message: 'Dados de ativacao invalidos.' }, 400)
    }

    const secret = extractTowerActivationSecret(
      parsed.data.method,
      parsed.data.credential,
    )
    if (!secret) {
      return json({ success: false, message: 'Dados de ativacao invalidos.' }, 400)
    }

    const credentialHash = createHash('sha256').update(secret, 'utf8').digest('hex')
    const credentialColumn = parsed.data.method === 'qr' ? 'token_hash' : 'fallback_code_hash'
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('tower_device_activations')
      .select('status,expires_at')
      .eq(credentialColumn, credentialHash)
      .maybeSingle()

    if (error) {
      console.error('[Torre] Falha ao validar ativacao:', error)
      return json({ success: false, message: 'Nao foi possivel validar a ativacao agora.' }, 503)
    }

    const activation = data as ActivationRow | null
    const isPending = activation?.status === 'pending'
    const isWithinExpiry = activation
      ? new Date(activation.expires_at).getTime() > Date.now()
      : false

    if (!activation || !isPending || !isWithinExpiry) {
      return json({
        success: false,
        message: 'Ativacao invalida, expirada, revogada ou ja utilizada.',
      }, 404)
    }

    await clearTowerActivationAttempts(rateLimit.key, rateLimit.scope)
    return json({
      success: true,
      status: 'validated',
      expiresAt: activation.expires_at,
    })
  } catch (error) {
    if (error instanceof SyntaxError) {
      return json({ success: false, message: 'Dados de ativacao invalidos.' }, 400)
    }

    console.error('[Torre] Erro inesperado na validacao:', error)
    return json({ success: false, message: 'Nao foi possivel validar a ativacao agora.' }, 500)
  }
}
