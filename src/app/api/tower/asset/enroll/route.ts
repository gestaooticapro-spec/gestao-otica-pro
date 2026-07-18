import { createHash, randomBytes } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { registerTowerActivationAttempt, clearTowerActivationAttempts } from '@/lib/server/tower-activation-rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  extractTowerAssetEnrollment,
  type TowerAssetEnrollmentResponse,
} from '@/lib/tower/asset-enrollment-contract'

export const dynamic = 'force-dynamic'

const schema = z.object({
  method: z.enum(['qr', 'code']),
  publicCode: z.string().trim().max(32).default(''),
  credential: z.string().trim().min(1).max(160),
  deviceLabel: z.string().trim().min(2).max(120),
  appVersion: z.string().trim().max(60).nullable().default(null),
}).strict()

function json(payload: TowerAssetEnrollmentResponse, status = 200, headers?: HeadersInit) {
  return NextResponse.json(payload, {
    status,
    headers: { 'Cache-Control': 'no-store, max-age=0', ...headers },
  })
}

export async function POST(request: NextRequest) {
  const rateLimit = await registerTowerActivationAttempt(request)
  if (!rateLimit.allowed) {
    return json(
      { success: false, message: 'Muitas tentativas. Aguarde alguns minutos.' },
      429,
      { 'Retry-After': String(rateLimit.retryAfterSeconds) },
    )
  }

  try {
    const rawBody = await request.text()
    if (rawBody.length > 768) return json({ success: false, message: 'Dados de fabrica invalidos.' }, 400)
    const parsed = schema.safeParse(JSON.parse(rawBody))
    if (!parsed.success) return json({ success: false, message: 'Dados de fabrica invalidos.' }, 400)

    const enrollment = extractTowerAssetEnrollment(
      parsed.data.method,
      parsed.data.publicCode,
      parsed.data.credential,
    )
    if (!enrollment) return json({ success: false, message: 'Codigo da Torre ou credencial invalidos.' }, 400)

    const assetCredential = `tower_asset_v1_${randomBytes(32).toString('base64url')}`
    const hash = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex')
    const admin = createAdminClient() as unknown as {
      rpc: (name: 'enroll_tower_asset', args: Record<string, unknown>) => PromiseLike<{
        data: Array<{ enrolled_asset_id: string; enrolled_public_code: string; asset_enrolled_at: string }> | null
        error: { message?: string } | null
      }>
    }
    const { data, error } = await admin.rpc('enroll_tower_asset', {
      p_method: parsed.data.method,
      p_public_code: enrollment.publicCode,
      p_secret_hash: hash(enrollment.secret),
      p_asset_credential_hash: hash(assetCredential),
      p_device_label: parsed.data.deviceLabel,
      p_app_version: parsed.data.appVersion,
    })
    const enrolled = data?.[0]
    if (error || !enrolled) {
      if (error?.message?.includes('TOWER_ASSET_ENROLLMENT_INVALID')) {
        return json({ success: false, message: 'Credencial expirada, revogada ou ja utilizada.' }, 409)
      }
      console.error('[Torre] Falha no registro fisico:', error)
      return json({ success: false, message: 'Nao foi possivel registrar esta Torre agora.' }, 503)
    }

    await clearTowerActivationAttempts(rateLimit.key, rateLimit.scope)
    return json({
      success: true,
      status: 'enrolled',
      assetId: enrolled.enrolled_asset_id,
      publicCode: enrolled.enrolled_public_code,
      assetCredential,
      enrolledAt: enrolled.asset_enrolled_at,
    })
  } catch (error) {
    if (error instanceof SyntaxError) return json({ success: false, message: 'Dados de fabrica invalidos.' }, 400)
    console.error('[Torre] Erro no registro fisico:', error)
    return json({ success: false, message: 'Nao foi possivel registrar esta Torre agora.' }, 500)
  }
}
