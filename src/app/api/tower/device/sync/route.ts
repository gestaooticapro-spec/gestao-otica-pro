import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateTowerDevice } from '@/lib/server/tower-device-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FiniteMeasurementSchema = z.number().finite().min(-1000).max(1000)
const FrontMeasurementsSchema = z.object({
  dp: FiniteMeasurementSchema,
  dnpOD: FiniteMeasurementSchema,
  dnpOE: FiniteMeasurementSchema,
  altOD: FiniteMeasurementSchema,
  altOE: FiniteMeasurementSchema,
  ponte: FiniteMeasurementSchema,
  horizontal: FiniteMeasurementSchema,
  vertical: FiniteMeasurementSchema,
  diagonal: FiniteMeasurementSchema,
  diamOD: FiniteMeasurementSchema,
  diamOE: FiniteMeasurementSchema,
  palpebraOD: FiniteMeasurementSchema,
  palpebraOE: FiniteMeasurementSchema,
})
const ProfileMeasurementsSchema = z.object({
  vertexDistance: FiniteMeasurementSchema,
  pantoscopicAngle: FiniteMeasurementSchema,
})
const CommonEventSchema = z.object({
  eventId: z.string().uuid(),
  entityId: z.string().uuid(),
  payloadHash: z.string().regex(/^[0-9a-f]{64}$/),
})
const SyncEventSchema = z.discriminatedUnion('eventType', [
  CommonEventSchema.extend({
    eventType: z.literal('tower_customer.upsert'),
    payload: z.object({
      id: z.string().uuid(),
      fullName: z.string().trim().min(3).max(160),
      mobilePhone: z.string().regex(/^\d{8,20}$/),
      createdAt: z.string().datetime(),
    }),
  }),
  CommonEventSchema.extend({
    eventType: z.literal('tower_session.upsert'),
    payload: z.object({
      id: z.string().uuid(),
      status: z.enum(['active', 'completed', 'discarded', 'expired']),
      currentExperience: z.enum(['look', 'visagismo', 'campo_visual', 'medidas', 'thickness']).nullable(),
      customerId: z.null(),
      localCustomerId: z.string().uuid().nullable().optional(),
      opticalEvaluationId: z.null(),
      prescriptionSnapshot: z.unknown().nullable(),
      startedAt: z.string().datetime(),
      completedAt: z.string().datetime().nullable(),
      discardedAt: z.string().datetime().nullable(),
      clientUpdatedAt: z.string().datetime(),
    }),
  }),
  CommonEventSchema.extend({
    eventType: z.literal('tower_measurement.created'),
    payload: z.object({
      id: z.string().uuid(),
      towerSessionId: z.string().uuid(),
      version: z.number().int().positive(),
      lensMode: z.enum(['multifocal', 'bifocal']),
      referenceMm: z.number().finite().positive().max(1000),
      frontMeasurements: FrontMeasurementsSchema,
      profileMeasurements: ProfileMeasurementsSchema,
      attentionCodes: z.array(z.enum([
        'low_fitting_height',
        'high_vertex_distance',
        'high_pantoscopic_angle',
        'dnp_difference',
      ])).max(4),
      algorithmVersion: z.string().trim().min(1).max(80),
      createdAt: z.string().datetime(),
    }),
  }),
  CommonEventSchema.extend({
    eventType: z.literal('tower_hardware_validation.upsert'),
    payload: z.object({
      id: z.string().uuid(),
      hardwareFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
      hardwareSnapshot: z.object({
        schemaVersion: z.literal(1),
        platform: z.string().min(1).max(32),
        hostname: z.string().min(1).max(255),
        displays: z.array(z.object({
          id: z.string().min(1).max(255),
          primary: z.boolean(),
          internal: z.boolean(),
          rotation: z.number().int().min(0).max(360),
          scaleFactor: z.number().finite().positive().max(10),
          bounds: z.object({
            x: z.number().int(), y: z.number().int(), width: z.number().int().positive(), height: z.number().int().positive(),
          }),
        })).min(1).max(8),
      }),
      cameraApprovedAt: z.string().datetime().nullable(),
      touchApprovedAt: z.string().datetime().nullable(),
      displayApprovedAt: z.string().datetime().nullable(),
      updatedAt: z.string().datetime(),
    }),
  }),
])

const SyncBatchSchema = z.object({
  events: z.array(SyncEventSchema).min(1).max(20),
})

export async function POST(request: NextRequest) {
  const authentication = await authenticateTowerDevice(request)
  if (authentication.status === 'invalid') {
    return NextResponse.json({ success: false, message: 'Credencial de dispositivo invalida.' }, { status: 401 })
  }
  if (authentication.status === 'unavailable') {
    return NextResponse.json({ success: false, message: 'Autenticacao da Torre indisponivel.' }, { status: 503 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, message: 'Lote de sincronizacao invalido.' }, { status: 400 })
  }

  const parsed = SyncBatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: 'Lote de sincronizacao invalido.' }, { status: 400 })
  }

  const acknowledgedEventIds: string[] = []
  const eventResults: Array<{ eventId: string; entityId: string; remoteCustomerId: number }> = []
  const admin = createAdminClient()
  const syncRpc = admin.rpc as unknown as (
    functionName: 'apply_tower_device_sync_event_v3',
    parameters: Record<string, unknown>,
  ) => Promise<{ data: number | null; error: { message: string } | null }>
  for (const event of parsed.data.events) {
    const calculatedHash = createHash('sha256')
      .update(JSON.stringify(event.payload), 'utf8')
      .digest('hex')
    if (calculatedHash !== event.payloadHash) {
      return NextResponse.json({
        success: false,
        message: 'Integridade do evento de sincronizacao invalida.',
        acknowledgedEventIds,
        eventResults,
        failedEventId: event.eventId,
      }, { status: 400 })
    }

    // A RPC deriva tenant e loja do dispositivo e aplica evento + recibo na
    // mesma transacao. Assim, repetir o lote depois de uma queda e seguro.
    const { data: remoteCustomerId, error } = await syncRpc('apply_tower_device_sync_event_v3', {
      p_device_id: authentication.device.id,
      p_event_id: event.eventId,
      p_event_type: event.eventType,
      p_entity_id: event.entityId,
      p_payload_hash: event.payloadHash,
      p_payload: event.payload,
    })

    if (error) {
      console.error('[Torre] Falha ao aplicar evento offline:', {
        eventId: event.eventId,
        eventType: event.eventType,
        deviceId: authentication.device.id,
        error,
      })
      const publicMessage = error.message.includes('TOWER_SYNC_CUSTOMER_NAME_CONFLICT')
        ? 'Ja existe um cliente com este nome nesta loja. Confirme o cadastro existente.'
        : error.message.includes('TOWER_SYNC_CUSTOMER_PHONE_CONFLICT')
          ? 'Este celular ja pertence a outro cliente desta loja.'
          : 'Nao foi possivel concluir a sincronizacao.'
      return NextResponse.json({
        success: false,
        message: publicMessage,
        acknowledgedEventIds,
        eventResults,
        failedEventId: event.eventId,
      }, { status: 409 })
    }
    acknowledgedEventIds.push(event.eventId)
    if (event.eventType === 'tower_customer.upsert'
        && Number.isSafeInteger(remoteCustomerId) && Number(remoteCustomerId) > 0) {
      eventResults.push({
        eventId: event.eventId,
        entityId: event.entityId,
        remoteCustomerId: Number(remoteCustomerId),
      })
    }
  }

  return NextResponse.json({ success: true, acknowledgedEventIds, eventResults })
}
