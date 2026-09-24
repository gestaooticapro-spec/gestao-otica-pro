import {
  WhatsAppConversationSummarySchema,
  registerHumanActivity,
  releaseExpiredHumanControl,
  type WhatsAppConversationMessage,
  type WhatsAppConversationSummary,
  type WhatsAppRedesignClassification,
} from './contracts'

// Somente uma saída confirmada como humana pode ativar o bloqueio. O eco
// técnico fromMe e uma proposta de handoff não são evidência suficiente.
export function reconcileConfirmedHumanActivity(input: {
  summary: WhatsAppConversationSummary
  humanMessageAt: string | null
  asOf: string
}): WhatsAppConversationSummary {
  const summary = WhatsAppConversationSummarySchema.parse(input.summary)
  const asOf = Date.parse(input.asOf)
  if (!Number.isFinite(asOf)) throw new Error('Data do contexto invalida.')
  if (!input.humanMessageAt) return releaseExpiredHumanControl(summary, input.asOf)

  const humanAt = Date.parse(input.humanMessageAt)
  if (!Number.isFinite(humanAt) || humanAt > asOf) {
    throw new Error('Data da atividade humana invalida para o contexto.')
  }
  const previousAt = summary.lastHumanActivityAt
    ? Date.parse(summary.lastHumanActivityAt)
    : Number.NEGATIVE_INFINITY
  const withActivity = humanAt > previousAt
    ? WhatsAppConversationSummarySchema.parse({
      ...registerHumanActivity(summary, input.humanMessageAt),
      updatedAt: new Date(Math.max(humanAt, Date.parse(summary.updatedAt))).toISOString(),
    })
    : summary
  return releaseExpiredHumanControl(withActivity, input.asOf)
}

export function reconcileLegacyManualPause(input: {
  summary: WhatsAppConversationSummary
  legacyState: {
    state: string
    reason: string | null
    updatedAt: string
    expiresAt: string
  } | null
  asOf: string
}): WhatsAppConversationSummary {
  const summary = WhatsAppConversationSummarySchema.parse(input.summary)
  const state = input.legacyState
  if (!state || state.state !== 'human_pause'
    || (state.reason !== 'store_initiated' && state.reason !== 'app_manual_send')) {
    return summary
  }

  const asOf = Date.parse(input.asOf)
  const updatedAt = Date.parse(state.updatedAt)
  const expiresAt = Date.parse(state.expiresAt)
  if (!Number.isFinite(asOf) || !Number.isFinite(updatedAt) || !Number.isFinite(expiresAt)
    || updatedAt > asOf || expiresAt <= asOf) {
    return summary
  }

  // Durante a transição, aproveita apenas a origem comprovadamente manual da
  // pausa legada. A duração aplicada ao redesign continua sendo de duas horas.
  return reconcileConfirmedHumanActivity({
    summary,
    humanMessageAt: state.updatedAt,
    asOf: input.asOf,
  })
}

export function applyConfirmedControlEvent(input: {
  summary: WhatsAppConversationSummary
  event: { action: 'assume' | 'release' | 'handoff_sent'; occurredAt: string; reason: string | null } | null
  asOf: string
}): WhatsAppConversationSummary {
  const summary = WhatsAppConversationSummarySchema.parse(input.summary)
  const event = input.event
  if (!event) return summary
  const eventAt = Date.parse(event.occurredAt)
  const asOf = Date.parse(input.asOf)
  if (!Number.isFinite(eventAt) || !Number.isFinite(asOf) || eventAt > asOf) {
    throw new Error('Evento de controle fora do contexto.')
  }
  if (event.action === 'assume') {
    return reconcileConfirmedHumanActivity({ summary, humanMessageAt: event.occurredAt, asOf: input.asOf })
  }
  if (event.action === 'release') {
    return WhatsAppConversationSummarySchema.parse({
      ...summary,
      phase: 'resumed',
      humanControl: 'human_released',
      humanActiveUntil: null,
      pendingAction: 'none',
      updatedAt: new Date(Math.max(eventAt, Date.parse(summary.updatedAt))).toISOString(),
    })
  }
  return WhatsAppConversationSummarySchema.parse({
    ...summary,
    phase: 'waiting_human',
    humanControl: 'human_pending',
    humanActiveUntil: null,
    pendingAction: 'awaiting_human',
    handoffReason: event.reason,
    updatedAt: new Date(Math.max(eventAt, Date.parse(summary.updatedAt))).toISOString(),
  })
}

// Prepara o próximo resumo sem persistir nem assumir que um handoff proposto
// em sombra foi enviado ao cliente ou aceito por um funcionário.
export function proposeWhatsAppConversationSummary(input: {
  summary: WhatsAppConversationSummary
  classification: WhatsAppRedesignClassification
  turnMessages: WhatsAppConversationMessage[]
  at: string
}): WhatsAppConversationSummary {
  const summary = WhatsAppConversationSummarySchema.parse(input.summary)
  const at = new Date(input.at)
  if (Number.isNaN(at.getTime())) throw new Error('Data de consolidacao invalida.')

  const hasAttachment = input.turnMessages.some((message) => message.kind !== 'text')
  const { intent, topicRelation } = input.classification
  const changesTopic = intent !== 'unknown' && intent !== 'greeting'
    && (topicRelation === 'change_topic' || summary.activeTopic === 'unknown')
  const addsParallelTopic = intent !== 'unknown' && intent !== 'greeting'
    && topicRelation === 'parallel_topic' && intent !== summary.activeTopic
  const secondaryTopics = changesTopic && summary.activeTopic !== 'unknown'
    ? [summary.activeTopic, ...summary.secondaryTopics]
      .filter((topic, index, topics) => topic !== intent && topics.indexOf(topic) === index)
      .slice(0, 5)
    : addsParallelTopic
      ? [intent, ...summary.secondaryTopics]
        .filter((topic, index, topics) => topics.indexOf(topic) === index)
        .slice(0, 5)
      : summary.secondaryTopics

  // A decisão em sombra é apenas uma proposta: não cria human_pending real.
  // Essa transição só pode ocorrer depois do envio ou de um evento operacional.
  return WhatsAppConversationSummarySchema.parse({
    ...summary,
    activeTopic: changesTopic ? intent : summary.activeTopic,
    secondaryTopics,
    attachmentStatus: hasAttachment ? 'received' : summary.attachmentStatus,
    updatedAt: new Date(Math.max(at.getTime(), Date.parse(summary.updatedAt))).toISOString(),
  })
}

export type WhatsAppProcessedTurnForSummary = {
  id: string
  openedAt: string
  closesAt: string
  classification: WhatsAppRedesignClassification
  turnMessages: WhatsAppConversationMessage[]
}

// Reconstrói somente os campos derivados de turnos; os campos de controle
// humano, pendência e handoff são preservados do resumo canônico de entrada.
// Assim, reprocessamento e chegada fora de ordem não fazem o assunto regredir.
export function replayWhatsAppConversationSummary(input: {
  summary: WhatsAppConversationSummary
  processedTurns: WhatsAppProcessedTurnForSummary[]
}): WhatsAppConversationSummary {
  const summary = WhatsAppConversationSummarySchema.parse(input.summary)
  const seen = new Set<string>()
  const turns = input.processedTurns.map((turn) => {
    const openedAt = Date.parse(turn.openedAt)
    const closesAt = Date.parse(turn.closesAt)
    if (!turn.id || seen.has(turn.id)) throw new Error('Turno repetido ou sem identificador.')
    if (!Number.isFinite(openedAt) || !Number.isFinite(closesAt) || closesAt < openedAt) {
      throw new Error('Janela temporal do turno invalida.')
    }
    seen.add(turn.id)
    return { ...turn, openedAtMs: openedAt, closesAtMs: closesAt }
  }).sort((left, right) => left.openedAtMs - right.openedAtMs
    || left.closesAtMs - right.closesAtMs || left.id.localeCompare(right.id))

  return turns.reduce<WhatsAppConversationSummary>((current, turn) => (
    proposeWhatsAppConversationSummary({
      summary: current,
      classification: turn.classification,
      turnMessages: turn.turnMessages,
      at: turn.closesAt,
    })
  ), {
    ...summary,
    activeTopic: 'unknown',
    secondaryTopics: [],
    attachmentStatus: 'none',
  })
}
