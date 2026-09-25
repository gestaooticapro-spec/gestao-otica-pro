import type { StoreHoursFacts } from '../store-hours-logic'
import {
  WhatsAppSystemDecisionDraftSchema,
  WhatsAppSystemDecisionSchema,
  type WhatsAppSystemDecisionDraft,
  type WhatsAppSystemDecision,
} from './contracts'
import { localizeNextOpenSchedule } from './reply-language'

function lowerFirst(value: string) {
  if (!value) return value
  return `${value.charAt(0).toLocaleLowerCase('pt-BR')}${value.slice(1)}`
}

function isHumanHandoff(decision: WhatsAppSystemDecisionDraft) {
  return decision.action === 'human_handoff' || decision.action === 'repeat_handoff'
}

/**
 * O expediente nao decide se a IA pode responder. Ele altera somente quando
 * um encaminhamento humano podera ser atendido pela equipe da loja.
 */
export function applyStoreAvailabilityToDecision(
  decision: WhatsAppSystemDecisionDraft,
  hoursFacts: StoreHoursFacts
): WhatsAppSystemDecision {
  const parsedDecision = WhatsAppSystemDecisionDraftSchema.parse(decision)
  if (!isHumanHandoff(parsedDecision)) return WhatsAppSystemDecisionSchema.parse(parsedDecision)

  if (hoursFacts.is_open_now) {
    return WhatsAppSystemDecisionSchema.parse({
      ...parsedDecision,
      facts: {
        ...parsedDecision.facts,
        isStoreOpenNow: true,
        humanHandoffTiming: 'during_open_hours',
        nextOpenSchedule: null,
      },
      humanHandoffTiming: {
        mode: 'during_open_hours',
        nextOpenSchedule: null,
      },
      humanization: {
        ...parsedDecision.humanization,
        mustIdentifyIara: true,
        mustMentionHumanHandoff: true,
      },
    })
  }

  const nextOpenSchedule = hoursFacts.next_open_schedule.trim()
  if (!nextOpenSchedule) {
    throw new Error('A loja esta fechada, mas o proximo horario de abertura nao foi calculado.')
  }

  const timingNotice = `Como a loja está fechada agora, um funcionário continuará com você quando ela abrir, ${lowerFirst(nextOpenSchedule)}.`

  const replyLanguage = parsedDecision.facts.replyLanguage
  const localizedNextOpen = replyLanguage === 'es'
    ? localizeNextOpenSchedule(nextOpenSchedule, 'es')
    : replyLanguage === 'en'
      ? localizeNextOpenSchedule(nextOpenSchedule, 'en')
      : nextOpenSchedule
  const localizedNotice = replyLanguage === 'es'
    ? `La tienda está cerrada ahora. Un asesor continuará contigo cuando abra, ${lowerFirst(localizedNextOpen)}.`
    : replyLanguage === 'en'
      ? `The store is currently closed. A team member will continue helping you when it opens, ${lowerFirst(localizedNextOpen)}.`
      : timingNotice

  return WhatsAppSystemDecisionSchema.parse({
    ...parsedDecision,
    canonicalReply: `${parsedDecision.canonicalReply} ${localizedNotice}`,
    facts: {
      ...parsedDecision.facts,
      isStoreOpenNow: false,
      isExceptionalClosure: hoursFacts.is_exceptional_closure,
      humanHandoffTiming: 'when_store_opens',
      nextOpenSchedule,
    },
    humanHandoffTiming: {
      mode: 'when_store_opens',
      nextOpenSchedule,
    },
    humanization: {
      ...parsedDecision.humanization,
      mustIdentifyIara: true,
      mustMentionHumanHandoff: true,
    },
  })
}
