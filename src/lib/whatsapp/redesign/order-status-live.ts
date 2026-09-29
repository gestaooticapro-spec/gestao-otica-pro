import { writeWhatsAppToolAgentReply, type WhatsAppToolAgentInput } from '../ai'
import { validateOrderAgentReply, type OpenOrderAgentFact } from '../order-status-agent'
import {
  runWhatsAppToolAgent,
  type WhatsAppToolCall,
  type WhatsAppToolResult,
} from '../tool-agent'
import {
  type WhatsAppRedesignClassification,
  type WhatsAppSystemDecisionDraft,
} from './contracts'
import { isExplicitHumanHandoffRequest, isExplicitOrderStatusOrReadinessQuestion } from './intent-guards'
import { extractExplicitOrderNumber } from './safe-replies-pilot'

export type StoreOneOrderLookupTool = 'lookup_open_orders' | 'lookup_open_orders_by_identifier'

export type StoreOneOrderLookupPlan = {
  tool: StoreOneOrderLookupTool
  source: 'canonical_decision' | 'explicit_identifier' | 'pending_identifier'
}

export function planStoreOneOrderLookup(input: {
  storeId: number
  enabled: boolean
  classification: WhatsAppRedesignClassification
  decision: WhatsAppSystemDecisionDraft
  messageText: string | null | undefined
  awaitingIdentifier: boolean
}): StoreOneOrderLookupPlan | null {
  const { classification, decision } = input
  if (input.storeId !== 1 || !input.enabled || classification.requestsHuman
    || classification.mentionsAttachment || isExplicitHumanHandoffRequest(input.messageText)) return null
  if (decision.action === 'no_reply' && decision.facts.decisionReason === 'human_control_blocks_ai') return null

  const explicitNumber = extractExplicitOrderNumber(input.messageText)
  const explicitStatus = isExplicitOrderStatusOrReadinessQuestion(input.messageText)
  const pendingIdentifier = input.awaitingIdentifier && !explicitStatus
    && (classification.intent === 'order_status' || classification.intent === 'unknown')
  const canonicalOrderDecision = decision.action === 'lookup_order_status'
  if (!canonicalOrderDecision && !explicitNumber && !pendingIdentifier) return null
  if (decision.action === 'no_reply' && !explicitNumber) return null

  const messageDigits = (input.messageText || '').replace(/\D/gu, '')
  const explicitCpf = messageDigits.length === 11
  // Nomes citados na pergunta nao autorizam consultar OS de outro cadastro.
  // A consulta por nome usa apenas o cliente associado ao WhatsApp.
  const entityValues = [classification.entities.orderNumber, classification.entities.cpf]
  const numericIdentifierInCurrentMessage = entityValues.some((value) => {
    if (!value) return false
    const digits = value.replace(/\D/gu, '')
    return digits.length >= 3 && messageDigits.includes(digits)
  })
  const bareOrderNumber = /^\s*\d{1,10}\s*$/u.test(input.messageText || '')
  const byIdentifier = Boolean(explicitNumber || explicitCpf
    || (pendingIdentifier && bareOrderNumber)
    || (canonicalOrderDecision && numericIdentifierInCurrentMessage))
  return {
    tool: byIdentifier ? 'lookup_open_orders_by_identifier' : 'lookup_open_orders',
    source: explicitNumber ? 'explicit_identifier'
      : pendingIdentifier && byIdentifier ? 'pending_identifier' : 'canonical_decision',
  }
}

export type StoreOneOrderDisposition =
  | { kind: 'send'; action: 'auto_reply' | 'request_identifier' | 'human_handoff';
      outboundType: 'os_status' | 'identifier_prompt' | 'human_handoff';
      state: 'ai_session' | 'waiting_identifier' | 'awaiting_human';
      reason: string; text: string; orderCount: number }
  | { kind: 'suppress'; reason: string }

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()
}

function assertsOrderStatus(text: string) {
  return /\b(?:esta|ta|ficou|ja)\s+pront\w*\b|\b(?:pode|ja pode)\s+(?:ser\s+)?(?:retirar|buscar)\b|\b(?:em producao|no laboratorio|em montagem)\b/u.test(normalize(text))
}

function asksForIdentifier(text: string, orderNumberOnly: boolean) {
  const normalized = normalize(text)
  const asks = /\b(?:envie|informe|passe|compartilhe|diga|qual|poderia|pode me|preciso do)\b/u.test(normalized)
  const identifier = orderNumberOnly
    ? /\b(?:os|pedido|ordem de servico)\b/u.test(normalized)
    : /\b(?:cpf|os|pedido|ordem de servico|nome completo|titular)\b/u.test(normalized)
  return asks && identifier && !assertsOrderStatus(text)
}

function safelyHandsOffUnfoundOrder(text: string) {
  const normalized = normalize(text)
  return /\biara\b/u.test(normalized)
    && /\b(?:pedido|os|ordem de servico)\b/u.test(normalized)
    && /\b(?:equipe|atendente|atendentes|funcionario|colaborador)\b/u.test(normalized)
    && /\b(?:nao encontrei|nao localizei|nao consegui encontrar|nao foi localizado|nao consegui localizar)\b/u.test(normalized)
    && !assertsOrderStatus(text)
    && !asksForIdentifier(text, false)
}

export function resolveStoreOneOrderDisposition(input: {
  plan: StoreOneOrderLookupPlan
  lookup: WhatsAppToolResult | undefined
  replyText: string | null
}): StoreOneOrderDisposition {
  const { plan, lookup } = input
  if (!lookup || lookup.tool !== plan.tool) return { kind: 'suppress', reason: 'expected_order_lookup_missing' }
  if (lookup.data.code === 'tool_execution_failed') return { kind: 'suppress', reason: 'order_lookup_failed' }
  const replyText = input.replyText?.trim()
  if (!replyText) return { kind: 'suppress', reason: 'order_reply_unavailable' }

  const orders = Array.isArray(lookup.data.orders) ? lookup.data.orders as OpenOrderAgentFact[] : []
  if (plan.tool === 'lookup_open_orders_by_identifier') {
    if (lookup.ok && orders.length >= 1 && orders.length <= 2) {
      const validation = validateOrderAgentReply(replyText, orders)
      if (!validation.valid) return { kind: 'suppress', reason: validation.reason }
      return { kind: 'send', action: 'auto_reply', outboundType: 'os_status',
        state: 'ai_session', reason: 'order_status_auto_reply', text: replyText, orderCount: orders.length }
    }
    if (lookup.ok && lookup.data.tooManyOpenOrders === true
      && asksForIdentifier(replyText, true)) {
      return { kind: 'send', action: 'request_identifier', outboundType: 'identifier_prompt',
        state: 'waiting_identifier', reason: 'order_identifier_requested', text: replyText, orderCount: 0 }
    }
    if (!lookup.ok && lookup.data.code === 'order_not_found_for_identifier'
      && safelyHandsOffUnfoundOrder(replyText)) {
      return { kind: 'send', action: 'human_handoff', outboundType: 'human_handoff',
        state: 'awaiting_human', reason: 'order_identifier_not_found', text: replyText, orderCount: 0 }
    }
    return { kind: 'suppress', reason: 'identifier_lookup_reply_unsafe' }
  }

  if ((lookup.data.code === 'customer_not_found' || lookup.data.tooManyOpenOrders === true
    || (lookup.ok && orders.length === 0)) && asksForIdentifier(replyText, lookup.data.tooManyOpenOrders === true)) {
    return { kind: 'send', action: 'request_identifier', outboundType: 'identifier_prompt',
      state: 'waiting_identifier', reason: 'order_identifier_requested', text: replyText, orderCount: 0 }
  }
  if (lookup.ok && orders.length >= 1 && orders.length <= 2) {
    const validation = validateOrderAgentReply(replyText, orders, { allowPossessiveOwnerReference: true })
    if (!validation.valid) return { kind: 'suppress', reason: validation.reason }
    return { kind: 'send', action: 'auto_reply', outboundType: 'os_status',
      state: 'ai_session', reason: 'order_status_auto_reply', text: replyText, orderCount: orders.length }
  }
  return { kind: 'suppress', reason: 'phone_lookup_reply_unsafe' }
}

export async function runStoreOneOrderStatusTurn(input: {
  plan: StoreOneOrderLookupPlan
  assistant: WhatsAppToolAgentInput
  executeLookup: (call: WhatsAppToolCall) => Promise<WhatsAppToolResult>
  writeReply?: typeof import('../ai').writeWhatsAppToolAgentReply
}) {
  const agent = await runWhatsAppToolAgent({
    assistant: input.assistant,
    forcedToolCalls: [{ name: input.plan.tool }],
    executeTool: input.executeLookup,
    writeReply: input.writeReply,
    deferReplyWhen: (_calls, results) => results.some((result) =>
      result.tool === input.plan.tool && result.data.code === 'tool_execution_failed'
    ),
  })
  const lookup = agent.toolResults.find((result) => result.tool === input.plan.tool)
  let disposition = resolveStoreOneOrderDisposition({
    plan: input.plan,
    lookup,
    replyText: agent.success ? agent.replyText : null,
  })
  const correctableReasons = new Set(['missing_order', 'mixed_orders', 'missing_patient', 'missing_status'])
  if (agent.success && agent.replyText && disposition.kind === 'suppress'
    && correctableReasons.has(disposition.reason)) {
    const orders = Array.isArray(lookup?.data.orders) ? lookup.data.orders as OpenOrderAgentFact[] : []
    const revision = await (input.writeReply ?? writeWhatsAppToolAgentReply)({
      ...input.assistant,
      conversationHistory: [],
      recentContext: [],
      rejectedOrderReply: {
        text: agent.replyText,
        reason: disposition.reason,
        requiredOrders: orders.map((order) => ({
          orderNumber: order.orderNumber,
          patientLabel: order.patientName || 'do titular',
          statusText: order.statusText,
        })),
      },
    }, agent.toolResults, { model: 'gpt-4.1-mini' })
    agent.aiResults.push(revision)
    agent.aiResultTasks.push('tool_agent_reply')
    disposition = revision.success
      ? resolveStoreOneOrderDisposition({ plan: input.plan, lookup, replyText: revision.data.reply_text })
      : { kind: 'suppress', reason: 'order_reply_revision_failed' }
  }
  return { agent, disposition }
}
