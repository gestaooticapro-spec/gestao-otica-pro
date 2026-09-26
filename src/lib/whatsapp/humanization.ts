import type { Json } from '@/lib/database.types'
import type { WhatsAppCanonicalReply } from './canonical'
import { extractWhatsAppCanonicalReply, getWhatsAppCanonicalHumanizableIntent } from './canonical'

export type WhatsAppHumanizationDecision =
  | 'skip_disabled'
  | 'skip_not_candidate'
  | 'apply'

export type WhatsAppHumanizationFailure = {
  success: false
  error: string
}

export type WhatsAppHumanizationSuccess = {
  success: true
  provider: string
  model: string
  attempts: number
  replyText: string
}

export type WhatsAppHumanizationOutcome =
  | WhatsAppHumanizationFailure
  | WhatsAppHumanizationSuccess

type PayloadRecord = Record<string, Json | undefined>

function preservesOrderStatus(payload: PayloadRecord, replyText: string) {
  const canonical = extractWhatsAppCanonicalReply(payload as Json)
  if (canonical?.intent !== 'order_status') return true

  const normalized = replyText.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()
  const has = (pattern: RegExp) => pattern.test(normalized)

  // Nao existe statusCode quando a busca nao localizou a OS. Nesse caso,
  // preserve o encaminhamento e a identificacao da IAra, sem inventar etapa.
  if (canonical.action === 'human_handoff' || canonical.action === 'repeat_handoff') {
    const identifiesIara = has(/\biara\b/u)
    const mentionsHuman = has(/\b(?:atendente|equipe|funcionario|colaborador|assessor|asesor|asesora|equipo|team|advisor|staff)\b/u)
    const inventsStatus = has(/\b(?:ficou|esta|ta|esta ya|is)\s+pront\w*\b/u)
      || has(/\b(?:pode|puede|can)\s+(?:ser\s+)?(?:retirar|retirado|retirada|buscar|recoger|pick up)\b/u)
      || has(/\b(?:em producao|no laboratorio|em montagem|in production|en produccion)\b/u)
    const canonicalNormalized = canonical.canonicalReply.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('pt-BR').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()
    const copiedCanonicalReply = normalized === canonicalNormalized
    return identifiesIara && mentionsHuman && !inventsStatus && !copiedCanonicalReply
  }

  // Um pedido de identificacao ainda nao tem status consultado para preservar.
  // Validamos que a resposta continue pedindo os dados necessarios, em vez de
  // exigir um statusCode inexistente e rejeitar toda resposta gerada pela IA.
  if (canonical.action === 'request_identifier'
    || canonical.outboundType === 'identifier_prompt'
    || canonical.outboundType === 'order_disambiguation_prompt') {
    const asksForIdentifier = /\b(?:envie|informe|diga|passe|compartilhe|me\s+(?:diga|informe|passe)|provide|send|share|tell me|indique|passar|informar|enviar|mandar|fornecer)\b/u.test(normalized)
    return /\b(?:cpf|numero do pedido|numero da os|ordem de servico|nome completo|titular|pedido)\b/u.test(normalized)
      && asksForIdentifier
  }

  const statusCode = canonical.facts.statusCode
  if (typeof statusCode !== 'string') return false
  switch (statusCode) {
    case 'ready_for_pickup':
      return has(/\b(?:ficou pronto|esta pronto|pronto para retirar|ja pode retirar|pode retirar|pode buscar|ready for pickup|ready to pick up|listo para recoger|ya puedes recoger)\b/u)
    case 'lens_in_production':
      return has(/\b(?:produc|laborator|fabric|production|fabricacion)\w*\b/u)
    case 'lens_arrived_needs_frame':
      return has(/\b(?:cheg|arriv|lleg)\w*\b/u) && has(/\b(?:armaca|mont|frame)\w*\b/u)
    case 'lens_arrived_assembling':
      return has(/\b(?:cheg|arriv|lleg)\w*\b/u) && has(/\b(?:mont|ensambl|assembly)\w*\b/u)
    default:
      return false
  }
}

export function decideWhatsAppHumanization(
  enabled: boolean,
  canonical: WhatsAppCanonicalReply | null
): {
  decision: WhatsAppHumanizationDecision
  intent: ReturnType<typeof getWhatsAppCanonicalHumanizableIntent>
} {
  if (!enabled) {
    return { decision: 'skip_disabled', intent: null }
  }

  const intent = getWhatsAppCanonicalHumanizableIntent(canonical)
  if (!canonical || !intent) {
    return { decision: 'skip_not_candidate', intent: null }
  }

  return { decision: 'apply', intent }
}

export function applyWhatsAppHumanizationOutcome(
  payload: PayloadRecord,
  fallbackText: string,
  outcome: WhatsAppHumanizationOutcome
) {
  if (!outcome.success) {
    return {
      text: fallbackText,
      payload: {
        ...payload,
        humanization: {
          enabled: true,
          success: false,
          error: outcome.error,
        },
      } satisfies PayloadRecord,
    }
  }

  const statusPreserved = preservesOrderStatus(payload, outcome.replyText)
  return {
    text: statusPreserved ? outcome.replyText : fallbackText,
    payload: {
      ...payload,
      humanization: {
        enabled: true,
        success: statusPreserved,
        provider: outcome.provider,
        model: outcome.model,
        attempts: outcome.attempts,
        ...(statusPreserved
          ? { replyText: outcome.replyText }
          : { rejectionReason: 'order_status_not_preserved' }),
      },
    } satisfies PayloadRecord,
  }
}
