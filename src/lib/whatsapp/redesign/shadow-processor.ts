import type { Json } from '@/lib/database.types'
import type { StoreSettings } from '@/lib/store-modules'
import {
  classifyWhatsAppRedesignConversation,
  type WhatsAppAiResult,
} from '../ai'
import { evaluateStoreHours } from '../store-hours-logic'
import {
  WhatsAppRedesignClassificationSchema,
  WhatsAppSystemDecisionSchema,
  type WhatsAppRedesignClassification,
} from './contracts'
import { applyStoreAvailabilityToDecision } from './store-availability-policy'
import { WhatsAppRedesignConversationStore, type WhatsAppRedesignTurnContext } from './store'
import { buildOfficialStoreLocationReply, buildWhatsAppShadowDecision } from './system-decision'

const SHADOW_PROCESSOR_VERSION = 1

type RedesignClassifier = (input: Parameters<typeof classifyWhatsAppRedesignConversation>[0]) =>
  Promise<WhatsAppAiResult<WhatsAppRedesignClassification>>

export type ProcessShadowTurnsOptions = {
  limit?: number
  storeId?: number
  now?: Date
  store?: WhatsAppRedesignConversationStore
  classifier?: RedesignClassifier
}

export type ProcessShadowTurnsResult = {
  discovered: number
  processed: number
  failed: number
  skipped: number
  sendsMessage: false
}

function jsonRecord(value: Json | null): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function elapsedBeforeTurn(context: WhatsAppRedesignTurnContext) {
  const currentIds = new Set(context.turnMessages.map((message) => message.id))
  const firstTurnAt = Math.min(...context.turnMessages.map((message) => Date.parse(message.occurredAt)))
  const previous = context.memory.messages
    .filter((message) => !currentIds.has(message.id) && Date.parse(message.occurredAt) < firstTurnAt)
    .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))[0]
  return previous ? Math.max(0, firstTurnAt - Date.parse(previous.occurredAt)) : null
}

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return message.slice(0, 500)
}

async function processClaimedTurn(input: {
  context: WhatsAppRedesignTurnContext
  now: Date
  store: WhatsAppRedesignConversationStore
  classifier: RedesignClassifier
}) {
  const { context } = input
  const existingMetadata = jsonRecord(context.turn.metadata)
  const storeProfile = await input.store.loadStore(context.conversation.store_id)
  const settings = (jsonRecord(storeProfile.settings) as StoreSettings)
  const hoursFacts = settings.store_hours
    ? evaluateStoreHours(settings.store_hours, input.now)
    : null

  const classificationResult = await input.classifier({
    memory: context.memory,
    turnMessages: context.turnMessages,
    elapsedSincePreviousMessageMs: elapsedBeforeTurn(context),
  })
  if (!classificationResult.success) {
    throw new Error(`classificacao_indisponivel:${classificationResult.error}`)
  }

  const classification = WhatsAppRedesignClassificationSchema.parse(classificationResult.data)
  const decisionResult = buildWhatsAppShadowDecision({
    classification,
    memory: context.memory,
    now: input.now.toISOString(),
    hoursFacts,
    storeLocationReply: buildOfficialStoreLocationReply(storeProfile),
    hasCurrentTurnAttachment: context.turnMessages.some((message) => message.kind !== 'text'),
  })
  const requiresHandoff = decisionResult.draft.action === 'human_handoff'
    || decisionResult.draft.action === 'repeat_handoff'
  if (requiresHandoff && !hoursFacts) {
    throw new Error('agenda_da_loja_ausente_para_handoff')
  }
  const decision = hoursFacts
    ? applyStoreAvailabilityToDecision(decisionResult.draft, hoursFacts)
    : WhatsAppSystemDecisionSchema.parse(decisionResult.draft)

  await input.store.finishTurn({
    turnId: context.turn.id,
    status: 'processed',
    metadata: {
      ...existingMetadata,
      shadowProcessing: {
        version: SHADOW_PROCESSOR_VERSION,
        processedAt: input.now.toISOString(),
        classification,
        decision,
        decisionReason: decisionResult.reason,
        context: {
          memoryMessageCount: context.memory.messages.length,
          turnMessageIds: context.turnMessages.map((message) => message.id),
          elapsedSincePreviousMessageMs: elapsedBeforeTurn(context),
        },
        ai: {
          provider: classificationResult.provider,
          model: classificationResult.model,
          attempts: classificationResult.attempts,
          latencyMs: classificationResult.latencyMs,
          tokenUsage: classificationResult.tokenUsage ?? null,
        },
        sendsMessage: false,
      },
    },
  })
}

export async function processWhatsAppRedesignShadowTurns(
  options: ProcessShadowTurnsOptions = {}
): Promise<ProcessShadowTurnsResult> {
  const store = options.store ?? new WhatsAppRedesignConversationStore()
  const classifier = options.classifier ?? classifyWhatsAppRedesignConversation
  const now = options.now ?? new Date()
  const turnIds = await store.listReadyTurnIds(options.limit ?? 10, now.toISOString(), options.storeId)
  const result: ProcessShadowTurnsResult = {
    discovered: turnIds.length,
    processed: 0,
    failed: 0,
    skipped: 0,
    sendsMessage: false,
  }

  for (const turnId of turnIds) {
    const claimed = await store.claimReadyTurn(turnId)
    if (!claimed) {
      result.skipped += 1
      continue
    }

    let context: WhatsAppRedesignTurnContext | null = null
    try {
      context = await store.loadTurnContext(turnId)
      if (context.conversation.mode !== 'shadow') {
        throw new Error('turno_fora_do_modo_sombra')
      }
      await processClaimedTurn({ context, now, store, classifier })
      result.processed += 1
    } catch (error) {
      const existingMetadata = context ? jsonRecord(context.turn.metadata) : {}
      await store.finishTurn({
        turnId,
        status: 'failed',
        metadata: {
          ...existingMetadata,
          shadowProcessing: {
            version: SHADOW_PROCESSOR_VERSION,
            processedAt: now.toISOString(),
            error: errorMessage(error),
            sendsMessage: false,
          },
        },
      })
      result.failed += 1
    }
  }

  return result
}
