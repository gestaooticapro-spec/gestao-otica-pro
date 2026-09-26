import assert from 'node:assert/strict'
import test from 'node:test'
import {
  formatWhatsAppPersistedConversationHistory,
  isInstallmentReminderPreferenceCandidate,
  isSimpleRepeatedStatusQuestion,
} from '../src/lib/whatsapp/customer-status'
import { buildWhatsAppHumanizationPrompt, detectWhatsAppConversationLanguage } from '../src/lib/whatsapp/ai'
import {
  continueExperimentalConversationAfterAutomatedHandoff,
  decidePreAiRoute,
} from '../src/lib/whatsapp/routing-heuristics'
import { resolveConversationStateCandidates } from '../src/lib/whatsapp/conversation-state-matching'
import { buildWhatsAppCanonicalPayload } from '../src/lib/whatsapp/canonical'
import { applyWhatsAppHumanizationOutcome } from '../src/lib/whatsapp/humanization'

test('silencia apenas uma repeticao literal de status', () => {
  assert.equal(isSimpleRepeatedStatusQuestion('Como t\u00e1 meu \u00f3culos?'), true)
  assert.equal(isSimpleRepeatedStatusQuestion('Meu \u00f3culos t\u00e1 pronto?'), true)
})

test('mantem perguntas novas sobre prazo e antecipacao fora do silencio', () => {
  assert.equal(isSimpleRepeatedStatusQuestion('Que dia deve ficar pronto?'), false)
  assert.equal(isSimpleRepeatedStatusQuestion('Tem como adiantar um pouco?'), false)
})

test('rejeita humanizacao de OS que troca a etapa oficial por assunto de horario', () => {
  const canonical = buildWhatsAppCanonicalPayload({
    intent: 'order_status',
    action: 'auto_reply',
    outboundType: 'os_status',
    canonicalReply: 'Oi! Seu óculos ficou pronto e já pode ser retirado na loja.',
    facts: { statusCode: 'ready_for_pickup' },
  })
  const result = applyWhatsAppHumanizationOutcome(canonical, canonical.canonical.canonicalReply, {
    success: true,
    provider: 'openai',
    model: 'test-model',
    attempts: 1,
    replyText: 'Oi! Hoje atendemos das 08:30 às 18:00.',
  })

  assert.equal(result.text, canonical.canonical.canonicalReply)
  assert.equal(result.payload.humanization.success, false)
  assert.equal('rejectionReason' in result.payload.humanization
    ? result.payload.humanization.rejectionReason : null, 'order_status_not_preserved')
})

test('aceita humanizacao natural que preserva a etapa pronta para retirada', () => {
  const canonical = buildWhatsAppCanonicalPayload({
    intent: 'order_status',
    action: 'auto_reply',
    outboundType: 'os_status',
    canonicalReply: 'Oi! Seu óculos ficou pronto e já pode ser retirado na loja.',
    facts: { statusCode: 'ready_for_pickup' },
  })
  const result = applyWhatsAppHumanizationOutcome(canonical, canonical.canonical.canonicalReply, {
    success: true,
    provider: 'openai',
    model: 'test-model',
    attempts: 1,
    replyText: 'Boa notícia: seu óculos está pronto para retirar!',
  })

  assert.equal(result.text, 'Boa notícia: seu óculos está pronto para retirar!')
  assert.equal(result.payload.humanization.success, true)
})

test('aceita humanizacao que pede identificador antes de consultar uma OS', () => {
  const canonical = buildWhatsAppCanonicalPayload({
    intent: 'order_status',
    action: 'request_identifier',
    outboundType: 'identifier_prompt',
    canonicalReply: 'Envie o CPF, número do pedido ou nome completo.',
  })
  const result = applyWhatsAppHumanizationOutcome(canonical, canonical.canonical.canonicalReply, {
    success: true,
    provider: 'openai',
    model: 'test-model',
    attempts: 1,
    replyText: 'Para eu localizar seu pedido, me informe o número da OS ou o nome completo do titular, por favor.',
  })

  assert.equal(result.text, 'Para eu localizar seu pedido, me informe o número da OS ou o nome completo do titular, por favor.')
  assert.equal(result.payload.humanization.success, true)
})

test('aceita pedido natural de identificador com verbo no infinitivo', () => {
  const canonical = buildWhatsAppCanonicalPayload({
    intent: 'order_status',
    action: 'request_identifier',
    outboundType: 'identifier_prompt',
    canonicalReply: 'Envie o número do pedido para localizar a OS.',
  })
  const replyText = 'Para eu localizar seu pedido, você poderia me passar o número do pedido?'
  const result = applyWhatsAppHumanizationOutcome(canonical, canonical.canonical.canonicalReply, {
    success: true,
    provider: 'openai',
    model: 'test-model',
    attempts: 1,
    replyText,
  })

  assert.equal(result.text, replyText)
  assert.equal(result.payload.humanization.success, true)

  const contextualReply = applyWhatsAppHumanizationOutcome(canonical, canonical.canonical.canonicalReply, {
    success: true,
    provider: 'openai',
    model: 'test-model',
    attempts: 1,
    replyText: 'Para verificar se seu óculos está pronto, poderia me passar o número do pedido?',
  })
  assert.equal(contextualReply.payload.humanization.success, true)
})

test('rejeita humanizacao do pedido de identificador que inventa status da OS', () => {
  const canonical = buildWhatsAppCanonicalPayload({
    intent: 'order_status',
    action: 'request_identifier',
    outboundType: 'identifier_prompt',
    canonicalReply: 'Envie o CPF, número do pedido ou nome completo.',
  })
  const result = applyWhatsAppHumanizationOutcome(canonical, canonical.canonical.canonicalReply, {
    success: true,
    provider: 'openai',
    model: 'test-model',
    attempts: 1,
    replyText: 'Seu óculos já está pronto para retirada.',
  })

  assert.equal(result.text, canonical.canonical.canonicalReply)
  assert.equal(result.payload.humanization.success, false)
})

test('aceita encaminhamento humanizado de OS nao localizada sem status oficial', () => {
  const canonical = buildWhatsAppCanonicalPayload({
    intent: 'order_status',
    action: 'human_handoff',
    outboundType: 'human_handoff',
    canonicalReply: 'Sou a IAra, assistente virtual. Nossa equipe vai conferir essa OS.',
  })
  const replyText = 'Sou a IAra, assistente virtual. Não localizei essa OS; vou pedir à nossa equipe que confira e continue com você por aqui.'
  const result = applyWhatsAppHumanizationOutcome(canonical, canonical.canonical.canonicalReply, {
    success: true, provider: 'openai', model: 'test-model', attempts: 1, replyText,
  })

  assert.equal(result.text, replyText)
  assert.equal(result.payload.humanization.success, true)
})

test('rejeita encaminhamento de OS sem IAra, sem equipe ou com status inventado', () => {
  const canonical = buildWhatsAppCanonicalPayload({
    intent: 'order_status',
    action: 'human_handoff',
    outboundType: 'human_handoff',
    canonicalReply: 'Sou a IAra, assistente virtual. Nossa equipe vai conferir essa OS.',
  })
  for (const replyText of [
    'Não localizei essa OS; nossa equipe vai conferir.',
    'Sou a IAra. Não localizei essa OS.',
    'Sou a IAra. Nossa equipe vai conferir; seu óculos está pronto.',
  ]) {
    const result = applyWhatsAppHumanizationOutcome(canonical, canonical.canonical.canonicalReply, {
      success: true, provider: 'openai', model: 'test-model', attempts: 1, replyText,
    })
    assert.equal(result.payload.humanization.success, false)
  }
})

test('prompt de OS nao localizada pede apresentacao e encaminhamento sem inventar status', () => {
  const prompt = buildWhatsAppHumanizationPrompt({
    intent: 'order_status', action: 'human_handoff', outboundType: 'human_handoff',
    canonicalReply: 'Sou a IAra. Nossa equipe vai conferir essa OS.',
    userMessageText: 'Pode consultar a OS 9999999999?',
    policy: { mustNotAddInformation: true, mustKeepShort: true },
  })
  assert.match(prompt, /Apresente-se como IAra/u)
  assert.match(prompt, /nao invente status/u)
  assert.match(prompt, /Nao solicite novamente o mesmo identificador/u)
})

test('prompt de pedido de identificador prioriza a OS e ignora historico de horarios', () => {
  const prompt = buildWhatsAppHumanizationPrompt({
    intent: 'order_status',
    action: 'request_identifier',
    outboundType: 'identifier_prompt',
    canonicalReply: 'Peça CPF, número da OS ou nome completo.',
    userMessageText: 'Meu óculos está pronto?',
    conversationHistory: ['Cliente perguntou o horário; loja fecha às 18h.'],
    policy: { mustNotAddInformation: true, mustKeepShort: true },
  })

  assert.match(prompt, /solicitar um identificador para localizar uma OS/u)
  assert.match(prompt, /Nao responda sobre horario/u)
  assert.doesNotMatch(prompt, /HISTORICO RECENTE DA SESSAO AUTOMATICA/u)
  assert.doesNotMatch(prompt, /08:30 as 18:00/u)
})

test('mantem o contexto disponivel enquanto aguarda a primeira resposta humana', () => {
  const baseInput = {
    option: null,
    hasAttachment: false,
    messageText: 'Ainda nao tive retorno',
    metadata: {},
    humanHandoffWindowMs: 60 * 60 * 1000,
    identifierWindowMs: 20 * 60 * 1000,
  }

  assert.equal(decidePreAiRoute({ ...baseInput, state: 'awaiting_human' }), 'continue_to_ai_or_menu')
  assert.equal(decidePreAiRoute({ ...baseInput, state: 'human_pause' }), 'ignore_human_pause')
})

test('liberacao considera todas as variantes de telefone e elimina pausa duplicada antiga', () => {
  const resolution = resolveConversationStateCandidates({
    phone: '5544999261487',
    nowMs: Date.parse('2026-09-25T12:00:00.000Z'),
    candidates: [
      {
        id: 10, remote_phone: '5544999261487', state: 'ai_session',
        expires_at: '2026-09-25T14:00:00.000Z', updated_at: '2026-09-25T11:30:00.000Z',
      },
      {
        id: 11, remote_phone: '44999261487', state: 'human_pause',
        expires_at: '2026-09-25T23:00:00.000Z', updated_at: '2026-09-25T11:45:00.000Z',
      },
      {
        id: 12, remote_phone: '554499261487', state: 'human_pause',
        expires_at: '2026-09-25T11:00:00.000Z', updated_at: '2026-09-25T10:00:00.000Z',
      },
    ],
  })

  assert.deepEqual(resolution.expiredIds, [12])
  assert.deepEqual(resolution.matchingIds, [11, 10])
  assert.equal(resolution.selected?.id, 11)
})

test('pausa confirmada continua bloqueando; estado expirado permite retomada', () => {
  const baseInput = {
    option: null,
    hasAttachment: false,
    messageText: 'Quero continuar',
    metadata: {},
    humanHandoffWindowMs: 60 * 60 * 1000,
    identifierWindowMs: 20 * 60 * 1000,
  }
  assert.equal(decidePreAiRoute({ ...baseInput, state: 'human_pause' }), 'ignore_human_pause')
  assert.equal(decidePreAiRoute({ ...baseInput, state: null }), 'continue_to_ai_or_menu')
})

test('recupera contexto da equipe e de comprovante sem confirmar a baixa', () => {
  const history = formatWhatsAppPersistedConversationHistory([
    { role: 'customer', text: 'Enviei o comprovante.', at: '2026-09-01T12:00:00.000Z' },
    { role: 'system', text: 'Uma imagem enviada pelo cliente foi identificada como possivel comprovante de pagamento. A baixa precisa ser confirmada no sistema.', at: '2026-09-01T12:01:00.000Z' },
    { role: 'human', text: 'Esta tudo certo, vou dar baixa na parcela.', at: '2026-09-01T12:02:00.000Z' },
  ])

  assert.deepEqual(history, [
    'cliente: Enviei o comprovante.',
    'sistema: Uma imagem enviada pelo cliente foi identificada como possivel comprovante de pagamento. A baixa precisa ser confirmada no sistema.',
    'equipe: Esta tudo certo, vou dar baixa na parcela.',
  ])
})

test('silencio temporario suprime repeticao identica, mas deixa mensagem nova continuar', () => {
  const metadata = { lastInboundText: 'Como esta meu oculos?' }

  assert.equal(continueExperimentalConversationAfterAutomatedHandoff({
    route: 'ignore_silent',
    messageText: 'E minhas parcelas?',
    metadata,
    toolAgentEnabled: false,
  }), 'continue_to_ai_or_menu')
  assert.equal(continueExperimentalConversationAfterAutomatedHandoff({
    route: 'ignore_silent',
    messageText: 'como está meu óculos!',
    metadata,
    toolAgentEnabled: false,
  }), 'ignore_silent')
  assert.equal(continueExperimentalConversationAfterAutomatedHandoff({
    route: 'preserve_human_handoff',
    messageText: 'E meu oculos em producao?',
    metadata,
    toolAgentEnabled: false,
  }), 'preserve_human_handoff')
  assert.equal(continueExperimentalConversationAfterAutomatedHandoff({
    route: 'preserve_human_handoff',
    messageText: 'E meu oculos em producao?',
    metadata,
    toolAgentEnabled: true,
  }), 'continue_to_ai_or_menu')
})

test('detecta ingles e espanhol para resposta da IAra', () => {
  assert.equal(detectWhatsAppConversationLanguage('Hello, where are my glasses?'), 'en')
  assert.equal(detectWhatsAppConversationLanguage('Hola, ¿dónde están mis gafas?'), 'es')
  assert.equal(detectWhatsAppConversationLanguage('Oi, como esta meu oculos?'), 'pt-BR')
})

test('encaminha para a decisao contextual apenas respostas que podem pedir bloqueio de lembretes', () => {
  assert.equal(isInstallmentReminderPreferenceCandidate('Boa tarde, pode parar. Eu sei a data do vencimento.'), true)
  assert.equal(isInstallmentReminderPreferenceCandidate('Nao quero mais receber lembretes por aqui.'), true)
  assert.equal(isInstallmentReminderPreferenceCandidate('Ja paguei a parcela.'), false)
  assert.equal(isInstallmentReminderPreferenceCandidate('Obrigada pelo aviso.'), false)
})
