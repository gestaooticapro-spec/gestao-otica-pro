import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { generateLensSalesAssistAction } from '@/lib/actions/gemini-narratives.actions'
import { locateTowerMeasurementPointsWithAiAction } from '@/lib/actions/tower-measurement-ai.actions'
import { generateVisagismoNarrativeAction } from '@/lib/actions/visagismo-ai.actions'
import { consumeTowerAuthenticatedRateLimit } from '@/lib/server/tower-activation-rate-limit'
import { authenticateTowerDeviceWebSessionToken } from '@/lib/server/tower-device-web-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BODY_BYTES = 4_000_000
const PointSchema = z.object({ x: z.number().finite(), y: z.number().finite() }).strict()
const MeasurementHandlesSchema = z.object({
  calibA: PointSchema.optional(),
  calibB: PointSchema.optional(),
  pupilR: PointSchema.optional(),
  pupilL: PointSchema.optional(),
  bridgeR: PointSchema.optional(),
  bridgeL: PointSchema.optional(),
  mountR: PointSchema.optional(),
  mountL: PointSchema.optional(),
  lensLeft: PointSchema.optional(),
  lensRight: PointSchema.optional(),
  lensTop: PointSchema.optional(),
  lensBottom: PointSchema.optional(),
  diagA: PointSchema.optional(),
  diagB: PointSchema.optional(),
  palpebraR: PointSchema.optional(),
  palpebraL: PointSchema.optional(),
}).strict()
const MeasurementPayloadSchema = z.object({
  dataUrl: z.string().max(3_600_000).regex(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/),
  width: z.number().int().min(64).max(4096),
  height: z.number().int().min(64).max(4096),
  existingHandles: MeasurementHandlesSchema.optional(),
  crop: z.object({
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().positive().finite(),
    height: z.number().positive().finite(),
  }).strict().optional(),
}).strict()
const GenericObjectSchema = z.record(z.string(), z.unknown())
const SalesAssistPayloadSchema = z.object({
  patientContext: GenericObjectSchema,
  technicalTriage: GenericObjectSchema.nullable(),
  motorInput: GenericObjectSchema,
  recommendations: z.array(GenericObjectSchema).min(1).max(3),
}).strict()
const VisagismoPayloadSchema = z.object({
  analysis: GenericObjectSchema,
  customerProfile: GenericObjectSchema,
  recommendations: z.array(GenericObjectSchema).min(1).max(12),
  templates: z.array(GenericObjectSchema).min(1).max(120),
  appearance: z.object({
    frameColor: z.string().max(32),
    lensMode: z.string().max(32),
    skinTone: z.string().max(32),
  }).strict(),
}).strict()
const RequestSchema = z.discriminatedUnion('command', [
  z.object({ storeId: z.number().int().positive(), command: z.literal('locate-measurement-points'), payload: MeasurementPayloadSchema }).strict(),
  z.object({ storeId: z.number().int().positive(), command: z.literal('generate-lens-sales-assist'), payload: SalesAssistPayloadSchema }).strict(),
  z.object({ storeId: z.number().int().positive(), command: z.literal('generate-visagismo-narrative'), payload: VisagismoPayloadSchema }).strict(),
])

const limits = {
  'locate-measurement-points': { attempts: 12, windowSeconds: 10 * 60 },
  'generate-lens-sales-assist': { attempts: 24, windowSeconds: 10 * 60 },
  'generate-visagismo-narrative': { attempts: 24, windowSeconds: 10 * 60 },
} as const

function json(payload: Record<string, unknown>, status = 200, headers?: HeadersInit) {
  return NextResponse.json(payload, {
    status,
    headers: { 'Cache-Control': 'no-store, max-age=0', ...headers },
  })
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
    return json({ success: false, message: 'Payload de IA excede o limite permitido.' }, 413)
  }

  let raw: unknown
  try {
    raw = JSON.parse(rawBody)
  } catch {
    return json({ success: false, message: 'Payload de IA invalido.' }, 400)
  }

  const parsed = RequestSchema.safeParse(raw)
  if (!parsed.success) {
    return json({ success: false, message: parsed.error.issues[0]?.message || 'Dados de IA invalidos.' }, 400)
  }

  const authorization = request.headers.get('authorization') ?? ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!token) return json({ success: false, message: 'Torre nao autenticada.' }, 401)

  const auth = await authenticateTowerDeviceWebSessionToken(token, parsed.data.storeId)
  if (!auth.ok || !auth.deviceId) {
    return json({ success: false, message: auth.ok ? 'Dispositivo da Torre invalido.' : auth.message }, 401)
  }

  const operationLimit = limits[parsed.data.command]
  const rateLimit = await consumeTowerAuthenticatedRateLimit(
    auth.deviceId,
    parsed.data.command,
    operationLimit.attempts,
    operationLimit.windowSeconds,
  )
  if (!rateLimit.allowed) {
    return json(
      { success: false, message: 'Limite de IA atingido. Aguarde alguns minutos e tente novamente.' },
      429,
      { 'Retry-After': String(rateLimit.retryAfterSeconds) },
    )
  }

  if (parsed.data.command === 'locate-measurement-points') {
    const result = await locateTowerMeasurementPointsWithAiAction(parsed.data.payload)
    return json({ success: true, message: 'Analise de medidas concluida.', data: result })
  }
  if (parsed.data.command === 'generate-lens-sales-assist') {
    const result = await generateLensSalesAssistAction(parsed.data.payload as Parameters<typeof generateLensSalesAssistAction>[0])
    return json({ success: true, message: 'Narrativa de lentes concluida.', data: result })
  }

  const result = await generateVisagismoNarrativeAction(parsed.data.payload as Parameters<typeof generateVisagismoNarrativeAction>[0])
  return json({ success: true, message: 'Narrativa de visagismo concluida.', data: result })
}
