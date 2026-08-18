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
      remoteCustomerId: z.number().int().positive().nullable().optional(),
      createdAt: z.string().datetime({ offset: true }),
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
      localEvaluationId: z.string().uuid().nullable().optional(),
      prescriptionSnapshot: z.unknown().nullable(),
      startedAt: z.string().datetime({ offset: true }),
      completedAt: z.string().datetime({ offset: true }).nullable(),
      discardedAt: z.string().datetime({ offset: true }).nullable(),
      clientUpdatedAt: z.string().datetime({ offset: true }),
    }),
  }),
  CommonEventSchema.extend({
    eventType: z.literal('tower_heatmap.upsert'),
    payload: z.object({
      id: z.string().uuid(),
      towerSessionId: z.string().uuid(),
      status: z.enum(['created', 'running', 'completed', 'cancelled', 'failed']),
      algorithmVersion: z.string().trim().min(1).max(80),
      targetPlanVersion: z.string().trim().min(1).max(80),
      resultSummary: z.record(z.string(), z.unknown()).nullable(),
      targetSamples: z.array(z.unknown()).max(20_000).nullable(),
      startedAt: z.string().datetime({ offset: true }).nullable(),
      completedAt: z.string().datetime({ offset: true }).nullable(),
      cancelledAt: z.string().datetime({ offset: true }).nullable(),
      clientUpdatedAt: z.string().datetime({ offset: true }),
    }),
  }),
  CommonEventSchema.extend({
    eventType: z.literal('tower_evaluation.upsert'),
    payload: z.object({
      id: z.string().uuid(),
      towerSessionId: z.string().uuid(),
      localCustomerId: z.string().uuid(),
      evaluation: z.record(z.string(), z.unknown()),
      recommendations: z.array(z.unknown()).max(100).nullable(),
      clientUpdatedAt: z.string().datetime({ offset: true }),
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
      createdAt: z.string().datetime({ offset: true }),
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
      cameraApprovedAt: z.string().datetime({ offset: true }).nullable(),
      touchApprovedAt: z.string().datetime({ offset: true }).nullable(),
      displayApprovedAt: z.string().datetime({ offset: true }).nullable(),
      updatedAt: z.string().datetime({ offset: true }),
    }),
  }),
])

const SyncBatchEnvelopeSchema = z.object({
  // O envelope e validado antes dos eventos para manter o limite operacional.
  // Cada evento e validado no loop: um legado malformado nao pode esconder a
  // identidade do evento nem bloquear os demais atendimentos da Torre.
  events: z.array(z.unknown()).min(1).max(20),
})

const SyncFailureCodes = [
  'TOWER_SYNC_EVENT_INVALID',
  'TOWER_SYNC_EVENT_CONFLICT',
  'TOWER_SYNC_CUSTOMER_INVALID',
  'TOWER_SYNC_CUSTOMER_NAME_CONFLICT',
  'TOWER_SYNC_CUSTOMER_PHONE_CONFLICT',
  'TOWER_SYNC_CUSTOMER_SCOPE_INVALID',
  'TOWER_SYNC_SESSION_INVALID',
  'TOWER_SYNC_SESSION_SCOPE_INVALID',
  'TOWER_SYNC_MEASUREMENT_INVALID',
  'TOWER_SYNC_HEATMAP_INVALID',
  'TOWER_SYNC_HEATMAP_SCOPE_INVALID',
  'TOWER_SYNC_EVALUATION_INVALID',
] as const

function isPermanentEventFailure(message: string) {
  return SyncFailureCodes.some((code) => message.includes(code))
}

function publicFailureCode(error: { code?: string | null, message?: string | null }) {
  const message = String(error.message || '')
  const domainCode = SyncFailureCodes.find((code) => message.includes(code))
  if (domainCode) return domainCode

  // Dependencias entre eventos (por exemplo, uma sessao que aguarda o
  // mapeamento do cliente local) sao codigos de dominio validos, mas nao sao
  // falhas permanentes. Preserve o codigo para a Torre diagnosticar e manter
  // a nova tentativa, sem expor detalhes do PostgreSQL.
  const genericDomainCode = message.match(/\b(TOWER_SYNC_[A-Z_]+)\b/)?.[1]
  if (genericDomainCode) return genericDomainCode

  // Codigos PostgreSQL nao carregam valores de payload nem dados pessoais.
  // Eles tornam diagnosticavel uma incompatibilidade de schema sem vazar a
  // excecao, a query ou os dados do atendimento para a Torre.
  const databaseCodes: Record<string, string> = {
    '22003': 'TOWER_SYNC_DATA_RANGE_INVALID',
    '22007': 'TOWER_SYNC_DATA_FORMAT_INVALID',
    '22P02': 'TOWER_SYNC_DATA_FORMAT_INVALID',
    '23502': 'TOWER_SYNC_REQUIRED_FIELD_MISSING',
    '23503': 'TOWER_SYNC_REFERENCE_INVALID',
    '23505': 'TOWER_SYNC_RECORD_CONFLICT',
    '42703': 'TOWER_SYNC_SERVER_SCHEMA_OUTDATED',
    '42883': 'TOWER_SYNC_SERVER_SCHEMA_OUTDATED',
    '42P01': 'TOWER_SYNC_SERVER_SCHEMA_OUTDATED',
  }
  return databaseCodes[String(error.code || '')] || 'TOWER_SYNC_APPLY_FAILED'
}

function isPermanentFailureCode(code: string) {
  return code === 'TOWER_SYNC_DATA_RANGE_INVALID'
    || code === 'TOWER_SYNC_DATA_FORMAT_INVALID'
    || code === 'TOWER_SYNC_REQUIRED_FIELD_MISSING'
    || code === 'TOWER_SYNC_REFERENCE_INVALID'
    || code === 'TOWER_SYNC_RECORD_CONFLICT'
}

function invalidEventId(event: unknown) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) return null
  const eventId = (event as { eventId?: unknown }).eventId
  return typeof eventId === 'string' && z.string().uuid().safeParse(eventId).success ? eventId : null
}

function invalidEventFields(error: z.ZodError) {
  const fields = [...new Set(error.issues
    .map((issue) => issue.path.join('.'))
    .filter(Boolean))]
    .slice(0, 6)
  return fields.length ? fields.join(', ') : 'estrutura do evento'
}

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

  const parsed = SyncBatchEnvelopeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: 'Lote de sincronizacao invalido.' }, { status: 400 })
  }

  const acknowledgedEventIds: string[] = []
  const eventResults: Array<{
    eventId: string
    entityId: string
    remoteCustomerId?: number
    remoteEvaluationId?: number
  }> = []
  const admin = createAdminClient()
  for (const rawEvent of parsed.data.events) {
    const parsedEvent = SyncEventSchema.safeParse(rawEvent)
    if (!parsedEvent.success) {
      const eventId = invalidEventId(rawEvent)
      return NextResponse.json({
        success: false,
        message: `Evento de sincronizacao invalido (${invalidEventFields(parsedEvent.error)}).`,
        failureCode: 'TOWER_SYNC_EVENT_INVALID',
        acknowledgedEventIds,
        eventResults,
        failedEventId: eventId,
        // Sem um UUID valido nao e possivel apontar um evento com seguranca;
        // a Torre preserva a fila e registra o diagnostico, sem descartar nada.
        permanentFailure: Boolean(eventId),
      }, { status: 400 })
    }
    const event = parsedEvent.data
    const calculatedHash = createHash('sha256')
      .update(JSON.stringify(event.payload), 'utf8')
      .digest('hex')
    if (calculatedHash !== event.payloadHash) {
      return NextResponse.json({
        success: false,
        message: 'Integridade do evento de sincronizacao invalida.',
        failureCode: 'TOWER_SYNC_EVENT_INVALID',
        acknowledgedEventIds,
        eventResults,
        failedEventId: event.eventId,
        permanentFailure: true,
      }, { status: 400 })
    }

    // A RPC deriva tenant e loja do dispositivo e aplica evento + recibo na
    // mesma transacao. Assim, repetir o lote depois de uma queda e seguro.
    const { data: remoteEntityId, error } = await (admin as any).rpc('apply_tower_device_sync_event_v4', {
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
      const failureCode = publicFailureCode(error)
      return NextResponse.json({
        success: false,
        // A Torre 0.1.11 persiste somente `message` no SQLite. O codigo seguro
        // tambem segue no texto para diagnosticar instalacoes ja distribuidas,
        // sem expor a excecao, SQL ou dados pessoais.
        message: `${publicMessage} (${failureCode})`,
        failureCode,
        acknowledgedEventIds,
        eventResults,
        failedEventId: event.eventId,
        permanentFailure: isPermanentEventFailure(error.message) || isPermanentFailureCode(failureCode),
      }, { status: 409 })
    }
    acknowledgedEventIds.push(event.eventId)
    if (event.eventType === 'tower_customer.upsert'
        && Number.isSafeInteger(remoteEntityId) && Number(remoteEntityId) > 0) {
      eventResults.push({
        eventId: event.eventId,
        entityId: event.entityId,
        remoteCustomerId: Number(remoteEntityId),
      })
    }
    if (event.eventType === 'tower_evaluation.upsert'
        && Number.isSafeInteger(remoteEntityId) && Number(remoteEntityId) > 0) {
      eventResults.push({
        eventId: event.eventId,
        entityId: event.entityId,
        remoteEvaluationId: Number(remoteEntityId),
      })
    }
  }

  return NextResponse.json({ success: true, acknowledgedEventIds, eventResults })
}
