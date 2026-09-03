import assert from 'node:assert/strict'
import test from 'node:test'
import {
  formatWhatsAppPersistedConversationHistory,
  isInstallmentReminderPreferenceCandidate,
  isSimpleRepeatedStatusQuestion,
} from '../src/lib/whatsapp/customer-status'
import { detectWhatsAppConversationLanguage } from '../src/lib/whatsapp/ai'
import {
  continueExperimentalConversationAfterAutomatedHandoff,
  decidePreAiRoute,
} from '../src/lib/whatsapp/routing-heuristics'

test('silencia apenas uma repeticao literal de status', () => {
  assert.equal(isSimpleRepeatedStatusQuestion('Como t\u00e1 meu \u00f3culos?'), true)
  assert.equal(isSimpleRepeatedStatusQuestion('Meu \u00f3culos t\u00e1 pronto?'), true)
})

test('mantem perguntas novas sobre prazo e antecipacao fora do silencio', () => {
  assert.equal(isSimpleRepeatedStatusQuestion('Que dia deve ficar pronto?'), false)
  assert.equal(isSimpleRepeatedStatusQuestion('Tem como adiantar um pouco?'), false)
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

test('modo experimental libera pergunta nova apos silencio ou handoff automatico', () => {
  const metadata = { lastInboundText: 'Como esta meu oculos?' }

  assert.equal(continueExperimentalConversationAfterAutomatedHandoff({
    route: 'ignore_silent',
    messageText: 'E minhas parcelas?',
    metadata,
    toolAgentEnabled: true,
  }), 'continue_to_ai_or_menu')
  assert.equal(continueExperimentalConversationAfterAutomatedHandoff({
    route: 'ignore_silent',
    messageText: 'Como esta meu oculos?',
    metadata,
    toolAgentEnabled: true,
  }), 'ignore_silent')
  assert.equal(continueExperimentalConversationAfterAutomatedHandoff({
    route: 'ignore_silent',
    messageText: 'E minhas parcelas?',
    metadata,
    toolAgentEnabled: false,
  }), 'ignore_silent')
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
