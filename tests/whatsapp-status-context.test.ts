import assert from 'node:assert/strict'
import test from 'node:test'
import { isSimpleRepeatedStatusQuestion } from '../src/lib/whatsapp/customer-status'
import { decidePreAiRoute } from '../src/lib/whatsapp/routing-heuristics'

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
